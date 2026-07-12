import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Archive, ArchiveRestore, Pencil, User } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, NativeDialog, TopBar } from '../../../components'
import { ActionSheet } from '../../../components/DropdownMenu'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { PhotoLightbox } from '../../../components/PhotoLightbox'
import { ClientHero, type HeroChips, type HeroStatusLevel } from '../../../components/coach/clientDetail/ClientHero'
import { ClientTabBar, type ClientTab, type TabItem } from '../../../components/coach/clientDetail/ClientTabBar'
import { ProfileFloatingActions } from '../../../components/coach/clientDetail/ProfileFloatingActions'
import { OverviewTab } from '../../../components/coach/clientDetail/OverviewTab'
import { ProgresoTab } from '../../../components/coach/clientDetail/ProgresoTab'
import { AnalisisTab } from '../../../components/coach/clientDetail/AnalisisTab'
import { PlanTab } from '../../../components/coach/clientDetail/PlanTab'
import { NutricionTab } from '../../../components/coach/clientDetail/NutricionTab'
import {
  getCoachClientDetail,
  getCoachClientDayDetail,
  setCoachClientArchived,
  updateCoachClient,
  type ClientDayDetail,
  type CoachClientDetail,
  type CoachClientDetailData,
} from '../../../lib/coach-client-detail'
import {
  buildProfileActivityCalendar,
  formatTrainingAgeLabel,
  longestActivityStreak,
} from '../../../lib/profile-analytics'
import { exportClientDossierPdf } from '../../../lib/client-dossier-pdf'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { daysBetweenCalendar } from '../../../lib/checkin-thresholds'
import { filterPlansForStructureView, resolveActiveWeekVariantForDisplay } from '../../../lib/program-week-variant'
import { deriveClientStatus } from '@eva/profile-analytics'

const round1 = (n: number) => Math.round(n * 10) / 10

// A-F18: etiqueta relativa de "ultima actividad".
function relActivityLabel(iso: string | null): string {
  if (!iso) return 'Sin actividad'
  const d = daysBetweenCalendar(iso.slice(0, 10), getTodayInSantiago().iso)
  if (d <= 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  if (d < 30) return `Hace ${d}d`
  const m = Math.floor(d / 30)
  return `Hace ${m} mes${m === 1 ? '' : 'es'}`
}

// "Desde {mmm yyyy}" a partir de la fecha de inicio (o alta) del alumno.
function sinceMonthLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
}

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [tab, setTab] = useState<ClientTab>('overview')
  const [data, setData] = useState<CoachClientDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => getTodayInSantiago().iso)
  const [dayDetail, setDayDetail] = useState<ClientDayDetail | null>(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const lastY = useRef(0)
  const tabStickyY = useRef(Number.MAX_SAFE_INTEGER)
  const [tabStuck, setTabStuck] = useState(false)
  const loadedOnceRef = useRef(false)
  const loadSeqRef = useRef(0)
  const daySeqRef = useRef(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!clientId) return
    const seq = ++loadSeqRef.current
    if (!opts?.silent) setLoading(true)
    setLoadError(null)
    try {
      const res = await getCoachClientDetail(clientId)
      if (seq === loadSeqRef.current) setData(res)
    } catch (e) {
      console.warn('[client-detail] load failed', e)
      if (seq === loadSeqRef.current) setLoadError('No pudimos cargar la ficha. Revisa tu conexión e intenta de nuevo.')
    } finally {
      if (seq === loadSeqRef.current) {
        if (!opts?.silent) setLoading(false)
        loadedOnceRef.current = true
      }
    }
  }, [clientId])

  useEffect(() => {
    loadedOnceRef.current = false
    loadSeqRef.current += 1
    daySeqRef.current += 1
    setSelectedDate(getTodayInSantiago().iso)
    setDayDetail(null)
  }, [clientId])

  // GOTCHA 6b: la ficha hace fetch propio y es una ruta stack-push (no se
  // desmonta al abrir program-builder / nutrition-builder). useFocusEffect
  // re-corre load() al VOLVER del builder → los datos no quedan stale. La
  // primera carga muestra el loader full-screen; los refrescos on-focus son
  // silenciosos (sin flash del loader).
  useFocusEffect(
    useCallback(() => {
      void load({ silent: loadedOnceRef.current })
    }, [load]),
  )

  useFocusEffect(
    useCallback(() => {
      if (!clientId || !selectedDate) return
      const seq = ++daySeqRef.current
      setDayLoading(true)
      void getCoachClientDayDetail(clientId, selectedDate)
        .then((detail) => { if (seq === daySeqRef.current) setDayDetail(detail) })
        .catch((error) => { console.warn('[client-detail] day load failed', error) })
        .finally(() => { if (seq === daySeqRef.current) setDayLoading(false) })
      return () => { daySeqRef.current += 1 }
    }, [clientId, selectedDate]),
  )

  const client = data?.client ?? null

  function openWhatsApp() {
    const digits = (client?.phone ?? '').replace(/\D/g, '')
    if (digits.length < 10) return
    Linking.openURL(`https://wa.me/${digits}`).catch(() => {})
  }

  function openBuilder() {
    if (!client) return
    router.push(`/coach/program-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)
  }

  function confirmArchive() {
    if (!client) return
    const archiving = !client.is_archived
    Alert.alert(
      archiving ? 'Archivar alumno' : 'Reactivar alumno',
      archiving ? `${client.full_name} dejara de aparecer como activo.` : `${client.full_name} volvera a estar activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Archivar' : 'Reactivar', style: archiving ? 'destructive' : 'default',
          onPress: async () => { const r = await setCoachClientArchived(client.id, archiving); if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo actualizar.'); else load() },
        },
      ]
    )
  }

  // ── Derivados para hero (badge, meta, chips) ──────────────────────────────
  const derived = useMemo(() => {
    if (!data || !client) return null
    const series = [...data.checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date))
    const currentWeight = series.length ? Number(series[series.length - 1]!.weight) : null
    const weightDelta = series.length >= 2 ? round1(Number(series[series.length - 1]!.weight) - Number(series[series.length - 2]!.weight)) : null
    const calendar = buildProfileActivityCalendar(data.workoutDates371, data.checkIns.map((c) => c.date))
    const streak = longestActivityStreak(calendar)
    const trainingAge = formatTrainingAgeLabel(client.subscription_start_date, client.created_at)
    const todayIso = getTodayInSantiago().iso
    const today = data.nutritionTimeline.find((t) => t.date === todayIso) ?? data.nutritionTimeline[0]
    const weeklyPRs = data.weeklyPRs

    // Alerta de atencion (motivo del badge).
    let attention: string | null = null
    if (data.compliance && data.compliance.checkInCompliancePercent < 40) attention = 'Check-ins irregulares — conviene contactar.'
    else if (data.activeNutrition && (data.compliance?.nutritionWeeklyAvgPct ?? 0) < 60) attention = 'Adherencia nutricional baja esta semana.'
    else if (data.checkIns[0] && !data.checkIns[0].reviewed_at) attention = 'Hay un check-in sin revisar.'

    // Ultima actividad (workout o check-in mas reciente) + semana de programa.
    const lastWorkout = data.workoutDates371.length ? data.workoutDates371[data.workoutDates371.length - 1] : null
    const lastCheckin = data.checkIns[0]?.date ?? null
    const lastActivityIso = [lastWorkout, lastCheckin].filter(Boolean).sort().pop() ?? null
    let planCurrentWeek: number | null = null
    if (data.activeProgram?.start_date && data.activeProgram.weeks_to_repeat) {
      const elapsedDays = Math.max(0, daysBetweenCalendar(data.activeProgram.start_date, todayIso))
      planCurrentWeek = Math.min(Math.floor(elapsedDays / 7) + 1, Math.max(1, data.activeProgram.weeks_to_repeat))
    }

    return { currentWeight, weightDelta, streak, trainingAge, today, weeklyPRs, attention, lastActivityIso, planCurrentWeek }
  }, [data, client])

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y
    setTabStuck(y >= tabStickyY.current - 1)
    if (y < 36) setCompact(false)
    else if (y - lastY.current > 8) setCompact(true)
    else if (lastY.current - y > 8) setCompact(false)
    lastY.current = y
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando alumno…" />
      </SafeAreaView>
    )
  }
  if (!client || !data || !derived) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <TopBar back title="Alumno" onBack={() => router.back()} />
        <EmptyState
          icon={User}
          title={loadError ? 'No pudimos cargar la ficha' : 'Alumno no encontrado'}
          subtitle={loadError ?? 'Vuelve a la lista de alumnos.'}
          action={loadError ? <Button label="Reintentar" variant="secondary" onPress={() => load()} /> : undefined}
        />
      </SafeAreaView>
    )
  }

  // ── Hero: eyebrow, estado, chips ──────────────────────────────────────────
  const programName = data.activeProgram?.name?.trim() || null
  const planCur = derived.planCurrentWeek
  const eyebrow = programName
    ? `${programName}${planCur != null ? ` · Semana ${planCur}` : ''}`
    : planCur != null
      ? `Semana ${planCur}`
      : 'Sin programa activo'

  const todayForStatus = getTodayInSantiago().iso
  const lastCheckinForStatus = data.checkIns[0]?.date ?? null
  const lastWorkoutForStatus = data.workoutDates371.length ? data.workoutDates371[data.workoutDates371.length - 1] : null
  const programDaysRemaining = data.activeProgram?.end_date
    ? daysBetweenCalendar(todayForStatus, data.activeProgram.end_date)
    : null
  const daysSinceCheckin = lastCheckinForStatus ? daysBetweenCalendar(lastCheckinForStatus, todayForStatus) : null
  const daysSinceWorkout = lastWorkoutForStatus ? daysBetweenCalendar(lastWorkoutForStatus, todayForStatus) : null
  const todayMealsDone = derived.today?.mealsDone ?? 0
  const todayMealsTotal = Math.max(1, derived.today?.mealsTotal ?? 0)
  const todayNutritionPct = Math.min(100, Math.round((todayMealsDone / todayMealsTotal) * 100))
  const attentionScore =
    (daysSinceCheckin != null && daysSinceCheckin > 30 ? 25 : 0) +
    (data.activeProgram && (daysSinceWorkout == null || daysSinceWorkout >= 7) ? 25 : 0) +
    (data.activeNutrition && todayNutritionPct < 60 ? 20 : 0) +
    (programDaysRemaining != null && programDaysRemaining <= 0 ? 15 : programDaysRemaining != null && programDaysRemaining <= 3 ? 8 : 0)
  const derivedStatus = deriveClientStatus({
    attentionScore,
    daysSinceCheckin,
    daysSinceWorkout,
    hasActiveWorkoutProgram: Boolean(data.activeProgram),
    nutritionAdherencePct: data.activeNutrition ? todayNutritionPct : null,
    planDaysRemaining: programDaysRemaining,
  })
  const statusLevel: HeroStatusLevel = derivedStatus.level
  const statusLabel = derivedStatus.label
  const reasons = derivedStatus.reasons

  const workoutsThisWeek = data.compliance?.workoutsThisWeek ?? 0
  const workoutsTarget = Math.max(1, data.compliance?.workoutsTarget ?? 1)
  // Chip "% plan": mismo calculo que el web (client-detail.service.ts:354 →
  // nutritionCompliancePercent = round(mealsDoneHoy / mealsTotalHoy)) — cumplimiento de
  // HOY, no el promedio semanal. El valor del chip "Comidas hoy" (mealsDone/mealsTotal) y
  // su sub "% plan" deben leer la MISMA ventana (dia), como en ClientProfileHero.tsx:124,331-338.
  const heroChips: HeroChips = {
    weightValue: derived.currentWeight,
    weightDelta: derived.weightDelta,
    adherencePct: Math.min(100, Math.round((workoutsThisWeek / workoutsTarget) * 100)),
    workoutsThisWeek,
    workoutsTarget,
    mealsDone: todayMealsDone,
    mealsTotal: todayMealsTotal,
    nutritionPct: todayNutritionPct,
  }

  // 5 pestañas (sin Facturacion — removida del chrome, RULING D2). Labels 1:1 con
  // el rediseno web: Resumen · Progreso · Entreno · Programa · Nutricion. Label-only.
  const tabs: TabItem[] = [
    { value: 'overview', label: 'Resumen' },
    { value: 'progreso', label: 'Progreso', badge: data.checkIns.length || null },
    { value: 'analisis', label: 'Entreno', badge: data.personalRecords.length || derived.weeklyPRs.length || null },
    {
      value: 'plan',
      label: 'Programa',
      badge: data.activeProgram
        ? filterPlansForStructureView(
            data.activeProgram.workoutPlans,
            data.activeProgram.program_structure_type === 'cycle' ? 'cycle' : 'weekly',
            { abMode: Boolean(data.activeProgram.ab_mode), activeVariant: resolveActiveWeekVariantForDisplay(data.activeProgram, planCur) },
          ).filter((plan) => plan.blocks.length > 0).length || null
        : null,
    },
    {
      value: 'nutricion',
      label: 'Nutrición',
      badge: data.activeNutrition && heroChips.nutritionPct < 60 ? '!' : data.nutritionMeals.length || null,
    },
  ]

  function onOpenPhoto(photos: string[], index: number) { setLightbox({ photos, index }) }

  // Export dossier PDF (E5-13): arma el dossier oscuro desde el modelo mobile + fotos firmadas
  // y abre el share sheet nativo. Cierra sobre statusLevel/statusLabel/derived del render actual.
  async function handleExportPdf() {
    if (!data || !client || !derived || exportingPdf) return
    setExportingPdf(true)
    try {
      await exportClientDossierPdf(clientId, data, {
        statusLabel,
        statusLevel,
        streak: derived.streak,
        trainingAge: derived.trainingAge,
        lastActivityIso: derived.lastActivityIso,
        planCurrentWeek: derived.planCurrentWeek,
      })
    } catch (e) {
      console.warn('[dossier-pdf] export failed', e)
      Alert.alert('No se pudo exportar', 'Hubo un problema generando el dossier. Intenta de nuevo.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <TopBar back backLabel="Alumnos" backColor={theme.mutedForeground} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]} onScroll={onScroll} scrollEventThrottle={16}>
        {/* 0 — Hero */}
        <ClientHero
          name={client.full_name}
          email={client.email}
          eyebrow={eyebrow}
          statusLabel={statusLabel}
          statusLevel={statusLevel}
          reasons={reasons}
          streak={derived.streak}
          lastActivityLabel={relActivityLabel(derived.lastActivityIso)}
          sinceLabel={sinceMonthLabel(client.subscription_start_date || client.created_at)}
          trainingAge={derived.trainingAge}
          chips={heroChips}
          onMore={() => setMoreOpen(true)}
          onExportPdf={handleExportPdf}
          exportingPdf={exportingPdf}
        />

        {/* 1 — Tab bar (sticky) */}
        <View onLayout={(event) => { tabStickyY.current = event.nativeEvent.layout.y }}>
          <ClientTabBar items={tabs} value={tab} onChange={setTab} stuck={tabStuck} />
        </View>

        {/* 2 — Content */}
        <View style={styles.tabContent}>
          {tab === 'overview' ? (
            <OverviewTab data={data} reload={load} onOpenPhoto={onOpenPhoto} onEditProgram={openBuilder} />
          ) : tab === 'progreso' ? (
            <ProgresoTab data={data} onOpenPhoto={onOpenPhoto} reload={load} />
          ) : tab === 'analisis' ? (
            <AnalisisTab data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading} />
          ) : tab === 'plan' ? (
            <PlanTab data={data} onEdit={openBuilder} />
          ) : (
            <NutricionTab clientId={client.id} data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading}
              onEditNutrition={() => router.push(`/coach/nutrition-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)} />
          )}
        </View>
      </ScrollView>

      {/* Barra flotante persistente — solo WhatsApp (rediseno). */}
      <ProfileFloatingActions onWhatsApp={openWhatsApp} compact={compact} enabled={(client.phone ?? '').replace(/\D/g, '').length >= 10} />

      {/* Menu de acciones del alumno (⋮) — editar datos / archivar. */}
      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Acciones"
        actions={[
          { key: 'edit', label: 'Editar datos', icon: Pencil, onSelect: () => setEditOpen(true) },
          {
            key: 'archive',
            label: client.is_archived ? 'Reactivar alumno' : 'Archivar alumno',
            icon: client.is_archived ? ArchiveRestore : Archive,
            destructive: !client.is_archived,
            onSelect: confirmArchive,
          },
        ]}
      />

      <NativeDialog open={editOpen} title="Editar alumno" onClose={() => setEditOpen(false)}>
        <EditClientForm client={client} onDone={() => { setEditOpen(false); load() }} onCancel={() => setEditOpen(false)} />
      </NativeDialog>

      <PhotoLightbox photos={lightbox?.photos ?? []} index={lightbox?.index ?? 0} visible={!!lightbox} onClose={() => setLightbox(null)} />
    </SafeAreaView>
  )
}

function Field({ label, value, onChangeText, theme, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: theme.fontSans }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholderTextColor={theme.mutedForeground}
        style={{ height: 46, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, paddingHorizontal: 12, fontFamily: theme.fontSans }} {...rest} />
    </View>
  )
}

function EditClientForm({ client, onDone, onCancel }: { client: CoachClientDetail; onDone: () => void; onCancel: () => void }) {
  const { theme } = useTheme()
  const [fullName, setFullName] = useState(client.full_name)
  const [phone, setPhone] = useState(client.phone ?? '')
  const [goalWeight, setGoalWeight] = useState(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
  const [startDate, setStartDate] = useState(client.subscription_start_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (fullName.trim().length < 2) { setError('Indica el nombre.'); return }
    setSaving(true)
    const r = await updateCoachClient(client.id, {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      goal_weight_kg: goalWeight.trim() ? Number(goalWeight) : null,
      subscription_start_date: startDate.trim() || null,
    })
    setSaving(false)
    if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
    else onDone()
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Nombre" value={fullName} onChangeText={setFullName} theme={theme} />
      <Field label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+56 9 ..." theme={theme} />
      <Field label="Peso objetivo (kg)" value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder="75" theme={theme} />
      <Field label="Alumno desde" value={startDate} onChangeText={setStartDate} placeholder="2026-01-15" theme={theme} />
      {error ? <Text style={{ color: theme.destructive, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={saving ? 'Guardando...' : 'Guardar'} onPress={submit} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 120, gap: 14 },
  tabContent: { gap: 14, paddingTop: 14 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
})
