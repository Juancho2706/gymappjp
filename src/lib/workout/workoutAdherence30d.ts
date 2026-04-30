import { parseISO, subDays } from 'date-fns'
import { getNutritionDayOfWeekFromIsoYmdInSantiago, getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
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
}

/**
 * Rolling 30 calendar days in Santiago ending `todaySantiagoIso`:
 * among days that have an assigned or program workout, what share had ≥1 log that day for that plan.
 */
export function computeWorkoutScore30d(input: {
    todaySantiagoIso: string
    activePlans: AdherencePlanRow[]
    program: AdherenceProgramRow | null
    logs: AdherenceLogRow[]
}): { plannedDays: number; completedDays: number; score: number } {
    const abMode = !!input.program?.ab_mode
    const anchor = parseISO(`${input.todaySantiagoIso}T12:00:00.000Z`)

    let plannedDays = 0
    let completedDays = 0

    for (let i = 0; i < 30; i++) {
        const instant = subDays(anchor, i)
        const iso = getSantiagoIsoYmdForUtcInstant(instant.toISOString())
        const dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)
        const assignedPlan = input.activePlans.find((p) => p.assigned_date === iso) ?? null

        let programPlan: AdherencePlanRow | null = null
        const prog = input.program
        if (prog) {
            const weekIdx = programWeekIndex1Based(prog, instant)
            const activeVariant = resolveActiveWeekVariantForDisplay(prog, weekIdx, instant)
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
