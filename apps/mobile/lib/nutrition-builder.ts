import { supabase } from './supabase'
import { getCoachOrgContext } from './org'
import { foodWorkspaceFilter } from './foods-scope'
import { getTodayInSantiago, isoDateAddDays } from './date-utils'
import { reconcileMeals } from '@eva/nutrition-engine'
import { buildMealReconcileInput } from './nutrition-reconcile'

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
  is_liquid: boolean
  category: string | null
  brand: string | null
  /** Medida casera opcional (household) — alimenta `gramsToHousehold` en la UI. Solo aplica a 'g'. */
  household_grams?: number | null
  household_label?: string | null
}

/** Alternativa de intercambio para un alimento (1:1 con web `food_items.swap_options`). */
export interface SwapOption {
  food_id: string
  quantity: number
  unit: 'g' | 'un' | 'ml'
  food: {
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit: string | null
    is_liquid?: boolean | null
    brand?: string | null
  }
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
  serving_unit: string
  is_liquid: boolean
  /** Medida casera del alimento (household, display-only) — para rótulo '120 g (1 taza)'. */
  household_grams?: number | null
  household_label?: string | null
  swapOptions: SwapOption[]
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
  is_custom?: boolean | null
  template_id?: string | null
  mealCount: number
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * org_id del workspace activo desde la sesión (app_metadata) — mismo origen que
 * `getCoachOrgContext`, pero SIN la query del nombre de la org: este resolver se
 * llama en cada búsqueda de alimentos. null = standalone.
 */
async function activeOrgId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const meta = session?.user?.app_metadata as Record<string, string> | undefined
  return meta?.org_id ?? null
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
    serving_unit: food.serving_unit || 'g',
    is_liquid: !!food.is_liquid || food.serving_unit === 'ml',
    household_grams: food.household_grams ?? null,
    household_label: food.household_label ?? null,
    swapOptions: [],
  }
}

/** Parsea el JSON `food_items.swap_options` (shape web) a SwapOption[]. */
export function parseSwapOptions(raw: unknown): SwapOption[] {
  if (!Array.isArray(raw)) return []
  const out: SwapOption[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue
    const x = o as Record<string, any>
    if (!x.food_id) continue
    const isLiquid = typeof x.is_liquid === 'boolean' ? x.is_liquid : String(x.serving_unit ?? '').toLowerCase() === 'ml'
    out.push({
      food_id: String(x.food_id),
      quantity: Number(x.quantity) || 0,
      unit: coerceSwapUnit(x.unit, isLiquid),
      food: {
        name: String(x.name ?? 'Alimento'),
        calories: Number(x.calories) || 0,
        protein_g: Number(x.protein_g) || 0,
        carbs_g: Number(x.carbs_g) || 0,
        fats_g: Number(x.fats_g) || 0,
        serving_size: Number(x.serving_size) || 100,
        serving_unit: x.serving_unit ?? null,
        is_liquid: isLiquid,
        brand: x.brand ?? null,
      },
    })
  }
  return out
}

function coerceSwapUnit(unit: unknown, isLiquid: boolean): 'g' | 'un' | 'ml' {
  const allowed = isLiquid ? ['ml', 'un'] : ['g', 'un']
  const u = String(unit ?? '').toLowerCase()
  return (allowed.includes(u) ? u : isLiquid ? 'ml' : 'g') as 'g' | 'un' | 'ml'
}

/** Serializa SwapOption[] al JSON que guarda la web en `food_items.swap_options`. */
export function serializeSwapOptions(opts: SwapOption[] | undefined): any[] {
  return (opts ?? []).map((o) => ({
    food_id: o.food_id,
    name: o.food.name,
    calories: o.food.calories,
    protein_g: o.food.protein_g,
    carbs_g: o.food.carbs_g,
    fats_g: o.food.fats_g,
    serving_size: o.food.serving_size,
    serving_unit: o.food.serving_unit ?? null,
    quantity: o.quantity,
    unit: coerceSwapUnit(o.unit, !!o.food.is_liquid || o.food.serving_unit === 'ml'),
    is_liquid: !!o.food.is_liquid || o.food.serving_unit === 'ml',
  }))
}

/** Live macro totals from the draft meals (scaled by quantity / serving_size). */
export function draftTotals(meals: DraftMeal[]): { kcal: number; protein: number; carbs: number; fats: number } {
  let kcal = 0, protein = 0, carbs = 0, fats = 0
  for (const meal of meals) {
    for (const it of meal.items) {
      // Fórmula canónica (1:1 alumno/web): g/ml → qty/100; un → qty·serving/100.
      const m = draftItemMacros(it)
      kcal += m.calories; protein += m.protein; carbs += m.carbs; fats += m.fats
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fats: Math.round(fats) }
}

/** Macros de un ítem del builder según cantidad+unidad (canónico, 1:1 con `calculateFoodItemMacros`). */
export function draftItemMacros(it: { quantity: number; unit: string; calories: number; protein_g: number; carbs_g: number; fats_g: number; serving_size: number }): { calories: number; protein: number; carbs: number; fats: number } {
  const u = (it.unit || 'g').toLowerCase()
  const factor = u === 'g' || u === 'ml' ? it.quantity / 100 : (it.quantity * (it.serving_size || 100)) / 100
  return { calories: it.calories * factor, protein: it.protein_g * factor, carbs: it.carbs_g * factor, fats: it.fats_g * factor }
}

/** Macros de una opción de intercambio (misma fórmula canónica). */
export function swapMacros(opt: SwapOption): { calories: number; protein: number; carbs: number; fats: number } {
  return draftItemMacros({ quantity: opt.quantity, unit: opt.unit, calories: opt.food.calories, protein_g: opt.food.protein_g, carbs_g: opt.food.carbs_g, fats_g: opt.food.fats_g, serving_size: opt.food.serving_size || 100 })
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
  /** Medida casera opcional (household). Espejo de web: SOLO se persiste con unidad 'g'. */
  household_grams?: number | null
  household_label?: string | null
}

/** Create a coach-owned food and return it ready to add to a meal. */
export async function createCustomFood(input: CustomFoodInput): Promise<{ ok: boolean; food?: FoodRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Indicá el nombre del alimento.' }
  if (!Number.isFinite(input.calories) || input.calories < 0) return { ok: false, error: 'Calorías inválidas.' }

  // Medida casera (household) — mismo gate que web `saveCustomFood`: solo aplica a
  // gramos (en 'un' la unidad YA es la medida) y exige label + gramos > 0; si no,
  // se persiste null/null.
  const householdLabelRaw = (input.household_label ?? '').trim()
  const householdGrams = Number(input.household_grams)
  const hasHousehold = input.serving_unit === 'g' && householdLabelRaw.length > 0 && Number.isFinite(householdGrams) && householdGrams > 0

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
      household_grams: hasHousehold ? Math.round(householdGrams) : null,
      household_label: hasHousehold ? householdLabelRaw : null,
    })
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand, household_grams, household_label')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, food: data as FoodRow }
}

/** Coach-owned foods for the management screen (editable; system foods excluded). */
export async function listCoachFoods(): Promise<FoodRow[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand')
    .eq('coach_id', coachId)
    .order('name')
  return (data as FoodRow[] | null) ?? []
}

export async function updateFood(id: string, input: CustomFoodInput): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Indicá el nombre del alimento.' }
  const { error } = await supabase
    .from('foods')
    .update({
      name: input.name.trim(),
      calories: Math.round(input.calories),
      protein_g: Math.round(input.protein_g) || 0,
      carbs_g: Math.round(input.carbs_g) || 0,
      fats_g: Math.round(input.fats_g) || 0,
      serving_size: Math.round(input.serving_size) || 100,
      serving_unit: input.serving_unit,
      is_liquid: input.serving_unit === 'ml',
      category: input.category,
    })
    .eq('id', id)
    .eq('coach_id', coachId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteFood(id: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const { error } = await supabase.from('foods').delete().eq('id', id).eq('coach_id', coachId)
  if (error) return { ok: false, error: 'No se pudo eliminar. Puede estar en uso en un plan.' }
  return { ok: true }
}

// P5: filtros de búsqueda (categoría + scope + calorías) y límite alto (antes .limit(40) fijo
// hacía que nunca se vieran todos los alimentos). Paridad con el food picker web.
export type FoodScope = 'all' | 'system' | 'mine'
export interface SearchFoodsOptions {
  category?: string | null // 'todos'/undefined = todas
  scope?: FoodScope
  maxCalories?: number | null
  limit?: number
}

export async function searchFoods(query: string, opts: SearchFoodsOptions = {}): Promise<FoodRow[]> {
  const coachId = await currentCoachId()
  const { category, scope = 'all', maxCalories, limit = 500 } = opts
  let q = supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand, household_grams, household_label')
  if (scope === 'mine' && coachId) q = q.eq('coach_id', coachId)
  else if (scope === 'system') q = q.is('coach_id', null)
  else {
    // 4B-02: scope 'all' respeta el workspace activo (espejo web). En enterprise
    // devuelve sistema + org (antes mezclaba sistema + propios del coach, ignorando
    // la org); en standalone, sistema + propios. RLS sigue siendo la barrera real.
    const orgId = await activeOrgId()
    q = q.or(foodWorkspaceFilter(coachId, orgId))
  }
  if (category && category !== 'todos') q = q.eq('category', category)
  if (maxCalories != null && maxCalories > 0) q = q.lte('calories', maxCalories)
  if (query.trim().length >= 2) q = q.ilike('name', `%${query.trim()}%`)
  q = q.order('name').limit(limit)
  const { data } = await q
  return (data as FoodRow[] | null) ?? []
}

// N-F6-full: board de adherencia (7 días) por alumno con plan activo — cálculo client-side
// (RLS coach-scoped), espejo simplificado de getActivePlansBoardData web.
export interface NutritionBoardRow {
  clientId: string
  clientName: string
  planName: string
  sparkline7d: number[]
  avg7d: number
  todayKcal: number
  targetKcal: number | null
}

export async function getNutritionBoard(): Promise<NutritionBoardRow[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { iso: today } = getTodayInSantiago()
  const days = Array.from({ length: 7 }, (_, i) => isoDateAddDays(today, -(6 - i))) // viejo→hoy

  const { data: plans } = await supabase
    .from('nutrition_plans')
    .select('id, client_id, name, daily_calories, clients ( full_name )')
    .eq('coach_id', coachId)
    .eq('is_active', true)
  const planList = (plans ?? []) as any[]
  if (!planList.length) return []

  const planIds = planList.map((p) => p.id)
  const clientIds = [...new Set(planList.map((p) => p.client_id))]
  const [{ data: logs }, { data: meals }] = await Promise.all([
    supabase.from('daily_nutrition_logs').select('client_id, plan_id, log_date, nutrition_meal_logs ( meal_id, is_completed )').in('client_id', clientIds).gte('log_date', days[0]),
    supabase.from('nutrition_meals').select('id, plan_id, day_of_week').in('plan_id', planIds),
  ])

  const mealsByPlan = new Map<string, { id: string; day_of_week: number | null }[]>()
  for (const m of (meals ?? []) as any[]) {
    const arr = mealsByPlan.get(m.plan_id) ?? []
    arr.push({ id: m.id, day_of_week: m.day_of_week ?? null })
    mealsByPlan.set(m.plan_id, arr)
  }
  const logsByKey = new Map<string, any[]>()
  for (const l of (logs ?? []) as any[]) {
    const k = `${l.client_id}|${l.plan_id}`
    const arr = logsByKey.get(k) ?? []
    arr.push(l)
    logsByKey.set(k, arr)
  }
  const isoDow = (d: string) => { const js = new Date(`${d}T12:00:00`).getDay(); return js === 0 ? 7 : js }

  return planList.map((plan) => {
    const planMeals = mealsByPlan.get(plan.id) ?? []
    const planLogs = logsByKey.get(`${plan.client_id}|${plan.id}`) ?? []
    const sparkline7d = days.map((d) => {
      const applicable = planMeals.filter((m) => m.day_of_week == null || m.day_of_week === isoDow(d))
      const denom = applicable.length
      if (denom === 0) return 0
      const ids = new Set(applicable.map((m) => m.id))
      const log = planLogs.find((x) => x.log_date === d)
      const done = ((log?.nutrition_meal_logs ?? []) as any[]).filter((x) => x.is_completed && ids.has(x.meal_id)).length
      return Math.min(100, Math.round((done / denom) * 100))
    })
    const avg7d = Math.round(sparkline7d.reduce((a, b) => a + b, 0) / 7)
    const targetKcal = plan.daily_calories ?? null
    const todayPct = sparkline7d[6] ?? 0
    const todayKcal = targetKcal ? Math.round((targetKcal * todayPct) / 100) : 0
    return {
      clientId: plan.client_id,
      clientName: plan.clients?.full_name ?? 'Alumno',
      planName: plan.name ?? 'Plan',
      sparkline7d,
      avg7d,
      todayKcal,
      targetKcal,
    }
  }).sort((a, b) => a.avg7d - b.avg7d) // peor adherencia primero (triage)
}

export async function getClientPlans(clientId: string): Promise<PlanSummary[]> {
  const { data } = await supabase
    .from('nutrition_plans')
    .select('id, name, daily_calories, protein_g, carbs_g, fats_g, is_active, is_custom, template_id, nutrition_meals ( id )')
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
    is_custom: p.is_custom ?? null,
    template_id: p.template_id ?? null,
    mealCount: p.nutrition_meals?.length ?? 0,
  }))
}

/** IDs de alimentos favoritos del alumno (read-only, para resaltar en el buscador).
 * N-F1: la tabla real es `client_food_preferences` con `preference_type='favorite'`
 * (NO existe `client_food_favorites`). Antes devolvía siempre vacío (soft-error tragado). */
export async function getClientFoodFavorites(clientId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('client_food_preferences' as never)
    .select('food_id')
    .eq('client_id' as never, clientId as never)
    .eq('preference_type' as never, 'favorite' as never)
  return new Set(((data ?? []) as any[]).map((r) => r.food_id as string))
}

/** Restricciones dietarias del alumno (correctness de salud). Espejo 1:1 del web
 * `getClientFoodRestrictions`: mismo origen (`client_food_preferences`, RLS coach-scoped)
 * y los mismos 3 tipos. Los sets alimentan los badges + el bloqueo de alérgenos del buscador. */
export type ClientFoodRestrictionType = 'dislike' | 'allergy' | 'intolerance'
export interface ClientFoodRestrictionSets {
  allergyIds: Set<string>
  intoleranceIds: Set<string>
  dislikeIds: Set<string>
}
export function emptyRestrictionSets(): ClientFoodRestrictionSets {
  return { allergyIds: new Set(), intoleranceIds: new Set(), dislikeIds: new Set() }
}
export async function getClientFoodRestrictions(clientId: string): Promise<ClientFoodRestrictionSets> {
  const sets = emptyRestrictionSets()
  const { data } = await supabase
    .from('client_food_preferences' as never)
    .select('food_id, preference_type')
    .eq('client_id' as never, clientId as never)
    .in('preference_type' as never, ['dislike', 'allergy', 'intolerance'] as never)
  for (const r of ((data ?? []) as any[])) {
    const id = r.food_id as string
    if (!id) continue
    if (r.preference_type === 'allergy') sets.allergyIds.add(id)
    else if (r.preference_type === 'intolerance') sets.intoleranceIds.add(id)
    else if (r.preference_type === 'dislike') sets.dislikeIds.add(id)
  }
  return sets
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
    .select('id, name, description, order_index, day_of_week, food_items ( food_id, quantity, unit, swap_options, foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, household_grams, household_label ) )')
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
      serving_unit: fi.foods?.serving_unit ?? 'g',
      is_liquid: !!fi.foods?.is_liquid || fi.foods?.serving_unit === 'ml',
      household_grams: fi.foods?.household_grams ?? null,
      household_label: fi.foods?.household_label ?? null,
      swapOptions: parseSwapOptions(fi.swap_options),
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
    ...(orgId ? { org_id: orgId } : {}),
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

      // CASCADE-SAFETY (G08 §2.2): antes borraba las comidas sobrantes INCONDICIONALMENTE ->
      // destruía nutrition_meal_logs (FK meal_id ON DELETE CASCADE/SET NULL) = pérdida de
      // adherencia del alumno. Ahora la decisión de qué borrar la toma `reconcileMeals`
      // (fn pura compartida con web): solo borra las huérfanas SIN logs; las que tienen
      // historial se CONSERVAN (quedan más allá del nuevo conteo de comidas).
      const { existingMeals, templateMeals, removalCandidates } = buildMealReconcileInput(
        (existing ?? []).map((m: any) => ({ id: m.id as string, order_index: m.order_index as number })),
        sorted.map((meal) => ({ name: meal.name, description: meal.notes ?? '', day_of_week: meal.day_of_week ?? null }))
      )
      const loggedMealIds = await fetchLoggedMealIds(removalCandidates)
      const { toDelete } = reconcileMeals(existingMeals, templateMeals, loggedMealIds)
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

/**
 * meal_ids que YA tienen registros de adherencia (`nutrition_meal_logs`). `reconcileMeals` NO
 * borra las comidas que aparezcan acá (cascade-safety). Réplica PostgREST del fetch de la web
 * (`nutrition.service.ts`): solo se consultan los candidatos a borrar para acotar la query.
 */
export async function fetchLoggedMealIds(mealIds: string[]): Promise<Set<string>> {
  if (!mealIds.length) return new Set()
  const { data } = await supabase.from('nutrition_meal_logs').select('meal_id').in('meal_id', mealIds)
  return new Set(((data ?? []) as any[]).map((r) => r.meal_id as string).filter(Boolean))
}

async function insertItems(mealId: string, items: DraftFoodItem[]): Promise<void> {
  if (items.length === 0) return
  await supabase.from('food_items').insert(
    items.map((it) => ({ meal_id: mealId, food_id: it.food_id, quantity: Math.round(it.quantity) || 0, unit: it.unit, swap_options: serializeSwapOptions(it.swapOptions) }))
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

export interface ClientLite { id: string; full_name: string }

/** Coach's active clients for the copy-to-client picker (RLS-scoped). */
export async function listCoachClients(): Promise<ClientLite[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('coach_id', coachId)
    .eq('is_archived', false)
    .order('full_name')
  return (data as ClientLite[] | null) ?? []
}

/**
 * Clone an active/any plan from one client to another as a new CUSTOM active plan.
 * Mirrors web `duplicatePlanToClient` — same tables (nutrition_plans/nutrition_meals/
 * food_items), so it never touches the template machinery. Deactivates the target's
 * current active plan (logs untouched).
 */
export async function duplicatePlanToClient(sourcePlanId: string, targetClientId: string): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const ctx = await getCoachOrgContext()
  const orgId = ctx.orgId

  try {
    const { data: src } = await supabase
      .from('nutrition_plans')
      .select('id, name, daily_calories, protein_g, carbs_g, fats_g, instructions')
      .eq('id', sourcePlanId)
      .eq('coach_id', coachId)
      .maybeSingle()
    if (!src) return { ok: false, error: 'Plan origen no encontrado.' }

    const { data: meals } = await supabase
      .from('nutrition_meals')
      .select('id, name, description, order_index, day_of_week')
      .eq('plan_id', sourcePlanId)
      .order('order_index', { ascending: true })
    const mealIds = (meals ?? []).map((m: any) => m.id)

    const { data: items } = mealIds.length
      // N-F16: incluir swap_options para no perder las sustituciones al copiar.
      ? await supabase.from('food_items').select('meal_id, food_id, quantity, unit, swap_options').in('meal_id', mealIds)
      : { data: [] as any[] }
    const itemsByMeal = new Map<string, any[]>()
    for (const it of (items as any[]) ?? []) {
      const list = itemsByMeal.get(it.meal_id) ?? []
      list.push(it)
      itemsByMeal.set(it.meal_id, list)
    }

    await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', targetClientId).eq('coach_id', coachId).eq('is_active', true)

    const { data: np, error: planErr } = await supabase
      .from('nutrition_plans')
      .insert({
        client_id: targetClientId, coach_id: coachId, ...(orgId ? { org_id: orgId } : {}),
        name: (src as any).name, daily_calories: (src as any).daily_calories, protein_g: (src as any).protein_g,
        carbs_g: (src as any).carbs_g, fats_g: (src as any).fats_g, instructions: (src as any).instructions ?? null,
        is_active: true, is_custom: true,
      })
      .select('id').single()
    if (planErr) throw planErr

    for (const m of (meals as any[]) ?? []) {
      const { data: nm, error: mErr } = await supabase
        .from('nutrition_meals')
        .insert({ plan_id: np.id, name: m.name, description: m.description ?? '', order_index: m.order_index, day_of_week: m.day_of_week ?? null })
        .select('id').single()
      if (mErr) throw mErr
      const its = itemsByMeal.get(m.id) ?? []
      if (its.length) {
        await supabase.from('food_items').insert(its.map((fi) => ({ meal_id: nm.id, food_id: fi.food_id, quantity: fi.quantity, unit: fi.unit, swap_options: fi.swap_options ?? [] })))
      }
    }

    return { ok: true, planId: np.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo copiar el plan.' }
  }
}
