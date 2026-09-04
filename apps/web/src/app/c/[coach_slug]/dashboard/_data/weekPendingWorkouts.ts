import {
    buildCycleCompletions,
    countLoggedSetsByBlock,
    deriveDayCompletion,
    programDayLabel,
    resolveCycleCursor,
    skippedBlockIdsFromLogs,
    type CycleCursorPlan,
    type DayCompletionBlock,
    type LoggedSetRow,
    type ProgramDayLabelStructure,
} from '@eva/workout-engine'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

/** Nombres completos 1=Lun … 7=Dom (convención DB). */
const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Fila mínima de plan (espejo de `getClientWorkoutPlans` + filtros del dashboard). */
export type WeekPlanRow = {
    id: string
    title: string
    assigned_date: string | null
    program_id: string | null
    day_of_week: number | null
    week_variant?: string | null
    /**
     * Bloques del plan = DENOMINADOR de la completitud del día (`getClientWorkoutPlans` ampliado).
     * `[]` = el plan REALMENTE no tiene bloques; `undefined`/`null` = el caller no los pidió → se
     * conserva la regla legacy (≥1 serie = hecho). Ver `blocksByPlan` más abajo.
     */
    workout_blocks?: readonly DayCompletionBlock[] | null
}

export type WeekLogRow = LoggedSetRow & {
    logged_at: string
    workout_blocks: { plan_id: string | null } | null
}

export type WeekProgramRow = {
    id: string
    ab_mode?: boolean | null
    start_date?: string | null
    weeks_to_repeat?: number | null
    /**
     * Estructura del programa (spec `docs/specs/ciclo-real-y-por-lado`). OPCIONAL: ausente ⇒ `weekly`,
     * o sea la grilla Lun→Dom de siempre. `getActiveProgram` ya la entrega estrechada, así que los dos
     * callers (`ActiveProgramSection`, `week-status.queries`) pasan la fila sin casts.
     */
    program_structure_type?: 'weekly' | 'cycle' | null
    /** Largo del ciclo 1..14 (R8). `null` en weekly y en ciclos legacy sin el campo. */
    cycle_length?: number | null
    /** Inicio flexible OPT-IN (R2): con `start_date` nulo el programa "no empezó" (R30). */
    start_date_flexible?: boolean | null
    /** Planes anidados de `getActiveProgram` — su `workout_blocks` es la fuente preferente de targets. */
    workout_plans?: ReadonlyArray<{
        id: string
        workout_blocks?: readonly DayCompletionBlock[] | null
    }> | null
}

/** Estado de un día de la semana actual del alumno. */
export type WeekDayStatus =
    /** No hay plan para ese día = descanso (nunca pendiente). */
    | 'rest'
    /** El plan de ese día completó el 100% de sus series en CUALQUIER día de esta semana (atribución al plan). */
    | 'done'
    /**
     * Sesión PARCIAL (1–99% de las series esperadas) en la propia fecha del día: empezado y sin
     * cerrar. Aplica tanto a HOY como a un día pasado (spec `workout-day-in-progress`, CEO O2).
     */
    | 'in_progress'
    /** Es HOY, sin ninguna serie registrada (lo gestiona el hero). */
    | 'today'
    /** Día pasado con plan y sin ninguna serie → recuperable. */
    | 'pending'
    /** Día futuro con plan. */
    | 'upcoming'

export type WeekDay = {
    /**
     * Fecha de la celda. En `cycle` un día NO tiene fecha de calendario: llega la fecha en que se
     * cerró (`done`) o cadena vacía.
     */
    dateIso: string
    /**
     * ISODOW 1..7 en `weekly`; ÍNDICE del ciclo 1..14 en `cycle` — misma dualidad que la columna
     * `workout_plans.day_of_week` que lo alimenta. Nunca se lo interprete como día de la semana sin
     * mirar `mode`; para pintar usá `dayLabel`, que ya resolvió las dos semánticas.
     */
    dayOfWeek: number
    planId: string | null
    title: string | null
    /** `Lun` / `Día 1` — `programDayLabel`, la única etiqueta de día del producto. */
    dayLabel: string
    /** `Lunes` / `Día 1 de 3`. */
    dayLabelLong: string
    /** `Lun` / `D1` — forma de chip (en weekly conserva las 3 letras de hoy, R31). */
    dayChipLabel: string
    status: WeekDayStatus
    isToday: boolean
    /**
     * Si el día quedó `done` por una sesión hecha en OTRO día de esta semana (recuperación),
     * fecha ISO `YYYY-MM-DD` de esa sesión. `null` cuando se hizo en su propia fecha (o no está hecho).
     */
    doneOnDate: string | null
    /**
     * Nombre completo del día de `doneOnDate` (p. ej. "Jueves"), para el copy "Hecho el jueves".
     * `null` en los mismos casos que `doneOnDate`. Campo aditivo: la UI del label llega en E1.6.
     */
    doneOnLabel: string | null
    /**
     * Fracción [0,1] de series esperadas ya registradas EN LA PROPIA FECHA del día (regla del engine).
     * `1` en un día `done` (incluidas las recuperaciones), `0` en descanso / futuro / sin registros.
     * Alimenta copys y a11y ("en progreso, 40%"); nunca decide el estado por su cuenta.
     */
    completionPct: number
}

export type PendingWorkout = {
    planId: string
    title: string
    /** 1=Lun … 7=Dom. */
    dayOfWeek: number
    /** Fecha YYYY-MM-DD de esa ocurrencia en la semana actual. */
    dateIso: string
    /** "Martes". */
    dayLabel: string
    /** "Mar". */
    shortLabel: string
    /** `pending` (cero series) o `in_progress` (empezado y sin cerrar) — cambia el copy del banner. */
    status: Extract<WeekDayStatus, 'pending' | 'in_progress'>
}

export type WeekWorkoutStatus = {
    /**
     * Estructura bajo la que se derivó: `weekly` = grilla de 7 días por fecha; `cycle` = los días del
     * ciclo que devuelve `resolveCycleCursor` (uno por índice, sin fechas). La UI branchea acá en vez
     * de volver a mirar `program_structure_type`.
     */
    mode: 'weekly' | 'cycle'
    /** Los días con su estado: los 7 de la semana actual (Lun→Dom) en `weekly`; los del ciclo en `cycle`. */
    days: WeekDay[]
    /**
     * Días PASADOS con plan que siguen abiertos, del más antiguo al más nuevo: sin ninguna serie
     * (`pending`) o con una sesión PARCIAL (`in_progress`). HOY nunca entra (es trabajo del hero).
     */
    pending: PendingWorkout[]
}

function pad(n: number): string {
    return String(n).padStart(2, '0')
}

/**
 * Deriva el estado de cada día de la semana ACTUAL del alumno y la cola de días PENDIENTES
 * (días pasados de esta semana con plan y sin registro). Función PURA — misma resolución de
 * `dayPlan` / variante A-B que `MomentumCard` y `computeWorkoutScore30d`.
 *
 * COMPLETITUD (spec `workout-day-in-progress`, CEO O2 2026-07-26): un día sólo queda `done` con el
 * 100% de sus series esperadas — la regla vive en `deriveDayCompletion` (`@eva/workout-engine`),
 * única para web y RN. Una sesión de 1–99% deja el día `in_progress` (antes bastaba UNA serie para
 * decir "hecho" y el alumno interrumpido caía al sheet "Ya hiciste este entrenamiento": incidente P0).
 * Sólo las sesiones al 100% participan de la atribución greedy de recuperaciones (cambia el UMBRAL
 * de "cerrado", no la atribución); una sesión parcial marca únicamente SU propia fecha.
 *
 * Atribución al PLAN (fix del gap real, CEO decisión 10, 2026-07-22): un día X queda `done` si SU
 * plan (`dayPlan.id`) tiene una sesión COMPLETA en CUALQUIER día de esta semana Santiago — no sólo en
 * su propia fecha calendario. Así, recuperar el martes un jueves marca el martes (`doneOnDate`/`doneOnLabel` =
 * "Hecho el jueves") y limpia el pendiente. Reglas de la atribución greedy por plan:
 *   1) cada día completado en SU MISMA fecha consume su propio log primero (done "en fecha", sin
 *      `doneOn` ajeno);
 *   2) los logs sobrantes cierran el día PENDIENTE MÁS ANTIGUO del mismo plan (recuperación);
 *      un mismo log jamás marca dos días → plan repetido en 2+ días necesita 1 log por día.
 * Los días FUTUROS nunca son elegibles (jamás `done`). Sólo cuentan logs cuyo día real Santiago cae
 * dentro de estos 7 días (el caller trae más historial del necesario).
 *
 * OJO: esto NO toca `computeWorkoutScore30d`/momentum ni la racha — ésos cuentan la fecha real by
 * design. Es sólo DESCUBRIBILIDAD + estado visual del dashboard; la ejecución no tiene candado de
 * fecha (`/workout/[planId]`). Sin programa activo → semana vacía y cero pendientes (nada cambia).
 *
 * Un día de DESCANSO (sin plan) NUNCA es pendiente. HOY nunca es pendiente (es trabajo del hero).
 */
export function deriveWeekWorkoutStatus(input: {
    /** Fecha local Santiago de hoy (de `getTodayInSantiago().date`). */
    userLocalDate: Date
    /** ISO YYYY-MM-DD de hoy en Santiago. */
    todayIso: string
    program: WeekProgramRow | null
    activePlans: WeekPlanRow[]
    logs: WeekLogRow[]
}): WeekWorkoutStatus {
    const { userLocalDate, todayIso, program, activePlans, logs } = input

    if (!program) {
        return { mode: 'weekly', days: [], pending: [] }
    }

    const abMode = !!program.ab_mode
    const weekIdx = programWeekIndex1Based(program, userLocalDate)
    // Variante EFECTIVA del ciclo (cae a la que tiene planes si A/B mal armado) — idéntica a la
    // que usa el carrusel y la tira, para no divergir en semanas "B" de una sola semana cargada.
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        activePlans.filter((p) => p.program_id === program.id),
        weekIdx,
        userLocalDate
    )

    // CICLO (R12): la semana de calendario no describe nada — el alumno entrena cuando puede y el
    // cursor avanza por completitud. Los 7 slots por fecha se reemplazan por los días del ciclo y no
    // hay «día perdido», así que la cola de recuperables queda vacía.
    if (program.program_structure_type === 'cycle') {
        return deriveCycleProgramStatus({ todayIso, program, activePlans, logs, activeVariant, abMode })
    }

    // Lunes de la semana que contiene hoy (misma fórmula que MomentumCard/WeekCalendar).
    const curr = userLocalDate
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)

    type DaySlot = {
        dateIso: string
        dayOfWeek: number
        dayPlan: WeekPlanRow | null
        isToday: boolean
        isFuture: boolean
    }

    // Paso 1: resolver el plan de cada día de la semana (Lun→Dom) — resolución idéntica a la previa.
    const slots: DaySlot[] = []
    for (let i = 0; i < 7; i++) {
        const d = new Date(curr)
        d.setDate(firstDay + i)
        const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const dDow = d.getDay() === 0 ? 7 : d.getDay()

        // El atajo por fecha es SOLO para planes SUELTOS (su semántica real: "plan de fecha fija").
        // Un plan de PROGRAMA se resuelve SIEMPRE por `day_of_week`: el builder estampaba
        // `assigned_date = program.start_date` en TODOS los días del programa, así que la semana del
        // start_date resolvía a un plan ARBITRARIO (el primero del array) en vez del día que tocaba
        // — el alumno veía otro entreno y su sesión real quedaba huérfana (incidente 2026-08-25).
        const assignedPlan = activePlans.find((p) => p.program_id == null && p.assigned_date === dStr) ?? null
        const programPlan =
            activePlans.find(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === dDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            ) ?? null
        const dayPlan = assignedPlan ?? programPlan

        slots.push({
            dateIso: dStr,
            dayOfWeek: dDow,
            dayPlan,
            isToday: dStr === todayIso,
            isFuture: dStr > todayIso,
        })
    }

    // Paso 2a: targets (denominador) por plan. Mandan los bloques ANIDADOS del programa activo
    // (`getActiveProgram`); los planes SUELTOS aportan los suyos desde el select ampliado de
    // `getClientWorkoutPlans`. Un plan que NO trae la relación (`undefined`) queda fuera del mapa a
    // propósito: ver la regla legacy del paso 2b.
    const blocksByPlan = new Map<string, readonly DayCompletionBlock[]>()
    for (const p of activePlans) {
        if (p.workout_blocks != null) blocksByPlan.set(p.id, p.workout_blocks)
    }
    for (const p of program.workout_plans ?? []) {
        if (p.workout_blocks != null) blocksByPlan.set(p.id, p.workout_blocks)
    }

    // Paso 2b: SESIONES de esta semana, agrupadas por (plan, DÍA Santiago). Sólo los días que caen en
    // los 7 de la semana cuentan (el caller trae más historial del necesario).
    // OJO (fix): la unidad es (plan, DÍA), no el log. `logs` trae UNA fila por SERIE, así que una
    // única sesión de 5 series dejaba 5 elementos y la fase 2 greedy los gastaba cerrando OTROS días
    // del mismo plan con la MISMA sesión (plan repetido Lun+Vie + 5 series el lunes ⇒ el viernes salía
    // "Hecho el lunes"). Deduplicar por día ANTES del greedy conserva la regla "1 sesión ↔ 1 día".
    // Espejo del Set `planId|ymd` de RN (weekly-streak.ts:99 / home.tsx `workoutPlanDays`).
    const weekDateSet = new Set(slots.map((s) => s.dateIso))
    type WeekSession = { planId: string; ymd: string; rows: WeekLogRow[] }
    const sessions = new Map<string, WeekSession>()
    for (const l of logs) {
        const planId = l.workout_blocks?.plan_id
        if (!planId) continue
        const ymd = getSantiagoIsoYmdForUtcInstant(l.logged_at)
        if (!weekDateSet.has(ymd)) continue
        const key = `${planId}|${ymd}`
        const s = sessions.get(key)
        if (s) s.rows.push(l)
        else sessions.set(key, { planId, ymd, rows: [l] })
    }

    // Cada sesión se mide con la regla ÚNICA del engine. Sólo las COMPLETAS entran a la atribución
    // greedy; el `pct` por (plan, día) queda a mano para marcar el estado parcial en su propia fecha.
    const doneDaysByPlan = new Map<string, Set<string>>()
    const pctByPlanDay = new Map<string, number>()
    for (const { planId, ymd, rows } of sessions.values()) {
        const blocks = blocksByPlan.get(planId)
        // REGLA LEGACY de compatibilidad: si el caller no pidió los bloques del plan (`undefined`, no
        // `[]`) no hay denominador que medir, y degradar a "nunca done" convertiría días REALES en
        // pendientes. En ese caso se conserva el comportamiento previo: ≥1 serie = hecho.
        const completion = blocks
            ? deriveDayCompletion({
                  blocks,
                  loggedSetsByBlock: countLoggedSetsByBlock(rows),
                  // OMISIONES (mockup 3 del ejecutor): el alumno puede resolver un bloque declarando que
                  // lo omite. Esa fila NO es una serie entrenada (`countLoggedSetsByBlock` la ignora), así
                  // que sin esto un día cerrado a base de omisiones se quedaría eternamente parcial en el
                  // panel del coach — pendiente ámbar incluido. Requiere que el caller traiga `metadata`
                  // en el select de `workout_logs` (ver `WeekLogRow`); sin la columna el array es vacío y
                  // el comportamiento es idéntico al histórico.
                  skippedBlockIds: skippedBlockIdsFromLogs(rows),
              })
            : { state: 'done' as const, pct: 1 }
        pctByPlanDay.set(`${planId}|${ymd}`, completion.pct)
        if (completion.state !== 'done') continue
        const set = doneDaysByPlan.get(planId)
        if (set) set.add(ymd)
        else doneDaysByPlan.set(planId, new Set([ymd]))
    }
    const weekLogsByPlan = new Map<string, string[]>()
    for (const [planId, set] of doneDaysByPlan) weekLogsByPlan.set(planId, [...set].sort())

    // Paso 3: atribución greedy por plan (sólo sesiones COMPLETAS). `doneOnByDate` mapea el día
    // cerrado → fecha real de la sesión que lo cerró (`null` = hecho en su propia fecha). Los días
    // futuros nunca son elegibles.
    const doneOnByDate = new Map<string, string | null>()
    const slotsByPlan = new Map<string, DaySlot[]>()
    for (const s of slots) {
        if (s.isFuture || !s.dayPlan) continue
        const arr = slotsByPlan.get(s.dayPlan.id)
        if (arr) arr.push(s)
        else slotsByPlan.set(s.dayPlan.id, [s])
    }
    for (const [planId, planSlots] of slotsByPlan) {
        const remaining = [...(weekLogsByPlan.get(planId) ?? [])] // fechas ymd asc
        if (remaining.length === 0) continue

        // Fase 1: match exacto en la propia fecha (completado en su día) — consume su log primero.
        for (const s of planSlots) {
            const idx = remaining.indexOf(s.dateIso)
            if (idx !== -1) {
                remaining.splice(idx, 1)
                doneOnByDate.set(s.dateIso, null)
            }
        }
        // Fase 2: logs sobrantes → día pendiente más antiguo del plan sin cerrar (recuperación).
        let li = 0
        for (const s of planSlots) {
            if (li >= remaining.length) break
            if (doneOnByDate.has(s.dateIso)) continue
            doneOnByDate.set(s.dateIso, remaining[li])
            li++
        }
    }

    const dowByDate = new Map(slots.map((s) => [s.dateIso, s.dayOfWeek]))

    const days: WeekDay[] = slots.map((s) => {
        const isDone = !!s.dayPlan && doneOnByDate.has(s.dateIso)
        const doneOnDate = isDone ? (doneOnByDate.get(s.dateIso) ?? null) : null
        // Sesión PARCIAL en la PROPIA fecha del día: las recuperaciones parciales no marcan días
        // ajenos (la atribución greedy sigue siendo sólo de sesiones completas — SPEC no-objetivos).
        const ownPct =
            s.dayPlan && !s.isFuture ? (pctByPlanDay.get(`${s.dayPlan.id}|${s.dateIso}`) ?? 0) : 0
        const isPartial = !isDone && ownPct > 0

        let status: WeekDayStatus
        if (!s.dayPlan) status = 'rest'
        else if (isDone) status = 'done'
        else if (isPartial) status = 'in_progress'
        else if (s.isToday) status = 'today'
        else if (s.isFuture) status = 'upcoming'
        else status = 'pending'

        const doneOnLabel = doneOnDate ? DAY_NAMES_FULL[(dowByDate.get(doneOnDate) ?? 1) - 1] : null

        return {
            dateIso: s.dateIso,
            dayOfWeek: s.dayOfWeek,
            planId: s.dayPlan?.id ?? null,
            title: s.dayPlan?.title ?? null,
            dayLabel: programDayLabel(s.dayOfWeek, 'weekly', null, { form: 'short' }),
            dayLabelLong: programDayLabel(s.dayOfWeek, 'weekly', null, { form: 'long' }),
            dayChipLabel: programDayLabel(s.dayOfWeek, 'weekly', null, { form: 'chip' }),
            status,
            isToday: s.isToday,
            doneOnDate,
            doneOnLabel,
            completionPct: isDone ? 1 : ownPct,
        }
    })

    // Cola de abiertos: día pasado sin nada (`pending`) o empezado a medias (`in_progress`). HOY
    // queda fuera aunque esté a medias — el hero es el dueño del día en curso.
    const pending: PendingWorkout[] = days
        .filter(
            (d): d is WeekDay & { planId: string; title: string; status: 'pending' | 'in_progress' } =>
                (d.status === 'pending' || d.status === 'in_progress') && !d.isToday && !!d.planId
        )
        .sort((a, b) => (a.dateIso < b.dateIso ? -1 : 1))
        .map((d) => ({
            planId: d.planId,
            title: d.title,
            dayOfWeek: d.dayOfWeek,
            dateIso: d.dateIso,
            dayLabel: DAY_NAMES_FULL[d.dayOfWeek - 1],
            shortLabel: DAY_NAMES_SHORT[d.dayOfWeek - 1],
            status: d.status,
        }))

    return { mode: 'weekly', days, pending }
}

/**
 * Estado de los días de un programa `cycle` (spec `docs/specs/ciclo-real-y-por-lado`, R12).
 *
 * Acá NO hay semana ni fechas: los días salen de `resolveCycleCursor` —el único dueño de "hoy toca"—
 * alimentado por `buildCycleCompletions`, el mismo par que consumen el hero web y RN. Un ciclo no
 * tiene «día perdido» (el índice no vence: el alumno entrena cuando puede y el cursor avanza al
 * cerrar el día), así que la cola de pendientes/recuperables es SIEMPRE vacía y el
 * `WorkoutRecoverBanner` no se monta. No se inventa una fecha de calendario para los días no hechos:
 * `dateIso` sólo trae la fecha real de la sesión que cerró un día.
 */
function deriveCycleProgramStatus(input: {
    todayIso: string
    program: WeekProgramRow
    activePlans: WeekPlanRow[]
    logs: WeekLogRow[]
    activeVariant: 'A' | 'B'
    abMode: boolean
}): WeekWorkoutStatus {
    const { todayIso, program, activePlans, logs, activeVariant, abMode } = input
    const structure: ProgramDayLabelStructure = 'cycle'
    const cycleLength = program.cycle_length ?? null

    // Planes del programa EN EL ORDEN RECIBIDO: el motor no reordena ni re-filtra (C18).
    const programPlans = activePlans.filter(
        (p) => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode)
    )
    const cursorPlans: CycleCursorPlan[] = programPlans.map((p) => ({
        id: p.id,
        day_of_week: p.day_of_week,
        title: p.title,
    }))

    // Denominador por plan — mismas dos fuentes que la rama weekly (planes sueltos + anidados).
    const blocksByPlan: Record<string, readonly DayCompletionBlock[]> = {}
    for (const p of activePlans) if (p.workout_blocks != null) blocksByPlan[p.id] = p.workout_blocks
    for (const p of program.workout_plans ?? []) if (p.workout_blocks != null) blocksByPlan[p.id] = p.workout_blocks

    const { completions, inProgress } = buildCycleCompletions({
        plans: cursorPlans,
        blocksByPlan,
        logs,
        todayIso,
    })
    const cursor = resolveCycleCursor({
        program: {
            program_structure_type: 'cycle',
            cycle_length: cycleLength,
            start_date: program.start_date ?? null,
            start_date_flexible: program.start_date_flexible ?? null,
        },
        plans: cursorPlans,
        completions,
        inProgress,
        todayIso,
    })

    const planById = new Map(programPlans.map((p) => [p.id, p]))
    // El cursor da el ESTADO del día en curso, no su fracción: la fracción se mide con la misma regla
    // del motor que usa la rama weekly, sobre los logs de HOY de ese plan.
    const inProgressPct = inProgress ? dayCompletionPct(inProgress.planId, todayIso, blocksByPlan, logs) : 0

    const days: WeekDay[] = cursor.slots.map((slot) => {
        const isTodaySlot = slot.state === 'today'
        const isInProgress = isTodaySlot && cursor.todayState === 'in_progress'
        const status: WeekDayStatus =
            slot.state === 'done' ? 'done' : isInProgress ? 'in_progress' : isTodaySlot ? 'today' : 'upcoming'

        return {
            dateIso: slot.doneDateIso ?? '',
            dayOfWeek: slot.cycleIndex,
            planId: slot.planId,
            title: planById.get(slot.planId)?.title ?? null,
            dayLabel: programDayLabel(slot.cycleIndex, structure, cycleLength, { form: 'short' }),
            dayLabelLong: programDayLabel(slot.cycleIndex, structure, cycleLength, { form: 'long' }),
            dayChipLabel: programDayLabel(slot.cycleIndex, structure, cycleLength, { form: 'chip' }),
            status,
            isToday: isTodaySlot,
            // «Hecho el jueves» es un concepto de calendario: en ciclo no hay día ajeno que recuperar.
            doneOnDate: null,
            doneOnLabel: null,
            completionPct: slot.state === 'done' ? 1 : isInProgress ? inProgressPct : 0,
        }
    })

    return { mode: 'cycle', days, pending: [] }
}

/** Fracción [0,1] del día `dateIso` para `planId`, con la regla única del motor. */
function dayCompletionPct(
    planId: string,
    dateIso: string,
    blocksByPlan: Record<string, readonly DayCompletionBlock[]>,
    logs: WeekLogRow[]
): number {
    const blocks = blocksByPlan[planId]
    if (!blocks || blocks.length === 0) return 0
    const blockIds = new Set(blocks.map((b) => b.id))
    // El enlace bloque→plan manda (mismo criterio que `buildCycleCompletions`); el `plan_id` del join
    // sólo cubre el bloque que el coach borró del plan después de la sesión.
    const rows = logs.filter((l) => {
        if (getSantiagoIsoYmdForUtcInstant(l.logged_at) !== dateIso) return false
        if (l.block_id != null && blockIds.has(l.block_id)) return true
        return l.workout_blocks?.plan_id === planId
    })
    if (rows.length === 0) return 0
    return deriveDayCompletion({
        blocks,
        loggedSetsByBlock: countLoggedSetsByBlock(rows),
        skippedBlockIds: skippedBlockIdsFromLogs(rows),
    }).pct
}
