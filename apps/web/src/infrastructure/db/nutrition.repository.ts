import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type NutritionPlanRow = Tables['nutrition_plans']['Row']
export type NutritionTemplateRow = Tables['nutrition_plan_templates']['Row']
export type NutritionMealRow = Tables['nutrition_meals']['Row']
export type FoodRow = Tables['foods']['Row']
export type RecipeRow = Tables['recipes']['Row']

export async function findNutritionPlansByCoach(db: DB, coachId: string): Promise<NutritionPlanRow[]> {
    const { data } = await db
        .from('nutrition_plans')
        .select('id, coach_id, client_id, template_id, template_version_id, name, instructions, daily_calories, protein_g, carbs_g, fats_g, is_active, is_custom, created_at, updated_at')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

    return (data ?? []) as NutritionPlanRow[]
}

export async function findNutritionTemplatesByCoach(db: DB, coachId: string): Promise<NutritionTemplateRow[]> {
    const { data } = await db
        .from('nutrition_plan_templates')
        .select('id, coach_id, name, description, instructions, daily_calories, protein_g, carbs_g, fats_g, goal_type, tags, is_favorite, created_at, updated_at')
        .eq('coach_id', coachId)
        .order('updated_at', { ascending: false })

    return (data ?? []) as NutritionTemplateRow[]
}

export async function findNutritionMealsByPlan(db: DB, planId: string): Promise<NutritionMealRow[]> {
    const { data } = await db
        .from('nutrition_meals')
        .select('id, plan_id, name, description, day_of_week, order_index, created_at')
        .eq('plan_id', planId)
        .order('order_index', { ascending: true })

    return (data ?? []) as NutritionMealRow[]
}

export async function findFoods(db: DB, coachId: string, limit = 100): Promise<FoodRow[]> {
    const { data } = await db
        .from('foods')
        .select('id, coach_id, name, name_search, brand, category, serving_size, serving_unit, calories, protein_g, carbs_g, fats_g, is_liquid')
        .or(`coach_id.is.null,coach_id.eq.${coachId}`)
        .order('name', { ascending: true })
        .limit(limit)

    return (data ?? []) as FoodRow[]
}

export async function findRecipeById(db: DB, recipeId: string): Promise<RecipeRow | null> {
    const { data } = await db
        .from('recipes')
        .select('id, coach_id, name, description, instructions, image_url, prep_time_minutes, calories, protein_g, carbs_g, fats_g, source_api, source_api_id, created_at, updated_at')
        .eq('id', recipeId)
        .maybeSingle()

    return data as RecipeRow | null
}
