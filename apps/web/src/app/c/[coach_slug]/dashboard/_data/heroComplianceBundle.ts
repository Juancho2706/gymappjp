import { cache } from 'react'
import {
    getActiveProgram,
    getCheckInHistory30Days,
    getClientWorkoutPlans,
    getNutritionLogDays30,
    getRecentWorkoutLogs,
    getWorkoutPlanBlocksForHero,
} from './dashboard.queries'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import type { HeroBlock } from '../_components/hero/WorkoutHeroCard'
import type { AdherenceProgramRow } from '@/lib/workout/workoutAdherence30d'
import { computeWorkoutScore30d } from '@/lib/workout/workoutAdherence30d'

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export type HeroComplianceBundle = {
    hero: {
        hasWorkout: boolean
        planId: string | null
        planTitle: string | null
        blocks: HeroBlock[]
        isAlreadyLogged: boolean
        totalSetsTarget: number
        totalSetsLogged: number
        baseLoggedPerBlock: Record<string, number>
        nextWorkoutTitle: string | null
        nextWorkoutDayLabel: string | null
    }
    scores: {
        workoutScore: number
        nutritionScore: number
        checkInScore: number
        /** §10: sin `daily_nutrition_logs` en 30d → anillo gris "Sin datos". */
        nutritionHasLogs: boolean
    }
}

export const getHeroComplianceBundle = cache(async (userId: string, _coachSlug: string): Promise<HeroComplianceBundle> => {
    const [program, allPlans, logs, checkInHistory, nutritionDays] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
        getCheckInHistory30Days(userId),
        getNutritionLogDays30(userId),
    ])
    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program?.id)

    const todayCtx = getTodayInSantiago()
    const { date: userLocalDate, iso: today, dayOfWeek: todayDow } = todayCtx
    const abMode = !!program?.ab_mode
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    const activeVariant = resolveActiveWeekVariantForDisplay(program, weekIdx, userLocalDate)

    let todayPlan = activePlans.find((p) => p.assigned_date === today) ?? null
    if (!todayPlan && program) {
        todayPlan =
            activePlans.find(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === todayDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            ) ?? null
    }

    const nestedPlan = program?.workout_plans?.find((p) => p.id === todayPlan?.id)
    let blocksRaw = nestedPlan?.workout_blocks ?? []
    if (todayPlan?.id && blocksRaw.length === 0) {
        const fullPlan = await getWorkoutPlanBlocksForHero(userId, todayPlan.id)
        const wb = (fullPlan as { workout_blocks?: typeof blocksRaw } | null)?.workout_blocks
        if (Array.isArray(wb) && wb.length > 0) {
            blocksRaw = wb
        }
    }
    const blocks: HeroBlock[] = blocksRaw.map((b) => ({
        id: b.id,
        sets: b.sets,
        reps: b.reps,
        exercise: { name: b.exercises?.name ?? 'Ejercicio' },
    }))

    const blockIdsToday = new Set(blocks.map((b) => b.id))
    const blockById = new Map(blocks.map((b) => [b.id, b]))
    const logsForPlanToday =
        todayPlan && blockIdsToday.size > 0
            ? logs.filter(
                  (l) =>
                      l.workout_blocks?.plan_id === todayPlan!.id &&
                      getSantiagoIsoYmdForUtcInstant(l.logged_at) === today &&
                      blockIdsToday.has(l.block_id)
              )
            : []
    const seenSetKeys = new Set<string>()
    const setsPerBlock: Record<string, number> = {}
    for (const l of logsForPlanToday) {
        const b = blockById.get(l.block_id)
        if (!b) continue
        if (l.set_number < 1 || l.set_number > b.sets) continue
        const key = `${l.block_id}:${l.set_number}`
        if (seenSetKeys.has(key)) continue
        seenSetKeys.add(key)
        setsPerBlock[l.block_id] = (setsPerBlock[l.block_id] ?? 0) + 1
    }
    const totalSetsTarget = blocks.reduce((s, b) => s + b.sets, 0)
    const totalSetsLogged = Object.values(setsPerBlock).reduce((a, b) => a + b, 0)
    const isAlreadyLogged = totalSetsTarget > 0 && totalSetsLogged >= totalSetsTarget

    let nextTitle: string | null = null
    let nextLabel: string | null = null
    if (!todayPlan && program) {
        const candidates = activePlans
            .filter(
                (p) =>
                    p.program_id === program.id &&
                    (p.day_of_week ?? 0) > todayDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            )
            .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
        const next = candidates[0]
        if (next) {
            nextTitle = next.title
            nextLabel = next.day_of_week === todayDow + 1 ? 'Mañana' : DAY_NAMES[(next.day_of_week ?? 1) - 1]
        }
    }

    const { score: workoutScore } = computeWorkoutScore30d({
        todaySantiagoIso: today,
        activePlans,
        program: program as AdherenceProgramRow | null,
        logs,
    })

    const checkInsLast30 = checkInHistory.length
    const checkInScore = Math.min(100, Math.round((checkInsLast30 / 4) * 100))

    const nutritionHasLogs = nutritionDays > 0
    const nutritionScore = nutritionHasLogs ? Math.min(100, Math.round((nutritionDays / 30) * 100)) : 0

    return {
        hero: {
            hasWorkout: !!todayPlan,
            planId: todayPlan?.id ?? null,
            planTitle: todayPlan?.title ?? null,
            blocks,
            isAlreadyLogged,
            totalSetsTarget,
            totalSetsLogged,
            baseLoggedPerBlock: setsPerBlock,
            nextWorkoutTitle: nextTitle,
            nextWorkoutDayLabel: nextLabel,
        },
        scores: {
            workoutScore,
            nutritionScore,
            checkInScore,
            nutritionHasLogs,
        },
    }
})
