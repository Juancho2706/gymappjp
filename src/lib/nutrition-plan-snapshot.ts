import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { ClientPlanSchema, type ClientPlanInput } from '@/lib/nutrition-schemas'

type FoodItemRow = {
  food_id: string
  quantity: number
  unit: string
  swap_options: Json | null
}

type MealRow = {
  name: string
  order_index: number
  day_of_week: number | null
  food_items: FoodItemRow[] | null
}

type PlanRow = {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  instructions: string | null
  nutrition_meals: MealRow[] | null
}

function normalizeSwapOptions(raw: Json | null): ClientPlanInput['meals'][0]['foodItems'][0]['swap_options'] {
  if (raw == null || !Array.isArray(raw)) return undefined
  return raw as ClientPlanInput['meals'][0]['foodItems'][0]['swap_options']
}

/**
 * Lee el plan activo en DB y lo convierte al payload del builder (Zod ClientPlanSchema).
 */
export async function fetchClientPlanSnapshotPayload(
  supabase: SupabaseClient<Database>,
  planId: string,
  coachId: string
): Promise<ClientPlanInput | null> {
  const { data: plan, error } = await supabase
    .from('nutrition_plans')
    .select(
      `
      id,
      name,
      daily_calories,
      protein_g,
      carbs_g,
      fats_g,
      instructions,
      nutrition_meals (
        name,
        order_index,
        day_of_week,
        food_items ( food_id, quantity, unit, swap_options )
      )
    `
    )
    .eq('id', planId)
    .eq('coach_id', coachId)
    .order('order_index', { referencedTable: 'nutrition_meals', ascending: true })
    .maybeSingle()

  if (error || !plan) return null

  const p = plan as unknown as PlanRow
  const mealsRaw = p.nutrition_meals ?? []

  const meals = mealsRaw.map((m) => ({
    name: m.name,
    order_index: m.order_index,
    day_of_week: m.day_of_week ?? undefined,
    foodItems: (m.food_items ?? []).map((fi) => ({
      food_id: fi.food_id,
      quantity: fi.quantity,
      unit: fi.unit as ClientPlanInput['meals'][number]['foodItems'][number]['unit'],
      swap_options: normalizeSwapOptions(fi.swap_options),
    })),
  }))

  const candidate: ClientPlanInput = {
    id: p.id,
    name: p.name,
    daily_calories: p.daily_calories ?? 0,
    protein_g: p.protein_g ?? 0,
    carbs_g: p.carbs_g ?? 0,
    fats_g: p.fats_g ?? 0,
    instructions: p.instructions ?? undefined,
    meals,
  }

  const parsed = ClientPlanSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}
