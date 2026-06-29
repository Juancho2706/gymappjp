import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Flame,
  MessageCircle,
  Moon,
  Play,
  Scale,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { getClientProfile, type ClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
import { useTheme } from '../../../context/ThemeContext'
import {
  Avatar,
  Badge,
  Button,
  Card,
  HabitsTracker,
  NutritionDailySummaryWidget,
  PersonalRecordsBanner,
  ScreenHeader,
  Sparkline,
  WelcomeModal,
} from '../../../components'
import { ProgressRing } from '../../../components/ProgressRing'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { getTodayInSantiago, timeGreeting } from '../../../lib/date-utils'
import { getDailyHabits, type HabitsData } from '../../../lib/habits.queries'

const MS_DAY = 24 * 60 * 60 * 1000
// Fixed DS accents (constant ramps; never white-labeled — sport follows brand at runtime).
const EMBER_500 = '#FF6A3D' // accent-nutrition
const EMBER_600 = '#E8511E'
const WARNING_500 = '#F5A524'
const SUCCESS_500 = '#1FB877'

// Semana Lun..Dom — etiquetas verbatim del diseño (Dash week strip).
const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
// Etiqueta corta de día para las day-cards del programa (dbDay 1..7 = Lun..Dom).
const DAY_SHORT = ['', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

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
  coachName: string | null
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
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Sticky CTA: se muestra cuando el hero sale de vista (Ola 2 del diseño).
  const [scrollY, setScrollY] = useState(0)
  const heroBottom = useRef(0)

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
      coachName: coachData?.brand_name ?? null,
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
    const workoutTargetDays = plans.length ? Math.min(plans.length * 4, 30) : 12
    const workoutCompliance = data ? Math.min(1, data.workoutDates.size / workoutTargetDays) : 0
    const nutritionCompliance = data ? Math.min(1, data.nutritionDates.size / 30) : 0
    const checkInCompliance = data ? Math.min(1, data.checkIns.length / 4) : 0
    const recentUnique = uniqueRecentWorkouts(data?.recentWorkouts ?? [])
    const weights = (data?.checkIns ?? []).filter((p) => p.weight != null).map((p) => p.weight as number)
    const currentWeight = weights.at(-1) ?? null
    const firstWeight = weights[0] ?? null
    const weightDelta = currentWeight != null && firstWeight != null ? currentWeight - firstWeight : null
    const streak = calculateStreak(data?.workoutDates ?? new Set<string>())
    const bestStreak = Math.max(streak, bestStreakInWindow(data?.workoutDates ?? new Set<string>()))
    const checkInDaysSince = daysSinceLastCheckIn(data?.checkIns ?? [])

    // ISO dates de Lun..Dom de la semana actual + qué días tienen workout planificado.
    const monday = startOfWeekMonday(today)
    const weekDates = Array.from({ length: 7 }, (_, i) => isoDate(new Date(monday.getTime() + i * MS_DAY)))
    const plannedDays = new Set<string>()
    if (plans.length > 0) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getTime() + i * MS_DAY)
        const dIso = isoDate(d)
        const dbDay = jsDayToDbDay(d.getDay())
        if (plans.some((p) => p.day_of_week === dbDay || p.assigned_date === dIso)) plannedDays.add(dIso)
      }
    }

    return {
      todayPlan,
      nextPlan,
      workoutCompliance,
      nutritionCompliance,
      checkInCompliance,
      nutritionEmpty: data ? data.nutritionDates.size === 0 : true,
      checkInEmpty: data ? data.checkIns.length === 0 : true,
      recentUnique,
      weights,
      currentWeight,
      weightDelta,
      streak,
      bestStreak,
      checkInDaysSince,
      weekDates,
      plannedDays,
      todayIso,
    }
  }, [data])

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando…" />
      </SafeAreaView>
    )
  }

  const firstName = data?.client?.fullName?.split(' ')[0] ?? ''
  const doneToday = !!derived.todayPlan && (data?.workoutDates.has(getTodayInSantiago().iso) ?? false)
  const subtitle = !data?.program
    ? 'Sin plan activo'
    : derived.todayPlan
    ? data.program.name
    : 'Hoy es día de descanso'

  // Check-in variant-aware (diseño): <3 días ok · 3–7 warning · >7 overdue.
  const ciDays = derived.checkInDaysSince
  const ciVariant: 'ok' | 'warning' | 'overdue' =
    ciDays == null || ciDays > 7 ? 'overdue' : ciDays >= 3 ? 'warning' : 'ok'

  const showStickyCta = !!derived.todayPlan && !doneToday && scrollY > heroBottom.current - 120

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title={`${timeGreeting()}, ${firstName}`.trim()} subtitle={subtitle} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {/* Racha ribbon — protagonista de retención */}
        <StreakRibbon streak={derived.streak} best={derived.bestStreak} />

        {/* Check-in banner (variant-aware) */}
        {ciVariant !== 'ok' && (
          <CheckInBanner variant={ciVariant} days={ciDays} onPress={() => router.push('/alumno/check-in')} />
        )}

        {/* HERO — qué hago hoy */}
        <View onLayout={(e) => { heroBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height }}>
          {!data?.program ? (
            <NoPlanHero coachName={data?.coachName} onPress={() => router.push('/alumno/check-in')} />
          ) : derived.todayPlan ? (
            <WorkoutHero plan={derived.todayPlan} doneToday={doneToday} onStart={(id) => router.push(`/alumno/workout/${id}`)} />
          ) : (
            <RestHero nextPlan={derived.nextPlan} onPress={() => router.push('/alumno/nutricion')} />
          )}
        </View>

        {/* Coach presence */}
        {data?.coachName && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360, delay: 60 }}>
            <Card interactive onPress={() => router.push('/alumno/check-in')} style={styles.coachCard}>
              <Avatar name={data.coachName} size="md" ring="ember" />
              <View style={styles.coachBody}>
                <View style={styles.coachNameRow}>
                  <Text className="font-sans-bold text-strong text-[13.5px]" numberOfLines={1} style={styles.flexShrink}>
                    {data.coachName}
                  </Text>
                  <Badge tone="ember" variant="soft" size="sm">Tu coach</Badge>
                </View>
                <Text className="font-sans text-muted text-[12.5px]" numberOfLines={2} style={styles.coachNote}>
                  Escríbele si tenés dudas de tu plan o tu progreso.
                </Text>
              </View>
              <View style={[styles.coachIcon, { backgroundColor: EMBER_500 + '1A' }]}>
                <MessageCircle size={17} color={EMBER_600} strokeWidth={2.25} />
              </View>
            </Card>
          </MotiView>
        )}

        {/* Momentum — semana + cumplimiento */}
        <SectionTitle title="Momentum" accent={theme.primary} />
        <Card>
          <WeekStrip
            weekDates={derived.weekDates}
            todayIso={derived.todayIso}
            workoutDates={data?.workoutDates ?? new Set<string>()}
            plannedDays={derived.plannedDays}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.ringsRow}>
            <ComplianceItem value={derived.workoutCompliance} label="Entrenos" sub={`${data?.workoutDates.size ?? 0} días`} color={theme.primary} />
            <ComplianceItem value={derived.nutritionCompliance} label="Nutrición" sub={`${data?.nutritionDates.size ?? 0} días`} color={EMBER_500} empty={derived.nutritionEmpty} />
            <ComplianceItem value={derived.checkInCompliance} label="Check-ins" sub={`${data?.checkIns.length ?? 0} de 4`} color={theme.success} empty={derived.checkInEmpty} />
          </View>
        </Card>

        {/* Tu programa */}
        {data?.program && (
          <>
            <SectionTitle title="Tu programa" accent={theme.primary} />
            <ProgramCard program={data.program} todayPlanId={derived.todayPlan?.id ?? null} onStart={(id) => router.push(`/alumno/workout/${id}`)} />
          </>
        )}

        {/* Peso y records */}
        <SectionTitle title="Peso y records" accent={theme.primary} />
        <WeightCard weights={derived.weights} currentWeight={derived.currentWeight} delta={derived.weightDelta} />
        {data?.client && <PersonalRecordsBanner clientId={data.client.id} />}

        {/* Actividad reciente */}
        <SectionTitle title="Actividad reciente" accent={theme.primary} />
        <RecentWorkouts workouts={derived.recentUnique} />

        {/* Hábitos de hoy */}
        <SectionTitle title="Hábitos de hoy" accent={theme.cyan} />
        {data?.client && (
          <HabitsTracker clientId={data.client.id} logDate={derived.todayIso} isToday initialData={data.habitsToday} />
        )}

        {/* Nutrición de hoy */}
        <SectionTitle title="Nutrición de hoy" accent={EMBER_500} action="Ver dieta" onAction={() => router.push('/alumno/nutricion')} />
        {data?.client && <NutritionDailySummaryWidget clientId={data.client.id} />}
      </ScrollView>

      {/* Sticky primary CTA — aparece cuando el hero sale de vista */}
      {showStickyCta && derived.todayPlan && (
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 240 }}
          style={[styles.stickyCta, { bottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <Button
            label="Empezar entrenamiento"
            variant="sport"
            size="lg"
            leftIcon={Play}
            full
            onPress={() => router.push(`/alumno/workout/${derived.todayPlan!.id}`)}
          />
        </MotiView>
      )}

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

/** Eyebrow de sección con barra de acento (Dash_SectionTitle). */
function SectionTitle({ title, accent, action, onAction }: { title: string; accent: string; action?: string; onAction?: () => void }) {
  const { theme } = useTheme()
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionTitleLeft}>
        <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
        <Text className="font-sans-bold text-subtle text-[11px] uppercase" style={styles.sectionEyebrow}>
          {title}
        </Text>
      </View>
      {action ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text className="font-sans-bold text-[12.5px]" style={{ color: theme.primary }}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

/** 🔥 Racha ribbon — streak + camino al récord. Ember FIJO (no white-label). */
function StreakRibbon({ streak, best }: { streak: number; best: number }) {
  const { theme } = useTheme()
  const safeBest = Math.max(best, 1)
  const toRecord = Math.max(0, safeBest - streak)
  const pct = Math.min(100, Math.round((streak / safeBest) * 100))
  return (
    <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
      <View style={[styles.ribbon, { backgroundColor: EMBER_500 + '1A', borderColor: EMBER_500 + '38' }]}>
        <View style={styles.ribbonRow}>
          <View style={[styles.ribbonFlame, { backgroundColor: EMBER_500 + '29' }]}>
            <Flame size={26} color={EMBER_600} strokeWidth={2.25} />
          </View>
          <View style={styles.flex1}>
            <View style={styles.ribbonValueRow}>
              <Text className="font-display-black text-strong" style={styles.ribbonValue}>{streak}</Text>
              <Text style={[styles.ribbonUnit, { color: EMBER_600 }]}>días de racha</Text>
            </View>
            <Text numberOfLines={1} style={[styles.ribbonSub, { color: EMBER_600 }]}>
              {streak === 0
                ? 'Entrená hoy para empezar tu racha.'
                : toRecord === 0
                ? '¡Igualaste tu récord! Seguí así.'
                : `Te ${toRecord === 1 ? 'falta' : 'faltan'} ${toRecord} para tu récord de ${safeBest}`}
            </Text>
          </View>
        </View>
        <View style={[styles.ribbonTrack, { backgroundColor: EMBER_500 + '2E' }]}>
          <MotiView
            from={{ width: '0%' }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'timing', duration: 900 }}
            style={[styles.ribbonFill, { backgroundColor: EMBER_500 }]}
          />
        </View>
      </View>
    </MotiView>
  )
}

function CheckInBanner({ variant, days, onPress }: { variant: 'warning' | 'overdue'; days: number | null; onPress: () => void }) {
  const overdue = variant === 'overdue'
  const accent = overdue ? '#F4365A' : EMBER_500
  const accentFg = overdue ? '#BE183C' : EMBER_600
  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.82}
        style={[styles.checkInBanner, { backgroundColor: accent + '1A', borderColor: accent + '38' }]}
      >
        <View style={[styles.bannerIcon, { backgroundColor: accent }]}>
          <ClipboardCheck size={18} color="#fff" strokeWidth={2.25} />
        </View>
        <View style={styles.bannerText}>
          <Text className="font-sans-bold text-[13.5px]" style={{ color: accentFg }}>
            {overdue ? '¡Check-in pendiente!' : 'Check-in próximo'}
          </Text>
          <Text className="font-sans text-[12px]" style={{ color: accentFg }}>
            {days == null ? 'Sin check-ins este mes' : `Último hace ${days} días`} · peso y energía en segundos
          </Text>
        </View>
        <ChevronRight size={18} color={accentFg} />
      </TouchableOpacity>
    </MotiView>
  )
}

/** HERO activo — inverse (dark) card. */
function WorkoutHero({ plan, doneToday, onStart }: { plan: Plan; doneToday: boolean; onStart: (id: string) => void }) {
  const { theme } = useTheme()
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card variant="inverse" padding="lg">
        <View style={styles.heroTopRow}>
          <View style={styles.flex1}>
            <Text className="font-sans-bold text-sport-400 text-[11px] uppercase" style={styles.heroEyebrow}>
              Hoy entrenás
            </Text>
            <Text className="font-display-black text-on-dark text-[23px]" numberOfLines={2} style={styles.heroTitle}>
              {plan.title}
            </Text>
            <Text className="font-sans text-on-dark-muted text-[13px]" style={styles.heroMeta}>
              {plan.blockCount} {plan.blockCount === 1 ? 'ejercicio' : 'ejercicios'}
            </Text>
          </View>
          <ProgressRing
            value={doneToday ? 100 : 0}
            size={64}
            stroke={6}
            color={theme.primary}
            track="rgba(255,255,255,0.12)"
            showValue={false}
            label={doneToday ? <Check size={24} color={SUCCESS_500} strokeWidth={3} /> : <Dumbbell size={22} color="#939DAB" strokeWidth={2.25} />}
          />
        </View>

        <View style={styles.heroCta}>
          <Button label={doneToday ? 'Entrenar de nuevo' : 'Empezar entrenamiento'} variant="sport" size="lg" leftIcon={Play} full onPress={() => onStart(plan.id)} />
        </View>
      </Card>
    </MotiView>
  )
}

/** HERO descanso — sunken card positivo. */
function RestHero({ nextPlan, onPress }: { nextPlan: Plan | null; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card variant="sunken" padding="lg" style={styles.centerCard}>
        <View style={[styles.heroBigIcon, { backgroundColor: theme.cyan + '22' }]}>
          <Moon size={26} color={theme.cyan} strokeWidth={2.25} />
        </View>
        <Text className="font-display-black text-strong text-[21px]" style={styles.centerTitle}>Día de descanso</Text>
        <Text className="font-sans text-muted text-[13.5px]" style={styles.centerText}>
          Recuperarte también es entrenar. {nextPlan ? `Mañana toca ${nextPlan.title}.` : 'Tu coach te avisa el próximo entreno.'}
        </Text>
        <Button label="Ver nutrición de hoy" variant="secondary" size="lg" rightIcon={ArrowRight} onPress={onPress} style={styles.centerBtn} />
      </Card>
    </MotiView>
  )
}

/** HERO sin plan — coach armando programa. */
function NoPlanHero({ coachName, onPress }: { coachName: string | null | undefined; onPress: () => void }) {
  const { theme } = useTheme()
  const short = coachName?.split(' ')[0] ?? 'tu coach'
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card padding="lg" style={styles.centerCard}>
        <View style={[styles.heroBigIcon, { backgroundColor: theme.primary + '1A' }]}>
          <Dumbbell size={28} color={theme.primary} strokeWidth={2.25} />
        </View>
        <Text className="font-display-black text-strong text-[20px]" style={styles.centerTitle}>Tu coach está armando tu plan</Text>
        <Text className="font-sans text-muted text-[13.5px]" style={styles.centerText}>
          {coachName ?? 'Tu coach'} está preparando tu programa. Te avisamos apenas esté listo.
        </Text>
        <Button label={`Escribir a ${short}`} variant="sport" size="lg" leftIcon={MessageCircle} onPress={onPress} style={styles.centerBtn} />
      </Card>
    </MotiView>
  )
}

/** Tira semanal Lun..Dom con check / hoy / planificado. */
function WeekStrip({ weekDates, todayIso, workoutDates, plannedDays }: { weekDates: string[]; todayIso: string; workoutDates: Set<string>; plannedDays: Set<string> }) {
  const { theme } = useTheme()
  return (
    <View style={styles.weekRow}>
      {weekDates.map((dIso, i) => {
        const isToday = dIso === todayIso
        const done = workoutDates.has(dIso)
        const planned = plannedDays.has(dIso) && !done && !isToday
        const bgClass = isToday ? 'bg-cta-fill' : done ? 'bg-surface-card border border-subtle' : 'bg-surface-sunken border border-subtle'
        return (
          <View key={dIso} className={`flex-1 items-center justify-center rounded-control ${bgClass}`} style={styles.dayPill}>
            <Text className={`font-display-bold text-[12px] ${isToday ? 'text-on-sport' : 'text-subtle'}`}>{WEEK_LETTERS[i]}</Text>
            <View style={styles.dayGlyph}>
              {done ? (
                <Check size={14} color={isToday ? '#fff' : theme.success} strokeWidth={3} />
              ) : isToday ? (
                <View style={[styles.dot, { backgroundColor: '#fff' }]} />
              ) : planned ? (
                <View style={[styles.dot, { backgroundColor: theme.primary, opacity: 0.5 }]} />
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** Un anillo de cumplimiento + label + sub. */
function ComplianceItem({ value, label, sub, color, empty = false }: { value: number; label: string; sub: string; color: string; empty?: boolean }) {
  const { theme } = useTheme()
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View className="items-center" style={styles.ringItem}>
      <ProgressRing
        value={empty ? 0 : pct}
        size={74}
        stroke={7}
        color={empty ? theme.mutedForeground : color}
        label={<Text className="font-display-black text-strong text-[19px]" style={styles.tnum}>{empty ? '—' : pct}</Text>}
      />
      <View className="items-center">
        <Text className="font-sans-bold text-strong text-[12px]">{label}</Text>
        <Text className="font-sans text-subtle text-[10.5px]">{empty ? 'Sin datos' : sub}</Text>
      </View>
    </View>
  )
}

/** Programa activo + day-cards horizontales. */
function ProgramCard({ program, todayPlanId, onStart }: { program: Program; todayPlanId: string | null; onStart: (id: string) => void }) {
  const { theme } = useTheme()
  return (
    <Card>
      <View style={styles.programHeader}>
        <View style={styles.flexShrink}>
          <Text className="font-display-bold text-strong text-[16px]" numberOfLines={1}>{program.name}</Text>
          <Text className="font-sans text-muted text-[12px]" style={styles.programMeta}>
            {program.plans.length} plan{program.plans.length !== 1 ? 'es' : ''} en rotación
          </Text>
        </View>
        <Badge tone="sport" variant="soft">Activo</Badge>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayCardsRow}>
        {program.plans.map((p) => {
          const isToday = p.id === todayPlanId
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onStart(p.id)}
              activeOpacity={0.8}
              style={[styles.dayCard, { borderColor: isToday ? theme.primary : theme.border, backgroundColor: isToday ? theme.primary + '14' : theme.card }]}
            >
              <View style={styles.dayCardTop}>
                <Text className="font-sans-bold text-[10.5px] uppercase" style={{ color: isToday ? theme.primary : theme.mutedForeground, letterSpacing: 0.5 }}>
                  {p.day_of_week ? DAY_SHORT[p.day_of_week] : 'PLAN'}
                </Text>
                {isToday ? <Play size={12} color={theme.primary} strokeWidth={2.5} /> : <ChevronRight size={13} color={theme.mutedForeground} />}
              </View>
              <Text className="font-sans-bold text-strong text-[13px]" numberOfLines={2} style={styles.dayCardTitle}>{p.title}</Text>
              <Text className="font-sans text-subtle text-[10.5px]" style={styles.dayCardMeta}>
                {p.blockCount} {p.blockCount === 1 ? 'ejercicio' : 'ejercicios'}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </Card>
  )
}

/** Peso actual + delta pill + sparkline de área. */
function WeightCard({ weights, currentWeight, delta }: { weights: number[]; currentWeight: number | null; delta: number | null }) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const sparkWidth = Math.max(0, width - 64)
  const good = delta != null && delta <= 0
  const TrendIcon = delta != null && delta < 0 ? TrendingDown : TrendingUp
  const deltaText = delta != null ? `${Math.abs(delta).toFixed(1)} kg` : '—'

  return (
    <Card>
      {weights.length < 2 ? (
        <>
          <Text className="font-sans-bold text-muted text-[11px] uppercase" style={styles.weightEyebrow}>Peso actual</Text>
          <Text className="font-sans text-muted text-[13px]" style={styles.emptyText}>
            Registrá más check-ins para ver tu tendencia.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.weightTopRow}>
            <View>
              <Text className="font-sans-bold text-muted text-[11px] uppercase" style={styles.weightEyebrow}>Peso actual</Text>
              <View style={styles.weightValueRow}>
                <Text className="font-display-black text-strong" style={styles.weightValue}>{currentWeight?.toFixed(1)}</Text>
                <Text className="font-sans-semibold text-muted text-[13px]">kg</Text>
              </View>
            </View>
            <Badge tone={good ? 'success' : 'warning'} variant="soft" size="md" icon={<TrendIcon size={12} color={good ? theme.success : WARNING_500} strokeWidth={2.5} />}>
              {deltaText}
            </Badge>
          </View>
          <View style={styles.sparkWrap}>
            <Sparkline values={weights} width={sparkWidth} height={56} color={theme.primary} />
          </View>
        </>
      )}
    </Card>
  )
}

function RecentWorkouts({ workouts }: { workouts: RecentWorkout[] }) {
  const { theme } = useTheme()
  const rows = workouts.slice(0, 4)
  return (
    <Card padding="none" style={styles.listCard}>
      {rows.length === 0 ? (
        <Text className="font-sans text-muted text-[13px]" style={styles.listEmpty}>
          Aún no hay entrenamientos registrados.
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
            <Text className="font-sans text-muted text-[12px]">{formatDateTime(w.logged_at)}</Text>
          </View>
        ))
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

/** Mejor racha (run consecutivo más largo) dentro de la ventana de fechas conocida. */
function bestStreakInWindow(dates: Set<string>): number {
  if (dates.size === 0) return 0
  const sorted = Array.from(dates).sort()
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime()
    const cur = new Date(`${sorted[i]}T00:00:00Z`).getTime()
    if (cur - prev === MS_DAY) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 1
    }
  }
  return best
}

function daysSinceLastCheckIn(checkIns: CheckInPoint[]): number | null {
  if (checkIns.length === 0) return null
  const last = checkIns[checkIns.length - 1]
  const lastMs = new Date(`${last.date}T00:00:00`).getTime()
  return Math.max(0, Math.round((startOfToday().getTime() - lastMs) / MS_DAY))
}

/** Lunes (00:00) de la semana que contiene `d`. */
function startOfWeekMonday(d: Date): Date {
  const jsDay = d.getDay() // 0 Sun..6 Sat
  const offset = jsDay === 0 ? -6 : 1 - jsDay
  return new Date(d.getTime() + offset * MS_DAY)
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },

  // Section titles
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 2 },
  sectionTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionAccent: { width: 3, height: 13, borderRadius: 2 },
  sectionEyebrow: { letterSpacing: 0.8 },

  // Streak ribbon
  ribbon: { borderWidth: 1, borderRadius: 20, padding: 14 },
  ribbonRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  ribbonFlame: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  ribbonValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  ribbonValue: { fontSize: 30, lineHeight: 32, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  ribbonUnit: { fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  ribbonSub: { fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', marginTop: 4 },
  ribbonTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  ribbonFill: { height: 6, borderRadius: 999 },

  // Check-in banner
  checkInBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12 },
  bannerIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },

  // Coach card
  coachCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachBody: { flex: 1, minWidth: 0, gap: 2 },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachNote: { lineHeight: 17 },
  coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Hero
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { letterSpacing: 1 },
  heroTitle: { letterSpacing: -0.4, marginTop: 7 },
  heroMeta: { marginTop: 4 },
  heroCta: { marginTop: 14 },
  centerCard: { alignItems: 'center' },
  heroBigIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  centerTitle: { textAlign: 'center', letterSpacing: -0.4 },
  centerText: { textAlign: 'center', lineHeight: 20, marginTop: 6, maxWidth: 300 },
  centerBtn: { marginTop: 16 },

  // Week strip
  weekRow: { flexDirection: 'row', gap: 6 },
  dayPill: { height: 54, paddingVertical: 8, gap: 5 },
  dayGlyph: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },

  // Compliance rings
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  ringItem: { gap: 7 },
  tnum: { fontVariant: ['tabular-nums'] },

  // Program
  programHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  programMeta: { marginTop: 1 },
  dayCardsRow: { gap: 8, paddingRight: 2 },
  dayCard: { width: 116, padding: 11, borderRadius: 14, borderWidth: 1 },
  dayCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayCardTitle: { marginTop: 6, lineHeight: 16 },
  dayCardMeta: { marginTop: 2 },

  // Weight
  weightEyebrow: { letterSpacing: 0.6 },
  weightTopRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  weightValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 3 },
  weightValue: { fontSize: 28, lineHeight: 30, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  sparkWrap: { marginTop: 12 },
  emptyText: { marginTop: 8, lineHeight: 19 },

  // Recent workouts
  listCard: { overflow: 'hidden' },
  listEmpty: { padding: 16, lineHeight: 19 },
  listRow: { gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  listIcon: { width: 38, height: 38 },

  // Sticky CTA
  stickyCta: { position: 'absolute', left: 16, right: 16 },
})
