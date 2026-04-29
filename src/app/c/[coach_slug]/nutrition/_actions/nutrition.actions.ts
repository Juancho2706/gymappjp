'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolveCoachSwapPortionFromSwapOptions } from '@/lib/nutrition-utils'

const mealLogSelect = 'meal_id, is_completed, consumed_quantity, satisfaction_score'

async function getOrCreateDailyNutritionLogId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  planId: string,
  targetDate: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('daily_nutrition_logs')
    .select('id')
    .eq('client_id', clientId)
    .eq('plan_id', planId)
    .eq('log_date', targetDate)
    .maybeSingle()
  if (existing?.id) return existing.id

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

  if (error || !newLog?.id) return null
  return newLog.id
}

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
    const id = await getOrCreateDailyNutritionLogId(supabase, clientId, planId, targetDate)
    if (!id) return { success: false }
    dailyLogId = id
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
      .update(
        isCompleted
          ? { is_completed: true }
          : { is_completed: false, consumed_quantity: null }
      )
      .eq('id', existing.id)
  } else {
    await supabase.from('nutrition_meal_logs').insert({
      daily_log_id: dailyLogId,
      meal_id: mealId,
      is_completed: isCompleted,
    })
  }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)

  return { success: true, logId: dailyLogId }
}

const updateConsumedPortionSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
  mealId: z.string().uuid(),
  dailyLogId: z.string().uuid(),
  coachSlug: z.string().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** null = modo binario (100% del plan); 0–100 = % de macros del plan */
  consumedPct: z.union([z.null(), z.number().min(0).max(100)]),
})

const applyFoodSwapSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
  /** If omitted, server creates or loads the log for targetDate (swap sin marcar comida). */
  dailyLogId: z.string().uuid().optional(),
  mealId: z.string().uuid(),
  originalFoodId: z.string().uuid(),
  swappedFoodId: z.string().uuid(),
  coachSlug: z.string().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Ajusta % consumido del plan para una comida ya marcada completa (hoy / día seleccionado).
 */
export async function updateMealConsumedPortion(
  raw: z.infer<typeof updateConsumedPortionSchema>
): Promise<{ success: boolean }> {
  const parsed = updateConsumedPortionSchema.safeParse(raw)
  if (!parsed.success) return { success: false }

  const { clientId, planId, mealId, dailyLogId, coachSlug, targetDate, consumedPct } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false }

  const { data: logRow } = await supabase
    .from('daily_nutrition_logs')
    .select('id, client_id, plan_id, log_date')
    .eq('id', dailyLogId)
    .maybeSingle()

  if (
    !logRow ||
    logRow.client_id !== clientId ||
    logRow.plan_id !== planId ||
    logRow.log_date !== targetDate
  ) {
    return { success: false }
  }

  const { data: mealLog } = await supabase
    .from('nutrition_meal_logs')
    .select('id, is_completed')
    .eq('daily_log_id', dailyLogId)
    .eq('meal_id', mealId)
    .maybeSingle()

  if (!mealLog?.is_completed) return { success: false }

  const { error } = await supabase
    .from('nutrition_meal_logs')
    .update({
      consumed_quantity: consumedPct == null ? null : consumedPct,
    })
    .eq('id', mealLog.id)

  if (error) return { success: false }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)
  return { success: true }
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
    .select(`*, nutrition_meal_logs(${mealLogSelect}), nutrition_meal_food_swaps(meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit)`)
    .eq('client_id', userId)
    .eq('plan_id', planId)
    .eq('log_date', date)
    .maybeSingle()

  const mealCompletions: Record<string, boolean> = {}
  const logs = data?.nutrition_meal_logs as
    | { meal_id: string; is_completed: boolean; consumed_quantity: number | null }[]
    | undefined
  ;(logs ?? []).forEach((ml) => {
    mealCompletions[ml.meal_id] = ml.is_completed
  })

  return { dailyLog: data ?? null, mealCompletions }
}

/**
 * Persist a client-selected swap option configured by coach in the plan item.
 */
export async function applyMealFoodSwap(
  raw: z.infer<typeof applyFoodSwapSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = applyFoodSwapSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message }

  const {
    clientId,
    planId,
    dailyLogId: incomingLogId,
    mealId,
    originalFoodId,
    swappedFoodId,
    coachSlug,
    targetDate,
  } = parsed.data

  if (originalFoodId === swappedFoodId) {
    return { success: false, error: 'El alimento alternativo debe ser distinto.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, error: 'No autorizado' }

  let dailyLogId = incomingLogId
  if (dailyLogId) {
    const { data: logRow } = await supabase
      .from('daily_nutrition_logs')
      .select('id, client_id, plan_id, log_date')
      .eq('id', dailyLogId)
      .maybeSingle()
    if (
      !logRow ||
      logRow.client_id !== clientId ||
      logRow.plan_id !== planId ||
      logRow.log_date !== targetDate
    ) {
      dailyLogId = undefined
    }
  }
  if (!dailyLogId) {
    const id = await getOrCreateDailyNutritionLogId(supabase, clientId, planId, targetDate)
    if (!id) return { success: false, error: 'No se pudo preparar el registro del día' }
    dailyLogId = id
  }

  const { data: mealFoodRow } = await supabase
    .from('food_items')
    .select('swap_options')
    .eq('meal_id', mealId)
    .eq('food_id', originalFoodId)
    .maybeSingle()
  if (!mealFoodRow) return { success: false, error: 'El alimento original no pertenece a esta comida' }

  const allowed = ((mealFoodRow.swap_options ?? []) as Array<{ food_id?: string }>)
    .some((opt) => opt.food_id === swappedFoodId)
  if (!allowed) return { success: false, error: 'Swap no permitido por tu coach' }

  const coachPortion = resolveCoachSwapPortionFromSwapOptions(mealFoodRow.swap_options, swappedFoodId)
  if (!coachPortion) {
    return { success: false, error: 'No hay porción definida para esta alternativa; pide a tu coach que la configure.' }
  }

  const { error } = await supabase.from('nutrition_meal_food_swaps').upsert(
    {
      client_id: clientId,
      daily_log_id: dailyLogId,
      meal_id: mealId,
      original_food_id: originalFoodId,
      swapped_food_id: swappedFoodId,
      swapped_quantity: coachPortion.quantity,
      swapped_unit: coachPortion.unit,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'daily_log_id,meal_id,original_food_id',
    }
  )
  if (error) return { success: false, error: error.message }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)
  return { success: true }
}

const updateSatisfactionSchema = z.object({
  clientId: z.string().uuid(),
  dailyLogId: z.string().uuid(),
  mealId: z.string().uuid(),
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
})

const toggleFoodPrefSchema = z.object({
  clientId: z.string().uuid(),
  foodId: z.string().uuid(),
  preferenceType: z.enum(['favorite', 'dislike']),
  /** Same as clients.id for the logged-in student; revalidates coach profile. */
  clientProfileRevalidateId: z.string().uuid().optional(),
})

/** Toggle a food preference for the authenticated client. */
export async function toggleClientFoodPreference(
  raw: z.infer<typeof toggleFoodPrefSchema>
): Promise<{ success: boolean; active: boolean }> {
  const parsed = toggleFoodPrefSchema.safeParse(raw)
  if (!parsed.success) return { success: false, active: false }

  const { clientId, foodId, preferenceType, clientProfileRevalidateId } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, active: false }

  const { data: existing } = await supabase
    .from('client_food_preferences')
    .select('preference_type')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle()

  if (existing) {
    if (existing.preference_type === preferenceType) {
      const { error } = await supabase
        .from('client_food_preferences')
        .delete()
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      if (error) return { success: false, active: false }
      if (clientProfileRevalidateId) {
        revalidatePath(`/coach/clients/${clientProfileRevalidateId}`)
      }
      return { success: true, active: false }
    } else {
      const { error } = await supabase
        .from('client_food_preferences')
        .update({ preference_type: preferenceType })
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      if (error) return { success: false, active: false }
      if (clientProfileRevalidateId) {
        revalidatePath(`/coach/clients/${clientProfileRevalidateId}`)
      }
      return { success: true, active: true }
    }
  }

  const { error } = await supabase.from('client_food_preferences').insert({
    client_id: clientId,
    food_id: foodId,
    preference_type: preferenceType,
  })
  if (error) return { success: false, active: false }
  if (clientProfileRevalidateId) {
    revalidatePath(`/coach/clients/${clientProfileRevalidateId}`)
  }
  return { success: true, active: true }
}

/** Fetch all food_ids the client has marked as favorite. */
export async function getClientFoodFavoritesForClient(
  clientId: string
): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return []
  const { data } = await supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
  return (data ?? []).map((r) => r.food_id)
}

export async function updateMealSatisfaction(
  raw: z.infer<typeof updateSatisfactionSchema>
): Promise<{ success: boolean }> {
  const parsed = updateSatisfactionSchema.safeParse(raw)
  if (!parsed.success) return { success: false }

  const { clientId, dailyLogId, mealId, score } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false }

  const { data: mealLog } = await supabase
    .from('nutrition_meal_logs')
    .select('id, is_completed')
    .eq('daily_log_id', dailyLogId)
    .eq('meal_id', mealId)
    .maybeSingle()

  if (!mealLog?.is_completed) return { success: false }

  const { error } = await supabase
    .from('nutrition_meal_logs')
    .update({ satisfaction_score: score })
    .eq('id', mealLog.id)

  return { success: !error }
}
