import { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Activity, Apple, Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, CreditCard, Droplets, Dumbbell, Flame, Footprints, Heart, LayoutGrid, MessageCircle, Moon, Pencil, Salad, Share2, Target, Timer, TrendingDown, TrendingUp, Trophy, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, ComplianceRing, EmptyState, InfoRow, MacroPill, NativeDialog, ProgressBar, Section, SegmentedTabs, Sparkline, TopBar } from '../../../components'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { PhotoLightbox } from '../../../components/PhotoLightbox'
import { TrendChart } from '../../../components/coach/TrendChart'
import { apiFetch } from '../../../lib/api'
import {
  getCoachClientDetail,
  getCoachClientDayDetail,
  markCoachCheckInReviewed,
  setCoachClientArchived,
  updateCoachClient,
  type ActivityDay,
  type ActiveNutritionInfo,
  type CheckInEntry,
  type ClientDayDetail,
  type ComplianceSummary,
  type CoachClientDetail,
  type DaySeriesPoint,
  type FavoriteFoodEntry,
  type MuscleVolumeEntry,
  type NutritionMealPlanEntry,
  type NutritionTimelineEntry,
  type PaymentEntry,
  type PersonalRecordEntry,
  type ActiveProgramInfo,
} from '../../../lib/coach-client-detail'
import { getTodayInSantiago } from '../../../lib/date-utils'

type Tab = 'resumen' | 'actividad' | 'progreso' | 'pagos'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatCurrency(n: number): string {
  return `$${n.toLocaleString('es-CL')}`
}

export default function ClientDetailScreen() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('resumen')
  const [client, setClient] = useState<CoachClientDetail | null>(null)
  const [checkIns, setCheckIns] = useState<CheckInEntry[]>([])
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [activeProgram, setActiveProgram] = useState<ActiveProgramInfo | null>(null)
  const [activeNutrition, setActiveNutrition] = useState<ActiveNutritionInfo | null>(null)
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null)
  const [activity, setActivity] = useState<ActivityDay[]>([])
  const [personalRecords, setPersonalRecords] = useState<PersonalRecordEntry[]>([])
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeEntry[]>([])
  const [volumeSeries, setVolumeSeries] = useState<DaySeriesPoint[]>([])
  const [strengthSeries, setStrengthSeries] = useState<DaySeriesPoint[]>([])
  const [nutritionMeals, setNutritionMeals] = useState<NutritionMealPlanEntry[]>([])
  const [nutritionTimeline, setNutritionTimeline] = useState<NutritionTimelineEntry[]>([])
  const [nutritionMonthlyAvgPct, setNutritionMonthlyAvgPct] = useState(0)
  const [nutritionStreakDays, setNutritionStreakDays] = useState(0)
  const [favoriteFoods, setFavoriteFoods] = useState<FavoriteFoodEntry[]>([])
  const [selectedDate, setSelectedDate] = useState(() => getTodayInSantiago().iso)
  const [dayDetail, setDayDetail] = useState<ClientDayDetail | null>(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [sessions30d, setSessions30d] = useState(0)
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)
  const [chartMetric, setChartMetric] = useState('weight')

  async function load() {
    setLoading(true)
    try {
      const res = await getCoachClientDetail(clientId)
      setClient(res.client)
      setCheckIns(res.checkIns)
      setPayments(res.payments)
      setActiveProgram(res.activeProgram)
      setActiveNutrition(res.activeNutrition)
      setCompliance(res.compliance)
      setActivity(res.activity)
      setPersonalRecords(res.personalRecords)
      setMuscleVolume(res.muscleVolume)
      setVolumeSeries(res.volumeSeries)
      setStrengthSeries(res.strengthSeries)
      setNutritionMeals(res.nutritionMeals)
      setNutritionTimeline(res.nutritionTimeline)
      setNutritionMonthlyAvgPct(res.nutritionMonthlyAvgPct)
      setNutritionStreakDays(res.nutritionStreakDays)
      setFavoriteFoods(res.favoriteFoods)
      setSelectedDate((prev) => res.activity.find((day) => day.workout || day.nutrition || day.checkIn)?.date ?? prev)
      setSessions30d(res.sessions30d)
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
      if (!cancelled) {
        setDayDetail(detail)
        setDayLoading(false)
      }
    }
    loadDay()
    return () => { cancelled = true }
  }, [clientId, selectedDate])

  function openWhatsApp() {
    const digits = (client?.phone ?? '').replace(/\D/g, '')
    if (!digits) { Alert.alert('Sin teléfono', 'Este alumno no tiene teléfono cargado.'); return }
    const msg = `Hola ${client?.full_name?.split(' ')[0] ?? ''}! Te escribo desde EVA.`
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() => {})
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
          text: archiving ? 'Archivar' : 'Reactivar',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            const r = await setCoachClientArchived(client.id, archiving)
            if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo actualizar.')
            else load()
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando alumno…" />
      </SafeAreaView>
    )
  }
  if (!client) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <TopBar back title="Alumno" onBack={() => router.back()} />
        <EmptyState icon={User} title="Alumno no encontrado" subtitle="Vuelve a la lista de alumnos." />
      </SafeAreaView>
    )
  }

  const weights = [...checkIns].reverse().map((c) => c.weight).filter((w): w is number => w != null)
  const energies = [...checkIns].reverse().map((c) => c.energy_level).filter((e): e is number => e != null)

  // Progreso multi-chart: cada serie usa TrendChart (scrub táctil incluido).
  const CHART_DEFS = [
    { key: 'weight', label: 'Peso', points: weights.map((kg, i) => ({ label: String(i + 1), v: kg })), color: theme.primary, suffix: ' kg', decimals: 1 },
    { key: 'energy', label: 'Energía', points: energies.map((e, i) => ({ label: String(i + 1), v: e })), color: '#F59E0B', suffix: '/10', decimals: 0 },
    { key: 'calories', label: 'Calorías', points: nutritionTimeline.map((t, i) => ({ label: String(i + 1), v: Math.round(t.consumedCalories) })), color: '#10B981', suffix: ' kcal', decimals: 0 },
    { key: 'balance', label: 'Balance', points: nutritionTimeline.map((t, i) => ({ label: String(i + 1), v: Math.round(t.consumedCalories - t.targetCalories) })), color: '#8B5CF6', suffix: ' kcal', decimals: 0 },
    { key: 'volume', label: 'Volumen', points: volumeSeries.map((p, i) => ({ label: String(i + 1), v: p.v })), color: theme.primary, suffix: ' kg', decimals: 0 },
    { key: 'strength', label: 'Fuerza', points: strengthSeries.map((p, i) => ({ label: String(i + 1), v: p.v })), color: '#06B6D4', suffix: ' kg', decimals: 0 },
  ].filter((d) => d.points.length >= 2)
  const activeMetric = CHART_DEFS.find((d) => d.key === chartMetric) ?? CHART_DEFS[0]
  const currentWeight = weights.length ? weights[weights.length - 1] : null
  const weightDelta = weights.length >= 2 ? Number((weights[weights.length - 1] - weights[weights.length - 2]).toFixed(1)) : null
  const deltaUp = (weightDelta ?? 0) > 0

  async function exportSummary() {
    if (!client) return
    const latestCheckIn = checkIns[0]
    const nutritionWeek = nutritionTimeline.slice(0, 7)
    const nutritionWeekAvg = Math.round(
      nutritionWeek.reduce((sum, row) => sum + row.compliancePct, 0) / Math.max(1, nutritionWeek.length)
    )
    const report = [
      `EVA - Resumen alumno`,
      ``,
      `Alumno: ${client.full_name}`,
      `Email: ${client.email}`,
      client.phone ? `Telefono: ${client.phone}` : null,
      `Estado: ${client.is_archived ? 'Archivado' : client.is_active ? 'Activo' : 'Inactivo'}`,
      ``,
      `Peso actual: ${currentWeight != null ? `${currentWeight} kg` : 'Sin datos'}`,
      `Cambio ultimo check-in: ${weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta} kg` : 'Sin datos'}`,
      `Peso objetivo: ${client.goal_weight_kg != null ? `${client.goal_weight_kg} kg` : 'Sin objetivo'}`,
      latestCheckIn ? `Ultimo check-in: ${formatDate(latestCheckIn.date)}${latestCheckIn.weight != null ? ` - ${latestCheckIn.weight} kg` : ''}` : `Ultimo check-in: Sin datos`,
      ``,
      `Programa activo: ${activeProgram ? activeProgram.name : 'Sin programa'}`,
      activeProgram ? `Dias de entrenamiento: ${activeProgram.planCount}` : null,
      `Sesiones 30d: ${sessions30d}`,
      ``,
      `Nutricion activa: ${activeNutrition ? activeNutrition.name : 'Sin plan'}`,
      activeNutrition?.daily_calories != null ? `Meta kcal: ${activeNutrition.daily_calories}` : null,
      activeNutrition ? `Cumplimiento nutricion 7d: ${nutritionWeekAvg}%` : null,
      activeNutrition ? `Cumplimiento nutricion 30d: ${nutritionMonthlyAvgPct}%` : null,
      activeNutrition ? `Racha nutricion: ${nutritionStreakDays} dias` : null,
      ``,
      `Pagos registrados: ${payments.length}`,
      payments[0] ? `Ultimo pago: ${formatDate(payments[0].payment_date)} - ${formatCurrency(payments[0].amount)}` : null,
      ``,
      `Generado desde EVA Mobile`,
    ].filter(Boolean).join('\n')

    try {
      await Share.share({ title: `Resumen ${client.full_name}`, message: report })
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? 'Intenta nuevamente.')
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <TopBar back title={client.full_name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360 }}
          style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={[styles.heroAvatar, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
            <User size={28} color={theme.primary} strokeWidth={1.75} />
          </View>
          <Text style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{client.full_name}</Text>
          <Text style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{client.email}</Text>
          <Badge label={client.is_archived ? 'Archivado' : client.is_active ? 'Activo' : 'Inactivo'} tone={client.is_archived ? 'muted' : client.is_active ? 'success' : 'muted'} />
        </MotiView>

        {/* Stat strip */}
        <View style={styles.statStrip}>
          <MiniStat theme={theme} icon={Activity} label="Peso" value={currentWeight != null ? String(currentWeight) : '—'} unit={currentWeight != null ? 'kg' : ''} />
          <MiniStat theme={theme} icon={deltaUp ? TrendingUp : TrendingDown} label="Cambio"
            value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta}` : '—'} unit={weightDelta != null ? 'kg' : ''}
            color={weightDelta == null ? undefined : deltaUp ? '#EF4444' : theme.success} />
          <MiniStat theme={theme} icon={Dumbbell} label="Sesiones 30d" value={String(sessions30d)} />
          <MiniStat theme={theme} icon={Flame} label="Check-ins" value={String(checkIns.length)} />
        </View>

        <SegmentedTabs<Tab>
          items={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'actividad', label: 'Actividad' },
            { value: 'progreso', label: 'Progreso' },
            { value: 'pagos', label: 'Pagos' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'resumen' ? (
          <>
            {/* Quick actions */}
            <View style={styles.actionGrid}>
              <ActionTile icon={Dumbbell} label={activeProgram ? 'Editar programa' : 'Crear programa'} theme={theme}
                onPress={() => router.push(`/coach/program-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)} />
              <ActionTile icon={Salad} label="Nutrición" theme={theme} onPress={() => router.push('/coach/(tabs)/nutricion')} />
              <ActionTile icon={CreditCard} label="Registrar pago" theme={theme} onPress={() => setPayOpen(true)} />
              <ActionTile icon={Pencil} label="Editar datos" theme={theme} onPress={() => setEditOpen(true)} />
            </View>

            {compliance ? <CompliancePanel compliance={compliance} theme={theme} /> : null}
            <WeeklyComplianceBar activity={activity} theme={theme} />

            {(client.phone || client.goal_weight_kg != null || client.subscription_start_date) ? (
              <Section title="Información">
                {client.phone ? <InfoRow label="Teléfono" value={client.phone} /> : null}
                {client.subscription_start_date ? <InfoRow label="Alumno desde" value={formatDate(client.subscription_start_date)} last /> : null}
              </Section>
            ) : null}

            <GoalWeightInline client={client} theme={theme} onSaved={load} />

            {activeProgram ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/coach/program-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)}
                style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={styles.statTitleRow}><Dumbbell size={15} color={theme.primary} />
                  <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Programa activo</Text>
                </View>
                <Text style={[styles.statBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{activeProgram.name}</Text>
                <Text style={[styles.statSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{activeProgram.planCount} plan{activeProgram.planCount !== 1 ? 'es' : ''}</Text>
              </TouchableOpacity>
            ) : null}

            {activeProgram ? <ProgramStructurePanel program={activeProgram} theme={theme} /> : null}

            <NutritionCoachPanel
              activeNutrition={activeNutrition}
              meals={nutritionMeals}
              timeline={nutritionTimeline}
              monthlyAvgPct={nutritionMonthlyAvgPct}
              streakDays={nutritionStreakDays}
              favoriteFoods={favoriteFoods}
              theme={theme}
            />

            <Button label="Mensaje por WhatsApp" variant="outline" leftIcon={MessageCircle} onPress={openWhatsApp} full />
            <Button label="Exportar resumen" variant="outline" leftIcon={Share2} onPress={exportSummary} full />
            <Button label={client.is_archived ? 'Reactivar alumno' : 'Archivar alumno'} variant={client.is_archived ? 'outline' : 'ghost'}
              leftIcon={client.is_archived ? ArchiveRestore : Archive} onPress={confirmArchive} full />
          </>
        ) : null}

        {tab === 'actividad' ? (
          <>
            <TrainingAnalyticsPanel personalRecords={personalRecords} muscleVolume={muscleVolume} theme={theme} />
            <ActivityTab
              activity={activity}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              dayDetail={dayDetail}
              loading={dayLoading}
              theme={theme}
            />
          </>
        ) : null}

        {tab === 'progreso' ? (
          <>
            {CHART_DEFS.length && activeMetric ? (
              <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={styles.statTitleRow}><Activity size={15} color={activeMetric.color} />
                  <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Progreso · {activeMetric.label}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {CHART_DEFS.map((d) => {
                    const on = d.key === activeMetric.key
                    return (
                      <TouchableOpacity key={d.key} onPress={() => setChartMetric(d.key)} activeOpacity={0.8}
                        style={[styles.chartPill, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
                        <Text style={{ fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{d.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
                <TrendChart points={activeMetric.points} color={activeMetric.color} suffix={activeMetric.suffix} decimals={activeMetric.decimals} />
                <Text style={[styles.statSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Desliza el dedo sobre la gráfica para ver cada valor.</Text>
              </View>
            ) : null}
            {checkIns.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={[styles.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>HISTORIAL DE CHECK-INS</Text>
                {checkIns.map((c) => (
                  <CheckInCard key={c.id} c={c} clientId={client.id} theme={theme} onReviewed={load} onOpenPhoto={(photos, i) => setLightbox({ photos, index: i })} />
                ))}
              </View>
            ) : (
              <EmptyState icon={Activity} title="Sin check-ins" subtitle="Este alumno aún no registra check-ins." />
            )}
          </>
        ) : null}

        {tab === 'pagos' ? (
          <>
            <Button label="Registrar pago" leftIcon={CreditCard} onPress={() => setPayOpen(true)} full />
            {payments.length > 0 ? (
              <Section title="Historial de pagos">
                {payments.map((p, i) => (
                  <InfoRow key={p.id} label={`${formatDate(p.payment_date)}${p.service_description ? ` · ${p.service_description}` : ''}`}
                    value={formatCurrency(p.amount)} last={i === payments.length - 1} />
                ))}
              </Section>
            ) : (
              <EmptyState icon={CreditCard} title="Sin pagos" subtitle="Aún no hay pagos registrados." />
            )}
          </>
        ) : null}
      </ScrollView>

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

function MiniStat({ theme, icon: Icon, label, value, unit, color }: { theme: any; icon: any; label: string; value: string; unit?: string; color?: string }) {
  return (
    <View style={[styles.miniStat, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={14} color={color ?? theme.primary} />
      <Text style={[styles.miniValue, { color: color ?? theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
        {value}{unit ? <Text style={{ fontSize: 10, color: theme.mutedForeground }}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.miniLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function CompliancePanel({ compliance, theme }: { compliance: ComplianceSummary; theme: any }) {
  const workoutPct = Math.min(1, compliance.workoutsThisWeek / Math.max(1, compliance.workoutsTarget))
  const nutritionPct = Math.min(1, compliance.nutritionWeeklyAvgPct / 100)
  const checkPct = Math.min(1, compliance.checkInCompliancePercent / 100)
  const workoutDelta = Math.round((workoutPct * 100) - (Math.min(1, compliance.workoutsPrevWeek / Math.max(1, compliance.workoutsTarget)) * 100))
  const nutritionDelta = compliance.nutritionWeeklyAvgPct - compliance.nutritionPrevWeeklyAvgPct
  const checkDelta = compliance.checkInCompliancePercent - compliance.checkInCompliancePercentWeekAgo

  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Flame size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Cumplimiento semanal</Text>
      </View>
      <View style={styles.ringRow}>
        <ComplianceItem label="Entreno" hint={`${compliance.workoutsThisWeek}/${compliance.workoutsTarget}`} delta={workoutDelta} value={workoutPct} color={theme.primary} theme={theme} />
        <ComplianceItem label="Nutrición" hint={`${compliance.nutritionWeeklyAvgPct}%`} delta={nutritionDelta} value={nutritionPct} color={compliance.nutritionWeeklyAvgPct >= 70 ? theme.success : compliance.nutritionWeeklyAvgPct >= 50 ? '#F59E0B' : theme.destructive} theme={theme} />
        <ComplianceItem label="Check-in" hint={`${compliance.checkInCompliancePercent}%`} delta={checkDelta} value={checkPct} color={compliance.checkInCompliancePercent >= 70 ? theme.success : compliance.checkInCompliancePercent >= 40 ? '#F59E0B' : theme.destructive} theme={theme} />
      </View>
    </View>
  )
}

function ComplianceItem({ label, hint, delta, value, color, theme }: { label: string; hint: string; delta: number; value: number; color: string; theme: any }) {
  return (
    <View style={styles.complianceItem}>
      <ComplianceRing value={value} label={label} color={color} size={68} />
      <Text style={[styles.complianceHint, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{hint}</Text>
      <Text style={[styles.complianceDelta, { color: delta > 0 ? theme.success : delta < 0 ? theme.destructive : theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {delta > 0 ? '+' : ''}{delta} pts
      </Text>
    </View>
  )
}

function GoalWeightInline({ client, theme, onSaved }: { client: CoachClientDetail; theme: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const numeric = value.trim() ? Number(value.replace(',', '.')) : null
    const r = await updateCoachClient(client.id, { goal_weight_kg: numeric })
    setSaving(false)
    if (!r.ok) {
      Alert.alert('Error', r.error ?? 'No se pudo guardar.')
      return
    }
    setEditing(false)
    onSaved()
  }

  return (
    <View style={[styles.goalCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.goalTop}>
        <View style={styles.statTitleRow}>
          <Activity size={15} color={theme.primary} />
          <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Peso objetivo</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing((v) => !v)} hitSlop={8}>
          <Pencil size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>
      {editing ? (
        <View style={styles.goalEditRow}>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="75"
            placeholderTextColor={theme.mutedForeground}
            style={[styles.goalInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
          />
          <Button label={saving ? '...' : 'OK'} onPress={save} disabled={saving} style={{ width: 72 }} />
        </View>
      ) : (
        <Text style={[styles.goalValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
          {client.goal_weight_kg != null ? `${client.goal_weight_kg} kg` : 'Sin objetivo'}
        </Text>
      )}
    </View>
  )
}

function ProgramStructurePanel({ program, theme }: { program: ActiveProgramInfo; theme: any }) {
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()
  const currentWeek = resolveProgramWeek(program)
  const weekProgress = currentWeek && program.weeks_to_repeat > 0 ? currentWeek / program.weeks_to_repeat : 0
  const daysLeft = program.end_date ? Math.max(0, Math.ceil((new Date(`${program.end_date}T23:59:59`).getTime() - Date.now()) / 86400000)) : null

  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <LayoutGrid size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Microciclo del programa</Text>
      </View>

      <View style={styles.programMetaRow}>
        <MetaPill label={program.program_structure_type === 'cycle' ? 'Cíclico' : 'Semanal'} theme={theme} />
        {program.ab_mode ? <MetaPill label="A/B" theme={theme} tone="warning" /> : null}
        <MetaPill label={`${program.weeks_to_repeat} sem.`} theme={theme} />
        {daysLeft != null ? <MetaPill label={`${daysLeft}d restantes`} theme={theme} /> : null}
      </View>

      {currentWeek ? (
        <View style={{ gap: 6 }}>
          <View style={styles.programWeekRow}>
            <Text style={[styles.dayRowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Semana ciclo</Text>
            <Text style={[styles.dayMetric, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{currentWeek}/{program.weeks_to_repeat}</Text>
          </View>
          <ProgressBar value={weekProgress} color={theme.primary} height={7} />
        </View>
      ) : null}

      <View style={styles.programGrid}>
        {program.workoutPlans.length ? program.workoutPlans.map((plan) => (
          <View
            key={plan.id}
            style={[
              styles.programDay,
              {
                backgroundColor: plan.day_of_week === todayDow ? theme.primary + '12' : theme.secondary,
                borderColor: plan.day_of_week === todayDow ? theme.primary + '55' : theme.border,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <View style={styles.programDayTop}>
              <Text style={[styles.programDayDow, { color: plan.day_of_week === todayDow ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                {plan.day_of_week ? dayName(plan.day_of_week) : 'Día'}
              </Text>
              {plan.week_variant ? <Text style={[styles.variantText, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{plan.week_variant}</Text> : null}
            </View>
            <Text numberOfLines={2} style={[styles.programDayTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{plan.title}</Text>
            <Text style={[styles.dayRowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{plan.blocks.length} ejercicios</Text>
            {plan.blocks.slice(0, 3).map((block) => (
              <View key={block.id} style={styles.programExerciseRow}>
                <Dumbbell size={11} color={theme.primary} />
                <Text numberOfLines={1} style={[styles.programExerciseText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {block.exerciseName}
                </Text>
              </View>
            ))}
          </View>
        )) : (
          <Text style={[styles.emptyLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Programa sin días cargados.</Text>
        )}
      </View>
    </View>
  )
}

function TrainingAnalyticsPanel({ personalRecords, muscleVolume, theme }: { personalRecords: PersonalRecordEntry[]; muscleVolume: MuscleVolumeEntry[]; theme: any }) {
  const maxVolume = Math.max(1, ...muscleVolume.map((row) => row.volume))
  if (!personalRecords.length && !muscleVolume.length) return null

  return (
    <View style={{ gap: 12 }}>
      {personalRecords.length ? (
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={styles.statTitleRow}>
            <Trophy size={15} color="#F59E0B" />
            <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Récords de peso</Text>
          </View>
          {personalRecords.slice(0, 5).map((record, i) => (
            <View key={`${record.exerciseName}-${i}`} style={[styles.prRow, i < Math.min(personalRecords.length, 5) - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.dayRowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{record.exerciseName}</Text>
                <Text style={[styles.dayRowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{record.muscleGroup ?? 'Sin grupo'}</Text>
              </View>
              <Text style={[styles.prValue, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>
                {record.maxWeightKg} kg{record.repsAtMax != null ? ` x${record.repsAtMax}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {muscleVolume.length ? (
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={styles.statTitleRow}>
            <Target size={15} color={theme.primary} />
            <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Volumen por grupo (30d)</Text>
          </View>
          {muscleVolume.slice(0, 7).map((row) => (
            <View key={row.muscleGroup} style={styles.volumeRow}>
              <View style={styles.volumeLabelRow}>
                <Text style={[styles.volumeLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{row.muscleGroup}</Text>
                <Text style={[styles.volumeValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{Math.round(row.volume).toLocaleString('es-CL')}</Text>
              </View>
              <ProgressBar value={row.volume / maxVolume} color={theme.primary} height={6} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function NutritionCoachPanel({
  activeNutrition,
  meals,
  timeline,
  monthlyAvgPct,
  streakDays,
  favoriteFoods,
  theme,
}: {
  activeNutrition: ActiveNutritionInfo | null
  meals: NutritionMealPlanEntry[]
  timeline: NutritionTimelineEntry[]
  monthlyAvgPct: number
  streakDays: number
  favoriteFoods: FavoriteFoodEntry[]
  theme: any
}) {
  if (!activeNutrition) return null

  const latestLogged = timeline.find((row) => row.mealsDone > 0)
  const weekRows = timeline.slice(0, 7)
  const prevRows = timeline.slice(7, 14)
  const weekAvg = Math.round(weekRows.reduce((sum, row) => sum + row.compliancePct, 0) / Math.max(1, weekRows.length))
  const prevAvg = Math.round(prevRows.reduce((sum, row) => sum + row.compliancePct, 0) / Math.max(1, prevRows.length))
  const weekDelta = weekAvg - prevAvg
  const heatRows = [...timeline].reverse()
  const kcalRows = [...weekRows].reverse()
  const maxKcal = Math.max(1, ...kcalRows.map((row) => Math.max(row.targetCalories, row.consumedCalories)))

  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Apple size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Nutricion coach</Text>
      </View>

      <Text numberOfLines={1} style={[styles.statBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{activeNutrition.name}</Text>
      <View style={styles.macroRow}>
        {activeNutrition.daily_calories != null && <MacroPill label="kcal" value={activeNutrition.daily_calories} color={theme.primary} />}
        {activeNutrition.protein_g != null && <MacroPill label="P" value={activeNutrition.protein_g} color="#EF4444" />}
        {activeNutrition.carbs_g != null && <MacroPill label="C" value={activeNutrition.carbs_g} color="#F59E0B" />}
        {activeNutrition.fats_g != null && <MacroPill label="G" value={activeNutrition.fats_g} color="#8B5CF6" />}
      </View>

      <View style={styles.nutritionStatsRow}>
        <NutritionMetric label="7d" value={`${weekAvg}%`} delta={weekDelta} theme={theme} />
        <NutritionMetric label="30d" value={`${monthlyAvgPct}%`} theme={theme} />
        <NutritionMetric label="Racha" value={`${streakDays}d`} theme={theme} />
      </View>

      <View style={styles.nutritionHeatRow}>
        {heatRows.map((row) => (
          <View key={row.date} style={[styles.nutritionHeatCell, { backgroundColor: nutritionColor(row.compliancePct, theme), opacity: row.mealsTotal > 0 ? 1 : 0.28 }]} />
        ))}
      </View>

      {kcalRows.length ? (
        <View style={{ gap: 7 }}>
          {kcalRows.map((row) => {
            const day = new Date(`${row.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short' }).slice(0, 3)
            return (
              <View key={row.date} style={styles.kcalBarRow}>
                <Text style={[styles.kcalDay, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{day}</Text>
                <View style={[styles.kcalTrack, { backgroundColor: theme.secondary }]}>
                  <View style={{ width: `${Math.min(100, (row.targetCalories / maxKcal) * 100)}%`, height: '100%', borderRadius: 99, backgroundColor: theme.border }} />
                  <View style={{ position: 'absolute', left: 0, top: 0, width: `${Math.min(100, (row.consumedCalories / maxKcal) * 100)}%`, height: '100%', borderRadius: 99, backgroundColor: nutritionColor(row.compliancePct, theme) }} />
                </View>
                <Text style={[styles.kcalValue, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{row.consumedCalories}</Text>
              </View>
            )
          })}
        </View>
      ) : null}

      {favoriteFoods.length ? (
        <View style={{ gap: 8 }}>
          <View style={styles.statTitleRow}>
            <Heart size={14} color="#F43F5E" />
            <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Favoritos del alumno</Text>
          </View>
          <View style={styles.favoriteWrap}>
            {favoriteFoods.slice(0, 10).map((food) => (
              <View key={food.id} style={[styles.favoriteChip, { backgroundColor: '#F43F5E18', borderColor: '#F43F5E44', borderRadius: theme.radius.sm }]}>
                <Text numberOfLines={1} style={[styles.favoriteText, { color: '#F43F5E', fontFamily: 'Inter_700Bold' }]}>{food.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {meals.length ? (
        <View style={{ gap: 8 }}>
          <View style={styles.statTitleRow}>
            <Salad size={14} color={theme.primary} />
            <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Plan completo</Text>
          </View>
          {meals.slice(0, 6).map((meal, i) => (
            <View key={meal.id} style={[styles.nutritionMealRow, i < Math.min(meals.length, 6) - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.dayRowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{meal.name}</Text>
                <Text style={[styles.dayRowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {meal.day_of_week ? dayName(meal.day_of_week) : 'Todos'} · {meal.foodCount} alimentos
                </Text>
              </View>
              <Text style={[styles.dayMetric, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>{meal.calories} kcal</Text>
            </View>
          ))}
        </View>
      ) : null}

      {latestLogged ? (
        <Text style={[styles.statSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Ultimo registro: {formatDate(latestLogged.date)} · {latestLogged.mealsDone}/{latestLogged.mealsTotal} comidas
        </Text>
      ) : null}
    </View>
  )
}

function NutritionMetric({ label, value, delta, theme }: { label: string; value: string; delta?: number; theme: any }) {
  return (
    <View style={[styles.nutritionMetric, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Text style={[styles.nutritionMetricValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{value}</Text>
      <Text style={[styles.nutritionMetricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      {delta != null ? (
        <Text style={[styles.nutritionMetricDelta, { color: delta > 0 ? theme.success : delta < 0 ? theme.destructive : theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {delta > 0 ? '+' : ''}{delta} pts
        </Text>
      ) : null}
    </View>
  )
}

function nutritionColor(pct: number, theme: any): string {
  if (pct >= 80) return theme.success
  if (pct >= 50) return '#F59E0B'
  if (pct > 0) return theme.destructive
  return theme.border
}

function MetaPill({ label, theme, tone }: { label: string; theme: any; tone?: 'warning' }) {
  const color = tone === 'warning' ? '#F59E0B' : theme.primary
  return (
    <View style={[styles.metaPill, { backgroundColor: color + '16', borderColor: color + '44', borderRadius: theme.radius.sm }]}>
      <Text style={[styles.metaPillText, { color, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  )
}

function dayName(day: number): string {
  return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][day - 1] ?? `D${day}`
}

function resolveProgramWeek(program: ActiveProgramInfo): number | null {
  if (!program.start_date) return null
  const start = new Date(`${program.start_date}T12:00:00`).getTime()
  const now = Date.now()
  if (!Number.isFinite(start)) return null
  const diffDays = Math.max(0, Math.floor((now - start) / 86400000))
  return Math.min(Math.max(1, Math.ceil((diffDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

function WeeklyComplianceBar({ activity, theme }: { activity: ActivityDay[]; theme: any }) {
  const last7 = [...activity].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
  if (last7.length === 0) return null
  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Activity size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Cumplimiento semanal</Text>
      </View>
      <View style={styles.weekRow}>
        {last7.map((d) => {
          const score = ((d.workout ? 1 : 0) + (d.nutrition ? 1 : 0) + (d.checkIn ? 1 : 0)) / 3
          const date = new Date(`${d.date}T12:00:00`)
          return (
            <View key={d.date} style={styles.weekCol}>
              <View style={[styles.weekTrack, { backgroundColor: theme.muted }]}>
                <View style={{ height: `${Math.max(6, Math.round(score * 100))}%`, width: '100%', backgroundColor: score >= 0.66 ? theme.success : score > 0 ? theme.primary : theme.border, borderRadius: 5 }} />
              </View>
              <Text style={[styles.weekDow, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{date.toLocaleDateString('es-CL', { weekday: 'short' }).slice(0, 1).toUpperCase()}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ActivityTab({ activity, selectedDate, onSelectDate, dayDetail, loading, theme }: {
  activity: ActivityDay[]
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  loading: boolean
  theme: any
}) {
  const sorted = [...activity].sort((a, b) => a.date.localeCompare(b.date))
  const sidx = sorted.findIndex((d) => d.date === selectedDate)
  const cur = sidx >= 0 ? sorted[sidx] : null
  const go = (delta: 1 | -1) => {
    const ni = sidx + delta
    if (ni < 0 || ni >= sorted.length) return
    onSelectDate(sorted[ni].date)
    Haptics.selectionAsync().catch(() => {})
  }
  const swipe = Gesture.Race(
    Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => go(1)),
    Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => go(-1))
  )

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ gap: 14 }}>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={styles.statTitleRow}>
            <Activity size={15} color={theme.primary} />
            <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Historial de actividad</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
            {activity.map((day) => (
              <DayChip key={day.date} day={day} active={day.date === selectedDate} onPress={() => onSelectDate(day.date)} theme={theme} />
            ))}
          </ScrollView>
        </View>

        {/* DayNavigator: prev / fecha + adherencia / sig (también swipe ← →) */}
        <View style={[styles.dayNav, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <TouchableOpacity onPress={() => go(-1)} disabled={sidx <= 0} hitSlop={8}>
            <ChevronLeft size={22} color={sidx <= 0 ? theme.muted : theme.foreground} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={[styles.dayNavDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(selectedDate)}</Text>
            {cur ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={[styles.navDot, { backgroundColor: cur.workout ? theme.primary : theme.border }]} />
                <View style={[styles.navDot, { backgroundColor: cur.nutrition ? '#10B981' : theme.border }]} />
                <View style={[styles.navDot, { backgroundColor: cur.checkIn ? '#F59E0B' : theme.border }]} />
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => go(1)} disabled={sidx >= sorted.length - 1} hitSlop={8}>
            <ChevronRight size={22} color={sidx >= sorted.length - 1 ? theme.muted : theme.foreground} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 28 }}><EvaLoader size="sm" subtitle="Cargando día..." /></View>
        ) : dayDetail ? (
          <View style={{ gap: 12 }}>
            <DayWorkout detail={dayDetail} theme={theme} />
            <DayNutrition detail={dayDetail} theme={theme} />
            <DayHabits detail={dayDetail} theme={theme} />
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
}

function DayChip({ day, active, onPress, theme }: { day: ActivityDay; active: boolean; onPress: () => void; theme: any }) {
  const date = new Date(`${day.date}T12:00:00`)
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[styles.dayChip, { backgroundColor: active ? theme.primary : theme.secondary, borderColor: active ? theme.primary : theme.border, borderRadius: theme.radius.lg }]}
    >
      <Text style={[styles.dayDow, { color: active ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
        {date.toLocaleDateString('es-CL', { weekday: 'short' }).slice(0, 3)}
      </Text>
      <Text style={[styles.dayNum, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
        {date.getDate()}
      </Text>
      <View style={styles.dayDots}>
        <View style={[styles.dayDot, { backgroundColor: day.workout ? (active ? theme.primaryForeground : theme.primary) : theme.border }]} />
        <View style={[styles.dayDot, { backgroundColor: day.nutrition ? '#10B981' : theme.border }]} />
        <View style={[styles.dayDot, { backgroundColor: day.checkIn ? '#F59E0B' : theme.border }]} />
      </View>
    </TouchableOpacity>
  )
}

function DayWorkout({ detail, theme }: { detail: ClientDayDetail; theme: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Dumbbell size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Entrenamiento del día</Text>
      </View>
      {detail.workoutSets.length ? detail.workoutSets.slice(0, 12).map((set, i) => (
        <View key={`${set.exerciseName}-${i}`} style={[styles.dayRow, i < detail.workoutSets.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.dayRowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{set.exerciseName}</Text>
            <Text style={[styles.dayRowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{set.muscleGroup ?? 'Sin grupo'} · Serie {set.setNumber ?? '-'}</Text>
          </View>
          <Text style={[styles.dayMetric, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {set.weightKg ?? 0}kg x {set.repsDone ?? 0}
          </Text>
        </View>
      )) : (
        <Text style={[styles.emptyLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin sets registrados este día.</Text>
      )}
    </View>
  )
}

function DayNutrition({ detail, theme }: { detail: ClientDayDetail; theme: any }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const done = detail.nutritionMeals.filter((meal) => meal.completed).length
  const total = detail.nutritionMeals.length
  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Apple size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Nutrición del día</Text>
      </View>
      {total ? (
        <>
          <ProgressBar value={done / total} color={done / total >= 0.8 ? theme.success : '#F59E0B'} height={7} />
          {detail.nutritionMeals.map((meal, i) => {
            const isOpen = open.has(i)
            const hasFoods = meal.foods.length > 0
            return (
              <View key={`${meal.name}-${i}`}>
                <TouchableOpacity activeOpacity={hasFoods ? 0.7 : 1} onPress={() => { if (!hasFoods) return; setOpen((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n }) }} style={styles.mealRow}>
                  <Check size={14} color={meal.completed ? theme.success : theme.mutedForeground} />
                  <Text style={[styles.dayRowTitle, { color: meal.completed ? theme.foreground : theme.mutedForeground, fontFamily: 'Inter_600SemiBold', flex: 1 }]} numberOfLines={1}>{meal.name}</Text>
                  {hasFoods ? <Text style={[styles.mealCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{meal.foods.length} alim.</Text> : null}
                  {hasFoods ? <ChevronRight size={14} color={theme.mutedForeground} style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }} /> : null}
                </TouchableOpacity>
                {isOpen && hasFoods ? (
                  <View style={styles.foodList}>
                    {meal.foods.map((f, fi) => (
                      <Text key={fi} style={[styles.foodItem, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                        • {f.name}{f.quantity != null ? ` — ${f.quantity}${f.unit ? ` ${f.unit}` : ''}` : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            )
          })}
        </>
      ) : (
        <Text style={[styles.emptyLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin registro nutricional este día.</Text>
      )}
    </View>
  )
}

function DayHabits({ detail, theme }: { detail: ClientDayDetail; theme: any }) {
  const h = detail.habits
  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.statTitleRow}>
        <Flame size={15} color={theme.primary} />
        <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Hábitos</Text>
      </View>
      {h ? (
        <>
          <View style={styles.habitGrid}>
            <HabitItem icon={Droplets} label="Agua" value={h.water_ml != null ? `${h.water_ml} ml` : '-'} theme={theme} />
            <HabitItem icon={Footprints} label="Pasos" value={h.steps != null ? h.steps.toLocaleString('es-CL') : '-'} theme={theme} />
            <HabitItem icon={Moon} label="Sueño" value={h.sleep_hours != null ? `${h.sleep_hours}h` : '-'} theme={theme} />
            <HabitItem icon={Activity} label="Ayuno" value={h.fasting_hours != null ? `${h.fasting_hours}h` : '-'} theme={theme} />
          </View>
          {h.notes ? <Text style={[styles.ciNotes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{h.notes}</Text> : null}
        </>
      ) : (
        <Text style={[styles.emptyLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin hábitos registrados este día.</Text>
      )}
    </View>
  )
}

function HabitItem({ icon: Icon, label, value, theme }: { icon: any; label: string; value: string; theme: any }) {
  return (
    <View style={[styles.habitItem, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={15} color={theme.primary} />
      <Text style={[styles.habitValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
      <Text style={[styles.habitLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
    </View>
  )
}

function CheckInCard({ c, clientId, theme, onReviewed, onOpenPhoto }: { c: CheckInEntry; clientId: string; theme: any; onReviewed: () => void; onOpenPhoto: (photos: string[], index: number) => void }) {
  const photos = [c.front_photo_url, c.back_photo_url].filter(Boolean) as string[]
  async function review() {
    const r = await markCoachCheckInReviewed(clientId, c.id)
    if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo marcar como revisado.')
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onReviewed() }
  }
  return (
    <View style={[styles.ciCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={styles.ciTop}>
        <Text style={[styles.ciDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(c.date)}</Text>
        {c.weight != null ? <Text style={[styles.ciWeight, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{c.weight} kg</Text> : null}
      </View>
      <View style={[styles.reviewRow, { backgroundColor: c.reviewed_at ? theme.success + '18' : theme.secondary, borderColor: c.reviewed_at ? theme.success + '44' : theme.border }]}>
        <Text style={[styles.reviewText, { color: c.reviewed_at ? theme.success : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
          {c.reviewed_at ? 'Revisado por coach' : 'Pendiente de revisión'}
        </Text>
        {!c.reviewed_at ? (
          <TouchableOpacity onPress={review} hitSlop={8}>
            <Text style={[styles.reviewAction, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Marcar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {c.energy_level != null ? (
        <View style={styles.ciEnergyRow}>
          <Text style={[styles.ciEnergyLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Energía</Text>
          <View style={[styles.ciEnergyTrack, { backgroundColor: theme.muted }]}>
            <View style={{ width: `${(c.energy_level / 10) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: theme.primary }} />
          </View>
          <Text style={[styles.ciEnergyVal, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.energy_level}/10</Text>
        </View>
      ) : null}
      {c.notes ? <Text style={[styles.ciNotes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{c.notes}</Text> : null}
      {photos.length ? (
        <View style={styles.ciPhotos}>
          {photos.map((p, i) => (
            <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => onOpenPhoto(photos, i)}>
              <Image source={{ uri: p }} style={styles.ciPhoto} contentFit="cover" transition={150} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function ActionTile({ icon: Icon, label, onPress, theme }: { icon: typeof Dumbbell; label: string; onPress: () => void; theme: any }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}
      style={[styles.actionTile, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={20} color={theme.primary} strokeWidth={2.1} />
      <Text style={[styles.actionLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
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
  statStrip: { flexDirection: 'row', gap: 8 },
  miniStat: { flex: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, gap: 3, alignItems: 'flex-start' },
  miniValue: { fontSize: 16, letterSpacing: -0.3 },
  miniLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  ringRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  complianceItem: { flex: 1, alignItems: 'center', gap: 4 },
  complianceHint: { fontSize: 13 },
  complianceDelta: { fontSize: 10 },
  goalCard: { padding: 16, borderWidth: 1, gap: 10 },
  goalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalValue: { fontSize: 24, letterSpacing: -0.5 },
  goalEditRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  goalInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  programMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  metaPillText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },
  programWeekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  programGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  programDay: { width: '47%', flexGrow: 1, borderWidth: 1, padding: 12, gap: 6 },
  programDayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  programDayDow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  variantText: { fontSize: 10, textTransform: 'uppercase' },
  programDayTitle: { fontSize: 13, lineHeight: 17 },
  programExerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  programExerciseText: { flex: 1, fontSize: 11 },
  prRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 },
  prValue: { fontSize: 13 },
  volumeRow: { gap: 6 },
  volumeLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  volumeLabel: { fontSize: 12, flex: 1 },
  volumeValue: { fontSize: 11 },
  nutritionStatsRow: { flexDirection: 'row', gap: 8, paddingTop: 2 },
  nutritionMetric: { flex: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  nutritionMetricValue: { fontSize: 17, letterSpacing: -0.2 },
  nutritionMetricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  nutritionMetricDelta: { fontSize: 10 },
  nutritionHeatRow: { flexDirection: 'row', gap: 2, paddingVertical: 4 },
  nutritionHeatCell: { flex: 1, height: 18, minWidth: 4, borderRadius: 4 },
  kcalBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kcalDay: { width: 32, fontSize: 10, textTransform: 'uppercase' },
  kcalTrack: { flex: 1, height: 7, borderRadius: 99, overflow: 'hidden' },
  kcalValue: { width: 46, textAlign: 'right', fontSize: 11 },
  favoriteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  favoriteChip: { maxWidth: '48%', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  favoriteText: { fontSize: 11 },
  nutritionMealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9 },
  dayStrip: { gap: 8, paddingTop: 4 },
  dayChip: { width: 58, paddingVertical: 9, paddingHorizontal: 8, borderWidth: 1, alignItems: 'center', gap: 3 },
  dayDow: { fontSize: 10, textTransform: 'uppercase' },
  dayNum: { fontSize: 18, lineHeight: 21 },
  dayDots: { flexDirection: 'row', gap: 3, marginTop: 2 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  dayNavDate: { fontSize: 14, textTransform: 'capitalize' },
  navDot: { width: 6, height: 6, borderRadius: 3 },
  mealCount: { fontSize: 11 },
  foodList: { paddingLeft: 22, paddingBottom: 6, gap: 3 },
  foodItem: { fontSize: 12, lineHeight: 17 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6, marginTop: 4 },
  weekCol: { flex: 1, alignItems: 'center', gap: 6 },
  weekTrack: { width: '100%', height: 56, borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden' },
  weekDow: { fontSize: 10 },
  chartPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9 },
  dayRowTitle: { fontSize: 13, flexShrink: 1 },
  dayRowSub: { fontSize: 11, marginTop: 2 },
  dayMetric: { fontSize: 13 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  habitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  habitItem: { width: '47%', flexGrow: 1, borderWidth: 1, padding: 10, gap: 3 },
  habitValue: { fontSize: 14 },
  habitLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyLine: { fontSize: 13, lineHeight: 18 },
  macroRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  listHeading: { fontSize: 11, letterSpacing: 0.8 },
  ciCard: { borderWidth: 1, padding: 14, gap: 8 },
  ciTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  reviewText: { fontSize: 12 },
  reviewAction: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  ciDate: { fontSize: 14 },
  ciWeight: { fontSize: 15 },
  ciEnergyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ciEnergyLabel: { fontSize: 12, width: 54 },
  ciEnergyTrack: { flex: 1, height: 6, borderRadius: 99, overflow: 'hidden' },
  ciEnergyVal: { fontSize: 12, width: 38, textAlign: 'right' },
  ciNotes: { fontSize: 13, lineHeight: 18 },
  ciPhotos: { flexDirection: 'row', gap: 8, marginTop: 2 },
  ciPhoto: { width: 64, height: 80, borderRadius: 10 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48, gap: 14 },
  heroCard: { padding: 22, borderWidth: 1, alignItems: 'center', gap: 8 },
  heroAvatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionTile: { width: '47%', flexGrow: 1, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionLabel: { fontSize: 13, flexShrink: 1 },
  statCard: { padding: 18, borderWidth: 1, gap: 8 },
  statTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  statBig: { fontSize: 17, letterSpacing: -0.2 },
  statSub: { fontSize: 13 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
})
