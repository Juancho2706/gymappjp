import { parseISO, subDays } from 'date-fns'
import { getNutritionDayOfWeekFromIsoYmdInSantiago, getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

/** Minimal plan row for adherence (matches `getClientWorkoutPlans` + filters). */
export type AdherencePlanRow = {
    id: string
    assigned_date: string | null
    program_id: string | null
    day_of_week: number | null
    week_variant?: string | null
}

export type AdherenceLogRow = {
    logged_at: string
    workout_blocks: { plan_id: string | null } | null
}

export type AdherenceProgramRow = {
    id: string
    ab_mode?: boolean | null
    start_date?: string | null
    weeks_to_repeat?: number | null
    /**
     * Estructura del programa (spec `docs/specs/ciclo-real-y-por-lado`, R12). OPCIONAL: ausente ⇒
     * `weekly`, o sea el comportamiento histórico byte a byte.
     */
    program_structure_type?: 'weekly' | 'cycle' | null
    /** Inicio flexible OPT-IN (R2). Con `start_date` nulo define el estado "no empezó" (R30). */
    start_date_flexible?: boolean | null
}

/**
 * Rolling 30 calendar days in Santiago ending `todaySantiagoIso`:
 * among days that have an assigned or program workout, what share had ≥1 log that day for that plan.
 *
 * SIN META SEMANAL EN CICLO (R12, spec `ciclo-real-y-por-lado`): en un programa `cycle` el "día
 * planificado" no existe —el alumno entrena cuando puede y el cursor avanza por completitud, no por
 * calendario—, y una meta semanal de sesiones es un no-objetivo declarado del tren. Contar los días
 * de semana que coinciden con el ÍNDICE del ciclo daba un porcentaje falso (un ciclo de 3 sólo
 * "tenía planificado" lun/mar/mié y entrenar jueves no sumaba), así que acá se devuelve
 * `score: null` — nunca un 0 % que castigue al alumno por entrenar el día que quiso. Los tres
 * consumidores del score pintan «—». Lo mismo vale para el programa que todavía NO empezó
 * (`programState: 'not_started'` del motor: inicio flexible sin fecha fijada).
 *
 * `completedDays` sigue informando: días con ≥ 1 log DEL PROGRAMA en la ventana (enlace bloque→plan;
 * un log con `block_id`/`plan_id` nulo es neutro, R29). `plannedDays` queda en 0 porque no hay
 * denominador honesto que declarar.
 */
export function computeWorkoutScore30d(input: {
    todaySantiagoIso: string
    activePlans: AdherencePlanRow[]
    program: AdherenceProgramRow | null
    logs: AdherenceLogRow[]
}): { plannedDays: number; completedDays: number; score: number | null } {
    const abMode = !!input.program?.ab_mode
    const anchor = parseISO(`${input.todaySantiagoIso}T12:00:00.000Z`)

    const prog0 = input.program
    const isCycle = prog0?.program_structure_type === 'cycle'
    // Espejo EXACTO de la regla R30 del motor (`resolveCycleCursor`): "no empezó" es inicio flexible
    // SIN fecha fijada, nunca `start_date == null` a secas (un weekly sin fecha sigue puntuando).
    const notStarted = !!prog0 && prog0.start_date_flexible === true && prog0.start_date == null
    if (prog0 && (isCycle || notStarted)) {
        return { plannedDays: 0, completedDays: countProgramLogDays30(input, anchor), score: null }
    }

    let plannedDays = 0
    let completedDays = 0

    for (let i = 0; i < 30; i++) {
        const instant = subDays(anchor, i)
        const iso = getSantiagoIsoYmdForUtcInstant(instant.toISOString())
        const dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)
        // Only LOOSE plans resolve by date: a program plan always resolves by `day_of_week` (the
        // builder used to stamp `assigned_date = program.start_date` on every day of the program, so
        // the start_date day matched an arbitrary plan and poisoned the whole 30d window).
        const assignedPlan = input.activePlans.find((p) => p.program_id == null && p.assigned_date === iso) ?? null

        let programPlan: AdherencePlanRow | null = null
        const prog = input.program
        if (prog) {
            const weekIdx = programWeekIndex1Based(prog, instant)
            // Variante EFECTIVA: alinea el conteo de "días planificados" con lo que el alumno
            // realmente ve (si A/B mal armado cae a la variante con planes), evitando un score
            // 0 artificial en semanas "B" de un programa con una sola semana cargada.
            const activeVariant = resolveEffectiveWeekVariant(
                prog,
                input.activePlans.filter((p) => p.program_id === prog.id),
                weekIdx,
                instant
            )
            programPlan =
                input.activePlans.find(
                    (p) =>
                        p.program_id === prog.id &&
                        p.day_of_week === dow &&
                        workoutPlanMatchesVariant(p, activeVariant, abMode)
                ) ?? null
        }

        const dayPlan = assignedPlan ?? programPlan
        if (!dayPlan) continue

        plannedDays++
        const done = input.logs.some(
            (l) =>
                l.workout_blocks?.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === iso
        )
        if (done) completedDays++
    }

    const score = plannedDays > 0 ? Math.min(100, Math.round((completedDays / plannedDays) * 100)) : 0
    return { plannedDays, completedDays, score }
}

/**
 * Días distintos de la ventana de 30 días con ≥ 1 log DEL PROGRAMA (R29: el enlace bloque→plan es el
 * que decide; un log sin `plan_id` es neutro). Es lo único informable cuando no hay denominador.
 */
function countProgramLogDays30(
    input: { activePlans: AdherencePlanRow[]; program: AdherenceProgramRow | null; logs: AdherenceLogRow[] },
    anchor: Date
): number {
    const programId = input.program?.id
    if (!programId) return 0
    const programPlanIds = new Set(
        input.activePlans.filter((p) => p.program_id === programId).map((p) => p.id)
    )
    if (programPlanIds.size === 0) return 0

    const windowDays = new Set<string>()
    for (let i = 0; i < 30; i++) {
        windowDays.add(getSantiagoIsoYmdForUtcInstant(subDays(anchor, i).toISOString()))
    }

    const daysWithLog = new Set<string>()
    for (const l of input.logs) {
        const planId = l.workout_blocks?.plan_id
        if (!planId || !programPlanIds.has(planId)) continue
        const iso = getSantiagoIsoYmdForUtcInstant(l.logged_at)
        if (windowDays.has(iso)) daysWithLog.add(iso)
    }
    return daysWithLog.size
}
