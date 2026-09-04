import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getOnboardingStatus } from '../../../lib/alumno-onboarding'
import { getDailyHabits } from '../../../lib/habits.queries'
import { getActiveOrgAnnouncements } from '../../../lib/org-announcements'
import { useEntitlements } from '../../../lib/entitlements'
import { useTheme } from '../../../context/ThemeContext'
import { useMarkDashboardReady } from '../../../context/DashboardReadyContext'
import { resetChromeScroll, useAlumnoScrollHandler } from '../../../lib/alumno-chrome-scroll'
import { countLoggedSetsByBlock, deriveDayCompletion, skippedBlockIdsFromLogs, type CycleCompletionLogRow, type DayCompletionBlock, type LoggedSetRow } from '@eva/workout-engine'
import { deriveProgramCursor } from '../../../components/alumno/home/program-cursor'
import { startWorkoutProgram } from '../../../lib/start-program'
import { formatLongDate, getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay, getTodayInSantiago, formatRelativeDate, isoDateAddDays, timeGreeting } from '../../../lib/date-utils'
import { buildWorkoutDoneEditParams } from '../../../lib/workout-executor-nav'
import { AppBackground } from '../../../components/AppBackground'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'
import { Skeleton } from '../../../components/Skeleton'
import { WelcomeModal } from '../../../components/WelcomeModal'
import { StudentOnboarding } from '../../../components/alumno/home/StudentOnboarding'
import { DashboardHeader, DashboardHeaderSkeleton } from '../../../components/alumno/home/DashboardHeader'
import { SectionTitle } from '../../../components/alumno/home/SectionTitle'
import { WeekStrip } from '../../../components/alumno/home/WeekStrip'
import { CheckInBanner } from '../../../components/alumno/home/CheckInBanner'
import { computeCheckInReminder } from '../../../lib/checkin-thresholds'
import { programWeekIndex1Based, weekIndexToVariantLetter, effectiveWeekVariantFromPlans, workoutPlanMatchesVariant } from '../../../lib/program-week-variant'
import { HeroSection } from '../../../components/alumno/home/HeroSection'
import { useSessionMorph } from '../../../components/alumno/workout/v3/session-morph'
import { deriveWeeklyStreak, greedyPlanDone, plannedDatesForWeek, weekDatesMondayToSunday, type PlanWeekCompletionSource } from '../../../components/alumno/workout/v3/weekly-streak'
import { CoachPresenceCard } from '../../../components/alumno/home/CoachPresenceCard'
import { MomentumCard, type MomentumDay } from '../../../components/alumno/home/MomentumCard'
import { ActiveProgramSection } from '../../../components/alumno/home/ActiveProgramSection'
import { WeightWidget } from '../../../components/alumno/home/WeightWidget'
import { PersonalRecordsCard } from '../../../components/alumno/home/PersonalRecordsCard'
import { RecentWorkouts } from '../../../components/alumno/home/RecentWorkouts'
import { OrgAnnouncementBanner } from '../../../components/alumno/home/OrgAnnouncementBanner'
import { StudentAccessBanner } from '../../../components/alumno/home/StudentAccessBanner'
import { HabitsCard } from '../../../components/alumno/home/HabitsCard'
import { NutritionDailySummaryV2 } from '../../../components/alumno/home/NutritionDailySummaryV2'
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
  const { nutritionEnabled, studentAccess } = useEntitlements()
  const { theme } = useTheme()
  const onScrollChrome = useAlumnoScrollHandler()
  const scrollRef = useRef<ScrollView>(null)
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Series registradas de la SEMANA por (plan, dia): clave `${planId}|${ymdSantiago}` →
  // `{ [blockId]: cantidad }`. Reemplaza al viejo Set `planId|ymd` ("hay >=1 log"), que
  // marcaba un dia como hecho con UNA sola serie (incidente P0 2026-07-26): con las series
  // por bloque el estado del dia lo decide `deriveDayCompletion` del engine — la MISMA
  // regla que la web (spec `workout-day-in-progress`, decision CEO O2). Sigue la dimension
  // plan_id que exige la paridad web (weekPendingWorkouts.ts:142-149): un dia solo cuenta
  // sesiones de SU plan, no cualquier entreno del dia. Vive fuera de HomeData (types.ts
  // describe el fetch de 30 dias, esta lectura es semanal).
  const [loggedSetsByPlanDay, setLoggedSetsByPlanDay] = useState<Map<string, Record<string, number>>>(() => new Map())
  // Bloques OMITIDOS de la semana por (plan, dia): misma clave `${planId}|${ymdSantiago}` → ids de
  // bloque. El alumno puede cerrar un dia declarando "Omitir" un ejercicio (mockup 3 del ejecutor):
  // esa fila NO es una serie entrenada (`countLoggedSetsByBlock` la ignora), asi que sin este mapa el
  // dia se veria eternamente 'in_progress' en las day-cards y el hero jamas mostraria el cierre.
  const [skippedBlockIdsByPlanDay, setSkippedBlockIdsByPlanDay] = useState<Map<string, string[]>>(() => new Map())
  // Señal de frescura para los widgets que fetchean por su cuenta (p.ej.
  // NutritionDailySummaryV2): se incrementa en cada load() exitoso (montaje,
  // pull-to-refresh, onSaved) para que el widget re-consulte y no quede congelado
  // en el snapshot de su primer montaje (paridad con la frescura RSC de la web).
  const [reloadKey, setReloadKey] = useState(0)
  // Guard last-writer-wins: cada load() captura un id incremental y sólo escribe
  // estado si sigue siendo el más reciente. Sin esto, un load() lento (refresh/
  // onSaved) puede resolver DESPUÉS de uno nuevo y pisar el estado fresco (p.ej.
  // un check-in recién guardado desaparece del widget).
  const loadIdRef = useRef(0)
  // Onboarding corto del alumno (primera entrada al dashboard). `false` hasta que el
  // overlay se resuelve — ya sea porque el alumno ya lo vio o porque acaba de cerrarlo.
  // Encadena con el WelcomeModal del coach: onboarding primero, welcome después (nunca
  // solapados). Sin `data` todavía no hay pantalla, así que el overlay se monta recién
  // cuando la home terminó de cargar.
  const [onboardingResolved, setOnboardingResolved] = useState(false)
  const handleOnboardingResolved = useCallback(() => setOnboardingResolved(true), [])

  // QA-5 — el splash de marca ES el loader de este dashboard (ver el efecto de `loading`
  // más abajo). Se declara acá arriba porque el desvío al onboarding también lo retira.
  const markDashboardReady = useMarkDashboardReady()

  useEffect(() => {
    getOnboardingStatus().then((done) => {
      if (!done) {
        // El alumno nuevo NO vuelve a esta pantalla: su primer load nunca resolverá y el
        // splash quedaría tapando el onboarding hasta el tope. El desvío ES la resolución.
        markDashboardReady()
        router.replace('/alumno/onboarding')
      }
    })
  }, [])

  // MOBILE-1 — refetch al ENFOCAR: antes la home solo cargaba al montar (deps []), asi el dia recien
  // entrenado seguia "pendiente"/CTA stale al volver del ejecutor (router.replace no remonta el screen de
  // tabs que sigue vivo bajo el stack). useFocusEffect corre en el foco INICIAL (montaje) y en CADA regreso.
  // load() es SILENCIOSO: no toca `loading` (el skeleton solo lo pinta el primer render, cuando aun no hay
  // datos), y el guard last-writer-wins (loadIdRef) evita que una carrera pise el estado fresco. Paridad con
  // la frescura RSC de la web y con la home del coach.
  useFocusEffect(
    useCallback(() => {
      // Al volver a la home (p.ej. del ejecutor) la vista quedaba donde el alumno la dejó — scrolleada
      // hasta el programa — y había que subir a mano (decisión CEO 2026-07-25: el regreso arranca ARRIBA).
      // El screen de tabs sigue vivo bajo el stack, así que el reset es explícito; `resetChromeScroll`
      // revela la cápsula del tab bar (scrollTo programático no garantiza el evento de scroll).
      scrollRef.current?.scrollTo({ y: 0, animated: false })
      resetChromeScroll()
      load().catch(() => setLoading(false))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  async function load() {
    const myId = ++loadIdRef.current
    const client = await getClientProfile()
    if (myId !== loadIdRef.current) return
    if (!client) { setLoading(false); setRefreshing(false); return }

    const { iso: todayIso } = getTodayInSantiago()
    const since30Iso = isoDate(new Date(Date.now() - 29 * MS_DAY))
    // Ventana UTC de la SEMANA Santiago (Lun→Dom) para la lectura serie-a-serie que alimenta el estado de
    // las day-cards. Margen de ±1 dia a proposito: `derived` ancla su semana con la fecha LOCAL del
    // dispositivo y esta con la de Santiago — en un telefono con otro huso ambas pueden diferir un dia, y
    // un lookup por clave exacta `planId|ymd` no perdona un dia faltante. El margen no cambia semantica
    // (las claves fuera de la semana derivada simplemente no se consultan).
    const santiagoWeek = weekDatesMondayToSunday(todayIso)
    const { startIso: weekStartIso } = getSantiagoUtcBoundsForDay(isoDateAddDays(santiagoWeek[0], -1))
    const { endIso: weekEndIso } = getSantiagoUtcBoundsForDay(isoDateAddDays(santiagoWeek[6], 1))

    const [{ data: programData }, { data: workoutRows }, { data: weekSetRows }, { data: nutritionRows }, { data: checkInRows }, { data: coachData }, habitsData, announcements, { data: streakData }] =
      await Promise.all([
        supabase
          .from('workout_programs')
          // `program_structure_type, cycle_length, start_date_flexible` (W3.3): sin ellos el shell no
          // puede saber si `day_of_week` es un ISODOW o el INDICE de un ciclo, ni si el programa
          // todavia no empezo (R30). Espejo del contrato web (`dashboard.queries.ts`).
          .select('id, name, start_date, weeks_to_repeat, ab_mode, program_phases, program_structure_type, cycle_length, start_date_flexible, workout_plans ( id, title, day_of_week, assigned_date, week_variant, workout_blocks ( id, sets, reps, exercises ( name ) ) )')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .maybeSingle(),
        // 30 dias — MISMA lectura que web (`dashboard.queries.ts` getRecentWorkoutLogs, R10): fechas de
        // entreno (momentum/cumplimiento), actividad reciente Y el insumo de `buildCycleCompletions`
        // (`block_id`, el `plan_id` del embed, `set_number`, `logged_at`, `metadata`). Con dos
        // estrategias distintas el mismo alumno veria "Dia 2 de 3" en la PWA y "Dia 1 de 3" en la app.
        // `target_date` NO se pide: no es columna de `workout_logs` (PGRST204); la fecha de la
        // completitud es el dia Santiago de `logged_at` (R11).
        // El `limit(200)` es el de web a proposito; el estado por dia de la SEMANA lo sigue calculando
        // la lectura semanal serie-a-serie de abajo, que no depende de este tope.
        supabase
          .from('workout_logs')
          .select('id, logged_at, exercise_name_at_log, block_id, set_number, metadata, workout_blocks ( plan_id )')
          .eq('client_id', client.id)
          .gte('logged_at', `${since30Iso}T00:00:00.000Z`)
          .order('logged_at', { ascending: false })
          .limit(200),
        // SEMANA serie-a-serie — insumo de la regla de completitud (spec `workout-day-in-progress`):
        // `block_id` + `set_number` dan las series por bloque y `workout_blocks ( plan_id )` el plan dueño
        // del log (mismo embed que web dashboard.queries.ts:150). Acotada a la semana ⇒ el volumen es de
        // una semana de entreno, no de 30 dias.
        // `metadata`: trae la marca de OMISION (`skipped`) — sin ella el engine no puede distinguir la
        // fila declarativa de una serie entrenada y el dia cerrado a base de omisiones no cerraria aca.
        supabase
          .from('workout_logs')
          .select('logged_at, block_id, set_number, metadata, workout_blocks ( plan_id )')
          .eq('client_id', client.id)
          .gte('logged_at', weekStartIso)
          .lt('logged_at', weekEndIso)
          .limit(1000),
        supabase
          .from('daily_nutrition_logs')
          .select('id, log_date')
          .eq('client_id', client.id)
          .gte('log_date', since30Iso)
          .lte('log_date', todayIso),
        // `check_ins.date` es timestamptz (un INSTANTE), no un dia calendario: `lte(todayIso)` lo casteaba
        // a la medianoche de hoy y dejaba FUERA el check-in que el alumno acaba de hacer — el banner
        // seguia diciendo "hace N dias" y el peso de hoy no aparecia. El corte va al fin del dia HOY en
        // Santiago (mismo helper que ya acota la ventana semanal de los logs).
        supabase
          .from('check_ins')
          .select('date, weight')
          .eq('client_id', client.id)
          .gte('date', since30Iso)
          .lt('date', getSantiagoUtcBoundsForDay(todayIso).endIso)
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
          // W3.3 — la estructura decide la semantica de `day_of_week` (ISODOW vs indice del ciclo) y
          // el flag + la fecha deciden `programState` (R30). `null` de la columna = weekly.
          structureType: (programData as any).program_structure_type === 'cycle' ? 'cycle' : 'weekly',
          cycleLength: typeof (programData as any).cycle_length === 'number' ? (programData as any).cycle_length : null,
          startDateFlexible: (programData as any).start_date_flexible ?? null,
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

    // `as unknown as` (mismo patron que web `dashboard.queries.ts:172`): el embed to-one
    // `workout_blocks` llega como OBJETO en runtime y los tipos generados infieren array.
    const rows = (workoutRows ?? []) as unknown as ({ id: string; logged_at: string; exercise_name_at_log: string | null } & CycleCompletionLogRow)[]
    const workoutDates = new Set(rows.map((r) => getSantiagoIsoYmdForUtcInstant(r.logged_at)))

    // `as unknown as` (mismo patron que web dashboard.queries.ts:155): el embed to-one
    // `workout_blocks` llega como OBJETO en runtime, pero los tipos generados infieren
    // array — se overridea la cardinalidad al shape real que consume web.
    const weekRows = (weekSetRows ?? []) as unknown as (LoggedSetRow & { logged_at: string; workout_blocks: { plan_id: string | null } | null })[]
    // Series por (plan, dia) — el bucketing por bloque (con dedup de `(block_id, set_number)`, que la cola
    // offline puede duplicar antes de reconciliar) lo hace `countLoggedSetsByBlock` del engine: web y RN
    // no vuelven a escribirlo. MISMO helper Santiago que workoutDates → mismo dia calendario.
    const rowsByPlanDay = new Map<string, LoggedSetRow[]>()
    for (const r of weekRows) {
      const planId = r.workout_blocks?.plan_id
      if (!planId || !r.block_id) continue
      const key = `${planId}|${getSantiagoIsoYmdForUtcInstant(r.logged_at)}`
      const bucket = rowsByPlanDay.get(key)
      if (bucket) bucket.push(r)
      else rowsByPlanDay.set(key, [r])
    }
    const loggedSetsByPlanDay = new Map<string, Record<string, number>>()
    // Compañera del conteo: los bloques que el alumno declaro OMITIDOS ese dia (`skippedBlockIdsFromLogs`
    // del engine, misma entrada ya filtrada por plan/dia). Resuelven su bloque entero en
    // `deriveDayCompletion` sin sumar una sola serie entrenada.
    const skippedBlockIdsByPlanDay = new Map<string, string[]>()
    for (const [key, bucket] of rowsByPlanDay) {
      loggedSetsByPlanDay.set(key, countLoggedSetsByBlock(bucket))
      const skipped = skippedBlockIdsFromLogs(bucket)
      if (skipped.length > 0) skippedBlockIdsByPlanDay.set(key, skipped)
    }
    // Progreso del hero (series por bloque de HOY): los ids de bloque son unicos por plan, asi que contar
    // todas las series de hoy y leerlas por bloque equivale a filtrar por plan.
    const todayLoggedByBlock = new Map<string, number>(
      Object.entries(countLoggedSetsByBlock(weekRows.filter((r) => getSantiagoIsoYmdForUtcInstant(r.logged_at) === todayIso))),
    )

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
      // Las MISMAS filas, sin recortar: `deriveProgramCursor` las pasa por `buildCycleCompletions`.
      cycleLogRows: rows,
      todayLoggedByBlock,
      nutritionDates: new Set((nutritionRows ?? []).map((r: any) => r.log_date)),
      checkIns: (checkInRows ?? []) as any,
      habitsToday: habitsData,
      welcomeModal,
      streak,
    })
    setLoggedSetsByPlanDay(loggedSetsByPlanDay)
    setSkippedBlockIdsByPlanDay(skippedBlockIdsByPlanDay)
    setReloadKey((k) => k + 1)
    setLoading(false)
    setRefreshing(false)
  }

  /**
   * «Empezar hoy» (W3.8, R14/R23): la RPC fija `start_date` = hoy y el home se recarga para que el cursor
   * pinte «Hoy toca · Día 1 de N». `program_not_startable` NO es un error para el alumno (otra sesion ya
   * lo empezo o dejo de ser flexible): se recarga y se muestra el estado real. Devuelve el mensaje de
   * error a mostrar inline, o `null` si todo fue bien.
   */
  async function handleStartProgram(programId: string): Promise<string | null> {
    const res = await startWorkoutProgram(programId, { via: 'button', structure: data?.program?.structureType ?? null })
    if (!res.ok && res.code !== 'program_not_startable') return res.message
    await load()
    return null
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

    // Estructura del programa (W3.3): decide si `day_of_week` es un ISODOW o el INDICE de un ciclo.
    const structureType = data?.program?.structureType ?? 'weekly'
    const isCycle = structureType === 'cycle'

    // Planes que participan del programa, filtrados por la variante A/B efectiva (web
    // ActiveProgramSection.tsx:49). Se calculan ACA arriba porque son la entrada del cursor.
    const programPlans = plans.filter((p) => p.day_of_week != null && workoutPlanMatchesVariant(p, activeVariant, abMode))

    // CURSOR DEL PROGRAMA (W3.5, D1) — UNICA resolucion de "hoy toca". En `weekly` es la IDENTIDAD de
    // lo de siempre (`day_of_week === ISODOW`); en `cycle` es el cursor por COMPLETITUD sobre la
    // lectura de 30 dias: el dia calendario NO participa. `programState` (R30) y las etiquetas
    // (`programDayLabel`) viajan en el resultado — ninguna seccion vuelve a derivarlos.
    const cursor = deriveProgramCursor({
      program: data?.program ?? null,
      plans: programPlans,
      logs: data?.cycleLogRows ?? [],
      todayIso,
    })
    const planById = new Map(plans.map((p) => [p.id, p]))

    // `plans` viene ANIDADO del programa ACTIVO ⇒ son TODOS planes de programa, cuya identidad de dia
    // es `day_of_week`. El atajo por `assigned_date` (que solo tiene sentido en un plan SUELTO de fecha
    // fija, aca imposible) hacia que durante la semana del `start_date` —estampado por el builder en
    // TODOS los dias del programa— el dia resolviera a un plan arbitrario (incidente 2026-08-25).
    // En `cycle` el hero lo lee del cursor: buscar por `todayDbDay` seria leer el indice del ciclo como
    // dia de la semana (el jueves de un ciclo de 3 dias dejaba el hero VACIO). En `weekly` se conserva
    // la busqueda historica sobre TODOS los planes (el cursor solo ve los de la variante activa).
    const todayPlan = isCycle
      ? (cursor.todayPlanId ? planById.get(cursor.todayPlanId) ?? null : null)
      : (plans.find((p) => p.day_of_week === todayDbDay) ?? null)
    const nextPlan = isCycle
      ? (cursor.nextPlanId ? planById.get(cursor.nextPlanId) ?? null : null)
      : (plans.find((p) => p.id !== todayPlan?.id) ?? null)

    // Semana Lun..Dom + planificados.
    const monday = startOfWeekMonday(today)
    const weekDates = Array.from({ length: 7 }, (_, i) => isoDate(new Date(monday.getTime() + i * MS_DAY)))
    const plannedDays = new Set<string>()
    // En CICLO no hay "dia asignado" del calendario (R12): la tira Lun→Dom es de dias ENTRENADOS, sin
    // estados «asignado»/«pendiente». Marcar planificados por `day_of_week` seria leer el indice del
    // ciclo como dia de la semana (el ciclo de 3 dias "planificaba" lun/mar/mie).
    if (!isCycle) {
      for (let i = 0; i < 7; i++) {
        const dIso = weekDates[i]
        const dbDay = jsDayToDbDay(new Date(monday.getTime() + i * MS_DAY).getDay())
        // Solo `day_of_week`: ver `todayPlan` — un plan de programa no se resuelve por fecha.
        if (plans.some((p) => p.day_of_week === dbDay)) plannedDays.add(dIso)
      }
    }
    const momentumDays: MomentumDay[] = weekDates.map((dIso, i) => ({
      label: WEEK_LETTERS[i],
      isToday: dIso === todayIso,
      // En ciclo `plannedDays` esta vacio ⇒ la tira queda con un punto por dia ENTRENADO (R12).
      hasWorkout: plannedDays.has(dIso) || workoutDates.has(dIso),
      isCompleted: workoutDates.has(dIso),
    }))

    // Estado por dia del programa + cola de pendientes (E1-19). Filtra por la variante
    // A/B efectiva (web ActiveProgramSection.tsx:49): en un programa A/B sólo se muestran
    // los días de la semana activa.
    // Mapa fecha→dbDay de la semana (para el label "Hecho el {dia}" de doneOnDate).
    const dbDayByDate = new Map<string, number>()
    for (let i = 0; i < 7; i++) dbDayByDate.set(weekDates[i], jsDayToDbDay(new Date(monday.getTime() + i * MS_DAY).getDay()))

    // Denominador de cada dia: bloques VIGENTES del plan (`sets` null/0 = 1 unidad, regla del engine).
    // Ya viajan en el fetch del programa (`workout_blocks ( id, sets, ... )`), no hay query extra.
    const blocksByPlan = new Map<string, DayCompletionBlock[]>()
    for (const p of plans) blocksByPlan.set(p.id, p.blocks.map((b) => ({ id: b.id, sets: b.sets })))
    const completionSource: PlanWeekCompletionSource = { blocksByPlan, loggedSetsByPlanDay, skippedBlockIdsByPlanDay }

    // ATRIBUCION GREEDY POR PLAN — espejo EXACTO del fix web weekPendingWorkouts.ts (Paso 2+3,
    // atribucion greedy, CEO decision 10 2026-07-22): un dia X queda 'done' si SU plan tiene un log
    // en CUALQUIER dia de esta semana Santiago, no solo en su propia fecha. Recuperar el martes un
    // jueves marca el martes (doneOnDate/doneOnLabel = "Hecho el jueves") y limpia el pendiente.
    //   Fase 1: el log en la PROPIA fecha del dia cierra "en fecha" (doneOnDate=null), consume su log.
    //   Fase 2: los logs sobrantes cierran el dia PENDIENTE mas antiguo del plan (recuperacion).
    // En el modelo plan-centrico del movil cada plan es UN slot (su day_of_week), asi que las dos
    // fases del web colapsan por plan: si hay sesion en su propia fecha → cierra en fecha; si no y hay
    // alguna sesion de la semana → recuperado con la mas antigua. Los dias FUTUROS nunca son
    // elegibles. NO toca momentum/racha (cuentan la fecha real by design) — solo descubribilidad +
    // estado visual.
    // COMPLETITUD (spec `workout-day-in-progress`, CEO O2 2026-07-26): el greedy ya no cierra con ">=1
    // log" sino con el 100% de las series esperadas (`deriveDayCompletion` del engine, misma regla que la
    // web); una sesion a medias deja el dia en 'in_progress' — ni pendiente (ya entreno) ni hecho (le
    // faltan series), y su day-card lleva al ejecutor en vez del sheet "Ya hiciste este entrenamiento".
    //
    // CICLO (R12/D1): el greedy semanal NO aplica — un dia del ciclo no tiene fecha de calendario ni
    // "dia perdido", asi que los slots salen del cursor (hecho con su fecha / hoy / proximo) y jamas
    // se mapea `day_of_week` sobre `weekDates`. Ese `((dow - 1) % 7 + 7) % 7` era justamente el bug:
    // con un ciclo de 14 dias los indices 8..14 se doblaban sobre lunes..domingo.
    const planDays: PlanDayView[] = isCycle
      ? cursor.slots.flatMap<PlanDayView>((slot) => {
          const plan = planById.get(slot.planId)
          if (!plan) return []
          const isToday = slot.planId === cursor.todayPlanId
          const status: PlanDayView['status'] =
            slot.state === 'done'
              ? 'done'
              : isToday
                ? (cursor.todayState === 'in_progress' ? 'in_progress' : cursor.todayState === 'done' ? 'done' : 'today')
                : 'upcoming'
          // Sin fecha de calendario: la unica fecha REAL de un slot de ciclo es la del dia que se cerro
          // (para abrir «Revisar y editar» sobre esa sesion); el resto apunta a hoy.
          const dateIso = slot.doneDateIso ?? todayIso
          return [{
            plan, status, isToday, dateIso, doneOnDate: null, doneOnLabel: null,
            // Etiquetas del cursor (W3.8): «Día 2» / «Día 2 de 3», nunca un dia de la semana.
            isCycle: true, label: slot.label, labelLong: slot.labelLong,
          }]
        })
      : programPlans.map((plan) => {
          const dow = plan.day_of_week as number
          // `day_of_week` en weekly es un ISODOW 1..7: el slot es su posicion en la semana Lun→Dom.
          const dIso = weekDates[dow - 1] ?? weekDates[0]
          const isToday = dIso === todayIso
          const isFuture = dIso > todayIso
          // Atribucion greedy por plan (Fase 1 en-fecha / Fase 2 recuperacion): helper PURO compartido con la
          // racha del ejecutor (weekly-streak.ts) — UNICA fuente de verdad del greedy, sin duplicar la logica.
          const { state, doneOnDate } = greedyPlanDone(plan.id, dIso, isFuture, weekDates, completionSource)
          const status: PlanDayView['status'] =
            state === 'done' ? 'done' : state === 'in_progress' ? 'in_progress' : isToday ? 'today' : isFuture ? 'upcoming' : 'pending'
          const doneOnLabel = doneOnDate ? DAY_FULL[dbDayByDate.get(doneOnDate) ?? 1] : null
          return { plan, status, isToday, dateIso: dIso, doneOnDate, doneOnLabel }
        })
    // Banner ambar = dias pasados accionables: sin nada registrado ('pending') Y TAMBIEN los
    // empezados a medias ('in_progress') — paridad con la web (weekPendingWorkouts.ts filtra
    // pending || in_progress y su banner cambia el verbo a «Continuar»). Excluirlos era el bug
    // del owner 19-08 («solo del presente a dias futuros»): un dia pasado a medias no tenia
    // NINGUN CTA en RN — su card solo abria el sheet de solo-lectura y la unica salida era
    // «Repetir hoy». El dia de HOY se excluye: su CTA es el hero, no el banner.
    // En CICLO no existe el «dia perdido» (R12): cero pendientes y cero recuperables, igual que la web
    // (`weekPendingWorkouts.ts` devuelve vacio y el banner ambar no se monta).
    const pending: PendingDay[] = isCycle ? [] : planDays
      .filter((d) => (d.status === 'pending' || d.status === 'in_progress') && !d.isToday)
      .map((d) => ({ planId: d.plan.id, dayOfWeek: d.plan.day_of_week as number, dayLabel: DAY_FULL[d.plan.day_of_week as number], dateIso: d.dateIso, status: d.status as 'pending' | 'in_progress' }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    const todayPlanId = planDays.find((d) => d.isToday)?.plan.id ?? todayPlan?.id ?? null

    // §3 "Tu semana" (WeekStrip) — se alimenta de los MISMOS insumos que las day-cards, sin
    // re-derivar la regla: `planDays` ya trae el estado GREEDY por slot (`greedyPlanDone`), asi
    // que las fechas done/in_progress salen de ahi tal cual. `plannedDates` usa el helper puro
    // compartido `plannedDatesForWeek` sobre `programPlans` (la MISMA lista filtrada por variante
    // A/B que pinta las day-cards) — no sobre `plannedDays`, que ignora la variante y es de la
    // tira de momentum. Empate de dos planes en un slot (A/B mal armado): el cerrado gana al
    // parcial, sin dot ambiguo (mismo desempate que `greedyStatesForWeek`).
    // En CICLO la tira es de dias ENTRENADOS (R12): un punto por dia con logs, sin «asignado» ni
    // «pendiente» — el greedy semanal y `plannedDatesForWeek` no aplican (los slots del ciclo no
    // tienen fecha de calendario).
    const weekDoneDates = new Set<string>()
    const weekInProgressDates = new Set<string>()
    if (isCycle) {
      for (const iso of weekDates) if (workoutDates.has(iso)) weekDoneDates.add(iso)
    } else {
      for (const d of planDays) {
        if (d.status === 'done') weekDoneDates.add(d.dateIso)
        else if (d.status === 'in_progress') weekInProgressDates.add(d.dateIso)
      }
      for (const iso of weekDoneDates) weekInProgressDates.delete(iso)
    }
    const weeklyStreak = deriveWeeklyStreak({
      weekDates,
      plannedDates: plannedDatesForWeek(programPlans, weekDates, structureType),
      doneDates: weekDoneDates,
      inProgressDates: weekInProgressDates,
      todayIso,
    })

    // Semana actual del programa — vía programWeekIndex1Based (C3, paridad web
    // ActiveProgramSection.tsx:82: `currentWeek = weekIdx ?? 1`).
    const totalWeeks = data?.program?.weeksToRepeat ?? 1
    const currentWeek = weekIdx ?? 1

    // Cumplimiento (mismas formulas que el legacy mobile).
    const workoutTargetDays = plans.length ? Math.min(plans.length * 4, 30) : 12
    // R12: en ciclo no hay meta semanal ⇒ el anillo «Entrenos» no tiene denominador (`null` ⇒ «—» +
    // «Sin meta semanal», paridad web `computeWorkoutScore30d`).
    const workoutCompliance: number | null = data ? (isCycle ? null : Math.min(1, workoutDates.size / workoutTargetDays)) : 0
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

    // Overlay "Entrenamiento completado" del hero (§5): SOLO si el plan que rige HOY tiene sesion HOY.
    // Antes era `workoutDates.has(todayIso)` = cualquier log del dia, de CUALQUIER plan: recuperar el
    // martes hoy (o repetir otro dia) tapaba el hero de hoy con el check verde y el CTA pasaba a "Ver
    // registro" sin haber entrenado lo de hoy. DECISION: se acota al plan del hero (`todayPlan`, el que
    // el hero realmente pinta), no a "cualquier plan del programa" — paridad con la web, que filtra
    // `plan_id === todayPlan.id && ymdSantiago(logged_at) === hoy` (heroComplianceBundle.ts:121-129).
    // Fuente = `loggedSetsByPlanDay` (series por `planId|ymd`), la misma que alimenta el greedy de las
    // day-cards. NO se usa el greedy aqui a proposito: el greedy puede marcar el dia de hoy como done por
    // una sesion en OTRA fecha de la semana (adelantar el plan del miercoles el lunes); el hero habla del
    // dia real, y la recuperacion/repeticion vive en las day-cards (igual que en la web).
    // COMPLETITUD (spec `workout-day-in-progress`): el overlay "Entrenamiento completado" ahora exige el
    // 100% de las series del plan de hoy — con la sesion a medias el hero deja el CTA vivo en "Continuar"
    // (lo decide `totalLogged > 0` dentro del hero) en vez de taparlo con el check verde.
    const todayCompletion = todayPlan
      ? deriveDayCompletion({
          blocks: blocksByPlan.get(todayPlan.id) ?? [],
          loggedSetsByBlock: loggedSetsByPlanDay.get(`${todayPlan.id}|${todayIso}`) ?? {},
          // Omisiones de HOY: un bloque declarado omitido resuelve el dia igual que si se hubiera
          // entrenado (misma regla que las day-cards), sin sumar series al hero.
          skippedBlockIds: skippedBlockIdsByPlanDay.get(`${todayPlan.id}|${todayIso}`),
        })
      : null
    // En CICLO el veredicto ya lo trae el cursor (`todayState`, calculado sobre la lectura de 30 dias
    // con la MISMA regla): no se re-deriva contra la ventana semanal.
    const doneToday = isCycle ? cursor.todayState === 'done' : todayCompletion?.state === 'done'

    return {
      todayPlan, nextPlan, momentumDays, planDays, pending, todayPlanId, currentWeek, totalWeeks,
      weekVariant: abMode ? activeVariant : null,
      workoutCompliance, nutritionCompliance, checkInCompliance,
      nutritionEmpty: data ? (data.nutritionDates.size ?? 0) === 0 : true,
      checkInEmpty: data ? checkIns.length === 0 : true,
      streak, ciVariant, ciDays, ciRelative, doneToday,
      weeklyStreak, todayIso,
      // CONTRATO DEL CURSOR (W3.5) — lo consumen ActiveProgramSection / WeekStrip / MomentumCard /
      // StreakRibbon (W3.8) TAL CUAL: `programState` (R30), `todayState`, los indices, la tira de
      // `slots` con sus etiquetas de `programDayLabel`. Ninguna seccion vuelve a derivar "hoy toca",
      // "no empezo" ni el nombre del dia a partir de `day_of_week`.
      isCycle,
      cursor,
      programState: cursor.programState,
      todayState: cursor.todayState,
      todayCycleIndex: cursor.todayCycleIndex,
      nextCycleIndex: cursor.nextCycleIndex,
      todayDayLabel: cursor.todayLabel,
      nextDayLabel: cursor.nextLabel,
      slots: cursor.slots,
    }
  }, [data, loggedSetsByPlanDay, skippedBlockIdsByPlanDay])

  // Fallback 'Atleta' = web `DashboardHeader.tsx:13`; el saludo cargado siempre lleva
  // nombre. Durante loading NO se pinta saludo (skeleton), asi el texto aparece una
  // sola vez ya final (P0-3: evita el swap "Hola/Buenas tardes" -> "..., Nombre").
  const firstName = data?.client?.fullName?.split(' ')[0] ?? 'Atleta'
  const greeting = `${timeGreeting()}, ${firstName}`

  // QA-5 — el splash de marca se retira cuando el PRIMER load resolvió, con datos o con
  // error (`load()` baja `loading` en los dos caminos). El skeleton de abajo queda como
  // fallback de las navegaciones posteriores, que ya no llevan splash.
  useEffect(() => {
    if (!loading) markDashboardReady()
  }, [loading, markDashboardReady])

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
        ref={scrollRef}
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

        {/* §3 Tu semana — rediseño Mock C (CEO 2026-07-30): la tira de 7 dias (mismo estado
            que las day-cards) reemplaza al StreakRibbon; la racha del RPC queda como chip. */}
        <WeekStrip week={derived.weeklyStreak} streak={derived.streak} todayIso={derived.todayIso} />

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
          // Cursor del motor (W3.8): el hero lee `programState`/`todayState`/etiquetas de aca, nunca de
          // `startDate` ni de `day_of_week`.
          cursor={derived.cursor}
          programId={data?.program?.id ?? null}
          onStartProgram={handleStartProgram}
          coachName={data?.coachName ?? null}
          nutritionEnabled={nutritionEnabled}
          // `label` = texto REAL del CTA tocado (Empezar/Continuar/Ver registro) → la pildora del Despegue
          // muestra el mismo texto (swap sin costura). MOBILE-2.
          onStart={(id, origin, label) => startMorph({ planId: id, origin, label })}
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
            weekVariant={derived.weekVariant}
            // `repeatDate` (sheet doble intencion → "Repetir hoy" sobre un dia hecho en OTRA fecha) viaja
            // como param `repetir`: el ejecutor abre una sesion NUEVA de hoy con cada serie precargada con
            // lo que se registro ese dia (editable). Los registros del dia original no se tocan.
            onStart={(id, origin, label, repeatDate) =>
              startMorph({ planId: id, origin, label, params: repeatDate ? { repetir: repeatDate } : undefined })
            }
            // Recuperar un dia pendiente: se entrena HOY y el log cae hoy (semantica correcta de
            // recuperacion, ver E1.1); el param `recuperar` solo pinta el banner informativo ambar.
            // Recuperar dispara el MISMO Despegue que el CTA/day-cards (con el param `recuperar`); el
            // origin (rect del banner/card) lo pasa ActiveProgramSection para que el morph nazca de él.
            onRecover={(id, fecha, origin, label) => startMorph({ planId: id, origin, params: { recuperar: fecha }, label })}
            // "Revisar y editar" del sheet: EDITOR DE DIA PASADO. `buildWorkoutDoneEditParams` decide el
            // param igual que la web (`buildWorkoutDoneEditHref`): sesion realmente pasada ⇒ `?fecha=`
            // (el motor conmuta a solo-UPDATE y corrige esa fecha sin insertar), sesion de HOY ⇒
            // `?desde=hecho` (flujo normal de hoy, que ya corrige la misma fila por upsert).
            onReview={(id, sessionDate, isTodayCell) =>
              startMorph({
                planId: id,
                label: 'Revisar y editar',
                params: buildWorkoutDoneEditParams(sessionDate, getTodayInSantiago().iso, isTodayCell),
              })
            }
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

        {/* §12 Nutrición de hoy — V2 es la única superficie activa para standalone y Team. */}
        {data?.client && nutritionEnabled ? (
          <View>
            <SectionTitle accent={EMBER_500} action="Ver nutrición" onAction={() => router.push('/alumno/nutricion')} actionTestID="home-nutrition-link">Nutrición de hoy</SectionTitle>
            <NutritionDailySummaryV2
              clientId={data.client.id}
              reloadSignal={reloadKey}
              // Deep-link a la franja que le toca ahora (SPEC nutrition-ui-poda #8): `slotCode`
              // viene de la propia card, calculado sobre el mismo cache que ya lee — sin él,
              // cae al Hoy sin resaltar ninguna franja.
              onSeeAll={(slotCode) =>
                router.push(
                  slotCode
                    ? { pathname: '/alumno/nutricion', params: { slot: slotCode } }
                    : '/alumno/nutricion',
                )
              }
            />
          </View>
        ) : null}
        </View>
      </ScrollView>

      {/* §13a Onboarding corto del alumno — 3 slides, una sola vez (AsyncStorage) */}
      <StudentOnboarding onResolved={handleOnboardingResolved} />

      {/* §13b WelcomeModal del coach — espera a que el onboarding esté resuelto */}
      {data?.welcomeModal ? (
        <WelcomeModal
          brandName={data.welcomeModal.brandName}
          enabled={data.welcomeModal.enabled && onboardingResolved}
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
