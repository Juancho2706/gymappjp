import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
import { getDailyHabits } from '../../../lib/habits.queries'
import { getActiveOrgAnnouncements } from '../../../lib/org-announcements'
import { useEntitlements } from '../../../lib/entitlements'
import { useTheme } from '../../../context/ThemeContext'
import { useAlumnoScrollHandler } from '../../../lib/alumno-chrome-scroll'
import { formatLongDate, getSantiagoIsoYmdForUtcInstant, getTodayInSantiago, formatRelativeDate, timeGreeting } from '../../../lib/date-utils'
import { AppBackground } from '../../../components/AppBackground'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'
import { Skeleton } from '../../../components/Skeleton'
import { WelcomeModal } from '../../../components/WelcomeModal'
import { DashboardHeader, DashboardHeaderSkeleton } from '../../../components/alumno/home/DashboardHeader'
import { SectionTitle } from '../../../components/alumno/home/SectionTitle'
import { StreakRibbon } from '../../../components/alumno/home/StreakRibbon'
import { CheckInBanner } from '../../../components/alumno/home/CheckInBanner'
import { computeCheckInReminder } from '../../../lib/checkin-thresholds'
import { programWeekIndex1Based, weekIndexToVariantLetter, effectiveWeekVariantFromPlans, workoutPlanMatchesVariant } from '../../../lib/program-week-variant'
import { HeroSection } from '../../../components/alumno/home/HeroSection'
import { useSessionMorph } from '../../../components/alumno/workout/v3/session-morph'
import { CoachPresenceCard } from '../../../components/alumno/home/CoachPresenceCard'
import { MomentumCard, type MomentumDay } from '../../../components/alumno/home/MomentumCard'
import { ActiveProgramSection } from '../../../components/alumno/home/ActiveProgramSection'
import { WeightWidget } from '../../../components/alumno/home/WeightWidget'
import { PersonalRecordsCard } from '../../../components/alumno/home/PersonalRecordsCard'
import { RecentWorkouts } from '../../../components/alumno/home/RecentWorkouts'
import { OrgAnnouncementBanner } from '../../../components/alumno/home/OrgAnnouncementBanner'
import { StudentAccessBanner } from '../../../components/alumno/home/StudentAccessBanner'
import { HabitsCard } from '../../../components/alumno/home/HabitsCard'
import { NutritionDailySummary } from '../../../components/alumno/home/NutritionDailySummary'
import { NutritionDailySummaryV2 } from '../../../components/alumno/home/NutritionDailySummaryV2'
import { isEnabled } from '../../../lib/flags'
import { DAY_FULL, EMBER_500, WEEK_LETTERS } from '../../../components/alumno/home/types'
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

/**
 * Dashboard alumno — shell de columna unica (paridad 1:1 con el arbol mobile de
 * la web: `apps/web/src/app/c/[coach_slug]/dashboard`). Hace UN fetch, deriva y
 * compone las 13 secciones (cada una en `components/alumno/home/*`). Orden vertical
 * verbatim del diseno; estados loading/empty por seccion.
 */
export default function AlumnoHomeScreen() {
  const router = useRouter()
  const { startMorph } = useSessionMorph()
  const insets = useSafeAreaInsets()
  const { nutritionEnabled, ready: entitlementsReady, studentAccess } = useEntitlements()
  const { theme } = useTheme()
  // Rollout técnico de Nutrición V2 (surface mobileStudent) resuelto por el servidor y espejado
  // en el flag local; fail-closed hasta que entitlements estén listos. Mismo patrón que la
  // pantalla /alumno/nutrition-v2.
  const nutritionV2Enabled = entitlementsReady && isEnabled('nutritionV2Student')
  const onScrollChrome = useAlumnoScrollHandler()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Sub-P1 (done-por-plan): set de claves `${planId}|${ymdSantiago}` — un dia del
  // programa solo se marca 'done' si hay log de ESE plan en ese mismo dia calendario
  // Santiago (paridad web weekPendingWorkouts.ts:142-149, `plan_id===dayPlan.id &&
  // getSantiagoIsoYmdForUtcInstant(logged_at)===dStr`), no por cualquier entreno del
  // dia. Vive fuera de HomeData (types.ts es off-limits en esta tarea).
  const [workoutPlanDays, setWorkoutPlanDays] = useState<Set<string>>(() => new Set())
  // Señal de frescura para los widgets que fetchean por su cuenta (p.ej.
  // NutritionDailySummary): se incrementa en cada load() exitoso (montaje,
  // pull-to-refresh, onSaved) para que el widget re-consulte y no quede congelado
  // en el snapshot de su primer montaje (paridad con la frescura RSC de la web).
  const [reloadKey, setReloadKey] = useState(0)
  // Guard last-writer-wins: cada load() captura un id incremental y sólo escribe
  // estado si sigue siendo el más reciente. Sin esto, un load() lento (refresh/
  // onSaved) puede resolver DESPUÉS de uno nuevo y pisar el estado fresco (p.ej.
  // un check-in recién guardado desaparece del widget).
  const loadIdRef = useRef(0)

  useEffect(() => {
    getOnboardingStatus().then((done) => { if (!done) router.replace('/alumno/onboarding') })
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    const myId = ++loadIdRef.current
    const client = await getClientProfile()
    if (myId !== loadIdRef.current) return
    if (!client) { setLoading(false); setRefreshing(false); return }

    const { iso: todayIso } = getTodayInSantiago()
    const since30Iso = isoDate(new Date(Date.now() - 29 * MS_DAY))

    const [{ data: programData }, { data: workoutRows }, { data: nutritionRows }, { data: checkInRows }, { data: coachData }, habitsData, announcements, { data: streakData }] =
      await Promise.all([
        supabase
          .from('workout_programs')
          .select('id, name, start_date, weeks_to_repeat, ab_mode, program_phases, workout_plans ( id, title, day_of_week, assigned_date, week_variant, workout_blocks ( id, sets, reps, exercises ( name ) ) )')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('workout_logs')
          // `workout_blocks ( plan_id )` = plan dueño del log (sub-P1 done-por-plan);
          // mismo embed que web dashboard.queries.ts:150 (`workout_blocks(plan_id)`).
          .select('id, logged_at, exercise_name_at_log, block_id, workout_blocks ( plan_id )')
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
        // §3 Racha — 1:1 con web: MISMO RPC (`get_client_current_streak`) que el
        // dashboard web (StreakRibbonSection). Regla "dias asignados" (CEO 2026-07-22,
        // migracion 20260723110000): dia asignado hecho = +1; asignado sin entrenar
        // nada = corta (hoy en curso no corta; recuperar despues no repara); dia libre
        // recuperando un dia perdido de la MISMA semana = +1; repeticion/sesion libre =
        // neutro; nutricion FUERA; sin programa activo todo dia entrenado suma.
        supabase.rpc('get_client_current_streak', { p_client_id: client.id }),
      ])

    const streakN = typeof streakData === 'number' ? streakData : Number(streakData)
    const streak = Number.isFinite(streakN) ? streakN : 0

    const rawPlans = ((programData as any)?.workout_plans ?? []) as any[]
    const program: Program | null = programData
      ? {
          id: (programData as any).id,
          name: (programData as any).name,
          startDate: (programData as any).start_date ?? null,
          weeksToRepeat: Math.max(1, (programData as any).weeks_to_repeat ?? 1),
          abMode: !!(programData as any).ab_mode,
          phases: Array.isArray((programData as any).program_phases) ? ((programData as any).program_phases as Program['phases']) : null,
          plans: rawPlans
            .map((p): Plan => ({
              id: p.id,
              title: p.title,
              day_of_week: p.day_of_week,
              assigned_date: p.assigned_date,
              week_variant: p.week_variant ?? null,
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

    // `as unknown as` (mismo patron que web dashboard.queries.ts:155): el embed to-one
    // `workout_blocks` llega como OBJETO en runtime, pero los tipos generados infieren
    // array — se overridea la cardinalidad al shape real que consume web.
    const rows = (workoutRows ?? []) as unknown as { id: string; logged_at: string; exercise_name_at_log: string | null; block_id: string | null; workout_blocks: { plan_id: string | null } | null }[]
    const workoutDates = new Set(rows.map((r) => getSantiagoIsoYmdForUtcInstant(r.logged_at)))
    // Set plan-dia (sub-P1): clave `${planId}|${ymdSantiago}` por log con plan dueño.
    // MISMO helper Santiago que workoutDates → mismo dia calendario; solo agrega la
    // dimension plan_id que exige web (weekPendingWorkouts.ts:145-148).
    const workoutPlanDays = new Set<string>()
    for (const r of rows) {
      const planId = r.workout_blocks?.plan_id
      if (!planId) continue
      workoutPlanDays.add(`${planId}|${getSantiagoIsoYmdForUtcInstant(r.logged_at)}`)
    }
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

    if (myId !== loadIdRef.current) return
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
      streak,
    })
    setWorkoutPlanDays(workoutPlanDays)
    setReloadKey((k) => k + 1)
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

    // Semana del programa + variante A/B EFECTIVA (paridad web ActiveProgramSection.tsx:37-46 /
    // weekPendingWorkouts.ts:108-117): sólo en ab_mode; cae a la variante que tenga planes si la
    // del ciclo está vacía (A/B mal armado). weekIdx alimenta también currentWeek (C3).
    const abMode = data?.program?.abMode ?? false
    const weekIdx = data?.program
      ? programWeekIndex1Based({ start_date: data.program.startDate, weeks_to_repeat: data.program.weeksToRepeat }, today)
      : null
    const cycleVariant = weekIdx ? weekIndexToVariantLetter(weekIdx) : 'A'
    const activeVariant = effectiveWeekVariantFromPlans(plans, cycleVariant, abMode)

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

    // Estado por dia del programa + cola de pendientes (E1-19). Filtra por la variante
    // A/B efectiva (web ActiveProgramSection.tsx:49): en un programa A/B sólo se muestran
    // los días de la semana activa.
    // Mapa fecha→dbDay de la semana (para el label "Hecho el {dia}" de doneOnDate).
    const dbDayByDate = new Map<string, number>()
    for (let i = 0; i < 7; i++) dbDayByDate.set(weekDates[i], jsDayToDbDay(new Date(monday.getTime() + i * MS_DAY).getDay()))

    const programPlans = plans.filter((p) => p.day_of_week != null && workoutPlanMatchesVariant(p, activeVariant, abMode))
    // ATRIBUCION GREEDY POR PLAN — espejo EXACTO del fix web weekPendingWorkouts.ts (Paso 2+3,
    // atribucion greedy, CEO decision 10 2026-07-22): un dia X queda 'done' si SU plan tiene un log
    // en CUALQUIER dia de esta semana Santiago, no solo en su propia fecha. Recuperar el martes un
    // jueves marca el martes (doneOnDate/doneOnLabel = "Hecho el jueves") y limpia el pendiente.
    //   Fase 1: el log en la PROPIA fecha del dia cierra "en fecha" (doneOnDate=null), consume su log.
    //   Fase 2: los logs sobrantes cierran el dia PENDIENTE mas antiguo del plan (recuperacion).
    // En el modelo plan-centrico del movil cada plan es UN slot (su day_of_week), asi que las dos
    // fases del web colapsan por plan: si hay log en su propia fecha → done en fecha; si no y hay
    // algun log de la semana → done recuperado con el mas antiguo. Los dias FUTUROS nunca son
    // elegibles. NO toca momentum/racha (cuentan la fecha real by design) — solo descubribilidad +
    // estado visual. FUENTE: el movil solo tiene `workoutPlanDays` (Set `planId|ymd`, granularidad
    // (plan,dia); dos logs del mismo plan el mismo dia colapsan a uno) — fiel para "que dias hay sesion".
    const planDays: PlanDayView[] = programPlans.map((plan) => {
      const dow = plan.day_of_week as number
      const idx = ((dow - 1) % 7 + 7) % 7
      const dIso = weekDates[idx]
      const isToday = dIso === todayIso
      const isFuture = dIso > todayIso
      // Fechas (asc, Lun→Dom) de esta semana con log de ESTE plan.
      const weekLogDates = isFuture ? [] : weekDates.filter((di) => workoutPlanDays.has(`${plan.id}|${di}`))
      let done = false
      let doneOnDate: string | null = null
      if (!isFuture && weekLogDates.length > 0) {
        if (weekLogDates.includes(dIso)) {
          done = true // Fase 1: hecho en su propia fecha.
          doneOnDate = null
        } else {
          done = true // Fase 2: recuperado — el log mas antiguo de la semana cierra este dia.
          doneOnDate = weekLogDates[0]
        }
      }
      const status = done ? 'done' : isToday ? 'today' : isFuture ? 'upcoming' : 'pending'
      const doneOnLabel = doneOnDate ? DAY_FULL[dbDayByDate.get(doneOnDate) ?? 1] : null
      return { plan, status, isToday, dateIso: dIso, doneOnDate, doneOnLabel }
    })
    const pending: PendingDay[] = planDays
      .filter((d) => d.status === 'pending')
      .map((d) => ({ planId: d.plan.id, dayOfWeek: d.plan.day_of_week as number, dayLabel: DAY_FULL[d.plan.day_of_week as number], dateIso: d.dateIso }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    const todayPlanId = planDays.find((d) => d.isToday)?.plan.id ?? todayPlan?.id ?? null

    // Semana actual del programa — vía programWeekIndex1Based (C3, paridad web
    // ActiveProgramSection.tsx:82: `currentWeek = weekIdx ?? 1`).
    const totalWeeks = data?.program?.weeksToRepeat ?? 1
    const currentWeek = weekIdx ?? 1

    // Cumplimiento (mismas formulas que el legacy mobile).
    const workoutTargetDays = plans.length ? Math.min(plans.length * 4, 30) : 12
    const workoutCompliance = data ? Math.min(1, workoutDates.size / workoutTargetDays) : 0
    const nutritionCompliance = data ? Math.min(1, (data.nutritionDates.size ?? 0) / 30) : 0
    const checkInCompliance = data ? Math.min(1, (data.checkIns.length ?? 0) / 4) : 0

    // Racha + check-in variant (umbrales compartidos con el prompt post-entreno → lib/checkin-thresholds).
    // `streak` viene del RPC (fetch), MISMA fuente/regla que el web — no se re-deriva local.
    const streak = data?.streak ?? 0
    const checkIns = data?.checkIns ?? []
    // `check_ins.date` es un timestamptz (instante UTC): mapear al día calendario de Santiago
    // ANTES de contar los días evita el off-by-one del prefijo UTC cerca de medianoche chilena
    // (paridad web CheckInBanner.tsx:35 → getSantiagoIsoYmdForUtcInstant). MISMO helper que ya
    // usa este shell para los workoutDates.
    const lastCheckInDate = checkIns.length ? getSantiagoIsoYmdForUtcInstant(checkIns[checkIns.length - 1].date) : null
    const ci = computeCheckInReminder(lastCheckInDate, todayIso)
    const ciVariant = ci.variant
    const ciDays = ci.daysSince
    const ciRelative = ci.lastDay ? formatRelativeDate(ci.lastDay, todayIso) : null

    const doneToday = !!todayPlan && workoutDates.has(todayIso)

    return {
      todayPlan, nextPlan, momentumDays, planDays, pending, todayPlanId, currentWeek, totalWeeks,
      weekVariant: abMode ? activeVariant : null,
      workoutCompliance, nutritionCompliance, checkInCompliance,
      nutritionEmpty: data ? (data.nutritionDates.size ?? 0) === 0 : true,
      checkInEmpty: data ? checkIns.length === 0 : true,
      streak, ciVariant, ciDays, ciRelative, doneToday,
    }
  }, [data, workoutPlanDays])

  // Fallback 'Atleta' = web `DashboardHeader.tsx:13`; el saludo cargado siempre lleva
  // nombre. Durante loading NO se pinta saludo (skeleton), asi el texto aparece una
  // sola vez ya final (P0-3: evita el swap "Hola/Buenas tardes" -> "..., Nombre").
  const firstName = data?.client?.fullName?.split(' ')[0] ?? 'Atleta'
  const greeting = `${timeGreeting()}, ${firstName}`

  if (loading) {
    return (
      <View style={styles.container} className="bg-surface-app">
        <AppBackground />
        <DashboardHeaderSkeleton />
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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        refreshControl={
          // Spinner del pull-to-refresh en color de marca (web DashboardPullToRefresh.tsx:60
          // `Loader2 text-[color:var(--theme-primary)]`): tintColor iOS + colors Android.
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
      >
        {/* §2 Header — scrollea con el contenido (paridad con web md, NO sticky) */}
        <DashboardHeader greeting={greeting} dateLabel={formatLongDate()} brandName={data?.coachName} welcomeMessage={data?.coachWelcome} />

        <View style={styles.content}>
        {/* §0 Acceso por suscripcion del coach (politica CEO 2026-07-18): gracia => banner discreto;
            post-gracia => aviso honesto de solo-lectura. 'active' no monta nada (espejo web /c). */}
        <StudentAccessBanner access={studentAccess} />

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
          onStart={(id, origin) => startMorph({ planId: id, origin })}
          onRest={() => router.push('/alumno/nutricion')}
          onNoPlan={() => router.push('/alumno/check-in')}
        />

        {/* §6 Coach presence — SIEMPRE visible (web page.tsx:105-110); el componente
            degrada a 'Tu coach' vía sus fallbacks cuando no hay brand_name. */}
        <CoachPresenceCard brandName={data?.coachName ?? null} note={data?.coachWelcome ?? null} />

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

        {/* §8 Programa activo — SIEMPRE montado (web page.tsx:118-124 renderiza el
            <div> con SectionTitle + ActiveProgramSection sin gate); la card "Sin
            programa activo" vive dentro de la seccion (web ActiveProgramSection.tsx:26-34). */}
        <View>
          <SectionTitle>Tu programa</SectionTitle>
          <ActiveProgramSection
            program={data?.program ?? null}
            currentWeek={derived.currentWeek}
            totalWeeks={derived.totalWeeks}
            planDays={derived.planDays}
            pending={derived.pending}
            todayPlanId={derived.todayPlanId}
            weekVariant={derived.weekVariant}
            onStart={(id, origin) => startMorph({ planId: id, origin })}
            // Recuperar un dia pendiente: se entrena HOY y el log cae hoy (semantica correcta de
            // recuperacion, ver E1.1); el param `recuperar` solo pinta el banner informativo ambar.
            // El camino "editar fecha pasada" (param `fecha`) queda cableado en [planId].tsx + banner
            // neutro pero SIN entrada de UI aun: el sheet deshabilita "Revisar y editar" porque el
            // guardado RN todavia escribe HOY (el solo-UPDATE por target_date es un server action web,
            // E1.5). El editor de fecha pasada RN llega en ola posterior y reactivara ese onReview.
            // Recuperar dispara el MISMO Despegue que el CTA/day-cards (con el param `recuperar`); el
            // origin (rect del banner/card) lo pasa ActiveProgramSection para que el morph nazca de él.
            onRecover={(id, fecha, origin) => startMorph({ planId: id, origin, params: { recuperar: fecha } })}
          />
        </View>

        {/* §9 Peso y records */}
        <View>
          <SectionTitle>Peso y records</SectionTitle>
          <View style={{ gap: 12 }}>
            {data?.client ? (
              <WeightWidget
                clientId={data.client.id}
                checkIns={data.checkIns}
                onSaved={() => load().catch(() => {})}
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

        {/* §10 Actividad reciente — la sección monta su propia SectionTitle ("Actividad
            reciente" · "Historial") y se oculta entera (header incluido) si no hay logs,
            espejo web RecentWorkoutsSection.tsx:11-19. */}
        {data?.client ? (
          <RecentWorkouts clientId={data.client.id} onHistory={() => router.push('/alumno/history')} />
        ) : null}

        {/* §11 Habitos de hoy */}
        {data?.client ? (
          <View>
            {/* aqua-700 vía clase DS dark-aware (--color-aqua-700 flipea en .dark, global.css:179),
                no el literal light-only; paridad web page.tsx:146 `var(--aqua-700)`. */}
            <SectionTitle accentClassName="bg-aqua-700">Hábitos de hoy</SectionTitle>
            <HabitsCard clientId={data.client.id} logDate={getTodayInSantiago().iso} isToday initialData={data.habitsToday} />
          </View>
        ) : null}

        {/* §12 Nutricion de hoy (gate) — V1 clásica o resumen V2 según el rollout mobileStudent */}
        {data?.client && nutritionEnabled ? (
          nutritionV2Enabled ? (
            <View>
              <SectionTitle accent={EMBER_500} action="Ver nutrición" onAction={() => router.push('/alumno/nutrition-v2')} actionTestID="home-nutrition-link">Nutrición de hoy</SectionTitle>
              <NutritionDailySummaryV2 clientId={data.client.id} reloadSignal={reloadKey} onSeeAll={() => router.push('/alumno/nutrition-v2')} />
            </View>
          ) : (
            <View>
              <SectionTitle accent={EMBER_500} action="Ver nutrición" onAction={() => router.push('/alumno/nutricion')} actionTestID="home-nutrition-link">Nutrición de hoy</SectionTitle>
              <NutritionDailySummary clientId={data.client.id} reloadSignal={reloadKey} onSeeAll={() => router.push('/alumno/nutricion')} />
            </View>
          )
        ) : null}
        </View>
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
  scroll: { paddingBottom: 120 },
  content: { paddingHorizontal: 16, gap: 14, paddingTop: 14 },
  skeletonWrap: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
})
