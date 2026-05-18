/**
 * Cálculo de macros por ítem de comida y agregación (plan nutrición alumno/coach).
 * Los valores en BD son por 100g/ml; unidades “count” usan serving_size del alimento.
 */
import type { Json } from './database.types'

export type FoodMacrosRow = {
  id?: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
}

export type FoodItemForMacros = {
  id?: string
  quantity: number
  unit: string
  foods: FoodMacrosRow
  swap_options?: Array<{
    food_id: string
    quantity?: number
    unit?: string
    /** Persisted from PlanBuilder; if absent, infer from serving_unit === ml */
    is_liquid?: boolean | null
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit?: string | null
  }>
}

/** Whether a swap-option row represents a liquid (for allowed units ml|un vs g|un). */
export function swapOptionIsLiquid(opt: {
  is_liquid?: boolean | null
  serving_unit?: string | null
}): boolean {
  if (String(opt.serving_unit ?? '').toLowerCase() === 'ml') return true
  if (typeof opt.is_liquid === 'boolean') return opt.is_liquid
  return false
}

export function swapOptionAllowedUnits(isLiquid: boolean): readonly ('g' | 'un' | 'ml')[] {
  return isLiquid ? (['ml', 'un'] as const) : (['g', 'un'] as const)
}

/** Coerce stored unit to one allowed for that food (fixes legacy JSON with wrong unit). */
export function coerceSwapOptionUnit(
  unit: string | null | undefined,
  isLiquid: boolean
): 'g' | 'un' | 'ml' {
  const allowed = swapOptionAllowedUnits(isLiquid) as readonly string[]
  const u = String(unit ?? '').toLowerCase()
  if (allowed.includes(u)) return u as 'g' | 'un' | 'ml'
  return isLiquid ? 'ml' : 'g'
}

/** Coach-defined quantity/unit for a swap option row (from `food_items.swap_options` JSON). */
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
 * Calcula macros de un ítem de comida según cantidad y unidad.
 *
 * Unidades canónicas:
 *   'g'  → gramos: proporcional directo → factor = qty / 100
 *   'ml' → mililitros: igual que gramos (macros en BD son por 100ml) → factor = qty / 100
 *   'un' → unidades contables: usa serving_size → factor = (qty × serving_size) / 100
 *
 * Ejemplo:
 *   Huevo: protein_g=13 por 100g, serving_size=60 (1 huevo ≈ 60g)
 *   - 1 un → factor = (1 × 60) / 100 = 0.6 → proteína = 7.8g
 *   - 100 g → factor = 1.0 → proteína = 13g
 *   Aceite: fats_g=100 por 100ml, serving_size=14
 *   - 15 ml → factor = 15/100 = 0.15 → grasas = 15g  ✓ (antes: 15×14/100=2.1 → 210g ✗)
 */
export function calculateFoodItemMacros(item: FoodItemForMacros) {
  const { quantity, unit, foods } = item

  const unitLower = unit?.toLowerCase() ?? 'g'
  const isDirectProportion = unitLower === 'g' || unitLower === 'ml'
  const factor = isDirectProportion
    ? quantity / 100
    : (quantity * foods.serving_size) / 100

  return {
    calories: Math.round(foods.calories * factor * 10) / 10,
    protein: Math.round(foods.protein_g * factor * 10) / 10,
    carbs: Math.round(foods.carbs_g * factor * 10) / 10,
    fats: Math.round(foods.fats_g * factor * 10) / 10,
  }
}

export function sumMealMacros(meal: { food_items: FoodItemForMacros[] }) {
  return meal.food_items.reduce(
    (acc, item) => {
      const m = calculateFoodItemMacros(item)
      acc.calories += m.calories
      acc.protein += m.protein
      acc.carbs += m.carbs
      acc.fats += m.fats
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

export type MealWithFoodItems = { id: string; food_items: FoodItemForMacros[] }

/** Fila `nutrition_meals` + ítems anidados (p. ej. select de Supabase). */
export type NutritionMealMacroSource = {
  id: string
  day_of_week?: number | null
  food_items?: Array<{
    id?: string
    quantity: number
    unit?: string | null
    swap_options?: Json | null
    foods?: {
      id?: string
      name?: string
      calories?: number
      protein_g?: number
      carbs_g?: number
      fats_g?: number
      serving_size?: number
      serving_unit?: string | null
    } | null
  }>
}

function normalizeSwapOptions(raw: Json | null | undefined): FoodItemForMacros['swap_options'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => {
      if (!v || typeof v !== 'object') return null
      const obj = v as Record<string, unknown>
      if (typeof obj.food_id !== 'string') return null
      const servingUnit = typeof obj.serving_unit === 'string' ? obj.serving_unit : null
      const is_liquid =
        String(servingUnit ?? '').toLowerCase() === 'ml'
          ? true
          : typeof obj.is_liquid === 'boolean'
            ? obj.is_liquid
            : false
      const rawUnit = typeof obj.unit === 'string' ? obj.unit : undefined
      return {
        food_id: obj.food_id,
        quantity: Number(obj.quantity) || Number(obj.serving_size) || 100,
        unit: coerceSwapOptionUnit(rawUnit, is_liquid),
        is_liquid,
        name: typeof obj.name === 'string' ? obj.name : '',
        calories: Number(obj.calories) || 0,
        protein_g: Number(obj.protein_g) || 0,
        carbs_g: Number(obj.carbs_g) || 0,
        fats_g: Number(obj.fats_g) || 0,
        serving_size: Number(obj.serving_size) || 100,
        serving_unit: servingUnit,
      }
    })
    .filter((v): v is NonNullable<typeof v> => v != null)
}

/** Convierte `nutrition_meals` + `food_items` anidados desde Supabase al shape de macros. */
export function normalizeMealForMacros(meal: NutritionMealMacroSource): MealWithFoodItems {
  const items = meal.food_items ?? []
  return {
    id: meal.id,
    food_items: items.map((fi) => ({
      id: fi.id,
      quantity: Number(fi.quantity) || 0,
      unit: fi.unit ?? 'g',
      swap_options: normalizeSwapOptions(fi.swap_options),
      foods: {
        id: fi.foods?.id,
        name: fi.foods?.name ?? '',
        calories: fi.foods?.calories ?? 0,
        protein_g: fi.foods?.protein_g ?? 0,
        carbs_g: fi.foods?.carbs_g ?? 0,
        fats_g: fi.foods?.fats_g ?? 0,
        serving_size: fi.foods?.serving_size ?? 100,
        serving_unit: fi.foods?.serving_unit ?? null,
      },
    })),
  }
}

export type MealFoodSwapApplied = {
  meal_id: string
  original_food_id: string
  swapped_food_id: string
  swapped_quantity?: number | null
  swapped_unit?: string | null
}

export function applyMealFoodSwaps(
  meal: MealWithFoodItems,
  swapsByOriginalFoodId: ReadonlyMap<
    string,
    {
      swappedFood: FoodMacrosRow
      swappedQuantity?: number | null
      swappedUnit?: string | null
    }
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

/** Mapa meal_id → % (0–100) solo para comidas completadas con ajuste parcial explícito. */
export function portionPctMapFromMealLogs(
  logs: ReadonlyArray<{ meal_id: string; is_completed: boolean; consumed_quantity?: number | null }>
): Map<string, number> {
  const m = new Map<string, number>()
  for (const row of logs) {
    if (!row.is_completed || row.consumed_quantity == null) continue
    const n = Number(row.consumed_quantity)
    if (Number.isNaN(n)) continue
    m.set(row.meal_id, n)
  }
  return m
}

/**
 * Porcentaje explícito (0-100) por meal_id. Solo filas presentes en el mapa escalan macros;
 * ausencia de clave = 100% del plan (modo binario).
 */
export function mealConsumedPortionMultiplier(
  mealId: string,
  portionPctByMealId?: ReadonlyMap<string, number>
): number {
  if (!portionPctByMealId?.has(mealId)) return 1
  const pct = portionPctByMealId.get(mealId)!
  if (Number.isNaN(pct)) return 1
  return Math.min(Math.max(pct / 100, 0), 1)
}

export function calculateConsumedMacros(
  meals: MealWithFoodItems[],
  completedMealIds: Set<string>,
  portionPctByMealId?: ReadonlyMap<string, number>
) {
  return meals
    .filter((m) => completedMealIds.has(m.id))
    .reduce(
      (acc, meal) => {
        const mult = mealConsumedPortionMultiplier(meal.id, portionPctByMealId)
        const m = sumMealMacros(meal)
        acc.calories += m.calories * mult
        acc.protein += m.protein * mult
        acc.carbs += m.carbs * mult
        acc.fats += m.fats * mult
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    )
}

export function hasAnyMealMacroData(meals: MealWithFoodItems[]) {
  return meals.some((meal) => {
    const m = sumMealMacros(meal)
    return m.calories > 0 || m.protein > 0 || m.carbs > 0 || m.fats > 0
  })
}

export function calculateConsumedMacrosWithCompletionFallback(
  meals: MealWithFoodItems[],
  completedMealIds: Set<string>,
  goals: { calories: number; protein: number; carbs: number; fats: number },
  portionPctByMealId?: ReadonlyMap<string, number>
) {
  const consumed = calculateConsumedMacros(meals, completedMealIds, portionPctByMealId)
  if (hasAnyMealMacroData(meals)) return consumed

  const totalMeals = meals.length
  if (totalMeals === 0) return consumed

  let weighted = 0
  for (const m of meals) {
    if (!completedMealIds.has(m.id)) continue
    weighted += mealConsumedPortionMultiplier(m.id, portionPctByMealId)
  }
  const ratio = Math.min(Math.max(weighted / totalMeals, 0), 1)
  return {
    calories: goals.calories * ratio,
    protein: goals.protein * ratio,
    carbs: goals.carbs * ratio,
    fats: goals.fats * ratio,
  }
}
