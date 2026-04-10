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

export function calculateFoodItemMacros(item: FoodItemForMacros) {
  const { quantity, unit, foods } = item

  const isWeight = ['g', 'ml', 'gr'].includes(unit?.toLowerCase() ?? '')
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

export function calculateConsumedMacros(meals: MealWithFoodItems[], completedMealIds: Set<string>) {
  return meals
    .filter((m) => completedMealIds.has(m.id))
    .reduce(
      (acc, meal) => {
        const m = sumMealMacros(meal)
        acc.calories += m.calories
        acc.protein += m.protein
        acc.carbs += m.carbs
        acc.fats += m.fats
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    )
}
