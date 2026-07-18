import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Battery,
  CalendarCheck,
  CalendarRange,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Minus,
  Moon,
  Pencil,
  PersonStanding,
  PieChart,
  Plus,
  Scale,
  Sparkles,
  Star,
  StickyNote,
  type LucideIcon,
} from 'lucide-react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, ComplianceRing, Input, ProgressBar, Sheet } from '../../../components'
import { InfoTooltip } from '../../InfoTooltip'
import { PHASE_COLORS } from '../ProgramConfigSheet'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago, isoDateAddDays } from '../../../lib/date-utils'
import { daysBetweenCalendar } from '../../../lib/checkin-thresholds'
import { StatCard } from './shared'
import {
  buildProfileActivityCalendar,
  longestActivityStreak,
} from '../../../lib/profile-analytics'
import { getProfileTopAlert, type ProfileAlertType } from '../../../lib/profile-top-alert'
import {
  markCoachCheckInReviewed,
  unmarkCoachCheckInReviewed,
  upsertClientBiometrics,
  type ClientSex,
  type CoachClientDetailData,
  type DailyHabitRow,
  type DailyHabitsSummary,
} from '../../../lib/coach-client-detail'
import type { ClientActionWorkspace } from '../../../lib/client-actions'
import { filterPlansForStructureView, resolveActiveWeekVariantForDisplay } from '../../../lib/program-week-variant'
import { FONT } from '../../../lib/typography'

type SexOption = ClientSex | 'none'
const SEX_OPTIONS: { value: SexOption; label: string }[] = [
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'other', label: 'Otro' },
  { value: 'none', label: 'Sin especificar' },
]

function parseBio(raw: string): number | null {
  const value = raw.trim().replace(',', '.')
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveProgramWeek(program: NonNullable<CoachClientDetailData['activeProgram']>, today: string): number | null {
  if (!program.start_date) return null
  const elapsedDays = Math.max(0, daysBetweenCalendar(program.start_date, today))
  return Math.min(Math.max(1, Math.ceil((elapsedDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text className="text-strong" style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  )
}

function TopAlertBanner({ type, message }: { type: ProfileAlertType; message: string }) {
  const visual = type === 'danger'
    ? { shell: 'border-danger-500 bg-danger-100', text: 'text-danger-700', icon: 'text-danger-600', Icon: AlertTriangle }
    : type === 'warning'
      ? { shell: 'border-warning-500 bg-warning-100', text: 'text-warning-700', icon: 'text-warning-600', Icon: AlertTriangle }
      : type === 'success'
        ? { shell: 'border-success-500 bg-success-100', text: 'text-success-700', icon: 'text-success-600', Icon: Sparkles }
        : { shell: 'border-sport-500 bg-sport-100', text: 'text-sport-700', icon: 'text-sport-600', Icon: Info }
  const Icon = visual.Icon
  return (
    <View className={visual.shell} style={styles.alertBanner}>
      <Icon size={20} className={visual.icon} />
      <Text className={visual.text} style={styles.alertMsg}>{message}</Text>
    </View>
  )
}

export function OverviewTab({
  data,
  reload,
  onOpenPhoto,
  onEditProgram,
  onViewNutrition,
  onViewProgress,
  onOpenProgram,
  workspace,
  moduleFlags,
  modulesReady,
}: {
  data: CoachClientDetailData
  reload: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  onEditProgram: () => void
  onViewNutrition?: () => void
  onViewProgress?: () => void
  onOpenProgram?: () => void
  workspace: ClientActionWorkspace
  moduleFlags: { cardio: boolean; movement: boolean; bodycomp: boolean }
  modulesReady: boolean
}) {
  const { theme } = useTheme()
  const {
    client,
    compliance,
    activeProgram,
    checkIns,
    workoutDates371,
    nutritionActivityDates371,
    sessions30d,
    nutritionTodayCompliancePct,
    lastWorkoutAt,
    dailyHabits,
    dailyHabitsSummary,
  } = data

  const calendar = useMemo(
    () => buildProfileActivityCalendar(workoutDates371, checkIns.map((checkIn) => checkIn.date)),
    [workoutDates371, checkIns],
  )
  const longestStreak = useMemo(() => longestActivityStreak(calendar), [calendar])
  const todayIso = getTodayInSantiago().iso
  const currentActivityStreak = useMemo(() => {
    const days = new Set([
      ...workoutDates371.map((date) => date.slice(0, 10)),
      ...nutritionActivityDates371,
    ])
    let cursor = days.has(todayIso) ? todayIso : isoDateAddDays(todayIso, -1)
    let count = 0
    while (days.has(cursor)) {
      count += 1
      cursor = isoDateAddDays(cursor, -1)
    }
    return count
  }, [nutritionActivityDates371, todayIso, workoutDates371])

  const sortedCheckIns = useMemo(
    () => [...checkIns]
      .sort((a, b) => String(b.created_at ?? b.date).localeCompare(String(a.created_at ?? a.date))),
    [checkIns],
  )
  const latestCheckIn = sortedCheckIns[0] ?? null
  const previousCheckIn = sortedCheckIns[1] ?? null
  const currentWeight = Number(latestCheckIn?.weight || client?.initial_weight_kg || 0)
  const weeklyWeightVariation = previousCheckIn
    ? currentWeight - Number(previousCheckIn.weight ?? 0)
    : 0
  const weightDelta30d = useMemo(() => {
    const cutoff = isoDateAddDays(todayIso, -30)
    const latest = sortedCheckIns[0]?.weight
    const baseline = sortedCheckIns.find((checkIn) => {
      const day = checkIn.created_at
        ? getSantiagoIsoYmdForUtcInstant(checkIn.created_at)
        : checkIn.date.slice(0, 10)
      return day <= cutoff
    })?.weight
    if (latest == null || baseline == null) return null
    return Math.round((Number(latest) - Number(baseline)) * 10) / 10
  }, [sortedCheckIns, todayIso])

  if (!compliance || !client) return null

  const target = Math.max(1, compliance.workoutsTarget)
  const workoutPct = Math.min(100, Math.round((compliance.workoutsThisWeek / target) * 100))
  const previousWorkoutPct = Math.min(100, Math.round((compliance.workoutsPrevWeek / target) * 100))
  const workoutDelta = workoutPct - previousWorkoutPct
  const nutritionPct = Math.min(100, compliance.nutritionWeeklyAvgPct)
  const nutritionDelta = compliance.nutritionWeeklyAvgPct - compliance.nutritionPrevWeeklyAvgPct
  const checkInPct = Math.min(100, compliance.checkInCompliancePercent)
  const checkInDelta = compliance.checkInCompliancePercent - compliance.checkInCompliancePercentWeekAgo
  const currentWeek = activeProgram ? resolveProgramWeek(activeProgram, todayIso) : null
  const totalWeeks = Math.max(1, activeProgram?.weeks_to_repeat ?? 1)
  const programEndIso = activeProgram?.end_date
    ?? (activeProgram?.start_date ? isoDateAddDays(activeProgram.start_date, totalWeeks * 7) : null)
  const planDaysRemaining = programEndIso ? daysBetweenCalendar(todayIso, programEndIso) : undefined
  const recentPhotos = sortedCheckIns.filter((checkIn) => checkIn.front_photo_url || checkIn.side_photo_url || checkIn.back_photo_url).slice(0, 3)
  const topAlert = getProfileTopAlert({
    checkIns: sortedCheckIns,
    compliance: {
      nutritionCompliancePercent: nutritionTodayCompliancePct,
      planDaysRemaining,
      currentStreak: currentActivityStreak,
    },
    lastWorkoutDate: lastWorkoutAt,
    oneRMDelta: null,
  })

  const kpis: Kpi[] = [
    { icon: Flame, label: 'Mejor racha', value: `${longestStreak} día${longestStreak === 1 ? '' : 's'}`, hint: 'histórico', tone: 'ember' },
    { icon: Dumbbell, label: 'Sesiones', value: String(sessions30d), hint: 'últimos 30 días', tone: 'sport' },
    {
      icon: PieChart,
      label: 'Adherencia entreno',
      value: `${workoutPct}%`,
      hint: `${workoutDelta >= 0 ? '+' : ''}${workoutDelta}% vs sem. ant.`,
      tone: 'sport',
      info: 'Porcentaje de entrenamientos completados frente al objetivo semanal.',
    },
    {
      icon: Scale,
      label: 'Δ Peso (30d)',
      value: weightDelta30d == null ? '—' : `${weightDelta30d > 0 ? '+' : ''}${weightDelta30d} kg`,
      hint: 'check-ins',
      tone: weightDelta30d != null && weightDelta30d > 0 ? 'ember' : 'success',
    },
    { icon: CalendarRange, label: 'Sem. programa', value: activeProgram && currentWeek ? `${currentWeek} / ${totalWeeks}` : '—', hint: 'ciclo activo', tone: 'sport' },
  ]

  return (
    <View style={styles.root}>
      {topAlert ? <TopAlertBanner type={topAlert.type} message={topAlert.message} /> : null}

      <StatCard>
        <SectionTitle>Cumplimiento semanal</SectionTitle>
        <View style={styles.ringRow}>
          <Ring label="Entreno" value={workoutPct} color={theme.primary} delta={workoutDelta} />
          <Ring label="Nutrición" value={nutritionPct} color={nutritionPct >= 70 ? theme.success : nutritionPct >= 50 ? theme.warning : theme.destructive} delta={nutritionDelta} onPress={onViewNutrition} />
          <Ring label="Check-in" value={checkInPct} color={checkInPct >= 70 ? theme.success : checkInPct >= 40 ? theme.warning : theme.destructive} delta={checkInDelta} />
        </View>
      </StatCard>

      <View style={styles.kpiGrid}>
        {kpis.map((item, index) => <KpiCard key={item.label} item={item} index={index} />)}
      </View>

      <View style={styles.sectionBlock}>
        <SectionTitle>Programa</SectionTitle>
        <ProgramSummary
          clientId={client.id}
          program={activeProgram}
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          daysRemaining={planDaysRemaining}
          nutritionAtRisk={nutritionTodayCompliancePct < 60}
          onAssign={onEditProgram}
          onOpen={onOpenProgram ?? onEditProgram}
          onViewNutrition={onViewNutrition}
        />
      </View>

      <KeyMetricsCard
        client={client}
        currentWeight={currentWeight}
        weeklyVariation={weeklyWeightVariation}
        reload={reload}
        workspace={workspace}
      />

      <HabitsMiniWidget summary={dailyHabitsSummary} rows={dailyHabits} />

      <CheckInSnapshot
        checkIn={latestCheckIn}
        clientId={client.id}
        reload={reload}
        onOpenPhoto={onOpenPhoto}
        onViewProgress={onViewProgress}
        workspace={workspace}
      />

      <VisualEvolution checkIns={recentPhotos} onOpenPhoto={onOpenPhoto} />
      <ToolsSection clientId={client.id} moduleFlags={moduleFlags} ready={modulesReady} />
      <Button label="Editar plan" variant="sport" leftIcon={Pencil} onPress={onEditProgram} full />
    </View>
  )
}

type KpiTone = 'sport' | 'ember' | 'success'
type Kpi = { icon: LucideIcon; label: string; value: string; hint: string; tone: KpiTone; info?: string }

function KpiCard({ item, index }: { item: Kpi; index: number }) {
  const reduceMotion = useReducedMotion()
  const Icon = item.icon
  const tile = item.tone === 'ember'
    ? 'bg-ember-100 dark:bg-ember-100/20'
    : item.tone === 'success'
      ? 'bg-success-100 dark:bg-success-100/[0.18]'
      : 'bg-sport-100 dark:bg-sport-100/20'
  const icon = item.tone === 'ember' ? 'text-ember-600' : item.tone === 'success' ? 'text-success-600' : 'text-sport-600'
  const settled = { opacity: 1, translateY: 0 }
  return (
    <MotiView
      from={reduceMotion ? settled : { opacity: 0, translateY: 8 }}
      animate={settled}
      transition={{ type: 'timing', duration: reduceMotion ? 0 : 250, delay: reduceMotion ? 0 : index * 50 }}
      style={styles.kpiHalf}
    >
      <View className="border border-subtle bg-surface-card" style={styles.kpiCard}>
        <View className={tile} style={styles.kpiIcon}><Icon size={18} className={icon} /></View>
        <View style={styles.kpiCopy}>
          <Text className="text-strong" style={styles.kpiValue}>{item.value}</Text>
          <View style={styles.kpiLabelRow}>
            <Text className="text-muted" style={styles.kpiLabel} numberOfLines={1}>{item.label} · {item.hint}</Text>
            {item.info ? <InfoTooltip title={item.label} content={item.info} size={12} /> : null}
          </View>
        </View>
      </View>
    </MotiView>
  )
}

function Ring({ label, value, color, delta, onPress }: { label: string; value: number; color: string; delta: number | null; onPress?: () => void }) {
  const { theme } = useTheme()
  const deltaCopy = delta == null || delta === 0 ? 'sin cambio versus semana anterior' : `${delta > 0 ? 'sube' : 'baja'} ${Math.abs(delta)} puntos`
  const body = (
    <View style={styles.ringItem}>
      <View style={styles.ringGraphic}>
        <ComplianceRing value={value / 100} label="" color={color} size={84} strokeWidth={8} />
      </View>
      <Text className="text-strong" style={styles.ringLabel}>{label}</Text>
      <Text style={[styles.ringDelta, { color: delta == null || delta === 0 ? theme.ink300 : delta > 0 ? theme.success : theme.destructive }]}>
        {delta == null || delta === 0 ? '— vs sem. ant.' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} pts`}
      </Text>
    </View>
  )
  return onPress ? (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver ${label.toLocaleLowerCase('es-CL')}. ${Math.round(value)}%. ${deltaCopy}.`}
      style={styles.ringTouch}
    >
      {body}
    </TouchableOpacity>
  ) : <View style={styles.ringTouch}>{body}</View>
}

function ProgramSummary({
  clientId,
  program,
  currentWeek,
  totalWeeks,
  daysRemaining,
  nutritionAtRisk,
  onAssign,
  onOpen,
  onViewNutrition,
}: {
  clientId: string
  program: CoachClientDetailData['activeProgram']
  currentWeek: number | null
  totalWeeks: number
  daysRemaining?: number
  nutritionAtRisk: boolean
  onAssign: () => void
  onOpen: () => void
  onViewNutrition?: () => void
}) {
  const { theme } = useTheme()
  const reduceMotion = useReducedMotion()
  if (!program) {
    return (
      <StatCard>
        <Text className="text-muted" style={styles.emptyProgram}>Sin programa activo asignado.</Text>
        <Button label="Asignar programa" variant="sport" leftIcon={Plus} onPress={onAssign} full testID={`assign-program-${clientId}`} />
      </StatCard>
    )
  }

  const week = currentWeek ?? 1
  const left = Math.max(0, daysRemaining ?? 0)
  const expired = (daysRemaining ?? 0) <= 0
  const visiblePlans = filterPlansForStructureView(
    program.workoutPlans,
    program.program_structure_type === 'cycle' ? 'cycle' : 'weekly',
    { abMode: Boolean(program.ab_mode), activeVariant: resolveActiveWeekVariantForDisplay(program, currentWeek) },
  ).filter((plan) => plan.blocks.length > 0)
  const todayIso = getTodayInSantiago().iso
  const todayDowRaw = new Date(`${todayIso}T12:00:00`).getDay()
  const todayDow = todayDowRaw === 0 ? 7 : todayDowRaw
  const scheduled = visiblePlans.filter((plan) => plan.day_of_week != null).sort((a, b) => a.day_of_week! - b.day_of_week!)
  const weekly = scheduled.filter((plan) => plan.day_of_week! >= 1 && plan.day_of_week! <= 7)
  const ordered = weekly.length ? weekly : scheduled
  const next = ordered.find((plan) => plan.day_of_week! >= todayDow) ?? ordered[0] ?? null
  const nextDay = next?.day_of_week ? dayLabel(next.day_of_week) : ''
  const isToday = next?.day_of_week === todayDow

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Abrir programa ${program.name}`}
    >
      <StatCard>
        <View style={styles.programTitleRow}>
          <Text className="text-strong" style={styles.programTitle} numberOfLines={2}>{program.name}</Text>
          <Badge tone={expired ? 'warning' : 'success'} size="sm">{expired ? 'Ciclo vencido' : 'En track'}</Badge>
        </View>
        {program.program_phases.length ? (
          <CompactProgramPhasesBar phases={program.program_phases} />
        ) : null}
        <View style={styles.programMeta}>
          <Text className="text-muted" style={styles.programMetaText}>Semana {week} de {totalWeeks}</Text>
          <Text className="text-muted" style={styles.programMetaText}>{left} d restantes</Text>
        </View>
        <ProgressBar value={week / totalWeeks} color={theme.primary} height={7} />
        <TouchableOpacity
          activeOpacity={onViewNutrition ? 0.78 : 1}
          disabled={!onViewNutrition}
          onPress={(event) => { event.stopPropagation(); onViewNutrition?.() }}
          accessibilityRole={onViewNutrition ? 'button' : undefined}
          accessibilityLabel={nutritionAtRisk ? 'Ver nutrición en riesgo' : 'Ver nutrición en track'}
          accessibilityState={{ disabled: !onViewNutrition }}
          className={nutritionAtRisk ? 'bg-danger-100 dark:bg-danger-100/[0.18]' : 'bg-success-100 dark:bg-success-100/[0.18]'}
          style={styles.nutritionSignal}
        >
          <MotiView
            from={{ opacity: 1 }}
            animate={nutritionAtRisk && !reduceMotion ? { opacity: 0.42 } : { opacity: 1 }}
            transition={{ type: 'timing', duration: 1000, loop: nutritionAtRisk && !reduceMotion, repeatReverse: true }}
            style={[styles.signalDot, { backgroundColor: nutritionAtRisk ? theme.destructive : theme.success }]}
          />
          <Text className={nutritionAtRisk ? 'text-danger-600' : 'text-success-600'} style={styles.signalLabel}>
            {nutritionAtRisk ? 'Nutrición en riesgo' : 'Nutrición en track'}
          </Text>
        </TouchableOpacity>
        {next ? (
          <View className="bg-sport-100 dark:bg-sport-100/20" style={styles.nextWorkout}>
            <CalendarCheck size={18} className="text-sport-600" />
            <View style={styles.nextCopy}>
              <Text className="text-sport-700" style={styles.nextEyebrow}>Próximo entreno · {nextDay}{isToday ? ' · Hoy' : ''}</Text>
              <Text className="text-strong" style={styles.nextTitle} numberOfLines={1}>{next.title} · {next.blocks.length} ejercicio{next.blocks.length === 1 ? '' : 's'}</Text>
            </View>
          </View>
        ) : null}
      </StatCard>
    </TouchableOpacity>
  )
}

function CompactProgramPhasesBar({ phases }: { phases: NonNullable<CoachClientDetailData['activeProgram']>['program_phases'] }) {
  const total = phases.reduce((sum, phase) => sum + Math.max(1, phase.weeks), 0) || 1
  // El fallback web es violeta, no el primary white-label. Reutiliza la paleta
  // semántica de macro-ciclos en vez de duplicar un valor crudo en este port.
  const fallback = PHASE_COLORS[1]
  return (
    <View className="border border-subtle bg-surface-sunken" style={styles.compactPhaseTrack}>
      {phases.map((phase, index) => (
        <View
          key={`${phase.name}-${index}`}
          accessibilityLabel={`${phase.name}: ${phase.weeks} sem.`}
          style={{
            width: `${(Math.max(1, phase.weeks) / total) * 100}%`,
            minWidth: 4,
            height: '100%',
            backgroundColor: phase.color || fallback,
          }}
        />
      ))}
    </View>
  )
}

function KeyMetricsCard({ client, currentWeight, weeklyVariation, reload, workspace }: {
  client: NonNullable<CoachClientDetailData['client']>
  currentWeight: number | null
  weeklyVariation: number
  reload: () => void
  workspace: ClientActionWorkspace
}) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [height, setHeight] = useState('')
  const [initial, setInitial] = useState('')
  const [sex, setSex] = useState<SexOption>('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openEditor() {
    setHeight(client.height_cm != null ? String(client.height_cm) : '')
    setInitial(client.initial_weight_kg != null ? String(client.initial_weight_kg) : '')
    setSex(client.sex ?? 'none')
    setError(null)
    setOpen(true)
  }

  async function save() {
    const heightValue = parseBio(height)
    const initialValue = parseBio(initial)
    if (height.trim() && heightValue == null) return setError('La altura debe estar entre 50 y 260 cm.')
    if (initial.trim() && initialValue == null) return setError('El peso inicial debe estar entre 20 y 400 kg.')
    if (heightValue != null && (heightValue < 50 || heightValue > 260)) return setError('La altura debe estar entre 50 y 260 cm.')
    if (initialValue != null && (initialValue < 20 || initialValue > 400)) return setError('El peso inicial debe estar entre 20 y 400 kg.')
    setError(null)
    setSaving(true)
    const biometrics = await upsertClientBiometrics(client.id, {
      heightCm: heightValue,
      weightKg: initialValue,
      sex: sex === 'none' ? null : sex,
    }, workspace)
    if (!biometrics.ok) {
      setSaving(false)
      setError(biometrics.error ?? 'No se pudo guardar la biometría.')
      return
    }
    setSaving(false)
    setOpen(false)
    reload()
  }

  const variationTone = weeklyVariation <= 0 ? 'text-success-600' : 'text-ember-700'
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle>Métricas clave</SectionTitle>
      <StatCard>
        <View style={styles.keyMetricsRow}>
          <View style={styles.keyMetrics}>
            <View style={styles.keyMetricCell}>
              <Text className="text-strong" style={styles.keyMetricValue}>{currentWeight != null ? currentWeight : '—'}{currentWeight != null ? <Text style={styles.keyMetricUnit}> kg</Text> : null}</Text>
              <Text className="text-muted" style={styles.keyMetricLabel}>Peso actual</Text>
            </View>
            <View style={styles.keyMetricCell}>
              <View style={styles.variationRow}>
                <Text className={variationTone} style={styles.keyMetricValue}>{weeklyVariation > 0 ? '+' : ''}{weeklyVariation.toFixed(1)}<Text style={styles.keyMetricUnit}> kg</Text></Text>
                {weeklyVariation > 0 ? <ArrowUpRight size={16} className="text-ember-600" /> : weeklyVariation < 0 ? <ArrowDownRight size={16} className="text-success-500" /> : <Minus size={16} className="text-muted" />}
              </View>
              <Text className="text-muted" style={styles.keyMetricLabel}>Variación semanal</Text>
            </View>
          </View>
          <TouchableOpacity onPress={openEditor} hitSlop={10} accessibilityRole="button" accessibilityLabel="Editar biometría inicial" testID="ficha-edit-biometria">
            <Pencil size={16} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </StatCard>

      <Sheet
        open={open}
        onClose={() => { if (!saving) setOpen(false) }}
        title="Editar biometría inicial"
        nativeModal
        snapPoints={['88%']}
        footer={
          <View style={styles.footerActions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setOpen(false)} disabled={saving} style={styles.flexButton} />
            <Button label={saving ? 'Guardando…' : 'Guardar'} variant="sport" onPress={save} loading={saving} disabled={saving} style={styles.flexButton} />
          </View>
        }
      >
        <View style={styles.descriptionInfo}>
          <Text className="text-muted" style={styles.descriptionText}>Necesario para calcular IMC</Text>
          <InfoTooltip title="IMC" content="Relación entre peso y altura usada como referencia general de composición corporal." size={14} />
          <Text className="text-muted" style={styles.descriptionText}>y gasto energético (TDEE)</Text>
          <InfoTooltip title="TDEE" content="Estimación de la energía total que la persona gasta durante un día." size={14} />
        </View>
        <Input label="Altura" value={height} onChangeText={setHeight} keyboardType="numeric" inputMode="numeric" placeholder="cm" testID="bio-height" />
        <Input label="Peso inicial" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" inputMode="decimal" placeholder="kg" testID="bio-weight" />
        <View style={styles.sexGroup}>
          <Text className="text-strong" style={styles.inputLabel}>Sexo</Text>
          <View style={styles.sexGrid}>
            {SEX_OPTIONS.map((option) => {
              const selected = option.value === sex
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setSex(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={selected ? 'border-sport-500 bg-sport-100 dark:bg-sport-100/20' : 'border-default bg-surface-card'}
                  style={styles.sexOption}
                >
                  <Text className={selected ? 'text-sport-600' : 'text-muted'} style={styles.sexLabel}>{option.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
        {error ? <Text accessibilityRole="alert" className="text-danger-600" style={styles.formError}>{error}</Text> : null}
      </Sheet>
    </View>
  )
}

function HabitsMiniWidget({ summary, rows }: { summary: DailyHabitsSummary; rows: DailyHabitRow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!summary || summary.daysLogged === 0) return null
  const { today, avg, daysLogged } = summary
  const cells = [
    { icon: Droplet, label: 'Agua', today: formatWater(today?.water_ml), average: formatWater(avg.water_ml) },
    { icon: Footprints, label: 'Pasos', today: formatSteps(today?.steps), average: formatSteps(avg.steps) },
    { icon: Moon, label: 'Sueño', today: formatHours(today?.sleep_hours), average: formatHours(avg.sleep_hours) },
  ]
  const hasTodayValue = cells.some((cell) => cell.today != null)
  const details = rows.slice(0, 7)
  return (
    <StatCard>
      <SectionTitle right={<Text className="text-subtle" style={styles.habitMode}>{today && hasTodayValue ? 'Hoy' : 'prom. 7d'}</Text>}>Hábitos diarios</SectionTitle>
      <View style={styles.habitCells}>
        {cells.map((cell) => {
          const Icon = cell.icon
          const showToday = Boolean(today && cell.today != null)
          return (
            <View key={cell.label} className="border border-subtle bg-surface-sunken" style={styles.habitCell}>
              <Icon size={16} className="text-sport-600" />
              <Text className="text-strong" style={styles.habitValue}>{(showToday ? cell.today : cell.average) ?? '—'}</Text>
              <Text className="text-muted" style={styles.habitLabel}>{cell.label}{!showToday && cell.average ? ' · prom.' : ''}</Text>
            </View>
          )
        })}
      </View>
      {(!today || !hasTodayValue) ? <Text className="text-muted" style={styles.habitHint}>Sin registro hoy · mostrando promedio de {daysLogged} día{daysLogged === 1 ? '' : 's'} con datos (7d)</Text> : null}
      {today?.supplements?.length ? (
        <View style={styles.supplements}>
          <Text className="text-subtle" style={styles.supplementsTitle}>Suplementos</Text>
          {today.supplements.map((supplement, index) => <View key={`${supplement}-${index}`} className="bg-surface-sunken" style={styles.supplementChip}><Text className="text-muted" style={styles.supplementText}>{supplement}</Text></View>)}
        </View>
      ) : null}
      {details.length ? (
        <>
          <TouchableOpacity onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.disclosure}>
            <Text className="text-sport-600" style={styles.disclosureText}>{expanded ? 'Ocultar' : 'Ver 7 días'}</Text>
            <ChevronDown size={14} className="text-sport-600" style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
          </TouchableOpacity>
          {expanded ? <HabitTable rows={details} /> : null}
        </>
      ) : null}
      <Text className="text-subtle" style={styles.explainer}>prom. 7d = promedio de los días CON registro. Ayuno = horas de ayuno declaradas por el alumno.</Text>
    </StatCard>
  )
}

function HabitTable({ rows }: { rows: DailyHabitRow[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="border border-subtle" style={styles.habitTable}>
        <View className="bg-surface-sunken" style={styles.habitTableRow}>
          {['Día', 'Agua', 'Pasos', 'Sueño', 'Ayuno'].map((label) => <Text key={label} className="text-subtle" style={[styles.habitTableCell, label === 'Día' ? styles.habitDayCell : null]}>{label}</Text>)}
        </View>
        {rows.map((row) => (
          <View key={row.log_date} className="border-t border-subtle" style={styles.habitTableRow}>
            <Text className="text-muted" style={[styles.habitTableCell, styles.habitDayCell]}>{formatHabitDate(row.log_date)}</Text>
            <Text className="text-strong" style={styles.habitTableCell}>{formatWater(row.water_ml) ?? '—'}</Text>
            <Text className="text-strong" style={styles.habitTableCell}>{formatSteps(row.steps) ?? '—'}</Text>
            <Text className="text-strong" style={styles.habitTableCell}>{formatHours(row.sleep_hours) ?? '—'}</Text>
            <Text className="text-strong" style={styles.habitTableCell}>{formatHours(row.fasting_hours) ?? '—'}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function CheckInSnapshot({ checkIn, clientId, reload, onOpenPhoto, onViewProgress, workspace }: {
  checkIn: CoachClientDetailData['checkIns'][number] | null
  clientId: string
  reload: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  onViewProgress?: () => void
  workspace: ClientActionWorkspace
}) {
  const { theme } = useTheme()
  if (!checkIn) {
    return (
      <StatCard>
        <View style={styles.emptyCheckInRow}>
          <Camera size={16} color={theme.mutedForeground} />
          <Text className="text-muted" style={styles.emptyCheckIn}>Aún no hay check-ins registrados.</Text>
        </View>
        {onViewProgress ? <Button label="Ver panel de progreso" variant="ghost" rightIcon={ChevronRight} onPress={onViewProgress} style={styles.historyButton} /> : null}
      </StatCard>
    )
  }
  return <CheckInSnapshotBody checkIn={checkIn} clientId={clientId} reload={reload} onOpenPhoto={onOpenPhoto} onViewProgress={onViewProgress} theme={theme} workspace={workspace} />
}

function CheckInSnapshotBody({ checkIn, clientId, reload, onOpenPhoto, onViewProgress, theme, workspace }: {
  checkIn: CoachClientDetailData['checkIns'][number]
  clientId: string
  reload: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  onViewProgress?: () => void
  theme: ReturnType<typeof useTheme>['theme']
  workspace: ClientActionWorkspace
}) {
  const [reviewed, setReviewed] = useState(Boolean(checkIn.reviewed_at))
  const [pending, setPending] = useState(false)
  useEffect(() => setReviewed(Boolean(checkIn.reviewed_at)), [checkIn.id, checkIn.reviewed_at])
  const photos = [checkIn.front_photo_url, checkIn.side_photo_url, checkIn.back_photo_url].filter(Boolean) as string[]

  async function toggleReviewed() {
    if (pending) return
    const next = !reviewed
    setReviewed(next)
    setPending(true)
    const result = next
      ? await markCoachCheckInReviewed(clientId, checkIn.id, workspace)
      : await unmarkCoachCheckInReviewed(clientId, checkIn.id, workspace)
    setPending(false)
    if (!result.ok) {
      setReviewed(!next)
      Alert.alert('Error', result.error ?? 'No se pudo actualizar el check-in.')
      return
    }
    reload()
  }

  return (
    <StatCard>
      <View style={styles.checkInHeader}>
        <SectionTitle>Último check-in</SectionTitle>
        <Text className="text-muted" style={styles.relativeDate}>{relativeDate(checkIn.created_at ?? checkIn.date)}</Text>
      </View>
      {photos.length ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenPhoto(photos, 0)} accessibilityRole="button" accessibilityLabel="Abrir foto del check-in">
          <Image source={{ uri: photos[0] }} alt="Check-in" style={[styles.checkInPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
        </TouchableOpacity>
      ) : null}
      <View className="border-t border-subtle" style={styles.metricRow}>
        <View style={styles.metricName}><Scale size={14} className="text-sport-600" /><Text className="text-muted" style={styles.metricNameText}>Peso</Text></View>
        <Text className="text-strong" style={styles.metricValue}>{checkIn.weight != null ? `${checkIn.weight} kg` : '—'}</Text>
      </View>
      <View className="border-t border-subtle" style={styles.metricRow}>
        <View style={styles.metricName}><Battery size={14} className="text-sport-600" /><Text className="text-muted" style={styles.metricNameText}>Energía</Text></View>
        {checkIn.energy_level != null ? <EnergyStars level={checkIn.energy_level} /> : <Text className="text-strong" style={styles.metricValue}>—</Text>}
      </View>
      <View className="border-t border-subtle" style={styles.metricRow}>
        <View style={styles.metricName}><StickyNote size={14} className="text-sport-600" /><Text className="text-muted" style={styles.metricNameText}>Notas</Text></View>
        <Text className="text-strong" style={[styles.metricValue, styles.notes]}>{checkIn.notes?.trim() ? checkIn.notes : 'Sin notas'}</Text>
      </View>
      <TouchableOpacity
        disabled={pending}
        onPress={toggleReviewed}
        accessibilityRole="button"
        accessibilityLabel={reviewed ? 'Check-in revisado. Tocar para des-marcar.' : 'Marcar check-in como revisado.'}
        accessibilityState={{ selected: reviewed, busy: pending, disabled: pending }}
        className={reviewed ? 'bg-success-100 dark:bg-success-100/[0.18]' : 'bg-surface-sunken'}
        style={styles.reviewButton}
      >
        {pending
          ? <ActivityIndicator size="small" color={reviewed ? theme.success : theme.mutedForeground} />
          : <Check size={16} className={reviewed ? 'text-success-600' : 'text-muted'} />}
        <Text className={reviewed ? 'text-success-600' : 'text-strong'} style={styles.reviewLabel}>{reviewed ? 'Revisado · des-marcar' : 'Marcar como revisado'}</Text>
      </TouchableOpacity>
      {onViewProgress ? <Button label="Ver historial en Progreso" variant="ghost" rightIcon={ChevronRight} onPress={onViewProgress} style={styles.historyButton} /> : null}
    </StatCard>
  )
}

function EnergyStars({ level }: { level: number }) {
  const { theme } = useTheme()
  const filled = Math.max(0, Math.min(5, Math.round(level / 2)))
  return <View accessible accessibilityRole="image" accessibilityLabel={`Energía ${level} de 10`} style={styles.stars}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} color={index < filled ? theme.warning : theme.borderDefault} fill={index < filled ? theme.warning : 'transparent'} />)}</View>
}

function VisualEvolution({ checkIns, onOpenPhoto }: { checkIns: CoachClientDetailData['checkIns']; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  return (
    <StatCard>
      <SectionTitle>Evolución visual</SectionTitle>
      {checkIns.length ? (
        <View style={styles.photoRow}>
          {checkIns.map((checkIn) => {
            const photos = [checkIn.front_photo_url, checkIn.side_photo_url, checkIn.back_photo_url].filter(Boolean) as string[]
            return (
              <TouchableOpacity
                key={checkIn.id}
                activeOpacity={0.85}
                onPress={() => onOpenPhoto(photos, 0)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir foto de progreso del ${formatHabitDate(checkIn.created_at ?? checkIn.date)}`}
                style={styles.photoItem}
              >
                <Image source={{ uri: photos[0] }} alt="Progreso" style={[styles.photo, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                <Text className="text-muted" style={styles.photoDate}>{formatHabitDate(checkIn.created_at ?? checkIn.date)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : (
        <View className="bg-surface-sunken" style={styles.photoEmpty}>
          <Camera size={22} color={theme.ink300} />
          <Text className="text-muted" style={styles.photoEmptyText}>Sin fotos recientes de check-in.</Text>
        </View>
      )}
    </StatCard>
  )
}

function ToolsSection({ clientId, moduleFlags, ready }: { clientId: string; moduleFlags: { cardio: boolean; movement: boolean; bodycomp: boolean }; ready: boolean }) {
  const router = useRouter()
  if (!ready) return null
  const tools = [
    moduleFlags.cardio ? { label: 'Cardio', icon: HeartPulse, onPress: () => router.push(`/coach/cardio/${clientId}`) } : null,
    moduleFlags.movement ? { label: 'Movimiento', icon: PersonStanding, onPress: () => router.push(`/coach/movement/${clientId}`) } : null,
    moduleFlags.bodycomp ? { label: 'Composición', icon: Scale, onPress: () => router.push(`/coach/bodycomp/${clientId}`) } : null,
  ].filter((tool): tool is { label: string; icon: LucideIcon; onPress: () => void } => tool != null)
  if (!tools.length) return null
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle>Módulos</SectionTitle>
      <View style={styles.toolsRow}>
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <TouchableOpacity key={tool.label} onPress={tool.onPress} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel={tool.label} className="border border-subtle bg-surface-card" style={styles.toolTile}>
              <View className="bg-sport-100 dark:bg-sport-100/20" style={styles.toolIcon}><Icon size={20} className="text-sport-600" /></View>
              <Text className="text-strong" style={styles.toolLabel} numberOfLines={2}>{tool.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function formatWater(value: number | null | undefined): string | null {
  if (value == null) return null
  const liters = value / 1000
  return `${Number.isInteger(liters) ? liters : liters.toFixed(1)} L`
}
function formatSteps(value: number | null | undefined): string | null {
  return value == null ? null : Math.round(value).toLocaleString('es-CL')
}
function formatHours(value: number | null | undefined): string | null {
  return value == null ? null : `${Number.isInteger(value) ? value : value.toFixed(1)} h`
}
function formatHabitDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}
function relativeDate(iso: string): string {
  const timestamp = new Date(iso).getTime()
  const elapsedMs = Date.now() - timestamp
  if (Number.isFinite(timestamp) && elapsedMs >= 0) {
    const minutes = Math.floor(elapsedMs / 60_000)
    if (minutes < 1) return 'hace menos de un minuto'
    if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`
  }
  const days = daysBetweenCalendar(iso.slice(0, 10), getTodayInSantiago().iso)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  if (days < 7) return `hace ${days} días`
  if (days < 14) return 'hace 1 semana'
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`
  if (days < 60) return 'hace alrededor de 1 mes'
  if (days < 365) return `hace ${Math.round(days / 30)} meses`
  if (days < 730) return 'hace alrededor de 1 año'
  return `hace ${Math.round(days / 365)} años`
}
function dayLabel(day: number): string {
  return ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][day] ?? `Día ${day}`
}

const styles = StyleSheet.create({
  root: { gap: 24 },
  sectionBlock: { gap: 12 },
  sectionTitleRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { flex: 1, fontSize: 17, fontFamily: FONT.displayBold, letterSpacing: -0.34 },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderLeftWidth: 3, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11 },
  alertMsg: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: FONT.uiSemibold },
  ringRow: { flexDirection: 'row', gap: 4 },
  ringTouch: { flex: 1 },
  ringItem: { alignItems: 'center', gap: 5 },
  ringGraphic: { width: 84, height: 84, overflow: 'hidden' },
  ringLabel: { fontSize: 12.5, fontFamily: FONT.uiBold, textAlign: 'center' },
  ringDelta: { minHeight: 15, fontSize: 10.5, fontFamily: FONT.uiSemibold, textAlign: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiHalf: { width: '48%' },
  compactPhaseTrack: { height: 6, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  kpiCard: { minHeight: 88, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  kpiIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kpiCopy: { flex: 1, minWidth: 0 },
  kpiValue: { fontSize: 18, lineHeight: 21, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  kpiLabel: { flexShrink: 1, fontSize: 10.5, fontFamily: FONT.uiMedium },
  emptyProgram: { fontSize: 13.5, fontFamily: FONT.uiMedium, textAlign: 'center' },
  programTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  programTitle: { flex: 1, fontSize: 15, lineHeight: 18, fontFamily: FONT.displayBlack },
  programMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  programMetaText: { fontSize: 12, fontFamily: FONT.ui },
  nutritionSignal: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  signalDot: { width: 8, height: 8, borderRadius: 4 },
  signalLabel: { fontSize: 12.5, fontFamily: FONT.uiBold },
  nextWorkout: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  nextCopy: { flex: 1, minWidth: 0 },
  nextEyebrow: { fontSize: 11, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.35 },
  nextTitle: { fontSize: 14, fontFamily: FONT.uiBold },
  keyMetricsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  keyMetrics: { flex: 1, flexDirection: 'row', gap: 12 },
  keyMetricCell: { flex: 1, gap: 6 },
  keyMetricLabel: { fontSize: 11, fontFamily: FONT.uiMedium },
  keyMetricValue: { fontSize: 22, lineHeight: 24, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  keyMetricUnit: { fontSize: 12, fontFamily: FONT.uiBold },
  variationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerActions: { flexDirection: 'row', gap: 10 },
  flexButton: { flex: 1 },
  descriptionInfo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  descriptionText: { fontSize: 12, fontFamily: FONT.ui },
  sexGroup: { gap: 7 },
  inputLabel: { fontSize: 13, fontFamily: FONT.uiSemibold },
  sexGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sexOption: { width: '48%', flexGrow: 1, minHeight: 42, borderWidth: 1.5, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sexLabel: { fontSize: 13, fontFamily: FONT.uiSemibold, textAlign: 'center' },
  formError: { fontSize: 13, fontFamily: FONT.uiSemibold },
  habitMode: { fontSize: 10, fontFamily: FONT.uiMedium, textTransform: 'uppercase', letterSpacing: 1 },
  habitCells: { flexDirection: 'row', gap: 8 },
  habitCell: { flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 10 },
  habitValue: { fontSize: 16, lineHeight: 18, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  habitLabel: { fontSize: 9, fontFamily: FONT.uiMedium, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
  habitHint: { fontSize: 10.5, fontFamily: FONT.uiMedium },
  supplements: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  supplementsTitle: { fontSize: 9, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.8 },
  supplementChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  supplementText: { fontSize: 10, fontFamily: FONT.uiMedium },
  disclosure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32 },
  disclosureText: { fontSize: 10, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.8 },
  explainer: { fontSize: 9.5, lineHeight: 13, fontFamily: FONT.ui },
  habitTable: { width: 510, borderRadius: 14, overflow: 'hidden' },
  habitTableRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center' },
  habitTableCell: { width: 94, paddingHorizontal: 8, fontSize: 11, fontFamily: FONT.uiMedium, textAlign: 'right', fontVariant: ['tabular-nums'] },
  habitDayCell: { width: 110, textAlign: 'left' },
  emptyCheckInRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyCheckIn: { flex: 1, fontSize: 13.5, fontFamily: FONT.uiMedium },
  historyButton: { alignSelf: 'flex-start' },
  checkInHeader: { gap: 4 },
  relativeDate: { fontSize: 10, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 1 },
  checkInPhoto: { width: '100%', height: 176, borderRadius: 14, borderWidth: 1 },
  metricRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 10 },
  metricName: { width: 84, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricNameText: { fontSize: 12, fontFamily: FONT.uiMedium },
  metricValue: { flex: 1, fontSize: 13, fontFamily: FONT.uiSemibold, textAlign: 'right' },
  notes: { lineHeight: 18 },
  stars: { flexDirection: 'row', gap: 3 },
  reviewButton: { minHeight: 34, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  reviewLabel: { fontSize: 10, fontFamily: FONT.uiExtra, textTransform: 'uppercase', letterSpacing: 1 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoItem: { flex: 1, alignItems: 'center', gap: 5 },
  photo: { width: '100%', aspectRatio: 0.78, borderRadius: 12, borderWidth: 1 },
  photoDate: { fontSize: 10.5, fontFamily: FONT.uiMedium },
  photoEmpty: { minHeight: 72, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14 },
  photoEmptyText: { fontSize: 13, fontFamily: FONT.uiMedium },
  toolsRow: { flexDirection: 'row', gap: 8 },
  toolTile: { flex: 1, minHeight: 92, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 10 },
  toolIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { fontSize: 11.5, lineHeight: 14, fontFamily: FONT.uiBold, textAlign: 'center' },
})
