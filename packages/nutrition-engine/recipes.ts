import { calculateFoodItemMacros } from './macros'

export type RecipeIngredientUnit = 'g' | 'ml' | 'un'

export type StructuredRecipeIngredient = {
  id?: string
  food_id?: string | null
  name_snapshot: string
  brand_snapshot?: string | null
  quantity: number
  unit: RecipeIngredientUnit | string
  calories_snapshot: number
  protein_g_snapshot: number
  carbs_g_snapshot: number
  fats_g_snapshot: number
  fiber_g_snapshot?: number | null
  serving_size_snapshot: number
  serving_unit_snapshot?: string | null
  order_index?: number
  note?: string | null
}

export type RecipeMacros = {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

const ZERO_RECIPE_MACROS: RecipeMacros = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
  fiber: 0,
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function normalizeRecipeIngredientUnit(value: unknown): RecipeIngredientUnit {
  const unit = String(value ?? '').toLowerCase()
  if (unit === 'ml') return 'ml'
  if (unit === 'u' || unit === 'un') return 'un'
  return 'g'
}

export function calculateRecipeIngredientMacros(
  ingredient: StructuredRecipeIngredient,
): RecipeMacros {
  const unit = normalizeRecipeIngredientUnit(ingredient.unit)
  const macros = calculateFoodItemMacros({
    quantity: Number(ingredient.quantity) || 0,
    unit,
    foods: {
      name: ingredient.name_snapshot,
      calories: Number(ingredient.calories_snapshot) || 0,
      protein_g: Number(ingredient.protein_g_snapshot) || 0,
      carbs_g: Number(ingredient.carbs_g_snapshot) || 0,
      fats_g: Number(ingredient.fats_g_snapshot) || 0,
      serving_size: Number(ingredient.serving_size_snapshot) || 100,
      serving_unit: ingredient.serving_unit_snapshot ?? null,
    },
  })

  const directQuantity = unit === 'g' || unit === 'ml'
  const gramsEquivalent = directQuantity
    ? Number(ingredient.quantity) || 0
    : (Number(ingredient.quantity) || 0) * (Number(ingredient.serving_size_snapshot) || 100)
  const fiber = (Number(ingredient.fiber_g_snapshot) || 0) * (gramsEquivalent / 100)

  return {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
    fiber: round1(fiber),
  }
}

export function calculateStructuredRecipeTotals(
  ingredients: readonly StructuredRecipeIngredient[],
): RecipeMacros {
  return ingredients.reduce<RecipeMacros>((acc, ingredient) => {
    const macros = calculateRecipeIngredientMacros(ingredient)
    return {
      calories: round1(acc.calories + macros.calories),
      protein: round1(acc.protein + macros.protein),
      carbs: round1(acc.carbs + macros.carbs),
      fats: round1(acc.fats + macros.fats),
      fiber: round1(acc.fiber + macros.fiber),
    }
  }, { ...ZERO_RECIPE_MACROS })
}

export function calculateStructuredRecipePerServing(
  ingredients: readonly StructuredRecipeIngredient[],
  servings: number,
): RecipeMacros {
  const divisor = Number.isFinite(servings) && servings > 0 ? servings : 1
  const totals = calculateStructuredRecipeTotals(ingredients)
  return {
    calories: round1(totals.calories / divisor),
    protein: round1(totals.protein / divisor),
    carbs: round1(totals.carbs / divisor),
    fats: round1(totals.fats / divisor),
    fiber: round1(totals.fiber / divisor),
  }
}

export function formatFoodReference(food: {
  calories: number
  serving_size: number
  serving_unit?: string | null
  is_liquid?: boolean | null
}): string {
  const servingUnit = String(food.serving_unit ?? '').toLowerCase()
  if (servingUnit === 'un') {
    const servingSize = Number(food.serving_size) || 100
    const caloriesPerUnit = round1((Number(food.calories) || 0) * servingSize / 100)
    return `1 un ≈ ${servingSize} g · ${caloriesPerUnit} kcal`
  }

  const baseUnit = food.is_liquid || servingUnit === 'ml' ? 'ml' : 'g'
  return `${round1(Number(food.calories) || 0)} kcal / 100 ${baseUnit}`
}

export function preferredFoodIntakeUnit(food: {
  serving_unit?: string | null
  is_liquid?: boolean | null
}): RecipeIngredientUnit {
  const unit = String(food.serving_unit ?? '').toLowerCase()
  if (unit === 'un') return 'un'
  if (unit === 'ml' || food.is_liquid) return 'ml'
  return 'g'
}

export function preferredFoodIntakeQuantity(food: {
  serving_size?: number | null
  serving_unit?: string | null
  is_liquid?: boolean | null
}): number {
  const unit = preferredFoodIntakeUnit(food)
  if (unit === 'un') return 1
  const servingSize = Number(food.serving_size)
  return Number.isFinite(servingSize) && servingSize > 0 ? servingSize : 100
}
