'use server'

import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import { revalidatePath } from 'next/cache'

export const getClientProfileData = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    // Fetch client base data
    const clientPromise = supabase
        .from('clients')
        .select(`
            *,
            client_intake (*)
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
                id, title, day_of_week,
                workout_blocks (
                    id, order_index, sets, reps, rest_time, notes, target_weight_kg,
                    exercises ( name )
                )
            )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

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
                id, target_weight_kg, reps, sets,
                exercises ( name ),
                workout_logs (
                    id, set_number, weight_kg, reps_done, rpe, logged_at
                )
            )
        `)
        .eq('client_id', clientId)
        .order('assigned_date', { ascending: false })

    // Fetch real payment history
    const paymentsPromise = supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', clientId)
        .order('payment_date', { ascending: false })

    // Fetch daily nutrition logs
    const nutritionLogsPromise = supabase
        .from('daily_nutrition_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(30)

    // Current Date details for compliance
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const startDateStr = startDate.toISOString().split('T')[0]

    const workoutSessionsPromise = supabase
        .from('workout_sessions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', startDateStr)

    const mealCompletionsPromise = supabase
        .from('meal_completions' as any)
        .select('*')
        .eq('client_id', clientId)
        .gte('date_completed', startDateStr)

    const streakPromise = supabase
        .rpc('get_client_current_streak' as any, { p_client_id: clientId })

    const activeNutritionPlanPromise = supabase
        .from('nutrition_plans')
        .select(`
            *,
            nutrition_meals (id)
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const [
        { data: client, error: clientErr },
        { data: activeProgram },
        { data: nutritionPlans },
        { data: nutritionLogs },
        { data: checkIns },
        { data: workoutLogs },
        { data: payments },
        { data: workoutSessions },
        { data: mealCompletions },
        { data: currentStreak },
        { data: activeNutritionPlan }
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

    // 1. Calcular Workouts Target: Dias con ejercicios en el programa activo
    let weeklyWorkoutTarget = 0;
    if (activeProgram?.workout_plans) {
        weeklyWorkoutTarget = activeProgram.workout_plans.filter((wp: any) => 
            wp.workout_blocks && wp.workout_blocks.length > 0
        ).length;
    }
    // Si no hay programa o no tiene bloques, evitamos dividir por 0
    if (weeklyWorkoutTarget === 0) weeklyWorkoutTarget = 1; 

    // 2. Calcular Nutricion Hoy
    let todayMealsTotal = 0;
    if (activeNutritionPlan?.nutrition_meals) {
        todayMealsTotal = activeNutritionPlan.nutrition_meals.length;
    }
    if (todayMealsTotal === 0) todayMealsTotal = 1; // Fallback para no dividir por 0 si no hay comidas
    
    // Contar check-offs de hoy
    const mealsDoneToday = mealCompletions?.filter((mc: any) => 
        mc.date_completed && mc.date_completed.startsWith(todayStr)
    ).length || 0;
    
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
    let completedWorkoutsCount = workoutSessions?.length || 0;
    
    // Fallback: check if we have any workout logs for this week in case workout_sessions are not being recorded yet
    if (completedWorkoutsCount === 0 && workoutLogs) {
        const uniqueWorkoutDays = new Set();
        workoutLogs.forEach((plan: any) => {
            plan.workout_blocks?.forEach((block: any) => {
                block.workout_logs?.forEach((log: any) => {
                    if (log.logged_at && log.logged_at >= startDateStr) {
                        uniqueWorkoutDays.add(log.logged_at.split('T')[0]);
                    }
                });
            });
        });
        completedWorkoutsCount = uniqueWorkoutDays.size;
    }

    const compliance = {
        workoutsThisWeek: completedWorkoutsCount,
        workoutsTarget: weeklyWorkoutTarget,
        nutritionCompliancePercent: nutritionCompliancePercent,
        todayMealsDone: mealsDoneToday,
        todayMealsTotal: todayMealsTotal,
        currentStreak: currentStreak || 0,
        planCurrentWeek: currentWeek,
        planTotalWeeks: totalWeeks,
        planDaysRemaining: daysRemaining
    }

    return {
        client,
        activeProgram,
        nutritionPlans: nutritionPlans || [],
        nutritionLogs: nutritionLogs || [],
        checkIns: checkIns || [],
        workoutHistory: workoutLogs || [],
        payments: payments || [],
        compliance
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

    // Fetch latest check-ins to calculate averages for energy, sleep, etc.
    const { data: latestCheckIns } = await supabase
        .from('check_ins')
        .select('energy_level, sleep_quality, digestion_quality, weight, date')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(4) // e.g., last 4 weeks

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
