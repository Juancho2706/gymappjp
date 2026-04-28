/**
 * Cálculo de macros por ítem de comida y agregación (plan nutrición alumno/coach).
 * Los valores en BD son por 100g/ml; unidades “count” usan serving_size del alimento.
 */

export type FoodMacrosRow = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
}

export type FoodItemForMacros = {
  quantity: number
  unit: string
  foods: FoodMacrosRow
}

/**
 * Calcula macros de un ítem de comida según cantidad y unidad.
 *
 * Unidades canónicas (2 tipos):
 *   'g'  → gramos: proporcional directo → factor = qty / 100
 *   'un' → unidades contables: usa serving_size → factor = (qty × serving_size) / 100
 *
 * Unidades legacy compatibles (migración pendiente a 'g' o 'un'):
 *   'ml', 'gr' → tratadas como peso ('g')
 *   'cda', 'cdta', 'taza', 'porción' → tratadas como unidades ('un')
 *
 * Ejemplo:
 *   Huevo: protein_g=13 por 100g, serving_size=60 (1 huevo ≈ 60g)
 *   - 1 un → factor = (1 × 60) / 100 = 0.6 → proteína = 7.8g
 *   - 100 g → factor = 1.0 → proteína = 13g
 */
export function calculateFoodItemMacros(item: FoodItemForMacros) {
  const { quantity, unit, foods } = item

  const unitLower = unit?.toLowerCase() ?? 'g'
  const isWeight = unitLower === 'g' || unitLower === 'ml' || unitLower === 'gr'
  const factor = isWeight
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
    quantity: number
    unit?: string | null
    foods?: {
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

/** Convierte `nutrition_meals` + `food_items` anidados desde Supabase al shape de macros. */
export function normalizeMealForMacros(meal: NutritionMealMacroSource): MealWithFoodItems {
  const items = meal.food_items ?? []
  return {
    id: meal.id,
    food_items: items.map((fi) => ({
      quantity: Number(fi.quantity) || 0,
      unit: fi.unit ?? 'g',
      foods: {
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
