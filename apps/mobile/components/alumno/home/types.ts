import type {
  CycleCompletionLogRow,
  CycleCursorMode,
  CycleProgramState,
  CycleSlotState,
  CycleTodayState,
} from '@eva/workout-engine'
import type { ClientProfile } from '../../../lib/client'
import type { HabitsData } from '../../../lib/habits.queries'
import type { OrgAnnouncement } from '../../../lib/org-announcements'

/**
 * Contrato de datos del dashboard alumno (mobile). El shell (`home.tsx`) hace UN
 * fetch, deriva y alimenta a las secciones presentacionales de este folder — cada
 * seccion vive en su propio archivo (paridad 1:1 con el arbol mobile de la web:
 * `apps/web/src/app/c/[coach_slug]/dashboard/_components/*`).
 */

/** Bloque del plan de hoy para la hero card (nombre + prescripcion). */
export interface HeroBlock {
  id: string
  name: string
  sets: number
  reps: string
}

export interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  /** Variante A/B del plan (solo relevante en programas ab_mode). Espejo de `workout_plans.week_variant`. */
  week_variant: string | null
  blockCount: number
  blocks: HeroBlock[]
}

/** Fase del programa (mesociclo) — espejo de `program_phases` jsonb. */
export interface ProgramPhase {
  name: string
  weeks: number
  color?: string
}

export interface Program {
  id: string
  name: string
  plans: Plan[]
  phases: ProgramPhase[] | null
  weeksToRepeat: number
  startDate: string | null
  /** Programa A/B (semanas alternadas). Espejo de `workout_programs.ab_mode`. */
  abMode: boolean
  /**
   * Estructura del programa (espejo de `workout_programs.program_structure_type`, W3.3): decide QUE
   * significa `Plan.day_of_week` — ISODOW 1..7 en `weekly`, INDICE del ciclo 1..14 en `cycle`. Sin
   * este campo el shell leia siempre el numero como dia de la semana y un ciclo de 3 dias solo
   * "tenia entreno" lun/mar/mie (feedback Movens 2026-09-03). `null` = weekly (default del schema).
   */
  structureType: 'weekly' | 'cycle' | null
  /** Largo del ciclo 1..14 (espejo de `cycle_length`). `null` en weekly y en ciclos legacy. */
  cycleLength: number | null
  /**
   * Inicio flexible OPT-IN (espejo de `start_date_flexible`, R2). Con `startDate` null significa que
   * el programa AUN NO EMPEZO (`programState: 'not_started'` del motor, R30); nadie vuelve a derivar
   * ese estado mirando `startDate`.
   */
  startDateFlexible: boolean | null
}

export interface RecentWorkout {
  id: string
  logged_at: string
  exercise_name_at_log: string | null
}

export interface CheckInPoint {
  date: string
  weight: number | null
}

export interface WelcomeModalConfig {
  enabled: boolean
  content: string
  type: 'text' | 'video'
  version: number
  brandName?: string
}

export interface HomeData {
  client: ClientProfile | null
  /** §1 — avisos activos de la org (vacio si el alumno no tiene org o sin anuncios). */
  announcements: OrgAnnouncement[]
  coachName: string | null
  coachWelcome: string | null
  program: Program | null
  recentWorkouts: RecentWorkout[]
  workoutDates: Set<string>
  /**
   * Filas CRUDAS de la lectura de 30 dias (W3.7b/R10: la MISMA query que web —
   * `block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `limit 200`). Es el insumo
   * de `buildCycleCompletions`; no se abre una tercera lectura ni se deriva completitud a mano.
   */
  cycleLogRows: CycleCompletionLogRow[]
  /** block_id -> series logueadas HOY (para el progreso de la hero card). */
  todayLoggedByBlock: Map<string, number>
  nutritionDates: Set<string>
  checkIns: CheckInPoint[]
  habitsToday: HabitsData | null
  welcomeModal: WelcomeModalConfig | null
  /** §3 Racha — RPC `get_client_current_streak` (MISMA fuente que web): dias ASIGNADOS hechos; dia sin asignacion = neutro (migracion 20260723110000). */
  streak: number
}

/**
 * Estado de un dia del programa en la semana actual (espejo de `WeekDayStatus`, incluye 'rest' = dia sin
 * plan). `in_progress` = sesion empezada y sin cerrar (1–99% de las series esperadas, regla unica
 * `deriveDayCompletion` de `@eva/workout-engine`; spec `workout-day-in-progress`, CEO O2 2026-07-26):
 * ni 'pending' (ya entreno) ni 'done' (le faltan series).
 */
export type DayStatus = 'today' | 'done' | 'in_progress' | 'pending' | 'upcoming' | 'rest'

export interface PlanDayView {
  plan: Plan
  status: DayStatus
  isToday: boolean
  /** Fecha ISO YYYY-MM-DD de este dia en la semana actual (para params de navegacion recuperar/fecha). */
  dateIso: string
  /**
   * Si la sesion atribuida a este dia ocurrio en OTRO dia de esta semana (recuperacion/adelanto), fecha
   * ISO YYYY-MM-DD de esa sesion; `null` cuando se hizo en su propia fecha (o no hay sesion). Aplica a
   * 'done' (copy "Hecho el jueves") y tambien a 'in_progress' (la sesion parcial vive en esa fecha).
   * Espejo aditivo de `WeekDay.doneOnDate` (web weekPendingWorkouts.ts, atribucion greedy E1.1).
   */
  doneOnDate: string | null
  /** Nombre completo del dia de `doneOnDate` ("Jueves") para el copy "Hecho el jueves". `null` = mismo caso que doneOnDate. */
  doneOnLabel: string | null
  /**
   * Ciclo (R12, W3.8): etiquetas del cursor ("Día 2" / "Día 2 de 3") para que el day-card y el sheet no
   * vuelvan a mapear `day_of_week` a un dia de la semana. Ausentes en weekly (se conserva `DAY_SHORT`).
   */
  isCycle?: boolean
  label?: string
  labelLong?: string
}

/** Dia pasado esta semana sin registro o a medias → recuperable/continuable HOY (delta Fase L / E1-19). */
export interface PendingDay {
  planId: string
  dayOfWeek: number
  dayLabel: string
  /** Fecha ISO YYYY-MM-DD de ese dia en la semana actual (param `recuperar` al ejecutor). */
  dateIso: string
  /** 'pending' = sin nada registrado («Recuperar») · 'in_progress' = empezado a medias («Continuar») — paridad web. */
  status: 'pending' | 'in_progress'
}

/**
 * UN dia del programa segun el motor (`CycleSlot` + sus etiquetas ya resueltas). En `cycle` es un dia
 * del ciclo ("Dia 2 de 3"); en `weekly` es el ISODOW con plan ("Mar"). Las secciones lo PINTAN: no
 * vuelven a mapear `day_of_week` a un dia de la semana ni a recalcular el estado.
 */
export interface ProgramSlotView {
  planId: string
  /** ISODOW 1..7 en `weekly`; indice del ciclo 1..14 en `cycle`. */
  cycleIndex: number
  state: CycleSlotState
  /** Solo en `done`: dia Santiago en que se cerro (yyyy-mm-dd). */
  doneDateIso: string | null
  /** Titulo del plan ("Empuje"), tal cual viene del programa. */
  title: string | null
  /** `programDayLabel(form: 'short')` — "Mar" / "Dia 2". */
  label: string
  /** `programDayLabel(form: 'long')` — "Martes" / "Dia 2 de 3". */
  labelLong: string
  /** `programDayLabel(form: 'chip')` — "Mar" / "D2" (chip de 34 px de las day-cards). */
  labelChip: string
}

/**
 * Resultado del cursor del programa expuesto por el shell (W3.5). Sale ENTERO de
 * `resolveCycleCursor` (`@eva/workout-engine`): `programState` incluido (R30 — nadie re-deriva "no
 * empezo" de `startDate`), y las etiquetas ya resueltas con `programDayLabel` (R8/R31). En `weekly`
 * es la IDENTIDAD de la resolucion de siempre (`day_of_week === ISODOW`).
 */
export interface ProgramCursorView {
  mode: CycleCursorMode
  /** `not_started` = inicio flexible sin fecha ⇒ hero "Empezar hoy" (R30). */
  programState: CycleProgramState
  /** Estado del dia de HOY: sin registrar / a medias / cerrado. */
  todayState: CycleTodayState
  todayPlanId: string | null
  /** ISODOW en weekly; indice del ciclo en cycle. `null` si no hay dia resoluble. */
  todayCycleIndex: number | null
  nextPlanId: string | null
  nextCycleIndex: number | null
  /** Etiqueta larga del dia de hoy ("Dia 2 de 3"); cadena vacia si no hay dia. */
  todayLabel: string
  /** Etiqueta larga del proximo dia; cadena vacia si no hay siguiente. */
  nextLabel: string
  /** Ultimo dia CERRADO dentro de la ventana de 30 dias (solo en `cycle`). */
  lastCompleted: { planId: string; cycleIndex: number; dateIso: string } | null
  /** Tira de dias del programa con su estado y etiquetas (day-cards / WeekStrip de ciclo). */
  slots: ProgramSlotView[]
}

// ── Acentos DS FIJOS (rampas constantes, nunca white-label; sport sigue la marca
//    en runtime via theme.primary / clases NativeWind). Mirror TOKENS.md. ──
export const EMBER_400 = '#FF8C66' // fill claro de la barra de racha (web --ember-400, globals.css:405)
export const EMBER_500 = '#FF6A3D' // accent-nutrition / racha
export const EMBER_600 = '#E8511E'
export const EMBER_700 = '#C2410C'
export const AQUA_700 = '#0A6E8D' // hidratacion (habitos)
export const DANGER_600 = '#BE183C'
export const DANGER_500 = '#F4365A'
export const WARNING_500 = '#F5A524'
export const SUCCESS_500 = '#1FB877'

// Etiquetas de dia — verbatim del diseno.
export const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // Lun..Dom (tira semanal)
export const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] // dbDay 1..7
export const DAY_FULL = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] // dbDay 1..7 (web DAY_NAMES_FULL)
