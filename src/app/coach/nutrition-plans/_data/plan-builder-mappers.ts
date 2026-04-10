import type { FoodItemDraft, MealDraft, PlanBuilderInitialData } from '../_components/PlanBuilder/types'

type ItemRow = {
  quantity: number
  unit?: string | null
  food_id: string
  food?: {
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit?: string | null
  } | null
}

function mapSavedItemsToFoodDrafts(items: ItemRow[]): FoodItemDraft[] {
  return items
    .filter((it) => it.food)
    .map((it) => ({
      food_id: it.food_id,
      quantity: Number(it.quantity) || 0,
      unit: it.unit ?? 'g',
      food: {
        name: it.food!.name,
        calories: it.food!.calories,
        protein_g: it.food!.protein_g,
        carbs_g: it.food!.carbs_g,
        fats_g: it.food!.fats_g,
        serving_size: it.food!.serving_size,
        serving_unit: it.food!.serving_unit ?? 'g',
      },
    }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTemplateRowToInitialData(row: any): PlanBuilderInitialData {
  const mealsRaw = [...(row.template_meals ?? [])].sort(
    (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
  )
  const meals: MealDraft[] = mealsRaw.map((tm: any) => {
    const groups = tm.template_meal_groups ?? []
    const flatItems: ItemRow[] = groups.flatMap((g: any) =>
      (g.saved_meals?.saved_meal_items ?? []).map((it: any) => ({
        quantity: it.quantity,
        unit: it.unit,
        food_id: it.food_id,
        food: it.food ?? null,
      }))
    )
    return {
      id: tm.id as string,
      name: tm.name as string,
      foodItems: mapSavedItemsToFoodDrafts(flatItems),
    }
  })

  return {
    id: row.id,
    name: row.name,
    daily_calories: row.daily_calories ?? 0,
    protein_g: row.protein_g ?? 0,
    carbs_g: row.carbs_g ?? 0,
    fats_g: row.fats_g ?? 0,
    instructions: row.instructions ?? undefined,
    meals,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapClientPlanRowToInitialData(row: any): PlanBuilderInitialData {
  const mealsRaw = [...(row.nutrition_meals ?? [])].sort(
    (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
  )
  const meals: MealDraft[] = mealsRaw.map((nm: any) => {
    const items: ItemRow[] = (nm.food_items ?? []).map((fi: any) => ({
      quantity: fi.quantity,
      unit: fi.unit,
      food_id: fi.food_id,
      food: fi.foods
        ? {
            name: fi.foods.name,
            calories: fi.foods.calories,
            protein_g: fi.foods.protein_g,
            carbs_g: fi.foods.carbs_g,
            fats_g: fi.foods.fats_g,
            serving_size: fi.foods.serving_size,
            serving_unit: fi.foods.serving_unit ?? 'g',
          }
        : null,
    }))
    return {
      id: nm.id as string,
      name: nm.name as string,
      foodItems: mapSavedItemsToFoodDrafts(items),
    }
  })

  return {
    id: row.id,
    name: row.name,
    daily_calories: row.daily_calories ?? 0,
    protein_g: row.protein_g ?? 0,
    carbs_g: row.carbs_g ?? 0,
    fats_g: row.fats_g ?? 0,
    instructions: row.instructions ?? undefined,
    meals,
  }
}
