import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import {
    getActiveProgram,
    getCheckInHistory30Days,
    getClientWorkoutPlans,
    getNutritionAdherenceInputs30d,
    getNutritionLogDays30,
    getRecentWorkoutLogs,
    getWorkoutPlanBlocksForHero,
} from './dashboard.queries'
import {
    getNutritionDayOfWeekFromIsoYmdInSantiago,
    getSantiagoIsoYmdForUtcInstant,
    getTodayInSantiago,
} from '@/lib/date-utils'
import {
    computeNutritionAdherence,
    normalizeMealForMacros,
    type AdherenceMeal,
    type MacroTarget,
    type MealLogRow,
} from '@eva/nutrition-engine'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
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
        /**
         * ENGAGEMENT de registro: días con `daily_nutrition_log` / 30 * 100.
         * NO es cumplimiento de comidas — mide cuántos días el alumno registró algo.
         */
        nutritionEngagementScore: number
        /**
         * CUMPLIMIENTO real de comidas (motor canónico `computeNutritionAdherence`):
         * sum(comidas completadas) / sum(comidas aplicables) en 30d. `null` cuando el
         * alumno no tiene plan activo (no se puede calcular adherencia sin plan).
         */
        nutritionComplianceScore: number | null
        checkInScore: number
        /** §10: sin `daily_nutrition_logs` en 30d → anillo gris "Sin datos". */
        nutritionHasLogs: boolean
    }
}

export const getHeroComplianceBundle = cache(async (userId: string, _coachSlug: string): Promise<HeroComplianceBundle> => {
    const [program, allPlans, logs, checkInHistory, nutritionDays, nutritionAdherenceInputs] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
        getCheckInHistory30Days(userId),
        getNutritionLogDays30(userId),
        getNutritionAdherenceInputs30d(userId),
    ])
    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program?.id)

    const todayCtx = getTodayInSantiago()
    const { date: userLocalDate, iso: today, dayOfWeek: todayDow } = todayCtx
    const abMode = !!program?.ab_mode
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    // Variante EFECTIVA: si la del ciclo no tiene planes (A/B mal armado) cae a la que sí tiene,
    // para que el hero "hoy / próximo entreno" no quede vacío en semanas "B" de una sola semana cargada.
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        program ? activePlans.filter((p) => p.program_id === program.id) : [],
        weekIdx,
        userLocalDate
    )

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
    // ENGAGEMENT de registro (días con log / 30) — NO es cumplimiento de comidas.
    const nutritionEngagementScore = nutritionHasLogs
        ? Math.min(100, Math.round((nutritionDays / 30) * 100))
        : 0

    // CUMPLIMIENTO real de comidas vía el motor canónico (sum done / sum aplicables).
    const nutritionComplianceScore = computeNutritionComplianceScore(nutritionAdherenceInputs)

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
            nutritionEngagementScore,
            nutritionComplianceScore,
            checkInScore,
            nutritionHasLogs,
        },
    }
})

/**
 * Cumplimiento real de comidas en 30d con el motor canónico `computeNutritionAdherence`.
 * Devuelve `null` si el alumno no tiene plan activo (sin plan no hay adherencia que medir).
 */
function computeNutritionComplianceScore(
    inputs: Awaited<ReturnType<typeof getNutritionAdherenceInputs30d>>
): number | null {
    if (!inputs) return null
    const { plan, logs, startIso, endIso } = inputs

    const meals: AdherenceMeal[] = (plan.nutrition_meals ?? []).map((m) => ({
        ...normalizeMealForMacros(m),
        day_of_week: m.day_of_week,
    }))

    const logsByDate = new Map<string, MealLogRow[]>()
    for (const day of logs) {
        const rows: MealLogRow[] = (day.nutrition_meal_logs ?? []).map((r) => ({
            meal_id: r.meal_id,
            is_completed: !!r.is_completed,
            consumed_quantity: r.consumed_quantity,
        }))
        logsByDate.set(day.log_date, rows)
    }

    const liveTarget: MacroTarget = {
        calories: plan.daily_calories ?? 0,
        protein: plan.protein_g ?? 0,
        carbs: plan.carbs_g ?? 0,
        fats: plan.fats_g ?? 0,
    }

    const targetByDate = new Map<string, MacroTarget>()
    for (const day of logs) {
        if (day.target_calories_at_log != null) {
            targetByDate.set(day.log_date, {
                calories: day.target_calories_at_log ?? 0,
                protein: day.target_protein_at_log ?? 0,
                carbs: day.target_carbs_at_log ?? 0,
                fats: day.target_fats_at_log ?? 0,
            })
        }
    }

    const { summary } = computeNutritionAdherence({
        meals,
        logsByDate,
        targetByDate,
        liveTarget,
        range: { startIso, endIso },
        dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago,
    })

    return Math.min(100, Math.round(summary.compliancePct))
}

/**
 * ¿Esta PRENDIDO el dominio Nutricion para este alumno en el DASHBOARD? Espejo exacto del gate
 * de la pagina `/c/[coach_slug]/nutrition` (master switch `_enabled`, plan §4.8): cuando el coach
 * apaga el dominio, las superficies de nutricion del dashboard (anillo de cumplimiento + resumen
 * diario) se ocultan limpio — nunca un esqueleto roto (NN/g pitfall).
 *
 * Resuelve el scope (coach/team/org) desde la fila `clients` del propio alumno (RLS techo:
 * `clients.id = auth.uid()`), igual que `getClientScope` de la pagina de nutricion. Usar el scope
 * del alumno (no el `coach_id` del plan) cubre el caso "sin plan": el dominio puede estar apagado
 * aunque todavia no exista un plan nutricional.
 *
 * React.cache => una sola lectura por request aunque el sidebar se monte 2x (mobile + desktop) y
 * el anillo + el resumen llamen ambos. Fail-OPEN del flag `FEATURE_PREFS_ENABLED` viene heredado
 * de `resolveNutritionDomainEnabled` (flag OFF => `true` = comportamiento de HOY, nada se oculta).
 */
export const getDashboardNutritionDomainEnabled = cache(async (userId: string): Promise<boolean> => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('clients')
        .select('coach_id, team_id, org_id')
        .eq('id', userId)
        .maybeSingle()

    return resolveNutritionDomainEnabled({
        coachId: (data?.coach_id ?? '') as string,
        clientId: userId,
        clientTeamId: (data?.team_id ?? null) as string | null,
        clientOrgId: (data?.org_id ?? null) as string | null,
    })
})
