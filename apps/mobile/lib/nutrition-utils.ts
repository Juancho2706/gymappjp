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

export type MealWithFoodItems = { id: string; food_items: FoodItemForMacros[] }

export type NutritionMealMacroSource = {
  id: string
  day_of_week?: number | null
  food_items?: Array<{
    id?: string
    quantity: number
    unit?: string | null
    swap_options?: unknown
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

// ─── Swap options (intercambios) — helpers 1:1 con la web ───────────────────
export function swapOptionIsLiquid(opt: { is_liquid?: boolean | null; serving_unit?: string | null }): boolean {
  if (String(opt.serving_unit ?? '').toLowerCase() === 'ml') return true
  if (typeof opt.is_liquid === 'boolean') return opt.is_liquid
  return false
}

export function swapOptionAllowedUnits(isLiquid: boolean): readonly ('g' | 'un' | 'ml')[] {
  return isLiquid ? (['ml', 'un'] as const) : (['g', 'un'] as const)
}

/** Coacciona la unidad guardada a una permitida para ese alimento (corrige JSON legacy). */
export function coerceSwapOptionUnit(unit: string | null | undefined, isLiquid: boolean): 'g' | 'un' | 'ml' {
  const allowed = swapOptionAllowedUnits(isLiquid) as readonly string[]
  const u = String(unit ?? '').toLowerCase()
  if (allowed.includes(u)) return u as 'g' | 'un' | 'ml'
  return isLiquid ? 'ml' : 'g'
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

function coerceUnit(unit: string | null | undefined, isLiquid: boolean): 'g' | 'un' | 'ml' {
  const allowed = isLiquid ? ['ml', 'un'] : ['g', 'un']
  const u = String(unit ?? '').toLowerCase()
  if (allowed.includes(u)) return u as 'g' | 'un' | 'ml'
  return isLiquid ? 'ml' : 'g'
}

function normalizeSwapOptions(raw: unknown): FoodItemForMacros['swap_options'] {
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
      return {
        food_id: obj.food_id,
        quantity: Number(obj.quantity) || Number(obj.serving_size) || 100,
        unit: coerceUnit(typeof obj.unit === 'string' ? obj.unit : undefined, is_liquid),
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

export function normalizeMealForMacros(meal: NutritionMealMacroSource): MealWithFoodItems {
  return {
    id: meal.id,
    food_items: (meal.food_items ?? []).map((fi) => ({
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

export function portionPctMapFromMealLogs(
  logs: ReadonlyArray<{ meal_id: string; is_completed: boolean; consumed_quantity?: number | null }>
): Map<string, number> {
  const m = new Map<string, number>()
  for (const row of logs) {
    if (!row.is_completed || row.consumed_quantity == null) continue
    const n = Number(row.consumed_quantity)
    if (!Number.isNaN(n)) m.set(row.meal_id, n)
  }
  return m
}

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
