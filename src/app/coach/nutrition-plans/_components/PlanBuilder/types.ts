export interface FoodItemDraft {
  food_id: string
  food: {
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit: string
  }
  quantity: number
  unit: string
}

export interface MealDraft {
  id: string
  name: string
  foodItems: FoodItemDraft[]
}

export interface PlanBuilderInitialData {
  id?: string
  name: string
  daily_calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  instructions?: string
  meals: MealDraft[]
}
