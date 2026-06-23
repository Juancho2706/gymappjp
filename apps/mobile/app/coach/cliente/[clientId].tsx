import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Apple, Archive, ArchiveRestore, BarChart3, Camera, ClipboardList, CreditCard, Dumbbell, HeartPulse, LayoutDashboard, LayoutGrid, MessageCircle, Pencil, Plus, Scale, TrendingUp, User, Utensils, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, NativeDialog, TopBar } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { PhotoLightbox } from '../../../components/PhotoLightbox'
import { ClientHero, type HeroStat } from '../../../components/coach/clientDetail/ClientHero'
import { ClientTabBar, type ClientTab, type TabItem } from '../../../components/coach/clientDetail/ClientTabBar'
import { OverviewTab } from '../../../components/coach/clientDetail/OverviewTab'
import { ProgresoTab } from '../../../components/coach/clientDetail/ProgresoTab'
import { AnalisisTab } from '../../../components/coach/clientDetail/AnalisisTab'
import { PlanTab } from '../../../components/coach/clientDetail/PlanTab'
import { NutricionTab } from '../../../components/coach/clientDetail/NutricionTab'
import { FacturacionTab } from '../../../components/coach/clientDetail/FacturacionTab'
import { hasModule } from '../../../lib/entitlements'
import { apiFetch, getApiBaseUrl } from '../../../lib/api'
import { getCoachProfile } from '../../../lib/coach'
import {
  getCoachClientDetail,
  getCoachClientDayDetail,
  setCoachClientArchived,
  type ClientDayDetail,
  type CoachClientDetail,
  type CoachClientDetailData,
} from '../../../lib/coach-client-detail'
import {
  getClientIntake,
  updateClientIntake,
} from '../../../lib/coach-client-extras'
import {
  avgEnergySince,
  bmiCategory,
  bmiFromMetric,
  buildProfileActivityCalendar,
  epleyOneRM,
  findWeeklyWeightPRs,
  formatTrainingAgeLabel,
  linearRegressionKgPerDay,
  longestActivityStreak,
} from '../../../lib/profile-analytics'
import { exportProgressPdf } from '../../../lib/progress-pdf'
import { getTodayInSantiago } from '../../../lib/date-utils'

const round1 = (n: number) => Math.round(n * 10) / 10

// Espejo de formatRelativeLastActivity (web profileOverviewUtils): copy verbatim.
function relActivityLabel(iso: string | null): string {
  if (!iso) return 'Sin actividad reciente'
  const ms = new Date(`${iso}T12:00:00`).getTime()
  if (!Number.isFinite(ms)) return 'Sin actividad reciente'
  const days = Math.floor((Date.now() - ms) / 86400000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Mes + año del alumno (espejo del clientSinceLabel de la web).
function clientSinceLabel(subscriptionStart: string | null, createdAt: string | null): string {
  const base = subscriptionStart || createdAt
  if (!base) return '—'
  const d = new Date(base.length <= 10 ? `${base}T12:00:00` : base)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

// Score de atención 0–100 (mismas señales que la web; sin attentionScore server-side en mobile).
function computeAttentionScore(args: {
  checkInCompliancePercent: number
  nutritionWeeklyAvgPct: number
  workoutsThisWeek: number
  hasActiveNutrition: boolean
  lastCheckInUnreviewed: boolean
}): number {
  let score = 0
  if (args.checkInCompliancePercent < 40) score += 35
  else if (args.checkInCompliancePercent < 60) score += 15
  if (args.hasActiveNutrition && args.nutritionWeeklyAvgPct < 60) score += 25
  if (args.workoutsThisWeek <= 0) score += 25
  if (args.lastCheckInUnreviewed) score += 15
  return Math.min(100, score)
}

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const [mods, setMods] = useState<{ cardio: boolean; movement: boolean; bodycomp: boolean }>({ cardio: false, movement: false, bodycomp: false })
  const [coachSlug, setCoachSlug] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([hasModule('cardio'), hasModule('movement_assessment'), hasModule('body_composition')])
      .then(([cardio, movement, bodycomp]) => setMods({ cardio, movement, bodycomp }))
      .catch(() => {})
    // Slug del coach para el deep-link de check-in del alumno (espejo de ProfileFloatingActions web).
    getCoachProfile().then((c) => setCoachSlug(c?.slug ?? null)).catch(() => {})
  }, [])

  const [tab, setTab] = useState<ClientTab>('overview')
  const [data, setData] = useState<CoachClientDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => getTodayInSantiago().iso)
  const [dayDetail, setDayDetail] = useState<ClientDayDetail | null>(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await getCoachClientDetail(clientId)
      setData(res)
      setSelectedDate((prev) => res.activity.find((d) => d.workout || d.nutrition || d.checkIn)?.date ?? prev)
    } catch (e) {
      console.warn('[client-detail] load failed', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [clientId])
  // Refetch al volver a la ficha (ej. tras editar programa/nutricion en el builder en otra
  // ruta) -> evita data vieja. Salta el primer focus (el mount ya carga via el effect de arriba).
  const focusedOnce = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]))

  useEffect(() => {
    let cancelled = false
    async function loadDay() {
      if (!clientId || !selectedDate) return
      setDayLoading(true)
      try {
        const detail = await getCoachClientDayDetail(clientId, selectedDate)
        if (!cancelled) setDayDetail(detail)
      } catch (e) {
        console.warn('[client-detail] loadDay failed', e)
      } finally {
        if (!cancelled) setDayLoading(false)
      }
    }
    loadDay()
    return () => { cancelled = true }
  }, [clientId, selectedDate])

  const client = data?.client ?? null

  function openWhatsApp() {
    const digits = (client?.phone ?? '').replace(/\D/g, '')
    if (!digits) { Alert.alert('Sin teléfono', 'Este alumno no tiene teléfono cargado.'); return }
    const msg = `Hola ${client?.full_name?.split(' ')[0] ?? ''}! Te escribo desde EVA.`
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() => {})
  }

  function openBuilder() {
    if (!client) return
    router.push(`/coach/program-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)
  }

  // Check-in del alumno (espejo de ProfileFloatingActions web): abre la web del alumno
  // (/c/[coachSlug]/check-in) — no hay ruta de check-in del alumno dentro de la app del coach.
  function openCheckIn() {
    if (!coachSlug) { Alert.alert('No disponible', 'No se pudo resolver el enlace del alumno.'); return }
    Linking.openURL(`${getApiBaseUrl()}/c/${coachSlug}/check-in`).catch(() => {})
  }

  function openNutrition() {
    if (!client) return
    router.push(`/coach/nutrition-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)
  }

  function confirmArchive() {
    if (!client) return
    const archiving = !client.is_archived
    Alert.alert(
      archiving ? 'Archivar alumno' : 'Reactivar alumno',
      archiving ? `${client.full_name} dejará de aparecer como activo.` : `${client.full_name} volverá a estar activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Archivar' : 'Reactivar', style: archiving ? 'destructive' : 'default',
          onPress: async () => { const r = await setCoachClientArchived(client.id, archiving); if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo actualizar.'); else load() },
        },
      ]
    )
  }

  // ── Derivados para hero + badges + PDF ─────────────────────────────────────
  const derived = useMemo(() => {
    if (!data || !client) return null
    const series = [...data.checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date))
    const currentWeight = series.length ? Number(series[series.length - 1]!.weight) : null
    const initialWeight = client.initial_weight_kg ?? (series.length ? Number(series[0]!.weight) : null)
    const weightDelta = series.length >= 2 ? round1(Number(series[series.length - 1]!.weight) - Number(series[series.length - 2]!.weight)) : null
    const calendar = buildProfileActivityCalendar(data.workoutDates371, data.checkIns.map((c) => c.date))
    const streak = longestActivityStreak(calendar)
    const trainingAge = formatTrainingAgeLabel(client.subscription_start_date, client.created_at)
    const todayIso = getTodayInSantiago().iso
    const today = data.nutritionTimeline.find((t) => t.date === todayIso) ?? data.nutritionTimeline[0]
    const weeklyPRs = data.weeklyPRs
    const pendingPays = data.payments.filter((p) => ['pending', 'pendiente'].includes((p.status ?? '').toLowerCase())).length

    // Attention
    let attention: string | null = null
    if (data.compliance && data.compliance.checkInCompliancePercent < 40) attention = 'Check-ins irregulares — conviene contactar.'
    else if (data.activeNutrition && (data.compliance?.nutritionWeeklyAvgPct ?? 0) < 60) attention = 'Adherencia nutricional baja esta semana.'
    else if (data.checkIns[0] && !data.checkIns[0].reviewed_at) attention = 'Hay un check-in sin revisar.'

    // A-F18: última actividad (workout o check-in más reciente) + semana de programa.
    const lastWorkout = data.workoutDates371.length ? data.workoutDates371[data.workoutDates371.length - 1] : null
    const lastCheckin = data.checkIns[0]?.date ?? null
    const lastActivityIso = [lastWorkout, lastCheckin].filter(Boolean).sort().pop() ?? null
    let programWeek: string | null = null
    let programWeekCur = 1
    let programWeekTot = 1
    if (data.activeProgram?.start_date && data.activeProgram.weeks_to_repeat) {
      const start = new Date(`${data.activeProgram.start_date}T12:00:00`).getTime()
      if (Number.isFinite(start)) {
        programWeekTot = Math.max(1, data.activeProgram.weeks_to_repeat)
        programWeekCur = Math.min(Math.max(1, Math.ceil((Math.max(0, (Date.now() - start) / 86400000) + 1) / 7)), programWeekTot)
        programWeek = `${programWeekCur}/${programWeekTot}`
      }
    }

    const lastCheckInUnreviewed = !!(data.checkIns[0] && !data.checkIns[0].reviewed_at)
    const attentionScore = computeAttentionScore({
      checkInCompliancePercent: data.compliance?.checkInCompliancePercent ?? 0,
      nutritionWeeklyAvgPct: data.compliance?.nutritionWeeklyAvgPct ?? 0,
      workoutsThisWeek: data.compliance?.workoutsThisWeek ?? 0,
      hasActiveNutrition: !!data.activeNutrition,
      lastCheckInUnreviewed,
    })

    // Días de ENTRENO de la variante activa del programa (espejo de
    // programTrainingDayCount de la web: solo planes con bloques que matchean la
    // variante activa del microciclo A/B). Sin A/B ⇒ solo variante A (o sin variante).
    const abModeProgram = !!data.activeProgram?.ab_mode
    const activeVariant: 'A' | 'B' = abModeProgram
      ? programWeekCur % 2 === 1 ? 'A' : 'B'
      : 'A'
    const programTrainingDayCount = (data.activeProgram?.workoutPlans ?? []).filter((p) => {
      if ((p.blocks?.length ?? 0) <= 0) return false
      const pVar = (String(p.week_variant || 'A') as 'A' | 'B')
      return abModeProgram ? pVar === activeVariant : pVar === 'A'
    }).length

    return { series, currentWeight, initialWeight, weightDelta, streak, trainingAge, today, weeklyPRs, pendingPays, attention, attentionScore, lastActivityIso, programWeek, programWeekCur, programWeekTot, programTrainingDayCount }
  }, [data, client])

  async function onExportPdf() {
    if (!data || !client || !derived) return
    setExporting(true)
    try {
      const slope = linearRegressionKgPerDay(data.checkIns.map((c) => ({ created_at: c.created_at ?? c.date, weight: c.weight })))
      const bmi = derived.currentWeight != null && client.height_cm != null ? bmiFromMetric(derived.currentWeight, client.height_cm) : null
      const energy7 = avgEnergySince(data.checkIns.map((c) => ({ created_at: c.created_at ?? c.date, energy_level: c.energy_level })), new Date(Date.now() - 7 * 86400000))
      await exportProgressPdf({
        clientName: client.full_name,
        coachName: null,
        trainingAge: derived.trainingAge,
        initialWeight: derived.initialWeight,
        currentWeight: derived.currentWeight,
        changeKg: derived.initialWeight != null && derived.currentWeight != null ? round1(derived.currentWeight - derived.initialWeight) : null,
        projection4w: derived.currentWeight != null ? round1(derived.currentWeight + slope * 28) : null,
        ritmo30: round1(slope * 30),
        bmi,
        bmiCategory: bmi != null ? bmiCategory(bmi) : null,
        energy7d: energy7,
        nutritionWeekPct: data.compliance?.nutritionWeeklyAvgPct ?? 0,
        nutritionMonthPct: data.nutritionMonthlyAvgPct,
        nutritionStreak: data.nutritionStreakDays,
        sessions30d: data.sessions30d,
        sessionsYear: data.workoutDates371.length,
        checkInsTotal: data.checkIns.length,
        checkIns: data.checkIns.map((c) => ({ date: c.date, weight: c.weight, energy: c.energy_level, notes: c.notes, photo: c.front_photo_url })),
        prs: data.personalRecords.map((r) => ({ exerciseName: r.exerciseName, weightKg: r.maxWeightKg, reps: r.repsAtMax ?? 0, oneRm: round1(epleyOneRM(r.maxWeightKg, r.repsAtMax ?? 0)) })),
      })
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? 'Intenta nuevamente.')
    } finally {
      setExporting(false)
    }
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
        <EmptyState icon={User} title="Alumno no encontrado" subtitle="Vuelve a la lista de alumnos." />
      </SafeAreaView>
    )
  }

  // 5 chips fijos en el orden de la web: Peso · Adherencia · Workouts · Programa · Comidas hoy.
  const workoutsThisWeek = data.compliance?.workoutsThisWeek ?? 0
  const workoutsTarget = Math.max(1, data.compliance?.workoutsTarget ?? 1)
  const adherencePct = Math.min(100, Math.round((workoutsThisWeek / workoutsTarget) * 100))
  const mealsDone = derived.today?.mealsDone ?? 0
  const mealsTotal = Math.max(1, derived.today?.mealsTotal ?? 1)
  const mealsPct = derived.today?.compliancePct ?? 0
  const stats: HeroStat[] = [
    {
      label: 'Peso',
      value: derived.currentWeight != null && derived.currentWeight > 0 ? `${derived.currentWeight} kg` : '—',
      sub: { kind: 'weightDelta', delta: derived.weightDelta },
    },
    {
      label: 'Adherencia',
      value: `${adherencePct}%`,
      sub: { kind: 'progress', pct: adherencePct },
    },
    {
      label: 'Workouts',
      value: `${workoutsThisWeek}/${workoutsTarget}`,
      sub: { kind: 'text', text: 'esta semana' },
      icon: Dumbbell,
      iconColor: theme.primary,
    },
    {
      label: 'Programa',
      value: `Sem ${derived.programWeekCur}/${derived.programWeekTot}`,
      sub: { kind: 'progress', pct: (derived.programWeekCur / derived.programWeekTot) * 100 },
    },
    {
      label: 'Comidas hoy',
      value: `${mealsDone}/${mealsTotal}`,
      sub: { kind: 'text', text: `${mealsPct}% plan`, color: mealsPct >= 80 ? '#10B981' : '#F59E0B' },
      icon: Utensils,
      iconColor: '#10B981',
    },
  ]

  const tabs: TabItem[] = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'progreso', label: 'Progreso', icon: TrendingUp, badge: data.checkIns.length || null },
    { value: 'analisis', label: 'Análisis', icon: BarChart3, badge: data.personalRecords.length || null },
    { value: 'plan', label: 'Plan', icon: LayoutGrid, badge: derived.programTrainingDayCount || null },
    { value: 'nutricion', label: 'Nutrición', icon: Apple, badge: (data.compliance?.nutritionWeeklyAvgPct ?? 0) < 60 ? '!' : data.nutritionMeals.length || null },
    { value: 'facturacion', label: 'Facturación', icon: CreditCard, badge: derived.pendingPays || null },
  ]

  function onOpenPhoto(photos: string[], index: number) { setLightbox({ photos, index }) }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <TopBar back title={client.full_name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        {/* 0 — Hero */}
        <ClientHero
          name={client.full_name}
          email={client.email}
          statusLabel={client.is_archived ? 'Archivado' : client.is_active ? 'Activo' : 'Inactivo'}
          statusTone={client.is_archived ? 'muted' : client.is_active ? 'success' : 'muted'}
          attentionScore={derived.attentionScore}
          lastActivityLabel={relActivityLabel(derived.lastActivityIso)}
          trainingAge={derived.trainingAge}
          streak={derived.streak}
          clientSinceLabel={clientSinceLabel(client.subscription_start_date, client.created_at)}
          stats={stats}
          hasPhone={!!(client.phone ?? '').replace(/\D/g, '')}
          onWhatsApp={openWhatsApp}
          onNutrition={openNutrition}
          onTraining={openBuilder}
          onExportPdf={onExportPdf}
          exporting={exporting}
        />

        {/* 1 — Tab bar (sticky) */}
        <ClientTabBar items={tabs} value={tab} onChange={setTab} />

        {/* 2 — Content */}
        <View style={styles.tabContent}>
          {data.loadError ? (
            <View style={{ backgroundColor: '#EF444414', borderColor: '#EF444440', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 }}>
              <Text style={{ color: '#EF4444', fontFamily: 'Inter_700Bold', fontSize: 13 }}>No se pudieron cargar algunos datos</Text>
              <Text style={{ color: theme.foreground, fontFamily: theme.fontSans, fontSize: 11, opacity: 0.7 }}>{data.loadError}</Text>
            </View>
          ) : null}
          {tab === 'overview' ? (
            <OverviewTab data={data} reload={load} onOpenPhoto={onOpenPhoto} onEditProgram={openBuilder} onViewNutrition={() => setTab('nutricion')} />
          ) : tab === 'progreso' ? (
            <ProgresoTab data={data} onOpenPhoto={onOpenPhoto} onReload={load} />
          ) : tab === 'analisis' ? (
            <AnalisisTab data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading} />
          ) : tab === 'plan' ? (
            <PlanTab data={data} onEdit={openBuilder} />
          ) : tab === 'nutricion' ? (
            <NutricionTab data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading}
              onEditNutrition={() => router.push(`/coach/nutrition-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)} />
          ) : (
            <FacturacionTab data={data} reload={load} onAddPayment={() => setPayOpen(true)} onOpenPhoto={onOpenPhoto} onViewHistory={() => setTab('progreso')} />
          )}

          {tab === 'overview' ? (
            <>
              {mods.cardio || mods.movement || mods.bodycomp ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {mods.cardio ? (
                    <Button label="Perfil cardio" variant="outline" leftIcon={HeartPulse} onPress={() => router.push(`/coach/cardio/${client.id}`)} full />
                  ) : null}
                  {mods.movement ? (
                    <Button label="Screening de movimiento" variant="outline" leftIcon={ClipboardList} onPress={() => router.push(`/coach/movement/${client.id}`)} full />
                  ) : null}
                  {mods.bodycomp ? (
                    <Button label="Composición corporal" variant="outline" leftIcon={Scale} onPress={() => router.push(`/coach/bodycomp/${client.id}`)} full />
                  ) : null}
                </View>
              ) : null}
              <View style={{ height: 6 }} />
              <Button
                label={client.is_archived ? 'Reactivar alumno' : 'Archivar alumno'}
                variant={client.is_archived ? 'outline' : 'ghost'}
                leftIcon={client.is_archived ? ArchiveRestore : Archive}
                onPress={confirmArchive}
                full
              />
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* FAB — espejo de ProfileFloatingActions de la web (WhatsApp · Builder),
          más acciones mobile-only que la web resuelve en diálogos/pestañas. */}
      <Fab open={fabOpen} onToggle={() => setFabOpen((v) => !v)} actions={[
        { icon: MessageCircle, label: 'WhatsApp', color: '#25D366', onPress: () => { setFabOpen(false); openWhatsApp() } },
        ...(coachSlug ? [{ icon: Camera, label: 'Check-in alumno', color: theme.primary, onPress: () => { setFabOpen(false); openCheckIn() } }] : []),
        { icon: Dumbbell, label: 'Builder', onPress: () => { setFabOpen(false); openBuilder() } },
        { icon: CreditCard, label: 'Registrar pago', onPress: () => { setFabOpen(false); setPayOpen(true) } },
        { icon: Pencil, label: 'Editar datos', onPress: () => { setFabOpen(false); setEditOpen(true) } },
      ]} />

      <NativeDialog open={payOpen} title="Registrar pago" onClose={() => setPayOpen(false)}>
        <PaymentForm clientId={client.id} onDone={() => { setPayOpen(false); load() }} onCancel={() => setPayOpen(false)} />
      </NativeDialog>

      <NativeDialog open={editOpen} title="Editar alumno" onClose={() => setEditOpen(false)}>
        <EditClientForm client={client} onDone={() => { setEditOpen(false); load() }} onCancel={() => setEditOpen(false)} />
      </NativeDialog>

      <PhotoLightbox photos={lightbox?.photos ?? []} index={lightbox?.index ?? 0} visible={!!lightbox} onClose={() => setLightbox(null)} />
    </SafeAreaView>
  )
}

function Fab({ open, onToggle, actions }: { open: boolean; onToggle: () => void; actions: { icon: any; label: string; color?: string; onPress: () => void }[] }) {
  const { theme } = useTheme()
  return (
    <View style={styles.fabWrap} pointerEvents="box-none">
      {open ? actions.map((a, i) => {
        const Icon = a.icon
        return (
          <MotiView key={a.label} from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 180, delay: i * 40 }} style={styles.fabAction}>
            <View style={[styles.fabLabel, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.fabLabelTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{a.label}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={a.onPress}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={[styles.fabMini, { backgroundColor: a.color ?? theme.primary }]}
            >
              <Icon size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </MotiView>
        )
      }) : null}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { onToggle(); Haptics.selectionAsync().catch(() => {}) }}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Cerrar acciones rápidas' : 'Abrir acciones rápidas'}
        accessibilityState={{ expanded: open }}
        style={[styles.fab, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
      >
        <MotiView animate={{ rotate: open ? '45deg' : '0deg' }} transition={{ type: 'timing', duration: 180 }}>
          {open ? <X size={24} color={theme.primaryForeground} /> : <Plus size={24} color={theme.primaryForeground} />}
        </MotiView>
      </TouchableOpacity>
    </View>
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

function PaymentForm({ clientId, onDone, onCancel }: { clientId: string; onDone: () => void; onCancel: () => void }) {
  const { theme } = useTheme()
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [periodMonths, setPeriodMonths] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const amt = Math.round(Number(String(amount).replace(/\s/g, '')))
    if (!Number.isFinite(amt) || amt <= 0) { setError('Indica un monto válido.'); return }
    if (!description.trim()) { setError('Indica un concepto.'); return }
    const pm = periodMonths.trim() ? Number(periodMonths) : null
    setSaving(true)
    try {
      await apiFetch<{ ok: true }>('/api/mobile/coach/payments', {
        method: 'POST', authenticated: true,
        body: { clientId, amount: amt, paymentDate, serviceDescription: description.trim(), periodMonths: pm },
      })
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar el pago.')
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Monto (CLP)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="30000" theme={theme} />
      <Field label="Fecha" value={paymentDate} onChangeText={setPaymentDate} placeholder="2026-06-02" theme={theme} />
      <Field label="Concepto" value={description} onChangeText={setDescription} placeholder="Mensualidad" theme={theme} />
      <Field label="Período (meses, opcional)" value={periodMonths} onChangeText={setPeriodMonths} keyboardType="number-pad" placeholder="1" theme={theme} />
      {error ? <Text style={{ color: theme.destructive, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={saving ? 'Guardando...' : 'Registrar'} onPress={submit} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

const GOAL_OPTIONS = [
  'Perder grasa',
  'Aumentar masa muscular',
  'Recomposición corporal',
  'Mantenimiento general',
  'Rendimiento deportivo',
]
const GOAL_LABELS: Record<string, string> = {
  'Perder grasa': 'Perder grasa / Definición',
  'Aumentar masa muscular': 'Aumentar masa muscular / Volumen',
  'Recomposición corporal': 'Recomposición corporal',
  'Mantenimiento general': 'Mantenimiento general / Salud',
  'Rendimiento deportivo': 'Mejorar rendimiento deportivo',
}
const EXPERIENCE_OPTIONS = ['Principiante', 'Intermedio', 'Avanzado']
const AVAILABILITY_OPTIONS = ['2 días', '3 días', '4 días', '5 días', '6+ días']

function OptionPicker({ label, value, options, labels, onChange, theme }: {
  label: string
  value: string
  options: string[]
  labels?: Record<string, string>
  onChange: (v: string) => void
  theme: any
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: theme.fontSans }}>{label}</Text>
      <View style={styles.optWrap}>
        {options.map((o) => {
          const on = value === o
          return (
            <TouchableOpacity key={o} activeOpacity={0.8} onPress={() => onChange(on ? '' : o)}
              style={[styles.optChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : theme.secondary, borderRadius: theme.radius.lg }]}>
              <Text style={{ fontSize: 12.5, fontFamily: on ? 'Inter_700Bold' : theme.fontSans, color: on ? theme.primary : theme.foreground }}>{labels?.[o] ?? o}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function MultilineField({ label, value, onChangeText, theme, placeholder }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: theme.fontSans }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.mutedForeground} multiline
        style={{ minHeight: 64, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, paddingHorizontal: 12, paddingVertical: 10, fontFamily: theme.fontSans, textAlignVertical: 'top' }} />
    </View>
  )
}

function EditClientForm({ client, onDone, onCancel }: { client: CoachClientDetail; onDone: () => void; onCancel: () => void }) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fullName, setFullName] = useState(client.full_name)
  const [phone, setPhone] = useState(client.phone ?? '')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [goals, setGoals] = useState('')
  const [experience, setExperience] = useState('')
  const [availability, setAvailability] = useState('')
  const [injuries, setInjuries] = useState('')
  const [medical, setMedical] = useState('')
  const [goalWeight, setGoalWeight] = useState(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
  const [startDate, setStartDate] = useState(client.subscription_start_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getClientIntake(client.id).then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError(error)
      else if (data) {
        setFullName(data.full_name)
        setPhone(data.phone ?? '')
        setWeight(data.weight_kg != null ? String(data.weight_kg) : '')
        setHeight(data.height_cm != null ? String(data.height_cm) : '')
        setGoals(data.goals ?? '')
        setExperience(data.experience_level ?? '')
        setAvailability(data.availability ?? '')
        setInjuries(data.injuries ?? '')
        setMedical(data.medical_conditions ?? '')
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [client.id])

  async function submit() {
    setError(null)
    if (fullName.trim().length < 2) { setError('Indica el nombre.'); return }
    setSaving(true)
    const r = await updateClientIntake({
      clientId: client.id,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      weight_kg: weight.trim() ? Number(weight) : null,
      height_cm: height.trim() ? Number(height) : null,
      goals: goals.trim() || null,
      experience_level: experience.trim() || null,
      availability: availability.trim() || null,
      injuries: injuries.trim() || null,
      medical_conditions: medical.trim() || null,
      goal_weight_kg: goalWeight.trim() ? Number(goalWeight) : null,
      subscription_start_date: startDate.trim() || null,
    })
    setSaving(false)
    if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
    else onDone()
  }

  if (loading) {
    return <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={theme.primary} /></View>
  }

  return (
    <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
      {loadError ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{loadError}</Text> : null}
      <Field label="Nombre completo" value={fullName} onChangeText={setFullName} theme={theme} />
      <Field label="Teléfono (WhatsApp)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+56 9 ..." theme={theme} />
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}><Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="75.5" theme={theme} /></View>
        <View style={{ flex: 1 }}><Field label="Estatura (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" placeholder="178" theme={theme} /></View>
      </View>
      <OptionPicker label="Objetivo principal" value={goals} options={GOAL_OPTIONS} labels={GOAL_LABELS} onChange={setGoals} theme={theme} />
      <OptionPicker label="Experiencia" value={experience} options={EXPERIENCE_OPTIONS} onChange={setExperience} theme={theme} />
      <OptionPicker label="Días/semana" value={availability} options={AVAILABILITY_OPTIONS} onChange={setAvailability} theme={theme} />
      <MultilineField label="Lesiones / Limitaciones" value={injuries} onChangeText={setInjuries} placeholder="Ninguna" theme={theme} />
      <MultilineField label="Condiciones médicas" value={medical} onChangeText={setMedical} placeholder="Ninguna" theme={theme} />
      <Field label="Peso objetivo (kg)" value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder="72" theme={theme} />
      <Field label="Alumno desde" value={startDate} onChangeText={setStartDate} placeholder="2026-01-15" theme={theme} />
      {error ? <Text style={{ color: theme.destructive, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={saving ? 'Guardando...' : 'Guardar cambios'} onPress={submit} disabled={saving} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 96, gap: 14 },
  tabContent: { gap: 14, paddingTop: 14 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  formRow: { flexDirection: 'row', gap: 10 },
  optWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optChip: { borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  fabWrap: { position: 'absolute', right: 18, bottom: 28, alignItems: 'flex-end', gap: 12 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fabAction: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabMini: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  fabLabel: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  fabLabelTxt: { fontSize: 12 },
})
