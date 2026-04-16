'use server'

import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { format, parseISO, subDays } from 'date-fns'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    calculateConsumedMacros,
    normalizeMealForMacros,
    type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { calculateAttentionScore } from '@/services/dashboard.service'
import {
    buildMuscleVolumeFromLogs,
    buildPersonalRecordsFromLogs,
} from './profileDataHelpers'
import { checkInRegularityPercentAsOf } from './profileOverviewUtils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

export const getClientProfileData = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    // Fetch client base data
    const clientPromise = supabase
        .from('clients')
        .select(`
            *,
            client_intake (*),
            coaches ( slug )
        `)
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    // Fetch active workout program
    const activeProgramPromise = supabase
        .from('workout_programs')
        .select(`
            *,
            workout_plans (
                id, title, day_of_week, week_variant,
                workout_blocks (
                    id, exercise_id, order_index, sets, reps, rest_time, notes, target_weight_kg,
                    tempo, rir,
                    exercises ( id, name, muscle_group, gif_url, video_url )
                )
            )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(2)

    // Fetch nutrition plans
    const nutritionPromise = supabase
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    // Fetch check-ins
    const checkInsPromise = supabase
        .from('check_ins')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    // Fetch workout history (for adherence & volume)
    const workoutHistoryPromise = supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date,
            workout_blocks (
                id, exercise_id, target_weight_kg, reps, sets,
                exercises ( id, name, muscle_group ),
                workout_logs (
                    id, set_number, weight_kg, reps_done, rpe, logged_at
                )
            )
        `)
        .eq('client_id', clientId)
        .order('assigned_date', { ascending: false })

    // Fetch real payment history (table not yet in generated types)
    const paymentsPromise = (supabase as any)
        .from('client_payments')
        .select('*')
        .eq('client_id', clientId)
        .order('payment_date', { ascending: false })

    const { iso: todayIso } = getTodayInSantiago()
    const nutritionLogDateFrom = format(subDays(parseISO(`${todayIso}T12:00:00`), 40), 'yyyy-MM-dd')

    // Fetch daily nutrition logs with meal completion detail (ventana calendario, misma lógica que alumno)
    const nutritionLogsPromise = supabase
        .from('daily_nutrition_logs')
        .select(`
            *,
            nutrition_meal_logs (
                id, meal_id, is_completed,
                nutrition_meals ( name, order_index )
            )
        `)
        .eq('client_id', clientId)
        .gte('log_date', nutritionLogDateFrom)
        .order('log_date', { ascending: false })

    // Current Date details for compliance
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const startDateStr = startDate.toISOString().split('T')[0]

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]

    const workoutSessionsPromise = supabase
        .from('workout_sessions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', fourteenDaysAgoStr)

    // Fetch today's meal completion logs for nutrition compliance
    const mealCompletionsPromise = supabase
        .from('daily_nutrition_logs')
        .select(`
            log_date,
            nutrition_meal_logs ( meal_id, is_completed )
        `)
        .eq('client_id', clientId)
        .eq('log_date', todayIso)
        .maybeSingle()

    const streakPromise = supabase
        .rpc('get_client_current_streak' as any, { p_client_id: clientId })

    const activeNutritionPlanPromise = supabase
        .from('nutrition_plans')
        .select(`
            *,
            nutrition_meals (
                *,
                food_items (
                    *,
                    foods (*)
                )
            )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('order_index', { referencedTable: 'nutrition_meals', ascending: true })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const [
        { data: client, error: clientErr },
        { data: activePrograms },
        { data: nutritionPlans },
        { data: nutritionLogs },
        { data: checkIns },
        { data: workoutLogs },
        { data: payments },
        { data: workoutSessions },
        { data: todayNutritionLog },
        { data: currentStreak },
        { data: activeNutritionPlanFull }
    ] = await Promise.all([
        clientPromise,
        activeProgramPromise,
        nutritionPromise,
        nutritionLogsPromise,
        checkInsPromise,
        workoutHistoryPromise,
        paymentsPromise,
        workoutSessionsPromise,
        mealCompletionsPromise,
        streakPromise,
        activeNutritionPlanPromise
    ])

    if (clientErr || !client) {
        throw new Error("Client not found")
    }

    // ─── B0: PRs, volumen por grupo (30d), detalle de comidas ─────────────
    const activeNutritionPlanIds = (nutritionPlans || [])
        .filter((p: { is_active?: boolean }) => p.is_active)
        .map((p: { id: string }) => p.id)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysIso = thirtyDaysAgo.toISOString()

    const workoutLogSelect = `
        weight_kg, reps_done, logged_at,
        workout_blocks (
            exercise_id,
            exercises ( name, muscle_group )
        )
    `

    const [prsRes, volRes] = await Promise.all([
        supabase
            .from('workout_logs')
            .select(workoutLogSelect)
            .eq('client_id', clientId)
            .not('weight_kg', 'is', null)
            .order('weight_kg', { ascending: false })
            .limit(4000),
        supabase
            .from('workout_logs')
            .select(workoutLogSelect)
            .eq('client_id', clientId)
            .gte('logged_at', thirtyDaysIso),
    ])

    let mealDetails: unknown[] = []
    if (activeNutritionPlanIds.length > 0) {
        const { data: meals } = await supabase
            .from('nutrition_meals')
            .select(
                `
                *,
                food_items (
                    quantity,
                    unit,
                    foods ( name, calories, protein_g, carbs_g, fats_g )
                )
            `
            )
            .in('plan_id', activeNutritionPlanIds)
            .order('order_index', { ascending: true })
        mealDetails = meals || []
    }

    const personalRecords = buildPersonalRecordsFromLogs(prsRes.data as unknown[])
    const muscleVolumeByGroup = buildMuscleVolumeFromLogs(volRes.data as unknown[])

    // 1. Calcular Workouts Target: días con entreno en la variante A/B que toca esta semana
    let weeklyWorkoutTarget = 0
    const activeProgram = (activePrograms || [])[0]
    if (activeProgram?.workout_plans) {
        const abMode = !!activeProgram.ab_mode
        const wkIdx = programWeekIndex1Based(activeProgram, today)
        const variantLetter = resolveActiveWeekVariantForDisplay(activeProgram, wkIdx, today)
        weeklyWorkoutTarget = activeProgram.workout_plans.filter(
            (wp: any) =>
                wp.workout_blocks &&
                wp.workout_blocks.length > 0 &&
                workoutPlanMatchesVariant(wp, variantLetter, abMode)
        ).length
    }
    // Si no hay programa o no tiene bloques, evitamos dividir por 0
    if (weeklyWorkoutTarget === 0) weeklyWorkoutTarget = 1; 

    // 2. Calcular Nutricion Hoy usando nutrition_meal_logs (fuente real de datos)
    let todayMealsTotal = 0;
    if (activeNutritionPlanFull?.nutrition_meals) {
        todayMealsTotal = activeNutritionPlanFull.nutrition_meals.length;
    }
    if (todayMealsTotal === 0) todayMealsTotal = 1;

    // Contar comidas completadas hoy desde nutrition_meal_logs
    const todayMealLogs = (todayNutritionLog as any)?.nutrition_meal_logs || [];
    const mealsDoneToday = todayMealLogs.filter((ml: any) => ml.is_completed === true).length;

    // Calcular % de cumplimiento de hoy (0 a 100)
    const nutritionCompliancePercent = Math.min(100, Math.round((mealsDoneToday / todayMealsTotal) * 100));

    // 3. Progreso del Plan de Ejercicios
    let currentWeek = 0;
    let totalWeeks = activeProgram?.weeks_to_repeat || 1;
    let daysRemaining = 0;

    if (activeProgram?.start_date && activeProgram?.end_date) {
        const start = new Date(activeProgram.start_date);
        const end = new Date(activeProgram.end_date);
        const diffTime = Math.abs(today.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        currentWeek = Math.min(totalWeeks, Math.ceil(diffDays / 7));
        if (currentWeek < 1) currentWeek = 1;

        const remainingTime = end.getTime() - today.getTime();
        daysRemaining = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) daysRemaining = 0;
    }

    // Check if workout sessions are being created properly. If not, fallback to counting unique days with workout logs
    let completedWorkoutsCount = 0
    let completedWorkoutsPrevWeek = 0

    const sessionsList = (workoutSessions || []) as { date_completed?: string }[]
    if (sessionsList.length > 0) {
        completedWorkoutsCount = sessionsList.filter(
            (s) => s.date_completed && s.date_completed >= startDateStr
        ).length
        completedWorkoutsPrevWeek = sessionsList.filter(
            (s) =>
                s.date_completed &&
                s.date_completed >= fourteenDaysAgoStr &&
                s.date_completed < startDateStr
        ).length
    } else if (workoutLogs) {
        const uniqueThisWeek = new Set<string>()
        const uniquePrevWeek = new Set<string>()
        workoutLogs.forEach((plan: any) => {
            plan.workout_blocks?.forEach((block: any) => {
                block.workout_logs?.forEach((log: any) => {
                    if (log.logged_at) {
                        const day = log.logged_at.split('T')[0]
                        if (day >= startDateStr) uniqueThisWeek.add(day)
                        else if (day >= fourteenDaysAgoStr) uniquePrevWeek.add(day)
                    }
                })
            })
        })
        completedWorkoutsCount = uniqueThisWeek.size
        completedWorkoutsPrevWeek = uniquePrevWeek.size
    }

    const sortedCheckIns = [...(checkIns || [])].sort(
        (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastCheckInRow = sortedCheckIns[0]
    const checkInCompliancePercent = checkInRegularityPercentAsOf(today, checkIns || [])
    const checkInCompliancePercentWeekAgo = checkInRegularityPercentAsOf(
        subDays(today, 7),
        checkIns || []
    )

    const avgMealCompliance = (logs: any[]) => {
        if (!logs.length) return null
        let sum = 0
        for (const l of logs) {
            const ml = l.nutrition_meal_logs || []
            const t = ml.length
            const d = ml.filter((x: { is_completed?: boolean }) => x.is_completed).length
            sum += t ? (d / t) * 100 : 0
        }
        return Math.round(sum / logs.length)
    }
    const nutritionLogsArr = nutritionLogs || []
    const nutritionWeeklyAvgPct =
        avgMealCompliance(
            nutritionLogsArr.filter((l: { log_date?: string }) => l.log_date && l.log_date >= startDateStr)
        ) ?? 0
    const nutritionPrevWeeklyAvgPct =
        avgMealCompliance(
            nutritionLogsArr.filter(
                (l: { log_date?: string }) =>
                    l.log_date &&
                    l.log_date >= fourteenDaysAgoStr &&
                    l.log_date < startDateStr
            )
        ) ?? 0

    const planId = (activeNutritionPlanFull as { id?: string } | null)?.id
    const planMealsRaw = (activeNutritionPlanFull as { nutrition_meals?: unknown[] } | null)?.nutrition_meals

    let mealsForMacros: ReturnType<typeof normalizeMealForMacros>[] = []
    if (Array.isArray(planMealsRaw) && planMealsRaw.length) {
        const sorted = [...planMealsRaw].sort(
            (a, b) =>
                ((a as { order_index?: number }).order_index ?? 0) -
                ((b as { order_index?: number }).order_index ?? 0)
        )
        mealsForMacros = sorted.map((m) => normalizeMealForMacros(m as NutritionMealMacroSource))
    }

    const nutritionLogsEnriched = nutritionLogsArr.map((log: Record<string, unknown>) => {
        const row = log as {
            plan_id?: string
            nutrition_meal_logs?: { is_completed?: boolean; meal_id?: string }[]
        }
        if (!planId || row.plan_id !== planId || mealsForMacros.length === 0) {
            return {
                ...log,
                consumed_calories: 0,
                consumed_protein: 0,
                consumed_carbs: 0,
                consumed_fats: 0,
            }
        }
        const completed = new Set<string>()
        for (const ml of row.nutrition_meal_logs || []) {
            if (ml.is_completed && ml.meal_id) completed.add(ml.meal_id)
        }
        const c = calculateConsumedMacros(mealsForMacros, completed)
        return {
            ...log,
            consumed_calories: Math.round(c.calories),
            consumed_protein: Math.round(c.protein),
            consumed_carbs: Math.round(c.carbs),
            consumed_fats: Math.round(c.fats),
        }
    })

    const nutritionAdherence30d = nutritionLogsArr
        .filter((l: { plan_id?: string }) => planId && l.plan_id === planId)
        .map((l: { log_date: string; nutrition_meal_logs?: { is_completed?: boolean }[] }) => ({
            log_date: l.log_date,
            nutrition_meal_logs: (l.nutrition_meal_logs || []).map((m) => ({
                is_completed: !!m.is_completed,
            })),
        }))

    let todayConsumedMacros = { calories: 0, protein: 0, carbs: 0, fats: 0 }
    let hasTodayNutritionLog = false
    const tn = todayNutritionLog as {
        log_date?: string
        nutrition_meal_logs?: { is_completed?: boolean; meal_id?: string }[]
    } | null
    if (tn?.log_date === todayIso && mealsForMacros.length) {
        hasTodayNutritionLog = true
        const completed = new Set<string>()
        for (const ml of tn.nutrition_meal_logs || []) {
            if (ml.is_completed && ml.meal_id) completed.add(ml.meal_id)
        }
        todayConsumedMacros = calculateConsumedMacros(mealsForMacros, completed)
    }

    const dateFrom30 = format(subDays(parseISO(`${todayIso}T12:00:00`), 29), 'yyyy-MM-dd')
    const logsLast30 = nutritionLogsArr.filter(
        (l: { plan_id?: string; log_date?: string }) =>
            planId && l.plan_id === planId && l.log_date && l.log_date >= dateFrom30
    )
    let nutritionMonthlyAvgPct: number | null = null
    if (logsLast30.length) {
        let s = 0
        for (const l of logsLast30) {
            const ml = (l as { nutrition_meal_logs?: { is_completed?: boolean }[] }).nutrition_meal_logs || []
            const t = ml.length
            const d = ml.filter((x) => x.is_completed).length
            s += t ? (d / t) * 100 : 0
        }
        nutritionMonthlyAvgPct = Math.round(s / logsLast30.length)
    }

    const pctByDate = new Map<string, number>()
    for (const l of nutritionLogsArr) {
        const row = l as { plan_id?: string; log_date?: string; nutrition_meal_logs?: { is_completed?: boolean }[] }
        if (!(planId && row.plan_id === planId && row.log_date)) continue
        const ml = row.nutrition_meal_logs || []
        const t = ml.length
        if (!t) continue
        const d = ml.filter((x) => x.is_completed).length
        pctByDate.set(row.log_date, Math.round((d / t) * 100))
    }
    let nutritionStreakDays = 0
    let cursor = parseISO(`${todayIso}T12:00:00`)
    for (let i = 0; i < 120; i++) {
        const key = format(cursor, 'yyyy-MM-dd')
        const pct = pctByDate.get(key)
        if (pct == null) break
        if (pct < 80) break
        nutritionStreakDays++
        cursor = subDays(cursor, 1)
    }

    let lastActivityMs = 0
    if (client.updated_at) {
        lastActivityMs = Math.max(lastActivityMs, new Date(client.updated_at).getTime())
    }
    for (const plan of workoutLogs || []) {
        plan.workout_blocks?.forEach((block: any) => {
            block.workout_logs?.forEach((log: { logged_at?: string }) => {
                if (log.logged_at) {
                    lastActivityMs = Math.max(lastActivityMs, new Date(log.logged_at).getTime())
                }
            })
        })
    }
    for (const c of checkIns || []) {
        if (c.created_at) {
            lastActivityMs = Math.max(lastActivityMs, new Date(c.created_at).getTime())
        }
    }
    const profileLastActivityAt =
        lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null

    const lastWorkoutDateFromHistory = (workoutLogs || []).reduce<string | null>(
        (latest, plan: any) => {
            for (const block of plan.workout_blocks || []) {
                for (const log of block.workout_logs || []) {
                    if (!log.logged_at) continue
                    if (!latest || new Date(log.logged_at) > new Date(latest)) {
                        latest = log.logged_at
                    }
                }
            }
            return latest
        },
        null
    )
    const { score: attentionScore } = calculateAttentionScore({
        lastCheckinDate: lastCheckInRow?.created_at ?? null,
        lastWorkoutDate: lastWorkoutDateFromHistory,
        hasActiveWorkoutProgram: activeProgram != null,
        nutritionCompliance: nutritionCompliancePercent,
        planDaysRemaining: daysRemaining,
        oneRMDelta: null,
    })

    const compliance = {
        workoutsThisWeek: completedWorkoutsCount,
        workoutsPrevWeek: completedWorkoutsPrevWeek,
        workoutsTarget: weeklyWorkoutTarget,
        nutritionCompliancePercent: nutritionCompliancePercent,
        nutritionWeeklyAvgPct,
        nutritionPrevWeeklyAvgPct,
        todayMealsDone: mealsDoneToday,
        todayMealsTotal: todayMealsTotal,
        currentStreak: currentStreak || 0,
        planCurrentWeek: currentWeek,
        planTotalWeeks: totalWeeks,
        planDaysRemaining: daysRemaining,
        checkInCompliancePercent,
        checkInCompliancePercentWeekAgo,
    }

    return {
        client,
        activeProgram,
        nutritionPlans: nutritionPlans || [],
        nutritionLogs: nutritionLogs || [],
        nutritionLogsEnriched,
        activeNutritionPlanWithMeals: activeNutritionPlanFull,
        nutritionAdherence30d,
        todayConsumedMacros,
        hasTodayNutritionLog,
        nutritionStreakDays,
        nutritionMonthlyAvgPct,
        todayIso,
        checkIns: checkIns || [],
        workoutHistory: workoutLogs || [],
        payments: payments || [],
        compliance,
        personalRecords,
        muscleVolumeByGroup,
        mealDetails,
        attentionScore,
        profileLastActivityAt,
    }
})

export async function addPayment(data: {
    client_id: string;
    amount: number;
    service_description: string;
    period_months?: number;
    payment_date: string;
    status?: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase
        .from('client_payments')
        .insert([{
            ...data,
            coach_id: user.id
        }])

    if (error) {
        console.error('Error adding payment:', error)
        throw new Error("Failed to add payment")
    }

    revalidatePath(`/coach/clients/${data.client_id}`)
}

export async function deletePayment(paymentId: string, clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase
        .from('client_payments')
        .delete()
        .eq('id', paymentId)
        .eq('coach_id', user.id)

    if (error) {
        console.error('Error deleting payment:', error)
        throw new Error("Failed to delete payment")
    }

    revalidatePath(`/coach/clients/${clientId}`)
}

export async function getWeeklyCompliance(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    // Get dates for the current week (e.g., last 7 days)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const startDateStr = startDate.toISOString().split('T')[0]

    // Fetch workout sessions for the week
    const { data: workoutSessions } = await supabase
        .from('workout_sessions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', startDateStr)

    // Fetch meal completions for the week
    const { data: mealCompletions } = await supabase
        .from('meal_completions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', startDateStr)

    // Mock targets (these would come from the client's plans)
    const weeklyWorkoutTarget = 4;
    const weeklyMealTarget = 21; // e.g., 3 meals * 7 days

    const workoutCompliance = Math.min(100, Math.round(((workoutSessions?.length || 0) / weeklyWorkoutTarget) * 100))
    const nutritionCompliance = Math.min(100, Math.round(((mealCompletions?.length || 0) / weeklyMealTarget) * 100))

    return {
        workoutCompliance,
        nutritionCompliance,
        workoutSessions: workoutSessions || [],
        mealCompletions: mealCompletions || []
    }
}

export async function getDynamicMetrics(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    // Fetch latest check-ins (only columns that exist in the schema)
    const { data: latestCheckIns } = await supabase
        .from('check_ins')
        .select('energy_level, weight, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(4)

    // Call RPC for streak
    const { data: currentStreak, error: streakError } = await supabase
        .rpc('get_client_current_streak' as any, { p_client_id: clientId })

    if (streakError) {
        console.error('Error fetching streak:', streakError)
    }

    return {
        latestCheckIns: latestCheckIns || [],
        currentStreak: currentStreak || 0
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Historial por fecha — coach ve lo que comió / entrenó un alumno en un día
// ─────────────────────────────────────────────────────────────────────────────

export async function getClientNutritionForDate(clientId: string, date: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data } = await supabase
        .from('daily_nutrition_logs')
        .select(`
            id, log_date, plan_name_at_log,
            target_calories_at_log, target_protein_at_log,
            target_carbs_at_log, target_fats_at_log,
            nutrition_meal_logs (
                id, is_completed,
                nutrition_meals (
                    id, name, order_index,
                    food_items (
                        id, quantity, unit,
                        foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit)
                    )
                )
            )
        `)
        .eq('client_id', clientId)
        .eq('log_date', date)
        .maybeSingle()

    return data
}

export async function getClientWorkoutForDate(clientId: string, date: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data } = await supabase
        .from('workout_logs')
        .select(`
            set_number, weight_kg, reps_done, rpe, logged_at,
            workout_blocks!inner (
                section, order_index,
                exercises (name, muscle_group),
                workout_plans (title, day_of_week)
            )
        `)
        .eq('client_id', clientId)
        .gte('logged_at', `${date}T00:00:00`)
        .lte('logged_at', `${date}T23:59:59`)
        .order('logged_at')

    return data ?? []
}

/** Actualiza el peso objetivo del cliente (solo el coach dueño puede hacerlo). */
export async function updateClientGoalWeight(clientId: string, goalWeightKg: number | null) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('clients')
        .update({ goal_weight_kg: goalWeightKg })
        .eq('id', clientId)
        .eq('coach_id', user.id)

    if (error) return { error: error.message }
    return { ok: true }
}

/** Días (YYYY-MM-DD) con workout_logs para el cliente en los últimos 90 días. */
export async function getClientWorkoutActivityDates(clientId: string): Promise<string[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const from = new Date()
    from.setDate(from.getDate() - 90)
    const fromIso = from.toISOString().slice(0, 10)

    const { data } = await supabase
        .from('workout_logs')
        .select('logged_at')
        .eq('client_id', clientId)
        .gte('logged_at', `${fromIso}T00:00:00`)
        .order('logged_at')

    if (!data) return []
    const seen = new Set<string>()
    for (const row of data) {
        seen.add((row.logged_at as string).slice(0, 10))
    }
    return [...seen]
}

/** Días (YYYY-MM-DD) con daily_nutrition_logs para el cliente en los últimos 90 días. */
export async function getClientNutritionActivityDates(clientId: string): Promise<string[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const from = new Date()
    from.setDate(from.getDate() - 90)
    const fromIso = from.toISOString().slice(0, 10)

    const { data } = await supabase
        .from('daily_nutrition_logs')
        .select('log_date')
        .eq('client_id', clientId)
        .gte('log_date', fromIso)
        .order('log_date')

    if (!data) return []
    return [...new Set(data.map((r) => r.log_date as string))]
}
