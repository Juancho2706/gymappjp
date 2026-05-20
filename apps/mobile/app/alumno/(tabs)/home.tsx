import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Apple, CalendarDays, ChevronRight, Droplets, Dumbbell, Footprints, Scale, TrendingDown, TrendingUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile, type ClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'
import {
  Button,
  Card,
  ComplianceRing,
  NutritionDailySummaryWidget,
  PersonalRecordsBanner,
  ScreenHeader,
  Sparkline,
  StreakWidget,
  WelcomeModal,
} from '../../../components'
import { getTodayInSantiago, timeGreeting, formatLongDate } from '../../../lib/date-utils'
import { getDailyHabits, type HabitsData } from '../../../lib/habits.queries'

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const MS_DAY = 24 * 60 * 60 * 1000

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
    load()
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
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={`${timeGreeting()}, ${data?.client?.fullName?.split(' ')[0] ?? ''}`.trim()}
        subtitle={formatLongDate()}
        trailing={<StreakWidget streak={derived.streak} />}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <WeekCalendar workoutDates={data?.workoutDates ?? new Set<string>()} plannedDays={derived.plannedDays} />

        {!hasCheckInThisMonth(data?.checkIns ?? []) ? (
          <MotiView
            from={{ opacity: 0, translateY: 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 400 }}
          >
            <TouchableOpacity
              style={[
                styles.checkInBanner,
                { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30', borderRadius: theme.radius.xl },
              ]}
              onPress={() => router.push('/alumno/check-in')}
              activeOpacity={0.82}
            >
              <View style={styles.bannerLeft}>
                <Scale size={18} color={theme.primary} />
                <View style={styles.bannerText}>
                  <Text style={[styles.bannerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                    Check-in pendiente
                  </Text>
                  <Text style={[styles.bannerSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    Registra tu peso y energia de este mes.
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={theme.primary} />
            </TouchableOpacity>
          </MotiView>
        ) : null}

        <WorkoutHero
          plan={derived.todayPlan}
          nextPlan={derived.nextPlan}
          onStart={(planId) => router.push(`/alumno/workout/${planId}`)}
        />

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 120 }}
        >
          <Card style={styles.complianceCard}>
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Cumplimiento 30 dias
            </Text>
            <View style={styles.ringsRow}>
              <ComplianceRing value={derived.workoutCompliance} label="Workout" color={theme.primary} />
              <ComplianceRing value={derived.nutritionCompliance} label="Nutricion" color="#10B981" />
              <ComplianceRing value={derived.checkInCompliance} label="Check-in" color="#F59E0B" />
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
          <HabitsMiniRow habits={data.habitsToday} theme={theme} />
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
        const isPast = dIso < todayIso
        // dot color: done=green, planned+past+not done=amber, planned+future=muted, active=white
        const dotColor = done
          ? (active ? theme.primaryForeground : '#10B981')
          : planned && isPast
          ? '#F59E0B'
          : planned
          ? (active ? theme.primaryForeground + '80' : theme.border)
          : 'transparent'

        return (
          <View
            key={dIso}
            style={[
              styles.dayPill,
              {
                backgroundColor: active ? theme.primary : theme.card,
                borderColor: active ? theme.primary : done ? '#10B981' + '50' : theme.border,
                borderRadius: theme.radius.xl,
              },
            ]}
          >
            <Text style={[styles.dayLabel, { color: active ? theme.primaryForeground : theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {DAY_LABELS[day.getDay()]}
            </Text>
            <Text style={[styles.dayNum, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {day.getDate()}
            </Text>
            <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
          </View>
        )
      })}
    </MotiView>
  )
}

function WorkoutHero({ plan, nextPlan, onStart }: { plan: Plan | null; nextPlan: Plan | null; onStart: (id: string) => void }) {
  const { theme } = useTheme()
  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 450, delay: 80 }}
    >
      <Card variant={plan ? 'highlighted' : 'default'} padding={20} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: theme.primary + '15', borderRadius: theme.radius.xl }]}>
            <Dumbbell size={24} color={theme.primary} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroEyebrow, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
              {plan ? 'Workout de hoy' : 'Dia de descanso'}
            </Text>
            <Text style={[styles.heroTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={2}>
              {plan?.title ?? 'Recupera y prepara el siguiente entreno'}
            </Text>
          </View>
        </View>
        {plan ? (
          <>
            <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.primary, width: '18%' }]} />
            </View>
            <Button label="Empezar" rightIcon={ChevronRight} onPress={() => onStart(plan.id)} full />
          </>
        ) : (
          <Text style={[styles.restText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Proximo workout: {nextPlan?.title ?? 'cuando tu coach lo asigne'}
          </Text>
        )}
      </Card>
    </MotiView>
  )
}

function ActiveProgramSection({ program }: { program: Program | null }) {
  const { theme } = useTheme()
  if (!program) return null
  const progress = program.plans.length ? 1 / program.plans.length : 0
  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow}>
        <CalendarDays size={17} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Programa activo
        </Text>
      </View>
      <Text style={[styles.programName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={2}>
        {program.name}
      </Text>
      <Text style={[styles.programMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {program.plans.length} plan{program.plans.length !== 1 ? 'es' : ''} en rotacion
      </Text>
      <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${Math.max(8, progress * 100)}%` }]} />
      </View>
    </Card>
  )
}

function RecentWorkouts({ workouts }: { workouts: RecentWorkout[] }) {
  const { theme } = useTheme()
  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow}>
        <Dumbbell size={17} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Ultimos workouts
        </Text>
      </View>
      {workouts.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Aun no hay entrenamientos registrados.
        </Text>
      ) : (
        workouts.slice(0, 4).map((w, idx) => (
          <View key={`${w.logged_at}-${idx}`} style={[styles.workoutRow, idx < workouts.length - 1 && { borderBottomColor: theme.border }]}>
            <Text style={[styles.workoutName, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>
              {w.exercise_name_at_log ?? 'Workout registrado'}
            </Text>
            <Text style={[styles.workoutDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
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
  const TrendIcon = delta != null && delta < 0 ? TrendingDown : TrendingUp
  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow}>
        <Scale size={17} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Peso 30 dias
        </Text>
      </View>
      {weights.length < 2 ? (
        <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Registra mas check-ins para ver tendencia.
        </Text>
      ) : (
        <>
          <View style={styles.weightTop}>
            <Text style={[styles.weightValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
              {currentWeight?.toFixed(1)} kg
            </Text>
            <View style={styles.trendRow}>
              <TrendIcon size={16} color={delta != null && delta <= 0 ? theme.success : '#F59E0B'} />
              <Text style={[styles.trendText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '-'}
              </Text>
            </View>
          </View>
          <Sparkline values={weights} height={84} color={theme.primary} />
        </>
      )}
    </Card>
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
  weekRow: { flexDirection: 'row', gap: 8 },
  dayPill: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dayLabel: { fontSize: 10, textTransform: 'uppercase' },
  dayNum: { fontSize: 17 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  checkInBanner: {
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { fontSize: 14 },
  bannerSub: { fontSize: 12, lineHeight: 17 },
  heroCard: { gap: 16 },
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0, gap: 3 },
  heroEyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { fontSize: 20, letterSpacing: -0.4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  restText: { fontSize: 13, lineHeight: 19 },
  complianceCard: { gap: 14 },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  sectionCard: { gap: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 15, letterSpacing: -0.1 },
  programName: { fontSize: 18, letterSpacing: -0.3 },
  programMeta: { fontSize: 13 },
  workoutRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  workoutName: { fontSize: 14, flex: 1 },
  workoutDate: { fontSize: 12 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  weightTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weightValue: { fontSize: 24, letterSpacing: -0.6 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 13 },
  habitsRow: { flexDirection: 'row', gap: 8 },
  habitChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  habitText: { fontSize: 13 },
})

function HabitsMiniRow({ habits, theme }: { habits: HabitsData; theme: any }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350 }}
    >
      <View style={styles.habitsRow}>
        {habits.water_ml != null && (
          <View style={[styles.habitChip, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Droplets size={14} color="#3b82f6" strokeWidth={2} />
            <Text style={[styles.habitText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {habits.water_ml >= 1000 ? `${(habits.water_ml / 1000).toFixed(1)}L` : `${habits.water_ml}ml`}
            </Text>
          </View>
        )}
        {habits.steps != null && (
          <View style={[styles.habitChip, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Footprints size={14} color="#10B981" strokeWidth={2} />
            <Text style={[styles.habitText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {habits.steps.toLocaleString('es-CL')} pasos
            </Text>
          </View>
        )}
      </View>
    </MotiView>
  )
}
