'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleMealCompletion(
    clientId: string,
    planId: string,
    mealId: string,
    isCompleted: boolean,
    existingLogId: string | undefined,
    coachSlug: string
) {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    let dailyLogId = existingLogId

    // 1. If daily log doesn't exist today, create it
    if (!dailyLogId) {
        const { data: newLog, error: logError } = await supabase
            .from('daily_nutrition_logs')
            .insert({
                client_id: clientId,
                plan_id: planId,
                log_date: today,
            })
            .select('id')
            .single()

        if (logError || !newLog) {
            console.error('Failed to create daily log:', logError)
            return
        }
        dailyLogId = newLog.id
    }

    // 2. Check if a meal log exists for this meal today
    const { data: existingMealLog } = await supabase
        .from('nutrition_meal_logs')
        .select('id')
        .eq('daily_log_id', dailyLogId)
        .eq('meal_id', mealId)
        .maybeSingle()

    if (existingMealLog) {
        // Update
        await supabase
            .from('nutrition_meal_logs')
            .update({ is_completed: isCompleted })
            .eq('id', existingMealLog.id)
    } else {
        // Insert
        await supabase
            .from('nutrition_meal_logs')
            .insert({
                daily_log_id: dailyLogId,
                meal_id: mealId,
                is_completed: isCompleted
            })
    }

    revalidatePath(`/c/${coachSlug}/nutrition`)
    revalidatePath(`/c/${coachSlug}/dashboard`)
}
