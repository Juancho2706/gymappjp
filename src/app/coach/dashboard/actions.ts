'use server'

import { createClient } from '@/lib/supabase/server'
import { PostgrestResponse } from '@supabase/supabase-js'

export async function getAdherenceStats() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    // 1. Obtener todos los alumnos del coach
    const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)

    if (!clients) return []

    // 2. Para cada alumno, calcular adherencia (sets logueados / sets programados) de la última semana
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)

    const stats = await Promise.all(clients.map(async (client) => {
        // Usar cast a any para evitar errores de TS hasta que los tipos de la base de datos se actualicen
        const { data: logs } = await supabase
            .from('workout_logs')
            .select('*')
            .eq('client_id', client.id)
            .gte('logged_at', lastWeek.toISOString()) as any

        // Obtener bloques de entrenamiento programados activos para este cliente
        const { data: activePlans } = await supabase
            .from('workout_plans')
            .select('id')
            .eq('client_id', client.id)

        let totalPlannedSets = 0
        if (activePlans && activePlans.length > 0) {
            const planIds = activePlans.map(p => p.id)
            const { data: blocks } = await supabase
                .from('workout_blocks')
                .select('sets')
                .in('plan_id', planIds)
            
            totalPlannedSets = blocks?.reduce((acc, b) => acc + (b.sets || 0), 0) || 0
        }

        const logsCount = logs?.length || 0
        const percentage = totalPlannedSets > 0 
            ? Math.min(Math.round((logsCount / totalPlannedSets) * 100), 100) 
            : 0

        const lastPlanName = logs && logs.length > 0 
            ? logs[logs.length - 1].plan_name_at_log || 'Plan Actual' 
            : 'Sin actividad reciente'

        return {
            clientId: client.id,
            clientName: client.full_name,
            percentage,
            lastPlan: lastPlanName,
            completedSets: logsCount,
            totalSets: totalPlannedSets
        }
    }))

    return stats
}

export async function getNutritionStats() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)

    if (!clients) return []

    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)

    const stats = await Promise.all(clients.map(async (client) => {
        const { data: dailyLogs } = await supabase
            .from('daily_nutrition_logs')
            .select(`
                *,
                nutrition_meal_logs (
                    *,
                    nutrition_meals (
                        *,
                        food_items (
                            *,
                            foods (*)
                        )
                    )
                )
            `)
            .eq('client_id', client.id)
            .gte('log_date', lastWeek.toISOString().split('T')[0]) as any

        let totalConsumed = { cal: 0, prot: 0, carb: 0, fat: 0 }
        let totalTarget = { cal: 0, prot: 0, carb: 0, fat: 0 }
        let mealsCompleted = 0
        let totalMeals = 0
        let lastPlanName = 'Sin plan'

        dailyLogs?.forEach((log: any) => {
            lastPlanName = log.plan_name_at_log || lastPlanName
            totalTarget.cal += log.target_calories_at_log || 0
            totalTarget.prot += log.target_protein_at_log || 0
            totalTarget.carb += log.target_carbs_at_log || 0
            totalTarget.fat += log.target_fats_at_log || 0

            log.nutrition_meal_logs?.forEach((mealLog: any) => {
                totalMeals++
                if (mealLog.is_completed) {
                    mealsCompleted++
                    mealLog.nutrition_meals?.food_items?.forEach((item: any) => {
                        const f = item.foods
                        if (f) {
                            const q = (item.quantity || 0) / (f.serving_size || 100)
                            totalConsumed.cal += (f.calories || 0) * q
                            totalConsumed.prot += (f.protein_g || 0) * q
                            totalConsumed.carb += (f.carbs_g || 0) * q
                            totalConsumed.fat += (f.fats_g || 0) * q
                        }
                    })
                }
            })
        })

        const adherencePercentage = totalMeals > 0 
            ? Math.round((mealsCompleted / totalMeals) * 100) 
            : 0

        return {
            clientId: client.id,
            clientName: client.full_name,
            percentage: adherencePercentage,
            lastPlan: lastPlanName,
            consumed: totalConsumed,
            target: totalTarget
        }
    }))

    return stats
}
