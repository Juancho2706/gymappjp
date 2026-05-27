import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'

type DB = SupabaseClient<Database>

export type AddPaymentInput = {
    client_id: string
    amount: number
    service_description: string
    period_months?: number
    payment_date: string
    status?: string
}

type CoachClientScope = {
    orgId: string | null
}

function applyClientScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

async function assertCoachCanManageClient(db: DB, coachId: string, clientId: string, scope: CoachClientScope) {
    let clientQuery = db
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .eq('is_active', true)
    clientQuery = applyClientScope(clientQuery, scope.orgId)

    const { data: client, error } = await clientQuery.maybeSingle()

    if (error) {
        console.error('Error validating client workspace access:', error)
        throw new Error('Failed to validate client access')
    }
    if (!client) {
        throw new Error('Client not found in active workspace')
    }
}

export async function addPaymentForCoach(db: DB, coachId: string, data: AddPaymentInput, scope: CoachClientScope) {
    await assertCoachCanManageClient(db, coachId, data.client_id, scope)

    const { error } = await db
        .from('client_payments')
        .insert([{
            ...data,
            coach_id: coachId,
        }])

    if (error) {
        console.error('Error adding payment:', error)
        throw new Error('Failed to add payment')
    }
}

export async function deletePaymentForCoach(db: DB, coachId: string, paymentId: string, scope: CoachClientScope) {
    const { data: payment, error: paymentError } = await db
        .from('client_payments')
        .select('id, client_id')
        .eq('id', paymentId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (paymentError) {
        console.error('Error finding payment:', paymentError)
        throw new Error('Failed to find payment')
    }
    if (!payment) {
        throw new Error('Payment not found')
    }

    await assertCoachCanManageClient(db, coachId, payment.client_id, scope)

    const { error } = await db
        .from('client_payments')
        .delete()
        .eq('id', paymentId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error deleting payment:', error)
        throw new Error('Failed to delete payment')
    }
}

export async function updateClientGoalWeightForCoach(
    db: DB,
    coachId: string,
    clientId: string,
    goalWeightKg: number | null,
    scope: CoachClientScope
) {
    let updateQuery = db
        .from('clients')
        .update({ goal_weight_kg: goalWeightKg })
        .eq('id', clientId)
        .eq('coach_id', coachId)
    updateQuery = applyClientScope(updateQuery, scope.orgId)
    const { error } = await updateQuery

    if (error) return { error: error.message }
    return { ok: true }
}

export async function getWeeklyComplianceForClient(db: DB, clientId: string) {
    const { iso: todayIso } = getTodayInSantiago()
    const weekEnd = parseISO(`${todayIso}T12:00:00`)
    const weekStart = subDays(weekEnd, 6)
    const weekDates = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((d) => format(d, 'yyyy-MM-dd'))
    const startDateStr = weekDates[0]!

    const { data: workoutSessions } = await db
        .from('workout_sessions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', startDateStr)

    const [{ data: activePlan }, { data: nutritionLogs }] = await Promise.all([
        db
            .from('nutrition_plans')
            .select('id, nutrition_meals ( id, day_of_week )')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        db
            .from('daily_nutrition_logs')
            .select('log_date, nutrition_meal_logs ( meal_id, is_completed )')
            .eq('client_id', clientId)
            .gte('log_date', startDateStr),
    ])

    const weeklyWorkoutTarget = 4
    const meals = (activePlan?.nutrition_meals ?? []) as { id: string; day_of_week?: number | null }[]

    const logsByDate = new Map<string, { nutrition_meal_logs?: { meal_id: string; is_completed: boolean }[] }>()
    for (const row of nutritionLogs ?? []) {
        const r = row as {
            log_date: string
            nutrition_meal_logs?: { meal_id: string; is_completed: boolean }[]
        }
        logsByDate.set(r.log_date, r)
    }

    let weeklyMealTarget = 0
    let completedMeals = 0
    for (const d of weekDates) {
        const planned = meals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, d)).length
        if (planned > 0) weeklyMealTarget += planned
        const log = logsByDate.get(d)
        const applicableIds = new Set(
            meals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, d)).map((m) => m.id)
        )
        for (const ml of log?.nutrition_meal_logs ?? []) {
            if (ml.is_completed && applicableIds.has(ml.meal_id)) completedMeals++
        }
    }
    if (weeklyMealTarget === 0) weeklyMealTarget = 1

    const nutritionMealLogs = (nutritionLogs ?? []).flatMap((row) => row.nutrition_meal_logs ?? [])
    const workoutCompliance = Math.min(100, Math.round(((workoutSessions?.length || 0) / weeklyWorkoutTarget) * 100))
    const nutritionCompliance = Math.min(100, Math.round((completedMeals / weeklyMealTarget) * 100))

    return {
        workoutCompliance,
        nutritionCompliance,
        workoutSessions: workoutSessions || [],
        nutritionMealLogs: nutritionMealLogs || [],
        mealCompletions: nutritionMealLogs || [],
    }
}
