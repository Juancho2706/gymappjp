'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const mealLogSelect = 'meal_id, is_completed, consumed_quantity'

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
    .select(`*, nutrition_meal_logs(${mealLogSelect})`)
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
