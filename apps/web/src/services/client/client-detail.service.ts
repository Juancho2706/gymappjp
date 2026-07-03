'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolveCheckinPhotoUrls } from '@/lib/storage/checkin-photos'
import { cache } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
    getTodayInSantiago,
    getSantiagoUtcBoundsForDay,
    getNutritionDayOfWeekFromIsoYmdInSantiago,
    nutritionMealAppliesOnIsoYmdInSantiago,
} from '@/lib/date-utils'
import {
    calculateConsumedMacrosWithCompletionFallback,
    computeNutritionAdherence,
    normalizeMealForMacros,
    portionPctMapFromMealLogs,
    type AdherenceMeal,
    type MealLogRow,
    type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { calculateAttentionScore } from '@/services/dashboard.service'
import {
    addPaymentForCoach,
    deletePaymentForCoach,
    getWeeklyComplianceForClient,
    updateClientGoalWeightForCoach,
} from '@/services/client/client.service'
import {
    mapExercisePrsRpc,
    mapMuscleVolumeRpc,
} from '@/app/coach/clients/[clientId]/profileDataHelpers'
import { checkInRegularityPercentAsOf } from '@/app/coach/clients/[clientId]/profileOverviewUtils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { logTeamClientAccess } from '@/services/team/team.service'
// Guards de scoping 3-vias extraidos a un servicio compartido (T3.0 specs/movida-screening):
// la logica de scoping coach->alumno vive en UN solo lugar (client-scope.service.ts).
import { assertCoachClientReadAccess, getCoachClientScope } from '@/services/client/client-scope.service'

export const getClientProfileData = cache(async (clientId: string) => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS + assertCoachClientReadAccess la gatean), no es boundary de mutación → no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null

    if (!user) throw new Error("Unauthorized")
    const { orgId, viaTeam } = await assertCoachClientReadAccess(supabase, user.id, clientId)

    // Fetch client base data
    let clientQuery = supabase
        .from('clients')
        .select(`
            *,
            client_intake (*),
            coaches ( slug )
        `)
        .eq('id', clientId)

    // Pool (team) clients: authorized via team membership; let RLS gate the row.
    // Standalone/enterprise: coach_id + org scoping. Standalone tambien excluye pool (team_id NULL)
    // para no cruzar contextos.
    if (!viaTeam) {
        clientQuery = clientQuery.eq('coach_id', user.id)
        clientQuery = orgId ? clientQuery.eq('org_id', orgId) : clientQuery.is('org_id', null)
        if (!orgId) clientQuery = clientQuery.is('team_id', null)
    }
    const clientPromise = clientQuery.maybeSingle()

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

    // Fetch nutrition plans — el resultado solo se usa para filtrar is_active y .map(p => p.id)
    // (activeNutritionPlanIds), así que basta 'id, is_active' (el plan completo con meals lo trae
    // activeNutritionPlanPromise aparte). Antes era select('*') innecesario.
    const nutritionPromise = supabase
        .from('nutrition_plans')
        .select('id, is_active')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    // Fetch check-ins
    const checkInsPromise = supabase
        .from('check_ins')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    // Fetch workout history (for adherence & volume).
    // Ventana de 548d (~18 meses): cubre el heatmap de actividad (371d) con margen para planes de
    // larga duracion, y MATA el full-scan ilimitado anterior (un alumno con años de historico bajaba
    // TODO el historial anidado -> saturaba memoria; causa del incidente de Supabase del 2026-06-12).
    // Las curvas de 1RM/fuerza por ejercicio (que hoy no tienen corte propio) muestran hasta esta
    // ventana; el tramo mas viejo se migrara a get_client_strength_series (RPC) en una fase posterior.
    const WORKOUT_HISTORY_WINDOW_DAYS = 548
    const { iso: workoutHistoryTodayIso } = getTodayInSantiago()
    const workoutHistoryFromDate = format(
        subDays(parseISO(`${workoutHistoryTodayIso}T12:00:00`), WORKOUT_HISTORY_WINDOW_DAYS),
        'yyyy-MM-dd'
    )
    const workoutHistoryPromise = supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date,
            workout_blocks (
                id, exercise_id, order_index, section, superset_group, target_weight_kg, reps, sets,
                exercises ( id, name, muscle_group ),
                workout_logs (
                    id, set_number, weight_kg, reps_done, rpe, logged_at
                )
            )
        `)
        .eq('client_id', clientId)
        .gte('assigned_date', workoutHistoryFromDate)
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
                id, meal_id, is_completed, consumed_quantity,
                nutrition_meals ( name, order_index, day_of_week )
            )
        `)
        .eq('client_id', clientId)
        .gte('log_date', nutritionLogDateFrom)
        .order('log_date', { ascending: false })

    // Current Date details for compliance
    const today = new Date()
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
            nutrition_meal_logs ( meal_id, is_completed, consumed_quantity )
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

    // Bitacora de acceso a datos de salud (Ley 21.719): SOLO cuando un coach del pool accede a un
    // alumno del team (viaTeam). Standalone/enterprise no generan bitacora de team. Best-effort.
    if (viaTeam && client.team_id) {
        await logTeamClientAccess(supabase, {
            teamId: client.team_id,
            actorCoachId: user.id,
            clientId,
            resource: 'client_profile',
            action: 'view',
            metadata: { full_name: client.full_name ?? null },
        })
    }

    // ─── B0: PRs, volumen por grupo (30d), detalle de comidas ─────────────
    const activeNutritionPlanIds = (nutritionPlans || [])
        .filter((p: { is_active?: boolean }) => p.is_active)
        .map((p: { id: string }) => p.id)

    // PRs (peso máx por ejercicio) y volumen por grupo (30d): Postgres agrega.
    // Antes: doble fetch de workout_logs (hasta 4000 filas para PRs + ventana 30d
    // para volumen) + reducción en JS. Ahora: 2 RPCs que ya devuelven lo agregado.
    const [prsRes, volRes] = await Promise.all([
        supabase.rpc('get_client_exercise_prs', { p_client_id: clientId }),
        supabase.rpc('get_client_muscle_volume', { p_client_id: clientId, p_days_back: 30 }),
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
                    swap_options,
                    foods ( name, calories, protein_g, carbs_g, fats_g )
                )
            `
            )
            .in('plan_id', activeNutritionPlanIds)
            .order('order_index', { ascending: true })
        mealDetails = meals || []
    }

    const personalRecords = mapExercisePrsRpc(prsRes.data ?? null)
    const muscleVolumeByGroup = mapMuscleVolumeRpc(volRes.data ?? null)

    // 1. Calcular Workouts Target: días con entreno en la variante A/B que toca esta semana
    let weeklyWorkoutTarget = 0
    const activeProgram = (activePrograms || [])[0]
    // Variante A/B efectiva expuesta en el retorno: el dossier PDF filtra los días del
    // programa con la MISMA variante que este target semanal (sin programa ⇒ null).
    let programEffectiveWeekVariant: 'A' | 'B' | null = null
    let programAbMode = false
    if (activeProgram?.workout_plans) {
        programAbMode = !!activeProgram.ab_mode
        const wkIdx = programWeekIndex1Based(activeProgram, today)
        // Variante EFECTIVA: el target semanal del coach cuenta los días que el alumno realmente ve
        // (cae a la variante con planes si la del ciclo está vacía por un A/B mal armado).
        const variantLetter = resolveEffectiveWeekVariant(activeProgram, activeProgram.workout_plans, wkIdx, today)
        programEffectiveWeekVariant = variantLetter
        weeklyWorkoutTarget = activeProgram.workout_plans.filter(
            (wp: any) =>
                wp.workout_blocks &&
                wp.workout_blocks.length > 0 &&
                workoutPlanMatchesVariant(wp, variantLetter, programAbMode)
        ).length
    }
    // Si no hay programa o no tiene bloques, evitamos dividir por 0
    if (weeklyWorkoutTarget === 0) weeklyWorkoutTarget = 1; 

    // 2. Calcular Nutricion Hoy usando el motor canonico computeNutritionAdherence
    //    (rango de UN dia = todayIso). El motor reemplaza el computo inline de
    //    Formula A (mealsDone / applicableMeals filtrado por dia de semana).
    //    Solo necesitamos el conteo de compliance del dia, no macros, asi que el
    //    target vivo se pasa en cero (los macros del dia se calculan aparte mas
    //    abajo via todayConsumedMacros).
    const adherenceMealsToday: AdherenceMeal[] = (activeNutritionPlanFull?.nutrition_meals ?? []).map(
        (m: NutritionMealMacroSource) => ({
            ...normalizeMealForMacros(m),
            day_of_week: m.day_of_week ?? null,
        })
    )
    const todayMealLogs = ((todayNutritionLog as any)?.nutrition_meal_logs || []) as MealLogRow[]
    const todayLogsByDate = new Map<string, MealLogRow[]>([[todayIso, todayMealLogs]])
    const { perDay: adherencePerDayToday } = computeNutritionAdherence({
        meals: adherenceMealsToday,
        logsByDate: todayLogsByDate,
        liveTarget: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        range: { startIso: todayIso, endIso: todayIso },
        dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago,
        mealAppliesOn: nutritionMealAppliesOnIsoYmdInSantiago,
    })
    const todayAdherence = adherencePerDayToday[0]
    const mealsDoneToday = todayAdherence?.mealsDone ?? 0
    // todayMealsTotal: comidas aplicables hoy, con piso de 1 para no dividir por 0
    // (misma invariante que el computo inline anterior).
    let todayMealsTotal = todayAdherence?.applicableMeals ?? 0
    if (todayMealsTotal === 0) todayMealsTotal = 1

    // % de cumplimiento de hoy (0 a 100), redondeado.
    const nutritionCompliancePercent = Math.min(100, Math.round((mealsDoneToday / todayMealsTotal) * 100))

    // 3. Progreso del Plan de Ejercicios
    let currentWeek = 0;
    const totalWeeks = activeProgram?.weeks_to_repeat || 1;
    let daysRemaining = 0;

    if (activeProgram?.start_date && activeProgram?.end_date) {
        const start = new Date(activeProgram.start_date);
        const end = new Date(activeProgram.end_date);
        const diffTime = today.getTime() - start.getTime();
        // start futuro → semana 1 (no contar días-hasta-inicio como transcurridos; ver programWeekVariant).
        const diffDays = diffTime < 0 ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
            nutrition_meal_logs?: {
                is_completed?: boolean
                meal_id?: string
                consumed_quantity?: number | null
            }[]
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
        const portionMap = portionPctMapFromMealLogs(
            (row.nutrition_meal_logs || []) as {
                meal_id: string
                is_completed: boolean
                consumed_quantity?: number | null
            }[]
        )
        const c = calculateConsumedMacrosWithCompletionFallback(mealsForMacros, completed, {
            calories: Number((activeNutritionPlanFull as { daily_calories?: number } | null)?.daily_calories ?? 0),
            protein: Number((activeNutritionPlanFull as { protein_g?: number } | null)?.protein_g ?? 0),
            carbs: Number((activeNutritionPlanFull as { carbs_g?: number } | null)?.carbs_g ?? 0),
            fats: Number((activeNutritionPlanFull as { fats_g?: number } | null)?.fats_g ?? 0),
        }, portionMap)
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
        nutrition_meal_logs?: {
            is_completed?: boolean
            meal_id?: string
            consumed_quantity?: number | null
        }[]
    } | null
    if (tn?.log_date === todayIso && mealsForMacros.length) {
        hasTodayNutritionLog = true
        const completed = new Set<string>()
        for (const ml of tn.nutrition_meal_logs || []) {
            if (ml.is_completed && ml.meal_id) completed.add(ml.meal_id)
        }
        const todayPortionMap = portionPctMapFromMealLogs(
            (tn.nutrition_meal_logs || []) as {
                meal_id: string
                is_completed: boolean
                consumed_quantity?: number | null
            }[]
        )
        todayConsumedMacros = calculateConsumedMacrosWithCompletionFallback(mealsForMacros, completed, {
            calories: Number((activeNutritionPlanFull as { daily_calories?: number } | null)?.daily_calories ?? 0),
            protein: Number((activeNutritionPlanFull as { protein_g?: number } | null)?.protein_g ?? 0),
            carbs: Number((activeNutritionPlanFull as { carbs_g?: number } | null)?.carbs_g ?? 0),
            fats: Number((activeNutritionPlanFull as { fats_g?: number } | null)?.fats_g ?? 0),
        }, todayPortionMap)
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

    const [
        { data: favoritePrefsRows },
        { data: nutritionPlanCyclesRows },
        { data: nutritionTemplatesLiteRows },
    ] = await Promise.all([
        supabase
            .from('client_food_preferences')
            .select('food_id, foods ( id, name )')
            .eq('client_id', clientId)
            .eq('preference_type', 'favorite')
            .order('created_at', { ascending: false }),
        supabase
            .from('nutrition_plan_cycles')
            .select('id, name, start_date, blocks, is_active, created_at')
            .eq('client_id', clientId)
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        supabase
            .from('nutrition_plan_templates')
            .select('id, name')
            .eq('coach_id', user.id)
            .order('name', { ascending: true }),
    ])

    const clientFavoriteFoods = (favoritePrefsRows ?? []).map((row: { food_id: string; foods?: { name?: string | null } | null }) => ({
        id: row.food_id,
        name: row.foods?.name?.trim() || 'Alimento',
    }))

    const activePlanIdForHistory = (activeNutritionPlanFull as { id?: string } | null)?.id
    let nutritionPlanHistoryEntries: { id: string; created_at: string; label: string | null }[] = []
    if (activePlanIdForHistory) {
        const { data: histRows } = await supabase
            .from('nutrition_plan_history')
            .select('id, created_at, label')
            .eq('nutrition_plan_id', activePlanIdForHistory)
            .order('created_at', { ascending: false })
            .limit(20)
        nutritionPlanHistoryEntries = histRows ?? []
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
        // P2: sign check-in photo paths (service-role; coaches have no storage SELECT policy).
        checkIns: await resolveCheckinPhotoUrls(createServiceRoleClient(), checkIns || []),
        workoutHistory: workoutLogs || [],
        payments: payments || [],
        compliance,
        personalRecords,
        muscleVolumeByGroup,
        programEffectiveWeekVariant,
        programAbMode,
        mealDetails,
        attentionScore,
        profileLastActivityAt,
        clientFavoriteFoods,
        nutritionPlanCycles: nutritionPlanCyclesRows ?? [],
        nutritionTemplatesLite: nutritionTemplatesLiteRows ?? [],
        nutritionPlanHistoryEntries,
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

    const scope = await getCoachClientScope(supabase, user.id)
    await addPaymentForCoach(supabase, user.id, data, scope)
}

export async function deletePayment(paymentId: string, clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    const scope = await getCoachClientScope(supabase, user.id)
    await deletePaymentForCoach(supabase, user.id, paymentId, scope)
}

export async function getWeeklyCompliance(clientId: string) {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null

    if (!user) throw new Error("Unauthorized")

    await assertCoachClientReadAccess(supabase, user.id, clientId)
    return getWeeklyComplianceForClient(supabase, clientId)
}

export async function getDynamicMetrics(clientId: string) {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null

    if (!user) throw new Error("Unauthorized")

    await assertCoachClientReadAccess(supabase, user.id, clientId)

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
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) throw new Error('Unauthorized')

    await assertCoachClientReadAccess(supabase, user.id, clientId)

    const { data } = await supabase
        .from('daily_nutrition_logs')
        .select(`
            id, log_date, plan_name_at_log,
            target_calories_at_log, target_protein_at_log,
            target_carbs_at_log, target_fats_at_log,
            nutrition_meal_food_swaps (
                id, meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit,
                original_food:foods!nutrition_meal_food_swaps_original_food_id_fkey ( id, name ),
                swapped_food:foods!nutrition_meal_food_swaps_swapped_food_id_fkey ( id, name )
            ),
            nutrition_meal_logs (
                id, is_completed,
                nutrition_meals (
                    id, name, order_index, day_of_week,
                    food_items (
                        id, quantity, unit, swap_options,
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
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) throw new Error('Unauthorized')

    await assertCoachClientReadAccess(supabase, user.id, clientId)

    const { startIso, endIso } = getSantiagoUtcBoundsForDay(date)
    const { data } = await supabase
        .from('workout_logs')
        // P1-3: sin !inner → un set logueado cuyo bloque fue borrado (block_id NULL) sigue
        // apareciendo en el detalle del día (el consumidor ya es null-safe: cae a "Ejercicio").
        .select(`
            set_number, weight_kg, reps_done, rpe, logged_at,
            workout_blocks (
                section, order_index,
                exercises (name, muscle_group),
                workout_plans (title, day_of_week)
            )
        `)
        .eq('client_id', clientId)
        .gte('logged_at', startIso)
        .lt('logged_at', endIso)
        .order('logged_at')

    return data ?? []
}

/** Actualiza el peso objetivo del cliente (solo el coach dueño puede hacerlo). */
export async function updateClientGoalWeight(clientId: string, goalWeightKg: number | null) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const scope = await getCoachClientScope(supabase, user.id)
    return updateClientGoalWeightForCoach(supabase, user.id, clientId, goalWeightKg, scope)
}

/** Días (YYYY-MM-DD) con workout_logs para el cliente en los últimos 90 días. */
export async function getClientWorkoutActivityDates(clientId: string): Promise<string[]> {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return []

    try {
        await assertCoachClientReadAccess(supabase, user.id, clientId)
    } catch {
        return []
    }

    // Postgres devuelve los días distintos ya convertidos a zona Santiago
    // (antes: traer cada logged_at y convertir UTC→Santiago en JS).
    const { data } = await supabase.rpc('get_client_activity_dates', {
        p_client_id: clientId,
        p_days_back: 90,
    })

    if (!data) return []
    return [...new Set(data.map((r) => r.day))]
}

/** Hábitos del día del alumno (coach lee por RLS: coach_id = auth.uid() en client_profiles). */
export async function getClientHabitsForDate(
  clientId: string,
  date: string
): Promise<{ water_ml: number | null; steps: number | null; sleep_hours: number | null; fasting_hours: number | null; supplements: string[] | null; notes: string | null } | null> {
  const supabase = await createClient()
  // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
  const { data: __cl } = await supabase.auth.getClaims()
  const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
  if (!user) return null

  try {
    await assertCoachClientReadAccess(supabase, user.id, clientId)
  } catch {
    return null
  }

  const { data } = await supabase
    .from('daily_habits')
    .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
    .eq('client_id', clientId)
    .eq('log_date', date)
    .maybeSingle()

  return data ?? null
}

/** Días (YYYY-MM-DD) con daily_nutrition_logs para el cliente en los últimos 90 días. */
export async function getClientNutritionActivityDates(clientId: string): Promise<string[]> {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS la gatea), no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return []

    try {
        await assertCoachClientReadAccess(supabase, user.id, clientId)
    } catch {
        return []
    }

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

/**
 * Marks a client check-in as reviewed by the authenticated coach.
 * Validates coach owns the client under the active workspace.
 * Sets reviewed_at + reviewed_by for org response-time metrics.
 */
export async function markCheckInReviewed(clientId: string, checkInId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    await assertCoachClientReadAccess(supabase, user.id, clientId)

    const { error } = await supabase
        .from('check_ins')
        .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
        .eq('id', checkInId)
        .eq('client_id', clientId)
        .is('reviewed_at', null)
    if (error) throw new Error(error.message)
    return { success: true }
}
