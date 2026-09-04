/**
 * Racha SEMANAL del ejecutor V3 (E4.4) — helpers PUROS (sin RN, sin queries) que derivan el estado de la
 * semana "sesiones hechas vs dias con plan" para pintar los dots Lun→Dom en el Inicio (SessionStart) y en
 * la pantalla Final (SessionCompleteV3). SIN rachas diarias ni guilt-copy: es una foto neutra de la semana.
 *
 * FUENTE DE VERDAD (documentada): el ejecutor NO tiene en memoria el calendario semanal (solo carga EL plan
 * en ejecucion). Para que la racha sea HONESTA y no inventada, `ExecutorV3` hace una lectura acotada a la
 * semana (best-effort, gateada por `clientId`) que espeja la atribucion GREEDY del dashboard
 * (`home.tsx` day-cards / web `weekPendingWorkouts`):
 *   · `plannedDates` = dias Lun→Dom con un `workout_plan` del alumno (por `day_of_week` 1..7; la
 *     `assigned_date` solo cuenta en un plan SUELTO — ver `usesAssignedDate`).
 *   · `doneDates`    = dias Lun→Dom `done` bajo atribucion GREEDY por plan (`greedyStatesForWeek`): un dia
 *     queda done si SU plan tiene una sesion COMPLETA en cualquier dia de la semana → recuperar el lunes un
 *     jueves marca el LUNES (decision CEO: RN adopta el greedy del web, el dia recuperado pinta done igual
 *     que la home).
 *   · `inProgressDates` = dias con sesion PARCIAL (1–99% de las series) — tercera visual, ver abajo.
 * Si la lectura falla (offline) el ejecutor pasa `null` y la UI oculta la racha — NUNCA se muestra un dato falso.
 *
 * COMPLETITUD (spec `workout-day-in-progress`, decision CEO O2 2026-07-26): "hecho" ya NO es ">=1 log del
 * plan" sino el 100% de las series esperadas. La regla NO vive aca: es `deriveDayCompletion` de
 * `@eva/workout-engine`, la MISMA funcion que consume la web — este modulo solo la aplica sobre la
 * atribucion greedy por plan. Un dia a medias queda `in_progress` (ni pendiente ni hecho) para que el
 * alumno interrumpido no caiga al sheet "Ya hiciste este entrenamiento" (incidente P0 2026-07-26).
 */
import { deriveDayCompletion, type DayCompletionBlock, type DayCompletionState, type ProgramDayLabelStructure } from '@eva/workout-engine'
import { isoDateAddDays } from '../../../../lib/date-utils'

/**
 * ESTRUCTURA DEL PROGRAMA (spec `docs/specs/ciclo-real-y-por-lado`, R12). Todo lo que mapea
 * `day_of_week` sobre la semana Lun→Dom vale SOLO en `weekly`, donde esa columna es el ISODOW; en
 * `cycle` guarda el INDICE del ciclo (1..14) y mapearlo a un dia de la semana es exactamente el bug
 * que reporto Movens (un ciclo de 3 dias "planificaba" lun/mar/mie; uno de 14 doblaba los dias 8..14
 * sobre los 7 primeros). En `cycle` no hay dia asignado ni dia perdido: la tira Lun→Dom es de dias
 * ENTRENADOS y el estado por dia del programa lo resuelve `resolveCycleCursor`, no estos helpers.
 *
 * Se pasa por parametro OPCIONAL (default `weekly`) para que los callers historicos —que solo tienen
 * programas semanales— no cambien de comportamiento.
 */
export type WeekStructure = ProgramDayLabelStructure

/** ¿La estructura mapea `day_of_week` sobre la semana Lun→Dom? Solo `weekly` (y el default `null`). */
function usesWeekdayGrid(structure: WeekStructure | undefined): boolean {
  return structure !== 'cycle'
}

/** Estado visual de un dot de la semana. `in_progress` = sesion empezada sin cerrar (1–99%). */
export type WeekDotState = 'done' | 'in_progress' | 'today' | 'pending' | 'rest'

/** Un dia de la semana (Lun→Dom) ya resuelto para pintar. */
export interface WeekDot {
  /** Fecha ISO YYYY-MM-DD (huso Santiago). */
  iso: string
  /** Inicial del dia (L M X J V S D). */
  label: string
  state: WeekDotState
}

export interface WeeklyStreak {
  /** 7 dots Lun→Dom. */
  dots: WeekDot[]
  /** Sesiones CERRADAS esta semana (100% de las series); las parciales no suman. */
  doneCount: number
  /** Denominador honesto = dias con plan U dias con sesion (nunca menor que doneCount). */
  plannedCount: number
  /** Copy neutro "3 de 4 esta semana" (o variantes sin denominador). */
  copy: string
  /** Falso cuando no hay nada que mostrar (sin plan ni sesiones) → la UI oculta la racha. */
  hasSignal: boolean
}

/** Iniciales Lun→Dom (es), indexadas 0=Lunes..6=Domingo. */
export const WEEK_LETTERS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Dia de la semana 1..7 (1=Lunes..7=Domingo) de un ISO YYYY-MM-DD, estable via mediodia UTC. */
function isoWeekday1to7(iso: string): number {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0=Dom..6=Sab
  return dow === 0 ? 7 : dow
}

/**
 * Las 7 fechas ISO (Lun→Dom) de la semana que contiene `todayIso` (ya en huso Santiago). Se ancla al lunes
 * restando (weekday-1) dias; toda la aritmetica pasa por `isoDateAddDays` (mediodia UTC, sin drift de TZ).
 */
export function weekDatesMondayToSunday(todayIso: string): string[] {
  const monday = isoDateAddDays(todayIso, -(isoWeekday1to7(todayIso) - 1))
  return Array.from({ length: 7 }, (_, i) => isoDateAddDays(monday, i))
}

/** Fila minima de plan que consumen los helpers de la semana. */
export interface WeekPlanRow {
  day_of_week: number | null
  assigned_date: string | null
  /** `null` = plan SUELTO. OPCIONAL: el ejecutor lee los planes ANIDADOS del programa activo y no lo trae. */
  program_id?: string | null
}

/**
 * ¿Este plan resuelve su dia por `assigned_date`? SOLO el plan SUELTO de fecha fija. Un plan de PROGRAMA
 * se identifica SIEMPRE por su `day_of_week`: el builder estampaba `assigned_date = program.start_date`
 * en TODOS los dias del programa, asi que durante la semana del start_date los 4 dias caian en el MISMO
 * slot y la semana entera colapsaba (incidente 2026-08-25). Un plan con `day_of_week` nunca es suelto,
 * asi que el descarte funciona igual cuando el caller no trae `program_id`.
 */
function usesAssignedDate(plan: WeekPlanRow): boolean {
  return plan.program_id == null && plan.day_of_week == null
}

/**
 * Dias de la semana con plan, a partir de las filas de plan del alumno. Un dia cuenta si algun plan cae en
 * su `day_of_week` (1..7) o su `assigned_date` coincide con la fecha (plan suelto de fecha fija).
 *
 * En `cycle` devuelve SIEMPRE vacio (R12): no existe el dia asignado del calendario, asi que la tira
 * queda con dias entrenados y sin pendientes.
 */
export function plannedDatesForWeek(plans: WeekPlanRow[], weekDates: string[], structure?: WeekStructure): Set<string> {
  const planned = new Set<string>()
  if (!usesWeekdayGrid(structure)) return planned
  for (const iso of weekDates) {
    const dow = isoWeekday1to7(iso)
    if (plans.some((p) => p.day_of_week === dow || (usesAssignedDate(p) && p.assigned_date === iso))) {
      planned.add(iso)
    }
  }
  return planned
}

/**
 * FUENTE de completitud por (plan, dia) que consume el greedy. Reemplaza al viejo `workoutPlanDays`
 * (Set de claves `planId|ymd` = "hay >=1 log"), que era la copia RN del concepto de "hecho" y mentia con
 * una sola serie registrada:
 *   · `blocksByPlan` — bloques VIGENTES de cada plan (`{ id, sets }`), el denominador del dia.
 *   · `loggedSetsByPlanDay` — series registradas por dia calendario Santiago: clave `planId|ymd` →
 *     `{ [blockId]: cantidad }` (armado con `countLoggedSetsByBlock` del engine, que ya deduplica por
 *     `(block_id, set_number)`).
 *   · `skippedBlockIdsByPlanDay` (OPCIONAL) — bloques que el alumno declaro OMITIDOS ese dia, clave
 *     `planId|ymd` → ids (armado con `skippedBlockIdsFromLogs` del engine). Cada uno resuelve su
 *     bloque entero: sin esto un dia cerrado a base de omisiones se veria eternamente "a medias".
 * Un plan/dia ausente en los mapas simplemente no tiene series ⇒ `none`.
 */
export interface PlanWeekCompletionSource {
  blocksByPlan: ReadonlyMap<string, readonly DayCompletionBlock[]>
  loggedSetsByPlanDay: ReadonlyMap<string, Readonly<Record<string, number>>>
  skippedBlockIdsByPlanDay?: ReadonlyMap<string, readonly string[]>
}

/** Estado de completitud de UN plan en UN dia calendario, via la regla unica del engine. */
export function planDayCompletionState(
  source: PlanWeekCompletionSource,
  planId: string,
  dateIso: string,
): DayCompletionState {
  const key = `${planId}|${dateIso}`
  return deriveDayCompletion({
    blocks: source.blocksByPlan.get(planId) ?? [],
    loggedSetsByBlock: source.loggedSetsByPlanDay.get(key) ?? {},
    skippedBlockIds: source.skippedBlockIdsByPlanDay?.get(key),
  }).state
}

/** Resultado de la atribucion greedy de UN dia del programa. */
export interface GreedyPlanDay {
  /** Estado del dia ya atribuido (`none` incluye los dias futuros). */
  state: DayCompletionState
  /**
   * Fecha ISO de la sesion que se atribuye a este dia cuando NO ocurrio en su propia fecha
   * (recuperacion/adelanto); `null` si la sesion es de su fecha o si no hay sesion. Aplica tanto al dia
   * cerrado (`done` → copy "Hecho el jueves") como al parcial (`in_progress` → sheet "Entrenamiento
   * incompleto" sobre esa fecha).
   */
  doneOnDate: string | null
}

/**
 * ATRIBUCION GREEDY POR PLAN (nucleo PURO compartido) — espejo del fix web `weekPendingWorkouts.ts`
 * (deriveWeekWorkoutStatus, CEO decision 10 2026-07-22) colapsado al modelo plan-por-slot del movil:
 * cada plan ocupa UN slot (su `day_of_week`/`assigned_date`), asi las Fases 1 y 2 del web colapsan por
 * plan. Los dias FUTUROS nunca son elegibles.
 *
 * Con la regla de completitud (spec `workout-day-in-progress`) el greedy CIERRA un dia solo con `done`
 * (100% de las series), y `in_progress` queda como senal de que la sesion existe pero no se cerro.
 * Precedencia, en orden:
 *   1. Su PROPIA fecha al 100% → `done` en fecha (doneOnDate null).
 *   2. Otra fecha de la semana al 100% (la mas antigua) → `done` recuperado (doneOnDate).
 *   3. Su propia fecha a medias → `in_progress` en fecha.
 *   4. Otra fecha a medias (la mas antigua) → `in_progress` con esa fecha.
 *   5. Nada → `none`.
 * Un parcial en la propia fecha NUNCA le gana a una sesion COMPLETA del mismo plan en otro dia: si el
 * alumno dejo el lunes a medias y lo rehizo entero el miercoles, el slot del lunes queda hecho.
 *
 * UNICA fuente de verdad del greedy: la usan la home (`home.tsx` planDays / day-cards) y la racha del
 * ejecutor (WeekStreakDots) — sin duplicar la logica.
 */
export function greedyPlanDone(
  planId: string,
  slotDateIso: string,
  isFuture: boolean,
  weekDates: string[],
  source: PlanWeekCompletionSource,
): GreedyPlanDay {
  if (isFuture) return { state: 'none', doneOnDate: null }
  const ownState = planDayCompletionState(source, planId, slotDateIso)
  if (ownState === 'done') return { state: 'done', doneOnDate: null } // 1 — en fecha, cerrado.
  // Otras fechas de la semana con sesion de ESTE plan, asc (Lun→Dom): la primera coincidencia es la mas
  // antigua, igual que el greedy original.
  const otherDates = weekDates.filter((di) => di !== slotDateIso)
  const doneElsewhere = otherDates.find((di) => planDayCompletionState(source, planId, di) === 'done')
  if (doneElsewhere) return { state: 'done', doneOnDate: doneElsewhere } // 2 — recuperado/adelantado.
  if (ownState === 'in_progress') return { state: 'in_progress', doneOnDate: null } // 3 — a medias hoy/su dia.
  const partialElsewhere = otherDates.find((di) => planDayCompletionState(source, planId, di) === 'in_progress')
  if (partialElsewhere) return { state: 'in_progress', doneOnDate: partialElsewhere } // 4 — a medias otro dia.
  return { state: 'none', doneOnDate: null } // 5 — sin sesion del plan esta semana.
}

/** Slot (fecha ISO de esta semana) que ocupa un plan: su `day_of_week` (1=Lun..7=Dom) mapeado sobre
 *  `weekDates` (Lun→Dom) y, solo cuando el plan no declara dia (suelto de fecha fija, ver
 *  `usesAssignedDate`), su `assigned_date`. `null` si no cae en la semana.
 *  El `day_of_week` va PRIMERO a proposito: con la fecha adelante, los N dias de un programa
 *  —todos con `assigned_date = start_date`— caian en un unico slot (incidente 2026-08-25).
 *
 *  En `cycle` devuelve SIEMPRE `null` (R12): un dia del ciclo no ocupa un slot del calendario. El
 *  wrap `((dow - 1) % 7 + 7) % 7` que habia aca ERA el bug — doblaba los indices 8..14 de un ciclo
 *  largo sobre lunes..domingo. En `weekly` el ISODOW ya es 1..7, asi que el indice es directo y un
 *  valor fuera de rango (dato inconsistente) devuelve `null` en vez de un dia inventado. */
function planSlotDate(plan: WeekPlanRow, weekDates: string[], structure?: WeekStructure): string | null {
  if (!usesWeekdayGrid(structure)) return null
  const dow = plan.day_of_week
  if (dow != null) return dow >= 1 && dow <= 7 ? weekDates[dow - 1] ?? null : null
  if (plan.assigned_date != null && weekDates.includes(plan.assigned_date)) return plan.assigned_date
  return null
}

/** Fechas de la semana por estado bajo la atribucion greedy (las que no aparecen no tienen sesion). */
export interface GreedyWeekStates {
  /** Dias cerrados al 100% (recuperaciones incluidas). */
  doneDates: Set<string>
  /** Dias con sesion parcial (1–99%): ni pendientes ni hechos. */
  inProgressDates: Set<string>
}

/**
 * FECHAS de la semana por estado bajo la atribucion greedy por plan. Espejo greedy del dashboard aplicado
 * al ejecutor: recuperar el lunes un jueves marca el LUNES como done (no el jueves), igual que la web.
 * Alimenta `deriveWeeklyStreak` para que los dots del ejecutor pinten igual que las day-cards de la home,
 * tercera visual incluida.
 */
export function greedyStatesForWeek(
  plans: Array<WeekPlanRow & { id: string }>,
  weekDates: string[],
  todayIso: string,
  source: PlanWeekCompletionSource,
  structure?: WeekStructure,
): GreedyWeekStates {
  const doneDates = new Set<string>()
  const inProgressDates = new Set<string>()
  // `cycle`: ningun plan ocupa slot de calendario ⇒ sets vacios y la tira se pinta con dias
  // entrenados (el caller los aporta), sin greedy ni recuperaciones (R12).
  for (const plan of plans) {
    const slot = planSlotDate(plan, weekDates, structure)
    if (slot == null) continue
    const { state } = greedyPlanDone(plan.id, slot, slot > todayIso, weekDates, source)
    if (state === 'done') doneDates.add(slot)
    else if (state === 'in_progress') inProgressDates.add(slot)
  }
  // Dos planes en el mismo slot (A/B mal armado): uno cerrado gana al parcial, sin dot ambiguo.
  for (const iso of doneDates) inProgressDates.delete(iso)
  return { doneDates, inProgressDates }
}

/**
 * Deriva la racha semanal. Estado por dia (Lun→Dom):
 *   · `done`        — sesion CERRADA (100% de las series esperadas) atribuida a esa fecha.
 *   · `in_progress` — sesion a medias (1–99%): empezada y sin cerrar. Gana a `today` (dice mas).
 *   · `today`       — es hoy y no hay sesion (aun).
 *   · `pending`     — hay plan ese dia (pasado o futuro) y no hay sesion.
 *   · `rest`        — sin plan y sin sesion (descanso).
 * Denominador honesto = |plannedDates ∪ doneDates ∪ inProgressDates| (una sesion extra fuera de plan suma
 * al denominador, asi doneCount nunca supera plannedCount). `doneCount` cuenta SOLO los dias cerrados: un
 * dia a medias ya no infla el "N de M" (era parte de la mentira del incidente P0). Copy neutro, sin culpa.
 */
export function deriveWeeklyStreak(input: {
  weekDates: string[]
  plannedDates: Set<string>
  doneDates: Set<string>
  /** Dias con sesion parcial. Opcional: sin el, la racha se comporta como antes (todo o nada). */
  inProgressDates?: Set<string>
  todayIso: string
}): WeeklyStreak {
  const { weekDates, plannedDates, doneDates, todayIso } = input
  const inProgressDates = input.inProgressDates ?? new Set<string>()
  const expected = new Set<string>(plannedDates)
  for (const iso of doneDates) if (weekDates.includes(iso)) expected.add(iso)
  for (const iso of inProgressDates) if (weekDates.includes(iso)) expected.add(iso)

  const dots: WeekDot[] = weekDates.map((iso, i) => {
    let state: WeekDotState
    if (doneDates.has(iso)) state = 'done'
    else if (inProgressDates.has(iso)) state = 'in_progress'
    else if (iso === todayIso) state = 'today'
    else if (plannedDates.has(iso)) state = 'pending'
    else state = 'rest'
    return { iso, label: WEEK_LETTERS_ES[i], state }
  })

  const doneCount = dots.reduce((n, d) => n + (d.state === 'done' ? 1 : 0), 0)
  const plannedCount = expected.size
  const hasSignal = plannedCount > 0
  const copy = plannedCount > 0
    ? `${doneCount} de ${plannedCount} esta semana`
    : doneCount > 0
      ? `${doneCount} esta semana`
      : 'Sin sesiones esta semana'

  return { dots, doneCount, plannedCount, copy, hasSignal }
}
