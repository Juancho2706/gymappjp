import { useEffect, useMemo, useState } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { AlertCircle, CalendarDays, Check, CheckCircle2, ChevronRight, Droplets, Dumbbell, Footprints, Scale, TrendingDown, TrendingUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile, type ClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
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
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { getTodayInSantiago, timeGreeting, formatLongDate, formatRelativeDate } from '../../../lib/date-utils'
import { getDailyHabits, type HabitsData } from '../../../lib/habits.queries'

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const MS_DAY = 24 * 60 * 60 * 1000

interface HeroBlock {
  id: string
  sets: number
  reps: string
  exerciseName: string
}

interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  blockCount: number
  blocks: HeroBlock[]
}

interface PhaseSeg {
  name: string
  weeks: number
  color?: string
}

interface Program {
  id: string
  name: string
  plans: Plan[]
  weeksToRepeat: number
  phases: PhaseSeg[] | null
}

interface OrgAnnouncement {
  id: string
  title: string
  body: string
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
  brandName: string | null
  welcomeMessage: string | null
  announcements: OrgAnnouncement[]
  lastCheckInAt: string | null
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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

    const nowIso = new Date().toISOString()
    const [{ data: programData }, { data: workoutRows }, { data: nutritionRows }, { data: checkInRows }, { data: coachData }, habitsData, { data: announcementRows }] =
      await Promise.all([
        supabase
          .from('workout_programs')
          .select('id, name, weeks_to_repeat, program_phases, workout_plans ( id, title, day_of_week, assigned_date, workout_blocks ( id, sets, reps, exercises ( name ) ) )')
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
          .select('brand_name, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version')
          .eq('id', client.coachId)
          .maybeSingle(),
        getDailyHabits(client.id, todayIso),
        client.orgId
          ? supabase
              .from('org_announcements')
              .select('id, title, body')
              .eq('org_id', client.orgId)
              .eq('is_active', true)
              .in('audience', ['all', 'clients'])
              .or(`active_until.is.null,active_until.gt.${nowIso}`)
              .or(`published_at.is.null,published_at.lte.${nowIso}`)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as OrgAnnouncement[] }),
      ])

    const phasesRaw = (programData as any)?.program_phases
    const program: Program | null = programData
      ? {
          id: programData.id,
          name: programData.name,
          weeksToRepeat: Math.max(1, (programData as any).weeks_to_repeat ?? 1),
          phases: Array.isArray(phasesRaw) && phasesRaw.length > 0 ? (phasesRaw as PhaseSeg[]) : null,
          plans: ((programData as any).workout_plans ?? [])
            .map((p: any) => ({
              id: p.id,
              title: p.title,
              day_of_week: p.day_of_week,
              assigned_date: p.assigned_date,
              blockCount: p.workout_blocks?.length ?? 0,
              blocks: (p.workout_blocks ?? []).map((b: any) => ({
                id: b.id,
                sets: b.sets ?? 0,
                reps: b.reps ?? '',
                exerciseName: b.exercises?.name ?? 'Ejercicio',
              })) as HeroBlock[],
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

    const checkInList = (checkInRows ?? []) as CheckInPoint[]
    const lastCheckInAt = checkInList.length ? checkInList[checkInList.length - 1].date : null

    setData({
      client,
      program,
      recentWorkouts: (workoutRows ?? []) as RecentWorkout[],
      workoutDates: new Set((workoutRows ?? []).map((row) => isoDate(new Date(row.logged_at)))),
      nutritionDates: new Set((nutritionRows ?? []).map((row) => row.log_date)),
      checkIns: checkInList,
      habitsToday: habitsData,
      welcomeModal,
      brandName: coachData?.brand_name ?? null,
      welcomeMessage: (coachData as any)?.welcome_message ?? null,
      announcements: (announcementRows ?? []) as OrgAnnouncement[],
      lastCheckInAt,
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
    const nextDayLabel = nextPlan?.day_of_week ? DOW_LABELS[nextPlan.day_of_week - 1] : null
    const workoutTargetDays = plans.length ? Math.min(plans.length, 30) : 12
    const workoutCompliance = data ? Math.min(1, data.workoutDates.size / workoutTargetDays) : 0
    const nutritionCompliance = data ? Math.min(1, data.nutritionDates.size / 30) : 0
    const checkInCompliance = data ? Math.min(1, data.checkIns.length / 4) : 0
    // Web "Actividad reciente": agrupado por día con conteo de series (cada log = 1 serie).
    const dayCount = new Map<string, number>()
    for (const row of data?.recentWorkouts ?? []) {
      const k = isoDate(new Date(row.logged_at))
      dayCount.set(k, (dayCount.get(k) ?? 0) + 1)
    }
    const recentDays = [...dayCount.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5)
      .map(([dayKey, sets]) => ({
        dayKey,
        dateLabel: formatRelativeDate(dayKey, todayIso),
        sets,
        subtitle: `${sets} serie${sets !== 1 ? 's' : ''} registrada${sets !== 1 ? 's' : ''}`,
      }))
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
      nextDayLabel,
      workoutCompliance,
      nutritionCompliance,
      checkInCompliance,
      // Estado "sin datos" → ring gris en vez de 0% (no confundir sin-uso con mal-cumplimiento).
      nutritionEmpty: data ? data.nutritionDates.size === 0 : true,
      checkInEmpty: data ? data.checkIns.length === 0 : true,
      recentDays,
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
      {data?.brandName ? (
        <Text style={[styles.brandEyebrow, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
          {data.brandName}
        </Text>
      ) : null}
      <ScreenHeader
        title={`${timeGreeting()}, ${data?.client?.fullName?.split(' ')[0] ?? 'Atleta'}`.trim()}
        subtitle={formatLongDate()}
        trailing={<StreakWidget streak={derived.streak} />}
      />
      {data?.welcomeMessage ? (
        <Text style={[styles.welcomeMessage, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
          {data.welcomeMessage}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {(data?.announcements ?? []).length > 0 && (
          <OrgAnnouncementBanner announcements={data!.announcements} />
        )}

        <WeekCalendar workoutDates={data?.workoutDates ?? new Set<string>()} plannedDays={derived.plannedDays} />

        <CheckInBanner lastCheckInAt={data?.lastCheckInAt ?? null} onPress={() => router.push('/alumno/check-in')} />

        <WorkoutHero
          plan={derived.todayPlan}
          nextPlan={derived.nextPlan}
          nextDayLabel={derived.nextDayLabel}
          doneToday={!!derived.todayPlan && (data?.workoutDates.has(getTodayInSantiago().iso) ?? false)}
          onStart={(planId) => router.push(`/alumno/workout/${planId}`)}
          onNutrition={() => router.push('/alumno/nutricion')}
        />

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 120 }}
        >
          <Card style={styles.complianceCard}>
            <Text style={[styles.complianceTitle, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Últimos 30 días
            </Text>
            <View style={styles.ringsRow}>
              <ComplianceRing value={derived.workoutCompliance} label="Entrenos" color={theme.primary} />
              <ComplianceRing value={derived.nutritionCompliance} label="Nutrición" color="#10b981" empty={derived.nutritionEmpty} />
              <ComplianceRing value={derived.checkInCompliance} label="Check-ins" color="#8b5cf6" empty={derived.checkInEmpty} />
            </View>
          </Card>
        </MotiView>

        <ActiveProgramSection
          program={data?.program ?? null}
          todayPlanId={derived.todayPlan?.id ?? null}
          onOpenToday={(id) => router.push(`/alumno/workout/${id}`)}
        />
        <RecentWorkouts items={derived.recentDays} onSeeAll={() => router.push('/alumno/history')} />
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

function WorkoutHero({
  plan, nextPlan, nextDayLabel, doneToday, onStart, onNutrition,
}: {
  plan: Plan | null
  nextPlan: Plan | null
  nextDayLabel: string | null
  doneToday: boolean
  onStart: (id: string) => void
  onNutrition: () => void
}) {
  const { theme } = useTheme()

  // Rest day (web RestDayCard): luna flotante, "Día de descanso", próximo + "Ver nutrición →".
  if (!plan) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 450, delay: 80 }}
      >
        <Card padding={24} style={styles.restCard}>
          <MotiView
            from={{ translateY: 0 }}
            animate={{ translateY: -8 }}
            transition={{ type: 'timing', duration: 1500, loop: true, repeatReverse: true }}
            style={[styles.restMoon, { backgroundColor: theme.muted }]}
          >
            <Text style={{ fontSize: 30 }}>🌙</Text>
          </MotiView>
          <Text style={[styles.restTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            Día de descanso
          </Text>
          {nextPlan ? (
            <Text style={[styles.restSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Próximo: <Text style={{ color: theme.foreground, fontFamily: 'Inter_600SemiBold' }}>{nextPlan.title}</Text>
              {nextDayLabel ? ` · ${nextDayLabel}` : ''}
            </Text>
          ) : (
            <Text style={[styles.restSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Recupera bien para la próxima sesión.
            </Text>
          )}
          <TouchableOpacity onPress={onNutrition} activeOpacity={0.7} style={{ marginTop: 4 }}>
            <Text style={[styles.restLink, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>
              Ver nutrición →
            </Text>
          </TouchableOpacity>
        </Card>
      </MotiView>
    )
  }

  const blocks = plan.blocks ?? []
  const show = blocks.slice(0, 4)
  const more = blocks.length - show.length
  const totalSetsTarget = blocks.reduce((s, b) => s + (b.sets || 0), 0)
  const totalSetsLogged = doneToday ? totalSetsTarget : 0
  const pct = totalSetsTarget > 0 ? Math.min(100, (totalSetsLogged / totalSetsTarget) * 100) : 0

  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 450, delay: 80 }}
    >
      <Card variant="highlighted" padding={20} style={styles.heroCard}>
        {doneToday ? (
          <View style={styles.heroDoneOverlay}>
            <Check size={40} color={theme.success} strokeWidth={2.5} />
            <Text style={{ color: theme.success, fontSize: 14, fontFamily: 'Montserrat_700Bold' }}>
              Entrenamiento completado
            </Text>
          </View>
        ) : null}
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30', borderWidth: 1, borderRadius: theme.radius.xl }]}>
            <Dumbbell size={24} color={theme.primary} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroEyebrow, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Hoy
            </Text>
            <Text style={[styles.heroTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={2}>
              {plan.title}
            </Text>
          </View>
        </View>

        {show.length > 0 ? (
          <View style={styles.heroList}>
            {show.map((b) => (
              <View key={b.id} style={styles.heroListRow}>
                <Text style={[styles.heroListName, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  • {b.exerciseName}
                </Text>
                <Text style={[styles.heroListReps, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {b.sets} × {b.reps}
                </Text>
              </View>
            ))}
            {more > 0 ? (
              <Text style={[styles.heroMore, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                + {more} ejercicios más
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.heroSeries, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {totalSetsLogged}/{totalSetsTarget} series
        </Text>

        <Button label={doneToday ? 'Ver registro' : 'Empezar entrenamiento'} rightIcon={ChevronRight} onPress={() => onStart(plan.id)} full />
      </Card>
    </MotiView>
  )
}

function CheckInBanner({ lastCheckInAt, onPress }: { lastCheckInAt: string | null; onPress: () => void }) {
  const { theme } = useTheme()
  const { iso: todayIso } = getTodayInSantiago()

  // Paridad con web CheckInBanner: sin registros / <3d oculto / 3-7d aviso / >7d vencido.
  if (!lastCheckInAt) {
    return (
      <BannerFrame theme={theme} variant="muted" icon={AlertCircle} title="Registra tu primer check-in" sub="Peso y energía en segundos" cta="Ir" onPress={onPress} />
    )
  }

  const lastDay = lastCheckInAt.slice(0, 10)
  const d0 = new Date(`${todayIso}T12:00:00`).getTime()
  const d1 = new Date(`${lastDay}T12:00:00`).getTime()
  const daysSince = Math.round((d0 - d1) / 86400000)

  if (daysSince < 3) return null

  const overdue = daysSince > 7
  const title = overdue ? '¡Check-in pendiente!' : daysSince === 3 ? 'Check-in próximo' : `Check-in próximo — hace ${daysSince} días`
  const sub = `Último: ${formatRelativeDate(lastDay, todayIso)}`

  return (
    <BannerFrame
      theme={theme}
      variant={overdue ? 'overdue' : 'warning'}
      icon={overdue ? AlertCircle : CheckCircle2}
      title={title}
      sub={sub}
      cta="Check-in"
      onPress={onPress}
    />
  )
}

function BannerFrame({
  theme, variant, icon: Icon, title, sub, cta, onPress,
}: {
  theme: any
  variant: 'muted' | 'warning' | 'overdue'
  icon: any
  title: string
  sub: string
  cta: string
  onPress: () => void
}) {
  const accent = variant === 'overdue' ? '#ef4444' : variant === 'warning' ? '#f59e0b' : theme.mutedForeground
  const bg = variant === 'overdue' ? '#ef444414' : variant === 'warning' ? '#f59e0b14' : theme.muted
  return (
    <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
      <View style={[styles.checkInBanner, { backgroundColor: bg, borderLeftColor: accent, borderLeftWidth: 4, borderRadius: theme.radius.lg }]}>
        <View style={styles.bannerLeft}>
          <Icon size={20} color={accent} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
            <Text style={[styles.bannerSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{sub}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.bannerCta, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>{cta}</Text>
        </TouchableOpacity>
      </View>
    </MotiView>
  )
}

function OrgAnnouncementBanner({ announcements }: { announcements: OrgAnnouncement[] }) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      {announcements.map((a) => (
        <View key={a.id} style={[styles.announceCard, { backgroundColor: '#3b82f614', borderColor: '#3b82f640', borderRadius: theme.radius.xl }]}>
          <Text style={[styles.announceTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{a.title}</Text>
          <Text style={[styles.announceBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{a.body}</Text>
        </View>
      ))}
    </View>
  )
}

function ProgramPhaseBar({ phases, currentWeek, totalWeeks }: { phases: PhaseSeg[] | null; currentWeek: number; totalWeeks: number }) {
  const { theme } = useTheme()
  const pct = totalWeeks > 0 ? Math.min(100, (currentWeek / totalWeeks) * 100) : 0

  if (!phases || phases.length === 0) {
    return (
      <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${pct}%` }]} />
      </View>
    )
  }

  return (
    <View style={[styles.phaseTrack, { backgroundColor: theme.muted }]}>
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flexDirection: 'row', flex: 1 }}>
          {phases.map((p, i) => (
            <View
              key={`${p.name}-${i}`}
              style={{
                width: `${(p.weeks / totalWeeks) * 100}%`,
                backgroundColor: p.color || theme.primary + '66',
                borderRightWidth: i < phases.length - 1 ? 1 : 0,
                borderRightColor: theme.background,
              }}
            />
          ))}
        </View>
      </View>
      <View style={[styles.phaseMarker, { backgroundColor: theme.primary, borderColor: theme.background, left: `${pct}%` }]} />
    </View>
  )
}

function ActiveProgramSection({
  program, todayPlanId, onOpenToday,
}: {
  program: Program | null
  todayPlanId: string | null
  onOpenToday: (id: string) => void
}) {
  const { theme } = useTheme()

  // Sin programa (web GlassCard empty): icono + copy.
  if (!program) {
    return (
      <Card style={StyleSheet.flatten([styles.sectionCard, { alignItems: 'center' }])}>
        <CalendarDays size={40} color={theme.mutedForeground} strokeWidth={1.5} />
        <Text style={[styles.programName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold', textAlign: 'center' }]}>
          Sin programa activo
        </Text>
        <Text style={[styles.programMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans, textAlign: 'center' }]}>
          Pídele a tu coach que te asigne uno
        </Text>
      </Card>
    )
  }

  const { dayOfWeek: todayDow } = getTodayInSantiago()
  const totalWeeks = program.weeksToRepeat
  // Sin start date en mobile → asumimos semana 1 (paridad visual con barra de fase).
  const currentWeek = 1
  const sortedPlans = [...program.plans].sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.programHeaderRow}>
        <View style={[styles.sectionTitleRow, { flex: 1, minWidth: 0 }]}>
          <CalendarDays size={16} color={theme.primary} />
          <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold', flex: 1 }]} numberOfLines={1}>
            {program.name}
          </Text>
        </View>
        <View style={[styles.weekBadge, { backgroundColor: theme.muted }]}>
          <Text style={[styles.weekBadgeText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Semana {currentWeek} de {totalWeeks}
          </Text>
        </View>
      </View>

      <ProgramPhaseBar phases={program.phases} currentWeek={currentWeek} totalWeeks={totalWeeks} />

      <View style={{ gap: 8 }}>
        {sortedPlans.map((p) => {
          const dow = p.day_of_week ?? 1
          const isToday = dow === todayDow
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onOpenToday(p.id)}
              activeOpacity={0.8}
              style={[
                styles.planCard,
                {
                  borderRadius: theme.radius.lg,
                  borderColor: isToday ? theme.primary + '4D' : theme.border,
                  backgroundColor: isToday ? theme.primary + '1A' : theme.card,
                },
              ]}
            >
              <View
                style={[
                  styles.planDayPill,
                  {
                    borderRadius: theme.radius.lg,
                    backgroundColor: isToday ? theme.primary : theme.primary + '1A',
                    borderColor: isToday ? theme.primary : theme.primary + '40',
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontFamily: 'Montserrat_700Bold', color: isToday ? theme.primaryForeground : theme.primary }}>
                  {DOW_LABELS[dow - 1]}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.planTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                  {p.title}
                </Text>
                <Text style={[styles.planDay, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Día {dow}
                </Text>
              </View>
              <ChevronRight size={20} color={theme.mutedForeground} />
            </TouchableOpacity>
          )
        })}
      </View>

      {todayPlanId ? (
        <TouchableOpacity onPress={() => onOpenToday(todayPlanId)} activeOpacity={0.7}>
          <Text style={[styles.sectionLink, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>
            Ver entreno de hoy →
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  )
}

function RecentWorkouts({
  items, onSeeAll,
}: {
  items: { dayKey: string; dateLabel: string; sets: number; subtitle: string }[]
  onSeeAll: () => void
}) {
  const { theme } = useTheme()
  // Web RecentWorkoutsSection: si no hay logs, no se renderiza nada.
  if (items.length === 0) return null
  return (
    <Card padding={0} style={styles.sectionCardFlush}>
      <View style={[styles.recentHeader, { borderBottomColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Actividad reciente
        </Text>
      </View>
      {items.map((it, idx) => (
        <View
          key={it.dayKey}
          style={[styles.recentRow, idx < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
        >
          <View style={[styles.recentIcon, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.md }]}>
            <Dumbbell size={16} color={theme.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.recentDate, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
              {it.dateLabel}
            </Text>
            <Text style={[styles.recentSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {it.subtitle}
            </Text>
          </View>
          <Text style={[styles.recentCount, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
            {it.sets} {it.sets === 1 ? 'serie' : 'series'}
          </Text>
        </View>
      ))}
      <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={[styles.recentFooter, { borderTopColor: theme.border }]}>
        <Text style={[styles.sectionLink, { color: theme.primary, fontFamily: 'Inter_600SemiBold', marginTop: 0 }]}>
          Ver historial completo →
        </Text>
      </TouchableOpacity>
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
          Peso
        </Text>
      </View>
      {weights.length < 2 ? (
        <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {weights.length === 0 ? 'Aún sin registros de peso' : 'Registra más check-ins para ver tendencia.'}
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

function calculateStreak(dates: Set<string>): number {
  let streak = 0
  let cursor = startOfToday()
  while (dates.has(isoDate(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - MS_DAY)
  }
  return streak
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  brandEyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, paddingHorizontal: 20, paddingTop: 18, fontWeight: '500' },
  welcomeMessage: { fontSize: 11, paddingHorizontal: 20, marginTop: -8, marginBottom: 4 },
  announceCard: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  announceTitle: { fontSize: 14 },
  announceBody: { fontSize: 13, lineHeight: 18 },
  bannerCta: { fontSize: 12 },
  restCard: { alignItems: 'center', gap: 8 },
  restMoon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  restTitle: { fontSize: 20, letterSpacing: -0.3 },
  restSub: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  restLink: { fontSize: 12 },
  heroDoneOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b98126',
    borderRadius: 16,
  },
  heroList: { gap: 6 },
  heroListRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  heroListName: { fontSize: 13.5, flex: 1 },
  heroListReps: { fontSize: 13.5, fontVariant: ['tabular-nums'] },
  heroMore: { fontSize: 12 },
  heroSeries: { fontSize: 12 },
  sectionLink: { fontSize: 11, textAlign: 'center', marginTop: 4 },
  programHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weekBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  weekBadgeText: { fontSize: 10, fontWeight: '500' },
  phaseTrack: { height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  phaseMarker: { position: 'absolute', top: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginLeft: -6 },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  planDayPill: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  planTitle: { fontSize: 14 },
  planDay: { fontSize: 10 },
  sectionCardFlush: { overflow: 'hidden' },
  recentHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  recentIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  recentDate: { fontSize: 14 },
  recentSub: { fontSize: 10 },
  recentCount: { fontSize: 12 },
  recentFooter: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  complianceTitle: { fontSize: 12, textAlign: 'center' },
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
