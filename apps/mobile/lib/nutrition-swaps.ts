import { supabase } from './supabase'
import {
  coerceSwapOptionUnit,
  type FoodItemForMacros,
  type FoodMacrosRow,
  type MealWithFoodItems,
} from './nutrition-utils'

/**
 * Food SWAP (intercambio de alimento del modo gramos) — lado ALUMNO (mobile).
 *
 * Espejo de:
 *  - packages/nutrition-engine/macros.ts (applyMealFoodSwaps + resolveCoachSwapPortionFromSwapOptions)
 *  - apps/web/src/app/c/[coach_slug]/nutrition/_actions/nutrition.actions.ts#applyMealFoodSwap
 *
 * El swap NO edita el plan: persiste una fila en `nutrition_meal_food_swaps` (por daily_log + meal
 * + original_food) con la PORCION definida por el coach en `food_items.swap_options`. La vista
 * reemplaza el alimento original por el alternativo (applyMealFoodSwaps puro). RLS = techo.
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * applyMealFoodSwaps / resolveCoachSwapPortionFromSwapOptions se espejan INLINE verbatim del
 * package (mobile/lib/nutrition-utils.ts no los re-exporta — solo trae el subset de macros). Si
 * cambia el motor, actualizar. La tabla real de items es `food_items` (el embed PostgREST del plan
 * usa el alias `nutrition_meal_food_items`).
 */

export type MealFoodSwapApplied = {
  meal_id: string
  original_food_id: string
  swapped_food_id: string
  swapped_quantity?: number | null
  swapped_unit?: string | null
}

/** Reemplaza en la comida los alimentos con swap activo por su alternativo (PURO, espejo verbatim). */
export function applyMealFoodSwaps(
  meal: MealWithFoodItems,
  swapsByOriginalFoodId: ReadonlyMap<
    string,
    { swappedFood: FoodMacrosRow; swappedQuantity?: number | null; swappedUnit?: string | null }
  >
): MealWithFoodItems {
  if (swapsByOriginalFoodId.size === 0) return meal
  return {
    ...meal,
    food_items: meal.food_items.map((item) => {
      const originalFoodId = item.foods.id
      if (!originalFoodId) return item
      const swap = swapsByOriginalFoodId.get(originalFoodId)
      if (!swap) return item
      return {
        ...item,
        foods: swap.swappedFood,
        quantity:
          swap.swappedQuantity != null && Number.isFinite(swap.swappedQuantity)
            ? swap.swappedQuantity
            : item.quantity,
        unit: swap.swappedUnit ?? item.unit,
      }
    }),
  }
}

/** Porcion/unidad definida por el coach para una opcion de swap (PURO, espejo verbatim). */
export function resolveCoachSwapPortionFromSwapOptions(
  swapOptions: unknown,
  swappedFoodId: string
): { quantity: number; unit: 'g' | 'un' | 'ml' } | null {
  if (!Array.isArray(swapOptions)) return null
  for (const raw of swapOptions) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    if (o.food_id !== swappedFoodId) continue
    const servingSize = Number(o.serving_size) || 100
    const qtyRaw = o.quantity != null ? Number(o.quantity) : NaN
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : servingSize || 100
    const servingUnit = typeof o.serving_unit === 'string' ? o.serving_unit : null
    const isLiquid =
      String(servingUnit ?? '').toLowerCase() === 'ml'
        ? true
        : typeof o.is_liquid === 'boolean'
          ? o.is_liquid
          : false
    const unitRaw = typeof o.unit === 'string' ? o.unit : undefined
    return { quantity: qty, unit: coerceSwapOptionUnit(unitRaw, isLiquid) }
  }
  return null
}

/**
 * Construye el mapa originalFoodId -> alternativo desde las filas de swap del log + los
 * swap_options del item (para resolver los macros del alimento alternativo). Espejo de la
 * derivacion en NutritionShell (mealsVisibleWithSwaps).
 */
export function buildSwapMapForMeal(
  meal: MealWithFoodItems,
  swapRows: MealFoodSwapApplied[]
): Map<string, { swappedFood: FoodMacrosRow; swappedQuantity?: number | null; swappedUnit?: string | null }> {
  const out = new Map<
    string,
    { swappedFood: FoodMacrosRow; swappedQuantity?: number | null; swappedUnit?: string | null }
  >()
  if (swapRows.length === 0) return out
  const swapByOriginal = new Map(swapRows.filter((s) => s.meal_id === meal.id).map((s) => [s.original_food_id, s]))
  for (const item of meal.food_items) {
    const originalFoodId = item.foods.id
    if (!originalFoodId) continue
    const swapRow = swapByOriginal.get(originalFoodId)
    if (!swapRow) continue
    const option = (item.swap_options ?? []).find((x) => x.food_id === swapRow.swapped_food_id)
    if (!option) continue
    out.set(originalFoodId, {
      swappedFood: {
        id: option.food_id,
        name: option.name,
        calories: option.calories,
        protein_g: option.protein_g,
        carbs_g: option.carbs_g,
        fats_g: option.fats_g,
        serving_size: option.serving_size,
        serving_unit: option.serving_unit ?? null,
      },
      swappedQuantity: swapRow.swapped_quantity ?? null,
      swappedUnit: swapRow.swapped_unit ?? null,
    })
  }
  return out
}

/**
 * Aplica un swap del alumno (insert/upsert en nutrition_meal_food_swaps con la porcion del coach).
 * Espejo de applyMealFoodSwap (action web). Valida: el alimento original pertenece a la comida, el
 * swap esta permitido por el coach (swap_options) y tiene porcion definida. RLS exige propiedad.
 *
 * @param dailyLogId log del dia (debe existir; el toggle de comida lo crea). Si null, falla suave.
 */
export async function applyMealFoodSwap(input: {
  clientId: string
  dailyLogId: string | null
  mealId: string
  originalFoodId: string
  swappedFoodId: string
}): Promise<{ success: boolean; error?: string }> {
  if (input.originalFoodId === input.swappedFoodId) {
    return { success: false, error: 'El alimento alternativo debe ser distinto.' }
  }
  if (!input.dailyLogId) {
    return { success: false, error: 'Marca la comida como completada antes de intercambiar.' }
  }
  try {
    const { data: mealFoodRow } = await supabase
      .from('food_items')
      .select('swap_options')
      .eq('meal_id', input.mealId)
      .eq('food_id', input.originalFoodId)
      .maybeSingle()
    if (!mealFoodRow) return { success: false, error: 'El alimento original no pertenece a esta comida.' }

    const swapOptions = (mealFoodRow as any).swap_options
    const allowed = ((swapOptions ?? []) as Array<{ food_id?: string }>).some(
      (opt) => opt.food_id === input.swappedFoodId
    )
    if (!allowed) return { success: false, error: 'Swap no permitido por tu coach.' }

    const coachPortion = resolveCoachSwapPortionFromSwapOptions(swapOptions, input.swappedFoodId)
    if (!coachPortion) {
      return { success: false, error: 'No hay porción definida para esta alternativa.' }
    }

    const { error } = await supabase.from('nutrition_meal_food_swaps').upsert(
      {
        client_id: input.clientId,
        daily_log_id: input.dailyLogId,
        meal_id: input.mealId,
        original_food_id: input.originalFoodId,
        swapped_food_id: input.swappedFoodId,
        swapped_quantity: coachPortion.quantity,
        swapped_unit: coachPortion.unit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'daily_log_id,meal_id,original_food_id' }
    )
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo aplicar el intercambio.' }
  }
}

/** Revierte un swap (borra la fila). El alimento original vuelve a mostrarse. */
export async function clearMealFoodSwap(input: {
  clientId: string
  dailyLogId: string | null
  mealId: string
  originalFoodId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!input.dailyLogId) return { success: true }
  try {
    const { error } = await supabase
      .from('nutrition_meal_food_swaps')
      .delete()
      .eq('client_id', input.clientId)
      .eq('daily_log_id', input.dailyLogId)
      .eq('meal_id', input.mealId)
      .eq('original_food_id', input.originalFoodId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo revertir el intercambio.' }
  }
}
