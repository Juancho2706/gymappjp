import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import type { FoodItemDraft, MealDraft } from './types'

function toMacrosItem(fi: FoodItemDraft): FoodItemForMacros {
  return {
    quantity: fi.quantity,
    unit: fi.unit,
    foods: {
      name: fi.food.name,
      calories: fi.food.calories,
      protein_g: fi.food.protein_g,
      carbs_g: fi.food.carbs_g,
      fats_g: fi.food.fats_g,
      serving_size: fi.food.serving_size,
      serving_unit: fi.food.serving_unit,
    },
  }
}

/** Macros totales de todas las comidas del borrador (suma de ítems). */
export function totalsFromMealDrafts(meals: MealDraft[]) {
  return meals.reduce(
    (acc, meal) => {
      for (const fi of meal.foodItems) {
        const m = calculateFoodItemMacros(toMacrosItem(fi))
        acc.calories += m.calories
        acc.protein += m.protein
        acc.carbs += m.carbs
        acc.fats += m.fats
      }
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

/** Preview al ajustar cantidad en el drawer (antes de agregar al plan). */
export function previewMacrosForQuantity(
  food: FoodItemDraft['food'],
  quantity: number,
  unit: string
) {
  const fi: FoodItemDraft = {
    food_id: 'preview',
    food: { ...food, serving_unit: food.serving_unit || 'g' },
    quantity,
    unit,
  }
  return calculateFoodItemMacros(toMacrosItem(fi))
}
