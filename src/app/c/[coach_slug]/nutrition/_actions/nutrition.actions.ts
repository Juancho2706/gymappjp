'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Toggle de completado de una comida.
 * - targetDate: YYYY-MM-DD (hoy u otro día cuando el shell lo permita).
 */
export async function toggleMealCompletion(
  clientId: string,
  planId: string,
  mealId: string,
  isCompleted: boolean,
  existingLogId: string | undefined,
  coachSlug: string,
  targetDate: string
): Promise<{ success: boolean; logId?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) {
    return { success: false }
  }

  let dailyLogId = existingLogId

  if (!dailyLogId) {
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select('name, daily_calories, protein_g, carbs_g, fats_g')
      .eq('id', planId)
      .single()

    const { data: newLog, error } = await supabase
      .from('daily_nutrition_logs')
      .insert({
        client_id: clientId,
        plan_id: planId,
        log_date: targetDate,
        plan_name_at_log: plan?.name,
        target_calories_at_log: plan?.daily_calories,
        target_protein_at_log: plan?.protein_g,
        target_carbs_at_log: plan?.carbs_g,
        target_fats_at_log: plan?.fats_g,
      })
      .select('id')
      .single()

    if (error || !newLog) return { success: false }
    dailyLogId = newLog.id
  }

  const { data: existing } = await supabase
    .from('nutrition_meal_logs')
    .select('id')
    .eq('daily_log_id', dailyLogId)
    .eq('meal_id', mealId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('nutrition_meal_logs')
      .update({ is_completed: isCompleted })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('nutrition_meal_logs')
      .insert({ daily_log_id: dailyLogId, meal_id: mealId, is_completed: isCompleted })
  }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)

  return { success: true, logId: dailyLogId }
}

export async function fetchLogForDate(
  userId: string,
  planId: string,
  date: string
): Promise<{ dailyLog: unknown; mealCompletions: Record<string, boolean> }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== userId) {
    return { dailyLog: null, mealCompletions: {} }
  }

  const { data } = await supabase
    .from('daily_nutrition_logs')
    .select(`*, nutrition_meal_logs(meal_id, is_completed)`)
    .eq('client_id', userId)
    .eq('plan_id', planId)
    .eq('log_date', date)
    .maybeSingle()

  const mealCompletions: Record<string, boolean> = {}
  const logs = data?.nutrition_meal_logs as { meal_id: string; is_completed: boolean }[] | undefined
  ;(logs ?? []).forEach((ml) => {
    mealCompletions[ml.meal_id] = ml.is_completed
  })

  return { dailyLog: data ?? null, mealCompletions }
}
