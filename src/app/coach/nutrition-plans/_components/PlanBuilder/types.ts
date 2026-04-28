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
    is_liquid?: boolean | null
    brand?: string | null
  }
  quantity: number
  unit: string
}

export interface MealDraft {
  id: string
  name: string
  /** 1=Lun … 7=Dom; undefined/null = todos los días */
  day_of_week?: number | null
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
