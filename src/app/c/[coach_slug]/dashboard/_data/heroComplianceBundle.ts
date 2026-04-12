import { cache } from 'react'
import { format, subDays } from 'date-fns'
import {
    getActiveProgram,
    getCheckInHistory30Days,
    getClientWorkoutPlans,
    getNutritionLogDays30,
    getRecentWorkoutLogs,
} from './dashboard.queries'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import type { HeroBlock } from '../_components/hero/WorkoutHeroCard'

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

function parseISOAnchor(iso: string) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0)
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
    const blocksRaw = nestedPlan?.workout_blocks ?? []
    const blocks: HeroBlock[] = blocksRaw.map((b) => ({
        id: b.id,
        sets: b.sets,
        reps: b.reps,
        exercise: { name: b.exercises?.name ?? 'Ejercicio' },
    }))

    const blockIds = new Set(blocks.map((b) => b.id))
    const logsToday = logs.filter((l) => l.logged_at.startsWith(today) && blockIds.has(l.block_id))
    const setsPerBlock: Record<string, number> = {}
    for (const l of logsToday) {
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

    const anchor = parseISOAnchor(today)
    let plannedDays = 0
    const logDates = new Set(logs.map((l) => l.logged_at.split('T')[0]))
    for (let i = 0; i < 30; i++) {
        const d = subDays(anchor, i)
        const iso = format(d, 'yyyy-MM-dd')
        const dow = d.getDay() === 0 ? 7 : d.getDay()
        const hasAssigned = activePlans.some((p) => p.assigned_date === iso)
        const hasProg =
            !!program &&
            activePlans.some(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === dow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            )
        if (hasAssigned || hasProg) {
            plannedDays++
        }
    }
    /** §10 maestro: días únicos con log / días con plan previstos (cap 100). */
    const loggedDaysCount = logDates.size
    const workoutScore = plannedDays > 0 ? Math.min(100, Math.round((loggedDaysCount / plannedDays) * 100)) : 0

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
