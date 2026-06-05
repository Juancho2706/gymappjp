import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Apple, Archive, ArchiveRestore, BarChart3, CreditCard, Dumbbell, LayoutGrid, MessageCircle, Plus, Salad, Scale, TrendingUp, User, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, NativeDialog, TopBar } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { PhotoLightbox } from '../../../components/PhotoLightbox'
import { ClientHero, type HeroChip } from '../../../components/coach/clientDetail/ClientHero'
import { ClientTabBar, type ClientTab, type TabItem } from '../../../components/coach/clientDetail/ClientTabBar'
import { OverviewTab } from '../../../components/coach/clientDetail/OverviewTab'
import { ProgresoTab } from '../../../components/coach/clientDetail/ProgresoTab'
import { AnalisisTab } from '../../../components/coach/clientDetail/AnalisisTab'
import { PlanTab } from '../../../components/coach/clientDetail/PlanTab'
import { NutricionTab } from '../../../components/coach/clientDetail/NutricionTab'
import { FacturacionTab } from '../../../components/coach/clientDetail/FacturacionTab'
import { apiFetch } from '../../../lib/api'
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

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()

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

  useEffect(() => {
    let cancelled = false
    async function loadDay() {
      if (!clientId || !selectedDate) return
      setDayLoading(true)
      const detail = await getCoachClientDayDetail(clientId, selectedDate)
      if (!cancelled) { setDayDetail(detail); setDayLoading(false) }
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
    const weeklyPRs = findWeeklyWeightPRs(data.workoutLogs)
    const pendingPays = data.payments.filter((p) => ['pending', 'pendiente'].includes((p.status ?? '').toLowerCase())).length

    // Attention
    let attention: string | null = null
    if (data.compliance && data.compliance.checkInCompliancePercent < 40) attention = 'Check-ins irregulares — conviene contactar.'
    else if (data.activeNutrition && (data.compliance?.nutritionWeeklyAvgPct ?? 0) < 40) attention = 'Adherencia nutricional baja esta semana.'
    else if (data.checkIns[0] && !data.checkIns[0].reviewed_at) attention = 'Hay un check-in sin revisar.'

    return { series, currentWeight, initialWeight, weightDelta, streak, trainingAge, today, weeklyPRs, pendingPays, attention }
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
        weightSeries: derived.series.map((c) => ({ date: c.date, weight: Number(c.weight) })),
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

  const chips: HeroChip[] = []
  chips.push({ icon: Scale, label: derived.weightDelta != null ? `Δ ${derived.weightDelta > 0 ? '+' : ''}${derived.weightDelta} kg` : 'Peso', value: derived.currentWeight != null ? `${derived.currentWeight} kg` : '—', color: derived.weightDelta == null ? undefined : derived.weightDelta > 0 ? '#EF4444' : theme.success })
  chips.push({ icon: Apple, label: 'Adherencia', value: `${data.compliance?.nutritionWeeklyAvgPct ?? 0}%` })
  chips.push({ icon: Dumbbell, label: 'Entrenos sem', value: `${data.compliance?.workoutsThisWeek ?? 0}/${data.compliance?.workoutsTarget ?? 1}` })
  if (derived.today) chips.push({ icon: Salad, label: 'Comidas hoy', value: `${derived.today.mealsDone}/${derived.today.mealsTotal}` })

  const tabs: TabItem[] = [
    { value: 'overview', label: 'Resumen', icon: LayoutGrid },
    { value: 'progreso', label: 'Progreso', icon: TrendingUp, badge: data.checkIns.length || null },
    { value: 'analisis', label: 'Análisis', icon: BarChart3, badge: derived.weeklyPRs.length || null },
    { value: 'plan', label: 'Plan', icon: Dumbbell, badge: data.activeProgram?.planCount || null },
    { value: 'nutricion', label: 'Nutrición', icon: Apple, badge: derived.attention && data.activeNutrition && (data.compliance?.nutritionWeeklyAvgPct ?? 0) < 40 ? '!' : null },
    { value: 'facturacion', label: 'Pagos', icon: CreditCard, badge: derived.pendingPays || null },
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
          attention={derived.attention}
          trainingAge={derived.trainingAge}
          streak={derived.streak}
          chips={chips}
          onWhatsApp={openWhatsApp}
          onExportPdf={onExportPdf}
          exporting={exporting}
        />

        {/* 1 — Tab bar (sticky) */}
        <ClientTabBar items={tabs} value={tab} onChange={setTab} />

        {/* 2 — Content */}
        <View style={styles.tabContent}>
          {tab === 'overview' ? (
            <OverviewTab data={data} reload={load} onOpenPhoto={onOpenPhoto} onEditProgram={openBuilder} />
          ) : tab === 'progreso' ? (
            <ProgresoTab data={data} onOpenPhoto={onOpenPhoto} />
          ) : tab === 'analisis' ? (
            <AnalisisTab data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading} />
          ) : tab === 'plan' ? (
            <PlanTab data={data} onEdit={openBuilder} />
          ) : tab === 'nutricion' ? (
            <NutricionTab data={data} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayDetail={dayDetail} dayLoading={dayLoading} />
          ) : (
            <FacturacionTab data={data} reload={load} onAddPayment={() => setPayOpen(true)} onOpenPhoto={onOpenPhoto} />
          )}

          <View style={{ height: 6 }} />
          <Button
            label={client.is_archived ? 'Reactivar alumno' : 'Archivar alumno'}
            variant={client.is_archived ? 'outline' : 'ghost'}
            leftIcon={client.is_archived ? ArchiveRestore : Archive}
            onPress={confirmArchive}
            full
          />
        </View>
      </ScrollView>

      {/* FAB */}
      <Fab open={fabOpen} onToggle={() => setFabOpen((v) => !v)} actions={[
        { icon: MessageCircle, label: 'WhatsApp', color: '#25D366', onPress: () => { setFabOpen(false); openWhatsApp() } },
        { icon: CreditCard, label: 'Registrar pago', onPress: () => { setFabOpen(false); setPayOpen(true) } },
        { icon: Dumbbell, label: 'Editar programa', onPress: () => { setFabOpen(false); openBuilder() } },
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
            <TouchableOpacity activeOpacity={0.85} onPress={a.onPress} style={[styles.fabMini, { backgroundColor: a.color ?? theme.primary }]}>
              <Icon size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </MotiView>
        )
      }) : null}
      <TouchableOpacity activeOpacity={0.85} onPress={() => { onToggle(); Haptics.selectionAsync().catch(() => {}) }} style={[styles.fab, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}>
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
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 96, gap: 14 },
  tabContent: { gap: 14, paddingTop: 14 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  fabWrap: { position: 'absolute', right: 18, bottom: 28, alignItems: 'flex-end', gap: 12 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fabAction: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabMini: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  fabLabel: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  fabLabelTxt: { fontSize: 12 },
})
