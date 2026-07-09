/**
 * Swaps de alimento interactivos + favoritos (E4-08 / gap B5).
 *
 * Espeja la lógica de las server actions web `applyMealFoodSwap` /
 * `toggleClientFoodPreference` (`apps/web/src/app/c/[coach_slug]/nutrition/
 * _actions/nutrition.actions.ts`) contra PostgREST directo. La seguridad NO es
 * de módulo (swaps/favoritos son base tier): el gate real es la RLS
 * client-scoped (`auth.uid() = client_id`) de `nutrition_meal_food_swaps` y
 * `client_food_preferences` (baseline: policies "client own meal food swaps" /
 * "client own prefs"). Como `clients.id === auth.uid()` para el alumno,
 * `clientId` = `client.id` = auth uid en ambas tablas.
 *
 * El recálculo de macros usa EXCLUSIVAMENTE `@eva/nutrition-engine`
 * (`calculateFoodItemMacros`) — sin copiar lógica de web.
 */

import { supabase } from './supabase'
import { calculateFoodItemMacros } from './nutrition-utils'
import type { FoodItemForMacros, FoodMacrosRow } from './nutrition-utils'

/** Una opción de intercambio ya normalizada (shape de `FoodItemForMacros['swap_options']`). */
export type SwapOption = NonNullable<FoodItemForMacros['swap_options']>[number]

export interface MealMacros {
  calories: number
  protein: number
  carbs: number
  fats: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ── Helpers PUROS de recálculo (motor @eva/nutrition-engine) ─────────────────

/** Mapea una `SwapOption` al shape `FoodMacrosRow` que consume el motor. */
export function swapOptionToFoodRow(opt: SwapOption): FoodMacrosRow {
  return {
    id: opt.food_id,
    name: opt.name,
    calories: opt.calories,
    protein_g: opt.protein_g,
    carbs_g: opt.carbs_g,
    fats_g: opt.fats_g,
    serving_size: opt.serving_size,
    serving_unit: opt.serving_unit ?? null,
  }
}

/** Macros del ítem original (porción/unidad del plan). */
export function macrosForFoodItem(item: FoodItemForMacros): MealMacros {
  return calculateFoodItemMacros(item)
}

/**
 * Macros recalculadas de una alternativa, usando la porción/unidad que definió el
 * coach en la opción (misma cantidad que se persiste al aplicar el swap).
 */
export function macrosForSwapOption(opt: SwapOption): MealMacros {
  return calculateFoodItemMacros({
    quantity: opt.quantity ?? opt.serving_size ?? 100,
    unit: opt.unit ?? 'g',
    foods: swapOptionToFoodRow(opt),
  })
}

/** Delta (alternativa − original) por macro; útil para la etiqueta "▲/▼ N kcal". */
export function swapMacroDelta(item: FoodItemForMacros, opt: SwapOption): MealMacros {
  const a = macrosForFoodItem(item)
  const b = macrosForSwapOption(opt)
  return {
    calories: round1(b.calories - a.calories),
    protein: round1(b.protein - a.protein),
    carbs: round1(b.carbs - a.carbs),
    fats: round1(b.fats - a.fats),
  }
}

// ── Persistencia (PostgREST + RLS del alumno) ────────────────────────────────

/**
 * Asegura la fila `daily_nutrition_logs` del día (mismo patrón que
 * `toggleMealCompletion` en `nutrition.queries.ts`) y devuelve su id.
 */
async function ensureDailyNutritionLog(
  clientId: string,
  planId: string,
  date: string
): Promise<string | null> {
  const { data: planMeta } = await supabase
    .from('nutrition_plans')
    .select('name, daily_calories, protein_g, carbs_g, fats_g')
    .eq('id', planId)
    .single()

  const { data: newLog } = await supabase
    .from('daily_nutrition_logs')
    .upsert(
      {
        client_id: clientId,
        plan_id: planId,
        log_date: date,
        plan_name_at_log: planMeta?.name,
        target_calories_at_log: planMeta?.daily_calories,
        target_protein_at_log: planMeta?.protein_g,
        target_carbs_at_log: planMeta?.carbs_g,
        target_fats_at_log: planMeta?.fats_g,
      },
      { onConflict: 'client_id,plan_id,log_date' }
    )
    .select('id')
    .single()

  return newLog?.id ?? null
}

export interface ApplySwapParams {
  clientId: string
  planId: string
  /** Log del día si ya existe (evita el upsert); se crea si falta. */
  dailyLogId?: string | null
  mealId: string
  originalFoodId: string
  /** Alternativa elegida (normalizada). `food_id` != originalFoodId. */
  option: SwapOption
  targetDate: string
}

/**
 * Aplica (upsert) un intercambio de alimento para el día. Persiste la porción del
 * coach (`option.quantity`/`option.unit`) — espejo exacto de la web. Devuelve el
 * `dailyLogId` resuelto para que el shell reconcilie sin refetch si quiere.
 */
export async function applyMealFoodSwap(
  params: ApplySwapParams
): Promise<{ success: boolean; error?: string; dailyLogId?: string }> {
  const { clientId, planId, mealId, originalFoodId, option, targetDate } = params
  if (originalFoodId === option.food_id) {
    return { success: false, error: 'El alimento alternativo debe ser distinto.' }
  }

  let dailyLogId = params.dailyLogId ?? undefined
  if (!dailyLogId) {
    const id = await ensureDailyNutritionLog(clientId, planId, targetDate)
    if (!id) return { success: false, error: 'No se pudo preparar el registro del día' }
    dailyLogId = id
  }

  const { error } = await supabase.from('nutrition_meal_food_swaps').upsert(
    {
      client_id: clientId,
      daily_log_id: dailyLogId,
      meal_id: mealId,
      original_food_id: originalFoodId,
      swapped_food_id: option.food_id,
      swapped_quantity: option.quantity ?? option.serving_size ?? null,
      swapped_unit: option.unit ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'daily_log_id,meal_id,original_food_id' }
  )
  if (error) return { success: false, error: error.message }
  return { success: true, dailyLogId }
}

/** Revierte un intercambio (borra la fila) → vuelve al alimento original del plan. */
export async function clearMealFoodSwap(params: {
  dailyLogId: string
  mealId: string
  originalFoodId: string
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('nutrition_meal_food_swaps')
    .delete()
    .eq('daily_log_id', params.dailyLogId)
    .eq('meal_id', params.mealId)
    .eq('original_food_id', params.originalFoodId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Favoritos de alimento ────────────────────────────────────────────────────

/**
 * Toggle favorito de un alimento (`client_food_preferences`). Espeja la guarda
 * de la web: el alumno NUNCA pisa un marcador de alergia/intolerancia del coach
 * (fila compartida por PK client_id,food_id) — ahí el toggle es no-op.
 */
export async function toggleClientFoodFavorite(params: {
  clientId: string
  foodId: string
}): Promise<{ success: boolean; active: boolean; blocked?: boolean }> {
  const { clientId, foodId } = params

  const { data: existing } = await supabase
    .from('client_food_preferences')
    .select('preference_type')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle()

  if (existing && (existing.preference_type === 'allergy' || existing.preference_type === 'intolerance')) {
    return { success: false, active: false, blocked: true }
  }

  if (existing) {
    if (existing.preference_type === 'favorite') {
      const { error } = await supabase
        .from('client_food_preferences')
        .delete()
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      if (error) return { success: false, active: true }
      return { success: true, active: false }
    }
    const { error } = await supabase
      .from('client_food_preferences')
      .update({ preference_type: 'favorite' })
      .eq('client_id', clientId)
      .eq('food_id', foodId)
    if (error) return { success: false, active: false }
    return { success: true, active: true }
  }

  const { error } = await supabase
    .from('client_food_preferences')
    .insert({ client_id: clientId, food_id: foodId, preference_type: 'favorite' })
  if (error) return { success: false, active: false }
  return { success: true, active: true }
}

/** Set de food_ids marcados como favoritos por el alumno. */
export async function getClientFoodFavorites(clientId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
  return new Set((data ?? []).map((r) => r.food_id as string))
}
