import { useEffect, useMemo, useState } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarDays, Check, ChevronRight, Droplets, Dumbbell, Footprints, Moon, Scale, TrendingDown, TrendingUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile, type ClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
import { useTheme } from '../../../context/ThemeContext'
import {
  Badge,
  Button,
  Card,
  NutritionDailySummaryWidget,
  PersonalRecordsBanner,
  ProgressBar,
  ScreenHeader,
  Sparkline,
  StreakWidget,
  WelcomeModal,
} from '../../../components'
import { ProgressRing } from '../../../components/ProgressRing'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { getTodayInSantiago, timeGreeting, formatLongDate } from '../../../lib/date-utils'
import { getDailyHabits, type HabitsData } from '../../../lib/habits.queries'

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const MS_DAY = 24 * 60 * 60 * 1000

// Fixed DS accents (constant ramp values; sport follows the runtime brand).
const EMBER_500 = '#FF6A3D' // accent-nutrition
const WARNING_500 = '#F5A524' // warning glyph (weight uptrend)

interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  blockCount: number
}

interface Program {
  id: string
  name: string
  plans: Plan[]
}

interface RecentWorkout {
  id: string
  logged_at: string
  exercise_name_at_log: string | null
}

interface CheckInPoint {
  date: string
  weight: number | null
}

interface WelcomeModalConfig {
  enabled: boolean
  content: string
  type: 'text' | 'video'
  version: number
  brandName?: string
}

interface HomeData {
  client: ClientProfile | null
  program: Program | null
  recentWorkouts: RecentWorkout[]
  workoutDates: Set<string>
  nutritionDates: Set<string>
  checkIns: CheckInPoint[]
  habitsToday: HabitsData | null
  welcomeModal: WelcomeModalConfig | null
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function jsDayToDbDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}


export default function AlumnoHomeScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    // Gate: alumno sin intake → onboarding antes del dashboard.
    getOnboardingStatus().then((done) => { if (!done) router.replace('/alumno/onboarding') })
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const today = startOfToday()
    const since30 = new Date(today.getTime() - 29 * MS_DAY)
    const todayIso = isoDate(today)
    const since30Iso = isoDate(since30)

    const [{ data: programData }, { data: workoutRows }, { data: nutritionRows }, { data: checkInRows }, { data: coachData }, habitsData] =
      await Promise.all([
        supabase
          .from('workout_programs')
          .select('id, name, workout_plans ( id, title, day_of_week, assigned_date, workout_blocks ( id ) )')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('workout_logs')
          .select('id, logged_at, exercise_name_at_log')
          .eq('client_id', client.id)
          .gte('logged_at', `${since30Iso}T00:00:00.000Z`)
          .order('logged_at', { ascending: false })
          .limit(80),
        supabase
          .from('daily_nutrition_logs')
          .select('id, log_date')
          .eq('client_id', client.id)
          .gte('log_date', since30Iso)
          .lte('log_date', todayIso),
        supabase
          .from('check_ins')
          .select('date, weight')
          .eq('client_id', client.id)
          .gte('date', since30Iso)
          .lte('date', todayIso)
          .order('date', { ascending: true }),
        supabase
          .from('coaches')
          .select('brand_name, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version')
          .eq('id', client.coachId)
          .maybeSingle(),
        getDailyHabits(client.id, todayIso),
      ])

    const program = programData
      ? {
          id: programData.id,
          name: programData.name,
          plans: ((programData as any).workout_plans ?? [])
            .map((p: any) => ({
              id: p.id,
              title: p.title,
              day_of_week: p.day_of_week,
              assigned_date: p.assigned_date,
              blockCount: p.workout_blocks?.length ?? 0,
            }))
            .sort((a: Plan, b: Plan) => (a.day_of_week ?? 8) - (b.day_of_week ?? 8)),
        }
      : null

    const welcomeModal: WelcomeModalConfig | null = coachData?.welcome_modal_enabled
      ? {
          enabled: true,
          content: coachData.welcome_modal_content ?? '',
          type: (coachData.welcome_modal_type as 'text' | 'video') ?? 'text',
          version: coachData.welcome_modal_version ?? 1,
          brandName: coachData.brand_name ?? undefined,
        }
      : null

    setData({
      client,
      program,
      recentWorkouts: (workoutRows ?? []) as RecentWorkout[],
      workoutDates: new Set((workoutRows ?? []).map((row) => isoDate(new Date(row.logged_at)))),
      nutritionDates: new Set((nutritionRows ?? []).map((row) => row.log_date)),
      checkIns: (checkInRows ?? []) as CheckInPoint[],
      habitsToday: habitsData,
      welcomeModal,
    })
    setLoading(false)
    setRefreshing(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await load()
  }

  const derived = useMemo(() => {
    const today = startOfToday()
    const todayIso = isoDate(today)
    const todayDbDay = jsDayToDbDay(today.getDay())
    const plans = data?.program?.plans ?? []
    const todayPlan =
      plans.find((p) => p.assigned_date === todayIso) ??
      plans.find((p) => p.day_of_week === todayDbDay) ??
      null
    const nextPlan = plans.find((p) => p.id !== todayPlan?.id) ?? null
    const workoutTargetDays = plans.length ? Math.min(plans.length, 30) : 12
    const workoutCompliance = data ? Math.min(1, data.workoutDates.size / workoutTargetDays) : 0
    const nutritionCompliance = data ? Math.min(1, data.nutritionDates.size / 30) : 0
    const checkInCompliance = data ? Math.min(1, data.checkIns.length / 4) : 0
    const recentUnique = uniqueRecentWorkouts(data?.recentWorkouts ?? [])
    const weights = (data?.checkIns ?? []).filter((p) => p.weight != null).map((p) => p.weight as number)
    const currentWeight = weights.at(-1) ?? null
    const firstWeight = weights[0] ?? null
    const weightDelta = currentWeight != null && firstWeight != null ? currentWeight - firstWeight : null
    const streak = calculateStreak(data?.workoutDates ?? new Set<string>())

    // Build a set of ISO dates in the 7-day window that have planned workouts
    const plannedDays = new Set<string>()
    if (plans.length > 0) {
      for (let i = -3; i <= 3; i++) {
        const d = new Date(today.getTime() + i * MS_DAY)
        const dIso = isoDate(d)
        const dbDay = jsDayToDbDay(d.getDay())
        if (plans.some((p) => p.day_of_week === dbDay || p.assigned_date === dIso)) {
          plannedDays.add(dIso)
        }
      }
    }

    return {
      todayPlan,
      nextPlan,
      workoutCompliance,
      nutritionCompliance,
      checkInCompliance,
      // Estado "sin datos" → ring gris en vez de 0% (no confundir sin-uso con mal-cumplimiento).
      nutritionEmpty: data ? data.nutritionDates.size === 0 : true,
      checkInEmpty: data ? data.checkIns.length === 0 : true,
      recentUnique,
      weights,
      currentWeight,
      weightDelta,
      streak,
      plannedDays,
    }
  }, [data])

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title={`${timeGreeting()}, ${data?.client?.fullName?.split(' ')[0] ?? ''}`.trim()}
        subtitle={formatLongDate()}
        trailing={<StreakWidget streak={derived.streak} />}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <WeekCalendar workoutDates={data?.workoutDates ?? new Set<string>()} plannedDays={derived.plannedDays} />

        {!hasCheckInThisMonth(data?.checkIns ?? []) ? (
          <MotiView
            from={{ opacity: 0, translateY: 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 400 }}
          >
            <TouchableOpacity
              className="flex-row items-center rounded-card border border-ember-200 bg-ember-100 dark:bg-ember-100/20"
              style={styles.checkInBanner}
              onPress={() => router.push('/alumno/check-in')}
              activeOpacity={0.82}
            >
              <View className="items-center justify-center rounded-control bg-ember-500" style={styles.bannerIcon}>
                <Scale size={18} color="#fff" strokeWidth={2.25} />
              </View>
              <View className="flex-1" style={styles.bannerText}>
                <Text className="font-sans-bold text-[13.5px] text-ember-700">
                  Check-in pendiente
                </Text>
                <Text className="font-sans text-[12px] text-ember-700">
                  Registra tu peso y energia de este mes.
                </Text>
              </View>
              <ChevronRight size={18} color={EMBER_500} />
            </TouchableOpacity>
          </MotiView>
        ) : null}

        <WorkoutHero
          plan={derived.todayPlan}
          nextPlan={derived.nextPlan}
          doneToday={!!derived.todayPlan && (data?.workoutDates.has(getTodayInSantiago().iso) ?? false)}
          onStart={(planId) => router.push(`/alumno/workout/${planId}`)}
        />

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 120 }}
        >
          <Card>
            <Text className="font-sans-bold text-[13px] uppercase text-subtle" style={styles.cardEyebrow}>
              Cumplimiento 30 dias
            </Text>
            <View style={styles.ringsRow}>
              <ComplianceItem value={derived.workoutCompliance} label="Entrenos" color={theme.primary} />
              <ComplianceItem value={derived.nutritionCompliance} label="Nutrición" color={EMBER_500} empty={derived.nutritionEmpty} />
              <ComplianceItem value={derived.checkInCompliance} label="Check-in" color={theme.success} empty={derived.checkInEmpty} />
            </View>
          </Card>
        </MotiView>

        <ActiveProgramSection program={data?.program ?? null} />
        <RecentWorkouts workouts={derived.recentUnique} />
        <WeightSparkline weights={derived.weights} currentWeight={derived.currentWeight} delta={derived.weightDelta} />
        {data?.client && (
          <PersonalRecordsBanner clientId={data.client.id} />
        )}
        {data?.client && (
          <NutritionDailySummaryWidget clientId={data.client.id} />
        )}
        {data?.habitsToday && (data.habitsToday.water_ml != null || data.habitsToday.steps != null) && (
          <HabitsMiniRow habits={data.habitsToday} />
        )}
      </ScrollView>

      {data?.welcomeModal && (
        <WelcomeModal
          brandName={data.welcomeModal.brandName}
          enabled={data.welcomeModal.enabled}
          content={data.welcomeModal.content}
          type={data.welcomeModal.type}
          version={data.welcomeModal.version}
        />
      )}
    </SafeAreaView>
  )
}

/** One compliance ring + label (DS ProgressRing, 0..1 fraction → percent). */
function ComplianceItem({ value, label, color, empty = false }: { value: number; label: string; color: string; empty?: boolean }) {
  const { theme } = useTheme()
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View className="items-center" style={styles.ringItem}>
      <ProgressRing
        value={empty ? 0 : pct}
        size={74}
        stroke={7}
        color={empty ? theme.mutedForeground : color}
        label={
          <Text className="font-display-black text-strong text-[19px]" style={styles.tnum}>
            {empty ? '—' : pct}
          </Text>
        }
      />
      <View className="items-center">
        <Text className="font-sans-bold text-strong text-[12px]">{label}</Text>
        {empty ? <Text className="font-sans text-subtle text-[10.5px]">Sin datos</Text> : null}
      </View>
    </View>
  )
}

function WeekCalendar({ workoutDates, plannedDays }: { workoutDates: Set<string>; plannedDays: Set<string> }) {
  const { theme } = useTheme()
  const today = startOfToday()
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + (i - 3) * MS_DAY))
  const todayIso = isoDate(today)

  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.weekRow}
    >
      {days.map((day) => {
        const dIso = isoDate(day)
        const active = dIso === todayIso
        const done = workoutDates.has(dIso)
        const planned = plannedDays.has(dIso)
        // today = brand cta-fill; completed = card + border; otherwise = sunken.
        const bgClass = active
          ? 'bg-cta-fill'
          : done
          ? 'bg-surface-card border border-subtle'
          : 'bg-surface-sunken border border-subtle'

        return (
          <View key={dIso} className={`flex-1 items-center justify-center rounded-control ${bgClass}`} style={styles.dayPill}>
            <Text className={`font-sans-bold text-[10px] uppercase ${active ? 'text-on-sport' : 'text-subtle'}`} style={styles.dayLabel}>
              {DAY_LABELS[day.getDay()]}
            </Text>
            <Text className={`font-display-bold text-[16px] ${active ? 'text-on-sport' : 'text-strong'}`}>
              {day.getDate()}
            </Text>
            <View style={styles.dayGlyph}>
              {done ? (
                <Check size={13} color={active ? '#fff' : theme.success} strokeWidth={3} />
              ) : active ? (
                <View style={[styles.dot, { backgroundColor: '#fff' }]} />
              ) : planned ? (
                <View style={[styles.dot, { backgroundColor: theme.primary, opacity: 0.5 }]} />
              ) : null}
            </View>
          </View>
        )
      })}
    </MotiView>
  )
}

function WorkoutHero({ plan, nextPlan, doneToday, onStart }: { plan: Plan | null; nextPlan: Plan | null; doneToday: boolean; onStart: (id: string) => void }) {
  const { theme } = useTheme()

  // ── Rest day (no plan today) — recessed sunken card ──
  if (!plan) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 450, delay: 80 }}
      >
        <Card variant="sunken" padding="lg">
          <View className="flex-row items-center" style={styles.heroTop}>
            <View className="items-center justify-center rounded-xl" style={[styles.heroIcon, { backgroundColor: theme.cyan + '1A' }]}>
              <Moon size={24} color={theme.cyan} strokeWidth={2.25} />
            </View>
            <View className="flex-1" style={styles.heroCopy}>
              <Text className="font-sans-bold text-[11px] uppercase" style={{ color: theme.cyan, letterSpacing: 1 }}>
                Dia de descanso
              </Text>
              <Text className="font-display-black text-strong text-[18px]" numberOfLines={2} style={styles.restTitle}>
                Recupera y prepara el siguiente entreno
              </Text>
            </View>
          </View>
          <Text className="font-sans text-muted text-[13px]" style={styles.restText}>
            Proximo workout: {nextPlan?.title ?? 'cuando tu coach lo asigne'}
          </Text>
        </Card>
      </MotiView>
    )
  }

  // ── Active workout — inverse (dark) hero ──
  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 450, delay: 80 }}
    >
      <Card variant="inverse" padding="lg">
        <View className="flex-row items-center" style={styles.heroTop}>
          <View className="items-center justify-center rounded-xl" style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Dumbbell size={24} color={theme.primary} strokeWidth={2.25} />
          </View>
          <View className="flex-1" style={styles.heroCopy}>
            <Text className="font-sans-bold text-sport-400 text-[11px] uppercase" style={{ letterSpacing: 1 }}>
              Workout de hoy
            </Text>
            <Text className="font-display-black text-on-dark text-[20px]" numberOfLines={2} style={styles.heroTitle}>
              {plan.title}
            </Text>
            <Text className="font-sans text-on-dark-muted text-[13px]">
              {plan.blockCount} {plan.blockCount === 1 ? 'ejercicio' : 'ejercicios'}
            </Text>
          </View>
        </View>

        {doneToday ? (
          <View style={styles.heroProgress}>
            <View className="overflow-hidden" style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.success, width: '100%' }]} />
            </View>
            <Text className="font-sans-semibold text-[12.5px]" style={{ color: theme.success }}>✓ Completado hoy</Text>
          </View>
        ) : null}

        <View style={styles.heroCta}>
          <Button
            label={doneToday ? 'Entrenar de nuevo' : 'Empezar'}
            variant="sport"
            rightIcon={ChevronRight}
            onPress={() => onStart(plan.id)}
            full
          />
        </View>
      </Card>
    </MotiView>
  )
}

function ActiveProgramSection({ program }: { program: Program | null }) {
  const { theme } = useTheme()
  if (!program) return null
  const progress = program.plans.length ? 1 / program.plans.length : 0
  return (
    <Card>
      <View className="flex-row items-center" style={styles.sectionTitleRow}>
        <CalendarDays size={16} color={theme.primary} strokeWidth={2.25} />
        <Text className="font-sans-bold text-[12px] uppercase text-subtle" style={styles.sectionEyebrow}>
          Programa activo
        </Text>
      </View>
      <Text className="font-display-bold text-strong text-[18px]" numberOfLines={2} style={styles.programName}>
        {program.name}
      </Text>
      <Text className="font-sans text-muted text-[13px]" style={styles.programMeta}>
        {program.plans.length} plan{program.plans.length !== 1 ? 'es' : ''} en rotacion
      </Text>
      <ProgressBar value={Math.max(0.08, progress)} color={theme.primary} style={styles.programBar} />
    </Card>
  )
}

function RecentWorkouts({ workouts }: { workouts: RecentWorkout[] }) {
  const { theme } = useTheme()
  const rows = workouts.slice(0, 4)
  return (
    <Card padding="none" style={styles.listCard}>
      <View className="flex-row items-center" style={styles.listHeader}>
        <Dumbbell size={16} color={theme.primary} strokeWidth={2.25} />
        <Text className="font-sans-bold text-[12px] uppercase text-subtle" style={styles.sectionEyebrow}>
          Ultimos workouts
        </Text>
      </View>
      {rows.length === 0 ? (
        <Text className="font-sans text-muted text-[13px]" style={styles.listEmpty}>
          Aun no hay entrenamientos registrados.
        </Text>
      ) : (
        rows.map((w, idx) => (
          <View
            key={`${w.logged_at}-${idx}`}
            className="flex-row items-center"
            style={[styles.listRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <View className="items-center justify-center rounded-md bg-surface-sunken" style={styles.listIcon}>
              <Dumbbell size={18} color={theme.primary} strokeWidth={2.25} />
            </View>
            <Text className="flex-1 font-sans-semibold text-strong text-[14px]" numberOfLines={1}>
              {w.exercise_name_at_log ?? 'Workout registrado'}
            </Text>
            <Text className="font-sans text-muted text-[12px]">
              {formatDateTime(w.logged_at)}
            </Text>
          </View>
        ))
      )}
    </Card>
  )
}

function WeightSparkline({ weights, currentWeight, delta }: { weights: number[]; currentWeight: number | null; delta: number | null }) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const sparkWidth = Math.max(0, width - 64) // scroll px (16×2) + card md padding (16×2)
  const good = delta != null && delta <= 0
  const TrendIcon = delta != null && delta < 0 ? TrendingDown : TrendingUp
  const deltaText = delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '-'

  return (
    <Card>
      <View className="flex-row items-center" style={styles.sectionTitleRow}>
        <Scale size={16} color={theme.primary} strokeWidth={2.25} />
        <Text className="font-sans-bold text-[12px] uppercase text-subtle" style={styles.sectionEyebrow}>
          Peso 30 dias
        </Text>
      </View>
      {weights.length < 2 ? (
        <Text className="font-sans text-muted text-[13px]" style={styles.listEmpty}>
          Registra mas check-ins para ver tendencia.
        </Text>
      ) : (
        <>
          <View className="flex-row items-end justify-between" style={styles.weightTop}>
            <View className="flex-row items-baseline" style={styles.weightValueRow}>
              <Text className="font-display-black text-strong" style={styles.weightValue}>
                {currentWeight?.toFixed(1)}
              </Text>
              <Text className="font-sans-semibold text-muted text-[13px]">kg</Text>
            </View>
            <Badge
              tone={good ? 'success' : 'warning'}
              variant="soft"
              size="md"
              icon={<TrendIcon size={12} color={good ? theme.success : WARNING_500} strokeWidth={2.5} />}
            >
              {deltaText}
            </Badge>
          </View>
          <View style={styles.sparkWrap}>
            <Sparkline values={weights} width={sparkWidth} height={64} color={theme.primary} />
          </View>
        </>
      )}
    </Card>
  )
}

function HabitsMiniRow({ habits }: { habits: HabitsData }) {
  const { theme } = useTheme()
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350 }}
    >
      <View style={styles.habitsRow}>
        {habits.water_ml != null && (
          <View className="flex-row items-center rounded-pill border border-subtle bg-surface-card" style={styles.habitChip}>
            <Droplets size={14} color={theme.cyan} strokeWidth={2.25} />
            <Text className="font-sans-semibold text-body text-[13px]">
              {habits.water_ml >= 1000 ? `${(habits.water_ml / 1000).toFixed(1)}L` : `${habits.water_ml}ml`}
            </Text>
          </View>
        )}
        {habits.steps != null && (
          <View className="flex-row items-center rounded-pill border border-subtle bg-surface-card" style={styles.habitChip}>
            <Footprints size={14} color={theme.primary} strokeWidth={2.25} />
            <Text className="font-sans-semibold text-body text-[13px]">
              {habits.steps.toLocaleString('es-CL')} pasos
            </Text>
          </View>
        )}
      </View>
    </MotiView>
  )
}

function uniqueRecentWorkouts(rows: RecentWorkout[]): RecentWorkout[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${isoDate(new Date(row.logged_at))}-${row.exercise_name_at_log ?? row.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function calculateStreak(dates: Set<string>): number {
  let streak = 0
  let cursor = startOfToday()
  while (dates.has(isoDate(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - MS_DAY)
  }
  return streak
}

function hasCheckInThisMonth(checkIns: CheckInPoint[]): boolean {
  const now = new Date()
  return checkIns.some((c) => {
    const d = new Date(c.date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },

  // Week strip
  weekRow: { flexDirection: 'row', gap: 6 },
  dayPill: { minHeight: 60, paddingVertical: 8, gap: 5 },
  dayLabel: { letterSpacing: 0.6 },
  dayGlyph: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // Check-in banner
  checkInBanner: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  bannerIcon: { width: 34, height: 34 },
  bannerText: { minWidth: 0, gap: 2 },

  // Cards / section titles
  cardEyebrow: { letterSpacing: 0.8, marginBottom: 14 },
  sectionTitleRow: { gap: 7, marginBottom: 2 },
  sectionEyebrow: { letterSpacing: 0.6 },

  // Compliance rings
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  ringItem: { gap: 8 },
  tnum: { fontVariant: ['tabular-nums'] },

  // Hero
  heroTop: { gap: 12 },
  heroIcon: { width: 54, height: 54 },
  heroCopy: { minWidth: 0, gap: 3 },
  heroTitle: { letterSpacing: -0.4, marginTop: 1 },
  heroProgress: { gap: 6, marginTop: 16 },
  heroCta: { marginTop: 16 },
  progressTrack: { height: 6, borderRadius: 9999 },
  progressFill: { height: 6, borderRadius: 9999 },
  restTitle: { letterSpacing: -0.3, marginTop: 1 },
  restText: { marginTop: 12, lineHeight: 19 },

  // Active program
  programName: { letterSpacing: -0.3, marginTop: 6 },
  programMeta: { marginTop: 2 },
  programBar: { marginTop: 12 },

  // Recent workouts list
  listCard: { overflow: 'hidden' },
  listHeader: { gap: 7, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  listEmpty: { paddingHorizontal: 16, paddingBottom: 16, lineHeight: 19 },
  listRow: { gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  listIcon: { width: 38, height: 38 },

  // Weight
  weightTop: { marginTop: 4 },
  weightValueRow: { gap: 5 },
  weightValue: { fontSize: 28, lineHeight: 30, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  sparkWrap: { marginTop: 12 },

  // Habits
  habitsRow: { flexDirection: 'row', gap: 8 },
  habitChip: { gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
})
