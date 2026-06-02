import { supabase } from './supabase'
import { getCoachOrgContext } from './org'

// Coach nutrition plan builder — mirrors the web `upsertClientNutritionPlanJson`
// (apps/web .../coach/nutrition-plans). Writes nutrition_plans → nutrition_meals
// → food_items directly under the coach session (RLS `*_coach_all`). On edit it
// matches meals by order_index to preserve meal IDs so nutrition_meal_logs survive.

export const FOOD_UNITS = ['g', 'un', 'ml'] as const
export type FoodUnit = (typeof FOOD_UNITS)[number]

export const DAY_OF_WEEK: { value: number | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

export interface FoodRow {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string
  category: string | null
  brand: string | null
}

export interface DraftFoodItem {
  uid: string
  food_id: string
  name: string
  quantity: number
  unit: string
  // food reference macros (per serving_size) for live totals
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
}

export interface DraftMeal {
  uid: string
  /** existing nutrition_meals.id when editing (preserves logs); null = new. */
  id: string | null
  name: string
  notes: string
  day_of_week: number | null
  order_index: number
  items: DraftFoodItem[]
}

export interface PlanDraft {
  id: string | null
  name: string
  daily_calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  instructions: string
  meals: DraftMeal[]
}

export interface PlanSummary {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  is_active: boolean
  mealCount: number
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export function emptyPlanDraft(): PlanDraft {
  return { id: null, name: '', daily_calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, instructions: '', meals: [] }
}

export function newMeal(orderIndex: number): DraftMeal {
  return { uid: uid('meal'), id: null, name: `Comida ${orderIndex + 1}`, notes: '', day_of_week: null, order_index: orderIndex, items: [] }
}

export function foodToDraftItem(food: FoodRow): DraftFoodItem {
  return {
    uid: uid('fi'),
    food_id: food.id,
    name: food.name,
    quantity: food.serving_size || 100,
    unit: food.serving_unit || 'g',
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fats_g: food.fats_g,
    serving_size: food.serving_size || 100,
  }
}

/** Live macro totals from the draft meals (scaled by quantity / serving_size). */
export function draftTotals(meals: DraftMeal[]): { kcal: number; protein: number; carbs: number; fats: number } {
  let kcal = 0, protein = 0, carbs = 0, fats = 0
  for (const meal of meals) {
    for (const it of meal.items) {
      const factor = it.serving_size > 0 ? it.quantity / it.serving_size : 0
      kcal += it.calories * factor
      protein += it.protein_g * factor
      carbs += it.carbs_g * factor
      fats += it.fats_g * factor
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fats: Math.round(fats) }
}

export const FOOD_CATEGORIES = [
  'proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura', 'legumbre', 'bebida', 'snack', 'otro',
] as const

export interface CustomFoodInput {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: FoodUnit
  category: string
}

/** Create a coach-owned food and return it ready to add to a meal. */
export async function createCustomFood(input: CustomFoodInput): Promise<{ ok: boolean; food?: FoodRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Indicá el nombre del alimento.' }
  if (!Number.isFinite(input.calories) || input.calories < 0) return { ok: false, error: 'Calorías inválidas.' }

  const { data, error } = await supabase
    .from('foods')
    .insert({
      name: input.name.trim(),
      calories: Math.round(input.calories),
      protein_g: Math.round(input.protein_g) || 0,
      carbs_g: Math.round(input.carbs_g) || 0,
      fats_g: Math.round(input.fats_g) || 0,
      serving_size: Math.round(input.serving_size) || 100,
      serving_unit: input.serving_unit,
      is_liquid: input.serving_unit === 'ml',
      category: input.category,
      coach_id: coachId,
    })
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, brand')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, food: data as FoodRow }
}

export async function searchFoods(query: string): Promise<FoodRow[]> {
  const coachId = await currentCoachId()
  const filter = coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : 'coach_id.is.null'
  let q = supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, brand')
    .or(filter)
    .order('name')
    .limit(40)
  if (query.trim().length >= 2) q = q.ilike('name', `%${query.trim()}%`)
  const { data } = await q
  return (data as FoodRow[] | null) ?? []
}

export async function getClientPlans(clientId: string): Promise<PlanSummary[]> {
  const { data } = await supabase
    .from('nutrition_plans')
    .select('id, name, daily_calories, protein_g, carbs_g, fats_g, is_active, nutrition_meals ( id )')
    .eq('client_id', clientId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    daily_calories: p.daily_calories,
    protein_g: p.protein_g,
    carbs_g: p.carbs_g,
    fats_g: p.fats_g,
    is_active: p.is_active,
    mealCount: p.nutrition_meals?.length ?? 0,
  }))
}

export async function getPlanDraft(planId: string): Promise<PlanDraft | null> {
  const { data: plan } = await supabase
    .from('nutrition_plans')
    .select('id, name, daily_calories, protein_g, carbs_g, fats_g, instructions')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return null

  const { data: meals } = await supabase
    .from('nutrition_meals')
    .select('id, name, description, order_index, day_of_week, food_items ( food_id, quantity, unit, foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit ) )')
    .eq('plan_id', planId)
    .order('order_index', { ascending: true })

  const draftMeals: DraftMeal[] = (meals ?? []).map((m: any, idx: number) => ({
    uid: uid('meal'),
    id: m.id,
    name: m.name,
    notes: m.description ?? '',
    day_of_week: m.day_of_week ?? null,
    order_index: m.order_index ?? idx,
    items: (m.food_items ?? []).map((fi: any) => ({
      uid: uid('fi'),
      food_id: fi.food_id,
      name: fi.foods?.name ?? 'Alimento',
      quantity: fi.quantity ?? 0,
      unit: fi.unit ?? 'g',
      calories: fi.foods?.calories ?? 0,
      protein_g: fi.foods?.protein_g ?? 0,
      carbs_g: fi.foods?.carbs_g ?? 0,
      fats_g: fi.foods?.fats_g ?? 0,
      serving_size: fi.foods?.serving_size ?? 100,
    })),
  }))

  return {
    id: plan.id,
    name: plan.name ?? '',
    daily_calories: plan.daily_calories ?? 0,
    protein_g: plan.protein_g ?? 0,
    carbs_g: plan.carbs_g ?? 0,
    fats_g: plan.fats_g ?? 0,
    instructions: plan.instructions ?? '',
    meals: draftMeals,
  }
}

export async function saveClientPlan(clientId: string, draft: PlanDraft): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (draft.name.trim().length < 2) return { ok: false, error: 'Indicá un nombre para el plan.' }

  const ctx = await getCoachOrgContext()
  const orgId = ctx.orgId

  const planData = {
    client_id: clientId,
    coach_id: coachId,
    org_id: orgId,
    name: draft.name.trim(),
    daily_calories: Math.round(draft.daily_calories) || 0,
    protein_g: Math.round(draft.protein_g) || 0,
    carbs_g: Math.round(draft.carbs_g) || 0,
    fats_g: Math.round(draft.fats_g) || 0,
    instructions: draft.instructions.trim() || null,
    is_active: true,
    is_custom: true,
  }

  const sorted = [...draft.meals].sort((a, b) => a.order_index - b.order_index)

  try {
    let planId = draft.id

    if (planId) {
      const { error: upErr } = await supabase.from('nutrition_plans').update(planData).eq('id', planId).eq('coach_id', coachId)
      if (upErr) throw upErr

      const { data: existing } = await supabase
        .from('nutrition_meals')
        .select('id, order_index')
        .eq('plan_id', planId)
        .order('order_index', { ascending: true })

      const existingByIndex = new Map<number, string>((existing ?? []).map((m: any) => [m.order_index, m.id]))
      const newIndices = new Set(sorted.map((_, i) => i))

      const toDelete = (existing ?? []).filter((m: any) => !newIndices.has(m.order_index)).map((m: any) => m.id)
      if (toDelete.length) {
        await supabase.from('food_items').delete().in('meal_id', toDelete)
        await supabase.from('nutrition_meals').delete().in('id', toDelete)
      }

      for (let i = 0; i < sorted.length; i++) {
        const meal = sorted[i]
        const existingId = existingByIndex.get(i)
        if (existingId) {
          await supabase.from('nutrition_meals').update({
            name: meal.name, description: meal.notes ?? '', order_index: i, day_of_week: meal.day_of_week ?? null,
          }).eq('id', existingId)
          await supabase.from('food_items').delete().eq('meal_id', existingId)
          await insertItems(existingId, meal.items)
        } else {
          const { data: nm, error } = await supabase.from('nutrition_meals').insert({
            plan_id: planId, name: meal.name, description: meal.notes ?? '', order_index: i, day_of_week: meal.day_of_week ?? null,
          }).select('id').single()
          if (error) throw error
          await insertItems(nm.id, meal.items)
        }
      }
    } else {
      // New plan → deactivate any current active plan, then insert fresh.
      await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId).eq('coach_id', coachId)
      const { data: np, error } = await supabase.from('nutrition_plans').insert(planData).select('id').single()
      if (error) throw error
      planId = np.id

      for (let i = 0; i < sorted.length; i++) {
        const meal = sorted[i]
        const { data: nm, error: mErr } = await supabase.from('nutrition_meals').insert({
          plan_id: planId, name: meal.name, description: meal.notes ?? '', order_index: i, day_of_week: meal.day_of_week ?? null,
        }).select('id').single()
        if (mErr) throw mErr
        await insertItems(nm.id, meal.items)
      }
    }

    return { ok: true, planId: planId ?? undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al guardar el plan.' }
  }
}

async function insertItems(mealId: string, items: DraftFoodItem[]): Promise<void> {
  if (items.length === 0) return
  await supabase.from('food_items').insert(
    items.map((it) => ({ meal_id: mealId, food_id: it.food_id, quantity: Math.round(it.quantity) || 0, unit: it.unit }))
  )
}

export async function setPlanActive(clientId: string, planId: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId).eq('coach_id', coachId)
  const { error } = await supabase.from('nutrition_plans').update({ is_active: true }).eq('id', planId).eq('coach_id', coachId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deletePlan(planId: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const { data: meals } = await supabase.from('nutrition_meals').select('id').eq('plan_id', planId)
  const mealIds = (meals ?? []).map((m: any) => m.id)
  if (mealIds.length) {
    await supabase.from('food_items').delete().in('meal_id', mealIds)
    await supabase.from('nutrition_meals').delete().eq('plan_id', planId)
  }
  const { error } = await supabase.from('nutrition_plans').delete().eq('id', planId).eq('coach_id', coachId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
