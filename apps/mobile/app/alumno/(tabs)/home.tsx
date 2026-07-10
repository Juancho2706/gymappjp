import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
import { getDailyHabits } from '../../../lib/habits.queries'
import { getActiveOrgAnnouncements } from '../../../lib/org-announcements'
import { useEntitlements } from '../../../lib/entitlements'
import { useAlumnoScrollHandler } from '../../../lib/alumno-chrome-scroll'
import { formatLongDate, getSantiagoIsoYmdForUtcInstant, getTodayInSantiago, formatRelativeDate, timeGreeting } from '../../../lib/date-utils'
import { AppBackground } from '../../../components/AppBackground'
import { Skeleton } from '../../../components/Skeleton'
import { WelcomeModal } from '../../../components/WelcomeModal'
import { DashboardHeader } from '../../../components/alumno/home/DashboardHeader'
import { SectionTitle } from '../../../components/alumno/home/SectionTitle'
import { StreakRibbon } from '../../../components/alumno/home/StreakRibbon'
import { CheckInBanner } from '../../../components/alumno/home/CheckInBanner'
import { computeCheckInReminder } from '../../../lib/checkin-thresholds'
import { HeroSection } from '../../../components/alumno/home/HeroSection'
import { CoachPresenceCard } from '../../../components/alumno/home/CoachPresenceCard'
import { MomentumCard, type MomentumDay } from '../../../components/alumno/home/MomentumCard'
import { ActiveProgramSection } from '../../../components/alumno/home/ActiveProgramSection'
import { WeightWidget } from '../../../components/alumno/home/WeightWidget'
import { PersonalRecordsCard } from '../../../components/alumno/home/PersonalRecordsCard'
import { RecentWorkouts } from '../../../components/alumno/home/RecentWorkouts'
import { OrgAnnouncementBanner } from '../../../components/alumno/home/OrgAnnouncementBanner'
import { HabitsCard } from '../../../components/alumno/home/HabitsCard'
import { NutritionDailySummary } from '../../../components/alumno/home/NutritionDailySummary'
import { AQUA_700, DAY_SHORT, EMBER_500, WEEK_LETTERS } from '../../../components/alumno/home/types'
import type { HomeData, PendingDay, Plan, PlanDayView, Program } from '../../../components/alumno/home/types'

const MS_DAY = 24 * 60 * 60 * 1000

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function jsDayToDbDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}
function startOfWeekMonday(d: Date): Date {
  const jsDay = d.getDay()
  const offset = jsDay === 0 ? -6 : 1 - jsDay
  const m = new Date(d.getTime() + offset * MS_DAY)
  m.setHours(0, 0, 0, 0)
  return m
}
function calculateStreak(dates: Set<string>): number {
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  while (dates.has(isoDate(cursor))) {
    streak += 1
    cursor.setTime(cursor.getTime() - MS_DAY)
  }
  return streak
}

/**
 * Dashboard alumno — shell de columna unica (paridad 1:1 con el arbol mobile de
 * la web: `apps/web/src/app/c/[coach_slug]/dashboard`). Hace UN fetch, deriva y
 * compone las 13 secciones (cada una en `components/alumno/home/*`). Orden vertical
 * verbatim del diseno; estados loading/empty por seccion.
 */
export default function AlumnoHomeScreen() {
  const router = useRouter()
  const { nutritionEnabled } = useEntitlements()
  const onScrollChrome = useAlumnoScrollHandler()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    getOnboardingStatus().then((done) => { if (!done) router.replace('/alumno/onboarding') })
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const { iso: todayIso } = getTodayInSantiago()
    const since30Iso = isoDate(new Date(Date.now() - 29 * MS_DAY))

    const [{ data: programData }, { data: workoutRows }, { data: nutritionRows }, { data: checkInRows }, { data: coachData }, habitsData, announcements] =
      await Promise.all([
        supabase
          .from('workout_programs')
          .select('id, name, start_date, weeks_to_repeat, program_phases, workout_plans ( id, title, day_of_week, assigned_date, workout_blocks ( id, sets, reps, exercises ( name ) ) )')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('workout_logs')
          .select('id, logged_at, exercise_name_at_log, block_id')
          .eq('client_id', client.id)
          .gte('logged_at', `${since30Iso}T00:00:00.000Z`)
          .order('logged_at', { ascending: false })
          .limit(200),
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
        // §1 — anuncios de org (solo si el alumno pertenece a una org).
        client.orgId ? getActiveOrgAnnouncements(client.orgId) : Promise.resolve([]),
      ])

    const rawPlans = ((programData as any)?.workout_plans ?? []) as any[]
    const program: Program | null = programData
      ? {
          id: (programData as any).id,
          name: (programData as any).name,
          startDate: (programData as any).start_date ?? null,
          weeksToRepeat: Math.max(1, (programData as any).weeks_to_repeat ?? 1),
          phases: Array.isArray((programData as any).program_phases) ? ((programData as any).program_phases as Program['phases']) : null,
          plans: rawPlans
            .map((p): Plan => ({
              id: p.id,
              title: p.title,
              day_of_week: p.day_of_week,
              assigned_date: p.assigned_date,
              blockCount: p.workout_blocks?.length ?? 0,
              blocks: (p.workout_blocks ?? []).map((b: any) => ({
                id: b.id,
                name: b.exercises?.name ?? 'Ejercicio',
                sets: b.sets ?? 0,
                reps: b.reps == null ? '' : String(b.reps),
              })),
            }))
            .sort((a, b) => (a.day_of_week ?? 8) - (b.day_of_week ?? 8)),
        }
      : null

    const rows = (workoutRows ?? []) as { id: string; logged_at: string; exercise_name_at_log: string | null; block_id: string | null }[]
    const workoutDates = new Set(rows.map((r) => getSantiagoIsoYmdForUtcInstant(r.logged_at)))
    const todayLoggedByBlock = new Map<string, number>()
    for (const r of rows) {
      if (!r.block_id) continue
      if (getSantiagoIsoYmdForUtcInstant(r.logged_at) !== todayIso) continue
      todayLoggedByBlock.set(r.block_id, (todayLoggedByBlock.get(r.block_id) ?? 0) + 1)
    }

    const welcomeModal = (coachData as any)?.welcome_modal_enabled
      ? {
          enabled: true,
          content: (coachData as any).welcome_modal_content ?? '',
          type: (((coachData as any).welcome_modal_type as 'text' | 'video') ?? 'text'),
          version: (coachData as any).welcome_modal_version ?? 1,
          brandName: (coachData as any).brand_name ?? undefined,
        }
      : null

    setData({
      client,
      announcements,
      coachName: (coachData as any)?.brand_name ?? null,
      coachWelcome: (coachData as any)?.welcome_message ?? null,
      program,
      recentWorkouts: rows.map((r) => ({ id: r.id, logged_at: r.logged_at, exercise_name_at_log: r.exercise_name_at_log })),
      workoutDates,
      todayLoggedByBlock,
      nutritionDates: new Set((nutritionRows ?? []).map((r: any) => r.log_date)),
      checkIns: (checkInRows ?? []) as any,
      habitsToday: habitsData,
      welcomeModal,
    })
    setLoading(false)
    setRefreshing(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await load().catch(() => setRefreshing(false))
  }

  const derived = useMemo(() => {
    const { iso: todayIso, dayOfWeek: todayDbDay } = getTodayInSantiago()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const plans = data?.program?.plans ?? []
    const workoutDates = data?.workoutDates ?? new Set<string>()

    const todayPlan =
      plans.find((p) => p.assigned_date === todayIso) ??
      plans.find((p) => p.day_of_week === todayDbDay) ??
      null
    const nextPlan = plans.find((p) => p.id !== todayPlan?.id) ?? null

    // Semana Lun..Dom + planificados.
    const monday = startOfWeekMonday(today)
    const weekDates = Array.from({ length: 7 }, (_, i) => isoDate(new Date(monday.getTime() + i * MS_DAY)))
    const plannedDays = new Set<string>()
    for (let i = 0; i < 7; i++) {
      const dIso = weekDates[i]
      const dbDay = jsDayToDbDay(new Date(monday.getTime() + i * MS_DAY).getDay())
      if (plans.some((p) => p.day_of_week === dbDay || p.assigned_date === dIso)) plannedDays.add(dIso)
    }
    const momentumDays: MomentumDay[] = weekDates.map((dIso, i) => ({
      label: WEEK_LETTERS[i],
      isToday: dIso === todayIso,
      hasWorkout: plannedDays.has(dIso) || workoutDates.has(dIso),
      isCompleted: workoutDates.has(dIso),
    }))

    // Estado por dia del programa + cola de pendientes (E1-19).
    const programPlans = plans.filter((p) => p.day_of_week != null)
    const planDays: PlanDayView[] = programPlans.map((plan) => {
      const dow = plan.day_of_week as number
      const idx = ((dow - 1) % 7 + 7) % 7
      const dIso = weekDates[idx]
      const done = workoutDates.has(dIso)
      const isToday = dIso === todayIso
      const status = done ? 'done' : isToday ? 'today' : dIso < todayIso ? 'pending' : 'upcoming'
      return { plan, status, isToday }
    })
    const pending: PendingDay[] = planDays
      .filter((d) => d.status === 'pending')
      .map((d) => ({ planId: d.plan.id, dayOfWeek: d.plan.day_of_week as number, dayLabel: DAY_SHORT[d.plan.day_of_week as number] }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    const todayPlanId = planDays.find((d) => d.isToday)?.plan.id ?? todayPlan?.id ?? null

    // Semana actual del programa (aprox: dias desde start_date, ciclado por weeks_to_repeat).
    const totalWeeks = data?.program?.weeksToRepeat ?? 1
    let currentWeek = 1
    if (data?.program?.startDate) {
      const startMs = new Date(`${data.program.startDate.slice(0, 10)}T12:00:00Z`).getTime()
      const daysSince = Math.max(0, Math.floor((Date.parse(`${todayIso}T12:00:00Z`) - startMs) / MS_DAY))
      currentWeek = (Math.floor(daysSince / 7) % totalWeeks) + 1
    }

    // Cumplimiento (mismas formulas que el legacy mobile).
    const workoutTargetDays = plans.length ? Math.min(plans.length * 4, 30) : 12
    const workoutCompliance = data ? Math.min(1, workoutDates.size / workoutTargetDays) : 0
    const nutritionCompliance = data ? Math.min(1, (data.nutritionDates.size ?? 0) / 30) : 0
    const checkInCompliance = data ? Math.min(1, (data.checkIns.length ?? 0) / 4) : 0

    // Racha + check-in variant (umbrales compartidos con el prompt post-entreno → lib/checkin-thresholds).
    const streak = calculateStreak(workoutDates)
    const checkIns = data?.checkIns ?? []
    const ci = computeCheckInReminder(checkIns.length ? checkIns[checkIns.length - 1].date : null, todayIso)
    const ciVariant = ci.variant
    const ciDays = ci.daysSince
    const ciRelative = ci.lastDay ? formatRelativeDate(ci.lastDay, todayIso) : null

    const doneToday = !!todayPlan && workoutDates.has(todayIso)

    return {
      todayPlan, nextPlan, momentumDays, planDays, pending, todayPlanId, currentWeek, totalWeeks,
      workoutCompliance, nutritionCompliance, checkInCompliance,
      nutritionEmpty: data ? (data.nutritionDates.size ?? 0) === 0 : true,
      checkInEmpty: data ? checkIns.length === 0 : true,
      streak, ciVariant, ciDays, ciRelative, doneToday,
    }
  }, [data])

  const firstName = data?.client?.fullName?.split(' ')[0] ?? ''
  const greeting = `${timeGreeting()}${firstName ? `, ${firstName}` : ''}`

  if (loading) {
    return (
      <View style={styles.container} className="bg-surface-app">
        <AppBackground />
        <DashboardHeader greeting={greeting || 'Hola'} dateLabel={formatLongDate()} brandName={null} welcomeMessage={null} />
        <View style={styles.skeletonWrap}>
          <Skeleton height={72} radius={20} />
          <Skeleton height={200} radius={22} />
          <Skeleton height={64} radius={22} />
          <Skeleton height={160} radius={22} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container} className="bg-surface-app">
      <AppBackground />
      <DashboardHeader greeting={greeting} dateLabel={formatLongDate()} brandName={data?.coachName} welcomeMessage={data?.coachWelcome} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* §1 Anuncios de la org */}
        <OrgAnnouncementBanner announcements={data?.announcements ?? []} />

        {/* §3 Racha */}
        <StreakRibbon streak={derived.streak} />

        {/* §4 Check-in (variant-aware; <3d oculto) */}
        {derived.ciVariant ? (
          <CheckInBanner variant={derived.ciVariant} daysSince={derived.ciDays} lastRelative={derived.ciRelative} onPress={() => router.push('/alumno/check-in')} />
        ) : null}

        {/* §5 Hero — que hago hoy */}
        <HeroSection
          todayPlan={derived.todayPlan}
          nextPlan={derived.nextPlan}
          loggedByBlock={data?.todayLoggedByBlock ?? new Map()}
          isAlreadyLogged={derived.doneToday}
          hasProgram={!!data?.program}
          coachName={data?.coachName ?? null}
          nutritionEnabled={nutritionEnabled}
          onStart={(id) => router.push(`/alumno/workout/${id}`)}
          onRest={() => router.push('/alumno/nutricion')}
          onNoPlan={() => router.push('/alumno/check-in')}
        />

        {/* §6 Coach presence */}
        {data?.coachName ? <CoachPresenceCard brandName={data.coachName} note={data.coachWelcome} /> : null}

        {/* §7 Momentum */}
        <MomentumCard
          days={derived.momentumDays}
          workoutCompliance={derived.workoutCompliance}
          nutritionCompliance={derived.nutritionCompliance}
          checkInCompliance={derived.checkInCompliance}
          nutritionEmpty={derived.nutritionEmpty}
          checkInEmpty={derived.checkInEmpty}
          nutritionEnabled={nutritionEnabled}
          workoutDays={data?.workoutDates.size ?? 0}
          nutritionDays={data?.nutritionDates.size ?? 0}
          checkInCount={data?.checkIns.length ?? 0}
        />

        {/* §8 Programa activo */}
        {data?.program ? (
          <View>
            <SectionTitle>Tu programa</SectionTitle>
            <ActiveProgramSection
              program={data.program}
              currentWeek={derived.currentWeek}
              totalWeeks={derived.totalWeeks}
              planDays={derived.planDays}
              pending={derived.pending}
              todayPlanId={derived.todayPlanId}
              onStart={(id) => router.push(`/alumno/workout/${id}`)}
            />
          </View>
        ) : null}

        {/* §9 Peso y records */}
        <View>
          <SectionTitle>Peso y records</SectionTitle>
          <View style={{ gap: 12 }}>
            {data?.client ? (
              <WeightWidget
                clientId={data.client.id}
                checkIns={data.checkIns}
                onSaved={() => load()}
                onCheckIn={() => router.push('/alumno/check-in')}
              />
            ) : null}
            {data?.client ? (
              <PersonalRecordsCard
                clientId={data.client.id}
                onTecnica={(name) => router.push({ pathname: '/alumno/exercises', params: { q: name } })}
              />
            ) : null}
          </View>
        </View>

        {/* §10 Actividad reciente */}
        {data?.client ? (
          <View>
            <SectionTitle action="Historial" onAction={() => router.push('/alumno/history')} actionTestID="home-history-link">Actividad reciente</SectionTitle>
            <RecentWorkouts clientId={data.client.id} />
          </View>
        ) : null}

        {/* §11 Habitos de hoy */}
        {data?.client ? (
          <View>
            <SectionTitle accent={AQUA_700}>Hábitos de hoy</SectionTitle>
            <HabitsCard clientId={data.client.id} logDate={getTodayInSantiago().iso} isToday initialData={data.habitsToday} />
          </View>
        ) : null}

        {/* §12 Nutricion de hoy (gate) */}
        {data?.client && nutritionEnabled ? (
          <View>
            <SectionTitle accent={EMBER_500} action="Ver nutrición" onAction={() => router.push('/alumno/nutricion')} actionTestID="home-nutrition-link">Nutrición de hoy</SectionTitle>
            <NutritionDailySummary clientId={data.client.id} onSeeAll={() => router.push('/alumno/nutricion')} />
          </View>
        ) : null}
      </ScrollView>

      {/* §13 WelcomeModal */}
      {data?.welcomeModal ? (
        <WelcomeModal
          brandName={data.welcomeModal.brandName}
          enabled={data.welcomeModal.enabled}
          content={data.welcomeModal.content}
          type={data.welcomeModal.type}
          version={data.welcomeModal.version}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 14, paddingTop: 14 },
  skeletonWrap: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
})
