export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout'

export type NutritionPlanStatus = 'active' | 'inactive' | 'template'

export type MacroTarget = {
    calories: number
    protein: number
    carbs: number
    fat: number
}
