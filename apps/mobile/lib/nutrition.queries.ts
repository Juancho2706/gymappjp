import { supabase } from './supabase'

export async function getActiveNutritionPlanFull(clientId: string) {
  return supabase.from('nutrition_plans').select(`
    id, name, daily_calories, protein_g, carbs_g, fats_g, instructions, coach_id,
    nutrition_meals (
      id, name, description, order_index, day_of_week,
      nutrition_meal_food_items (
        id, quantity, unit, swap_options,
        foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, household_grams, household_label )
      )
    )
  `).eq('client_id', clientId).eq('is_active', true).maybeSingle()
}

export async function getNutritionLogForDate(clientId: string, planId: string, date: string) {
  return supabase.from('daily_nutrition_logs').select(`
    id, log_date, target_calories_at_log, target_protein_at_log,
    target_carbs_at_log, target_fats_at_log,
    nutrition_meal_logs ( id, meal_id, is_completed, consumed_quantity, satisfaction_score ),
    nutrition_meal_food_swaps ( meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit )
  `).eq('client_id', clientId).eq('plan_id', planId).eq('log_date', date).maybeSingle()
}

export async function getNutritionAdherence30d(clientId: string, planId: string, since: string) {
  return supabase.from('daily_nutrition_logs').select(
    'log_date, nutrition_meal_logs ( meal_id, is_completed )'
  ).eq('client_id', clientId).eq('plan_id', planId).gte('log_date', since).order('log_date')
}

export async function toggleMealCompletion(
  clientId: string,
  planId: string,
  mealId: string,
  completed: boolean,
  existingLogId: string | null,
  date: string
): Promise<{ success: boolean; logId: string | null }> {
  let logId = existingLogId

  if (!logId) {
    const { data: planMeta } = await supabase
      .from('nutrition_plans')
      .select('name, daily_calories, protein_g, carbs_g, fats_g')
      .eq('id', planId)
      .single()

    const { data: newLog } = await supabase
      .from('daily_nutrition_logs')
      .upsert({
        client_id: clientId,
        plan_id: planId,
        log_date: date,
        plan_name_at_log: planMeta?.name,
        target_calories_at_log: planMeta?.daily_calories,
        target_protein_at_log: planMeta?.protein_g,
        target_carbs_at_log: planMeta?.carbs_g,
        target_fats_at_log: planMeta?.fats_g,
      }, { onConflict: 'client_id,plan_id,log_date' })
      .select('id')
      .single()

    logId = newLog?.id ?? null
  }

  if (!logId) return { success: false, logId: null }

  if (completed) {
    const { error } = await supabase.from('nutrition_meal_logs').upsert(
      { daily_log_id: logId, meal_id: mealId, is_completed: true },
      { onConflict: 'daily_log_id,meal_id' }
    )
    if (error) return { success: false, logId }
  } else {
    const { error } = await supabase
      .from('nutrition_meal_logs')
      .delete()
      .eq('daily_log_id', logId)
      .eq('meal_id', mealId)
    if (error) return { success: false, logId }
  }

  return { success: true, logId }
}

/**
 * Porción consumida (0-100%) de una comida completada. El motor de macros la usa
 * como multiplicador. `null` = "Plan completo" (100% de macros del plan, sin
 * ajuste parcial — misma semántica que la web `partialPlanPct == null`).
 */
export async function updateMealConsumedPortion(dailyLogId: string, mealId: string, pct: number | null) {
  return supabase.from('nutrition_meal_logs').upsert(
    { daily_log_id: dailyLogId, meal_id: mealId, consumed_quantity: pct },
    { onConflict: 'daily_log_id,meal_id' }
  )
}

export async function updateMealSatisfaction(
  dailyLogId: string,
  mealId: string,
  score: 1 | 2 | 3 | null
) {
  if (score === null) {
    return supabase
      .from('nutrition_meal_logs')
      .update({ satisfaction_score: null })
      .eq('daily_log_id', dailyLogId)
      .eq('meal_id', mealId)
  }
  return supabase.from('nutrition_meal_logs').upsert(
    { daily_log_id: dailyLogId, meal_id: mealId, satisfaction_score: score },
    { onConflict: 'daily_log_id,meal_id' }
  )
}
