import { supabase } from './supabase'
import { apiFetch, ApiError } from './api'
import { getCoachOrgContext } from './org'
import { getTodayInSantiago, isoDateAddDays } from './date-utils'
import {
  type ComposedGroupPart,
  type DayVariant,
  type ExchangeFoodEquivalence,
  type ExchangeGroup,
  type MealExchangeTarget,
  type NutritionPlanMode,
} from './nutrition-exchanges'

// Re-export para que el builder y los componentes coach consuman desde un solo hogar.
export type { DayVariant, ExchangeGroup, ExchangeFoodEquivalence, MealExchangeTarget, NutritionPlanMode }

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
  // Origen del alimento (espejo web FoodListCompact): coach_id == sesión → "Propio"
  // (Star), null/otro → "Global" (Globe). Opcional: no todos los call-sites lo traen.
  coach_id?: string | null
  // Medida casera (espejo web bf90571c): render "120 g (1 taza)". Opcionales: no
  // todos los call-sites que construyen un FoodRow las traen (ej. meal-groups).
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
  household_grams: number | null
  household_label: string | null
  swapOptions: SwapOption[]
}

/**
 * Render de medida casera (espejo web bf90571c): "120 g (1 taza)".
 * Devuelve null si no hay etiqueta casera para mostrar.
 */
export function householdMeasureLabel(food: { household_grams?: number | null; household_label?: string | null }): string | null {
  if (!food.household_label) return null
  const label = food.household_label.trim()
  if (!label) return null
  return food.household_grams != null && food.household_grams > 0
    ? `${Math.round(food.household_grams)} g (${label})`
    : label
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
  // Medida casera (espejo web saveCustomFood): SOLO aplica con unidad 'g' y solo si
  // hay etiqueta + gramos > 0. En 'un'/'ml' la unidad ya ES la medida. Opcionales.
  household_label?: string | null
  household_grams?: number | null
}

/** Create a coach-owned food and return it ready to add to a meal. */
export async function createCustomFood(input: CustomFoodInput): Promise<{ ok: boolean; food?: FoodRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Indicá el nombre del alimento.' }
  if (!Number.isFinite(input.calories) || input.calories < 0) return { ok: false, error: 'Calorías inválidas.' }

  const household = resolveHousehold(input)

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
      household_grams: household.grams,
      household_label: household.label,
    })
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand, coach_id, household_grams, household_label')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, food: data as FoodRow }
}

/**
 * Medida casera para persistir (espejo web saveCustomFood): SOLO con unidad 'g',
 * etiqueta no vacía y gramos > 0. En cualquier otro caso se limpia a null (incluido
 * al editar un alimento que tenía medida y se le cambia la unidad).
 */
function resolveHousehold(input: CustomFoodInput): { grams: number | null; label: string | null } {
  const label = (input.household_label ?? '').trim()
  const grams = Number(input.household_grams)
  const hasHousehold = input.serving_unit === 'g' && label.length > 0 && Number.isFinite(grams) && grams > 0
  return hasHousehold ? { grams: Math.round(grams), label } : { grams: null, label: null }
}

/** Coach-owned foods for the management screen (editable; system foods excluded). */
export async function listCoachFoods(): Promise<FoodRow[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand, coach_id, household_grams, household_label')
    .eq('coach_id', coachId)
    .order('name')
  return (data as FoodRow[] | null) ?? []
}

export async function updateFood(id: string, input: CustomFoodInput): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Indicá el nombre del alimento.' }
  const household = resolveHousehold(input)
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
      household_grams: household.grams,
      household_label: household.label,
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
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand, coach_id, household_grams, household_label')
  if (scope === 'mine' && coachId) q = q.eq('coach_id', coachId)
  else if (scope === 'system') q = q.is('coach_id', null)
  else q = q.or(coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : 'coach_id.is.null')
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

/** Un día de adherencia (espejo de la fila `daily_nutrition_logs` web). */
export interface ClientAdherenceDay {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

/**
 * Adherencia de los últimos 30 días de un alumno para un plan (espejo de `getClientAdherence` web:
 * lee `daily_nutrition_logs` + `nutrition_meal_logs` del plan, RLS coach-scoped). La pinta el
 * `AdherenceStrip` junto con el día-de-semana de cada comida del plan.
 */
export async function getClientAdherence(clientId: string, planId: string): Promise<ClientAdherenceDay[]> {
  const { iso: today } = getTodayInSantiago()
  const dateFrom = isoDateAddDays(today, -30)
  const { data } = await supabase
    .from('daily_nutrition_logs')
    .select('log_date, nutrition_meal_logs ( meal_id, is_completed )')
    .eq('client_id', clientId)
    .eq('plan_id', planId)
    .gte('log_date', dateFrom)
    .order('log_date', { ascending: true })
  return ((data ?? []) as any[]).map((d) => ({
    log_date: d.log_date as string,
    nutrition_meal_logs: ((d.nutrition_meal_logs ?? []) as any[]).map((l) => ({
      meal_id: l.meal_id as string,
      is_completed: !!l.is_completed,
    })),
  }))
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

/**
 * Resultado del guardado: `mealIdsByUid` mapea el uid de cada DraftMeal a su id de DB
 * persistido (orden = order_index). El builder lo usa para persistir, en una segunda
 * pasada, los targets de intercambio y la asignación de variante por comida (modo Pro).
 */
export async function saveClientPlan(clientId: string, draft: PlanDraft): Promise<{ ok: boolean; planId?: string; mealIdsByUid?: Record<string, string>; error?: string }> {
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
  const mealIdsByUid: Record<string, string> = {}

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
          mealIdsByUid[meal.uid] = existingId
        } else {
          const { data: nm, error } = await supabase.from('nutrition_meals').insert({
            plan_id: planId, name: meal.name, description: meal.notes ?? '', order_index: i, day_of_week: meal.day_of_week ?? null,
          }).select('id').single()
          if (error) throw error
          await insertItems(nm.id, meal.items)
          mealIdsByUid[meal.uid] = nm.id
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
        mealIdsByUid[meal.uid] = nm.id
      }
    }

    return { ok: true, planId: planId ?? undefined, mealIdsByUid }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al guardar el plan.' }
  }
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

// ════════════════════════════════════════════════════════════════════════════════
// Nutrición Pro (módulo nutrition_exchanges) — lado COACH (builder)
// Espejo de:
//   apps/web/.../PlanBuilder (ExchangeModePanel + ExchangeTargetsEditor)
//   apps/web/src/services/nutrition-exchanges/* + infrastructure/db/exchanges.repository.ts
// El gate de dinero sigue server-side (RLS met_coach_all / xg_select); acá el coach
// escribe con su sesión (RLS = techo). Sin service-role.
// ════════════════════════════════════════════════════════════════════════════════

const EXCHANGE_GROUP_COLUMNS =
  'id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed'

function parseComposedOf(value: unknown): ComposedGroupPart[] | null {
  if (!Array.isArray(value)) return null
  const parts: ComposedGroupPart[] = []
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as any).code === 'string' &&
      typeof (item as any).portions === 'number'
    ) {
      parts.push({ code: (item as any).code, portions: (item as any).portions })
    }
  }
  return parts.length > 0 ? parts : null
}

function mapExchangeGroupRow(r: any): ExchangeGroup {
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    name: r.name,
    coachId: r.coach_id ?? null,
    teamId: r.team_id ?? null,
    isSystem: !!r.is_system,
    refCalories: Number(r.ref_calories) || 0,
    refProteinG: Number(r.ref_protein_g) || 0,
    refCarbsG: Number(r.ref_carbs_g) || 0,
    refFatsG: Number(r.ref_fats_g) || 0,
    color: r.color ?? null,
    sortOrder: r.sort_order ?? 0,
    composedOf: parseComposedOf(r.composed_of),
    macrosConfirmed: !!r.macros_confirmed,
  }
}

/**
 * Catálogo de grupos de intercambio visibles para el coach: system + propios + team activo.
 * Espejo de findExchangeGroupsForScope (RLS xg_select = techo). standalone v1: sin team.
 */
export async function getCoachExchangeGroups(): Promise<ExchangeGroup[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  // standalone mobile v1: no hay workspace team activo (igual que el resto de libs coach).
  const filters = ['is_system.eq.true', `coach_id.eq.${coachId}`]
  const { data } = await supabase
    .from('exchange_groups')
    .select(EXCHANGE_GROUP_COLUMNS)
    .or(filters.join(','))
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  return ((data ?? []) as any[]).map(mapExchangeGroupRow)
}

export interface PlanExchangeData {
  planMode: NutritionPlanMode
  /** keyed por meal_id de DB. */
  targetsByMealId: Record<string, MealExchangeTarget[]>
  variants: DayVariant[]
  /** keyed por meal_id de DB. */
  variantByMealId: Record<string, string | null>
}

const EMPTY_PLAN_EXCHANGE_DATA: PlanExchangeData = {
  planMode: 'grams',
  targetsByMealId: {},
  variants: [],
  variantByMealId: {},
}

/** Carga el modo del plan, targets por comida y variantes (builder coach, RLS-scoped). */
export async function getPlanExchangeData(planId: string): Promise<PlanExchangeData> {
  try {
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select('id, plan_mode')
      .eq('id', planId)
      .maybeSingle()
    const planMode: NutritionPlanMode = (plan as any)?.plan_mode === 'exchanges' ? 'exchanges' : 'grams'

    const { data: mealsData } = await supabase
      .from('nutrition_meals')
      .select('id, day_variant_id')
      .eq('plan_id', planId)
    const assignments = ((mealsData ?? []) as any[]).map((m) => ({
      mealId: m.id as string,
      dayVariantId: (m.day_variant_id ?? null) as string | null,
    }))
    const mealIds = assignments.map((a) => a.mealId)

    const [targetsRes, variantsRes] = await Promise.all([
      mealIds.length
        ? supabase
            .from('meal_exchange_targets')
            .select('id, meal_id, exchange_group_id, portions, notes')
            .in('meal_id', mealIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('nutrition_plan_day_variants')
        .select('id, plan_id, name, sort_order, created_at')
        .eq('plan_id', planId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    const targetsByMealId: Record<string, MealExchangeTarget[]> = {}
    for (const r of ((targetsRes as any).data ?? []) as any[]) {
      const t: MealExchangeTarget = {
        id: r.id,
        mealId: r.meal_id,
        exchangeGroupId: r.exchange_group_id,
        portions: Number(r.portions) || 0,
        notes: r.notes ?? null,
      }
      ;(targetsByMealId[t.mealId] ??= []).push(t)
    }
    const variants: DayVariant[] = ((variantsRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      planId: r.plan_id,
      name: r.name,
      sortOrder: r.sort_order ?? 0,
    }))
    const variantByMealId: Record<string, string | null> = {}
    for (const a of assignments) variantByMealId[a.mealId] = a.dayVariantId

    return { planMode, targetsByMealId, variants, variantByMealId }
  } catch {
    return EMPTY_PLAN_EXCHANGE_DATA
  }
}

/**
 * Cambia el modo del plan (gramos ↔ porciones). Gating server-side: pega a
 * /api/mobile/nutrition/exchanges/set-mode que corre `assertModule(nutrition_exchanges)`
 * ANTES de escribir (la RLS no chequea enabled_modules → sin el endpoint un coach sin el
 * modulo evadiria el cobro por PostgREST directo). La escritura real sigue user-scoped (RLS = techo).
 */
export async function setPlanModeDb(planId: string, mode: NutritionPlanMode): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/nutrition/exchanges/set-mode', {
      method: 'POST',
      authenticated: true,
      body: { planId, mode },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudo cambiar el modo del plan.' }
  }
}

/**
 * Reemplaza (delete + insert) los targets de UNA comida. Gating server-side via
 * /api/mobile/nutrition/exchanges/targets (assertModule(nutrition_exchanges) antes del
 * delete+insert). Espejo de replaceMealExchangeTargets; el server filtra portions > 0.
 */
export async function saveMealExchangeTargetsDb(
  mealId: string,
  targets: { exchangeGroupId: string; portions: number; notes?: string | null }[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/nutrition/exchanges/targets', {
      method: 'POST',
      authenticated: true,
      body: { mealId, targets: targets.filter((t) => t.portions > 0) },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudieron guardar las porciones.' }
  }
}

/**
 * Asigna/limpia la variante de día de una comida (null = aplica a todas). Gating
 * server-side via /api/mobile/nutrition/exchanges/meal-variant (assertModule antes del UPDATE).
 */
export async function setMealDayVariantDb(mealId: string, variantId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/nutrition/exchanges/meal-variant', {
      method: 'POST',
      authenticated: true,
      body: { mealId, variantId },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudo asignar la variante.' }
  }
}

/**
 * Crea una variante de día. Espejo de createPlanDayVariant (máx 6, sin nombres repetidos —
 * ambas validaciones viven ahora en el endpoint). Gating server-side via
 * /api/mobile/nutrition/exchanges/variants (assertModule antes del INSERT).
 */
export async function createDayVariantDb(planId: string, name: string): Promise<{ ok: boolean; variant?: DayVariant; error?: string }> {
  const trimmed = name.trim()
  if (trimmed.length < 1) return { ok: false, error: 'Indicá un nombre.' }
  try {
    const res = await apiFetch<{ ok: true; variant: DayVariant }>('/api/mobile/nutrition/exchanges/variants', {
      method: 'POST',
      authenticated: true,
      body: { planId, name: trimmed },
    })
    return { ok: true, variant: res.variant }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudo crear la variante.' }
  }
}

/**
 * Borra una variante (las comidas asignadas quedan day_variant_id NULL — ON DELETE SET NULL).
 * Gating server-side via /api/mobile/nutrition/exchanges/variants (DELETE).
 */
export async function deleteDayVariantDb(variantId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/nutrition/exchanges/variants', {
      method: 'DELETE',
      authenticated: true,
      body: { variantId },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudo eliminar la variante.' }
  }
}

/** Código resumen de una comida en porciones: "2C · 1LAC · 1F" (espejo de portionsSummaryLabel web). */
export function portionsSummaryLabel(
  targets: { exchangeGroupId: string; portions: number }[],
  groups: ExchangeGroup[]
): string {
  const map = new Map(groups.map((g) => [g.id, g]))
  return targets
    .map((t) => ({ group: map.get(t.exchangeGroupId), portions: t.portions }))
    .filter((r): r is { group: ExchangeGroup; portions: number } => !!r.group && r.portions > 0)
    .sort((a, b) =>
      a.group.sortOrder !== b.group.sortOrder
        ? a.group.sortOrder - b.group.sortOrder
        : a.group.code.localeCompare(b.group.code)
    )
    .map((r) => {
      const p = Math.round(r.portions * 10) / 10
      return `${p}${r.group.code}`
    })
    .join(' · ')
}

/** ¿Algún grupo usado tiene macros sin confirmar? (badge "referencial", espejo web AC3). */
export function hasUnconfirmedMacros(
  targets: { exchangeGroupId: string; portions: number }[],
  groups: ExchangeGroup[]
): boolean {
  const map = new Map(groups.map((g) => [g.id, g]))
  return targets.some((t) => {
    const g = map.get(t.exchangeGroupId)
    return !!g && !g.macrosConfirmed
  })
}

// ── Restricciones dietarias del alumno (alergia / intolerancia / disgusto) ──────
// Espejo de getClientFoodRestrictions (web). Safety: alergia bloquea con override.

export type ClientRestrictionType = 'allergy' | 'intolerance' | 'dislike'

export interface ClientFoodRestrictions {
  allergy: Set<string>
  intolerance: Set<string>
  dislike: Set<string>
}

export const EMPTY_RESTRICTIONS: ClientFoodRestrictions = {
  allergy: new Set(),
  intolerance: new Set(),
  dislike: new Set(),
}

/**
 * Restricciones dietarias del alumno por food_id. RLS-scoped (el coach solo lee las de sus
 * alumnos). Se devuelven 3 sets separados para no degradar una intolerancia a "no le gusta".
 */
export async function getClientFoodRestrictions(clientId: string): Promise<ClientFoodRestrictions> {
  try {
    const { data } = await supabase
      .from('client_food_preferences')
      .select('food_id, preference_type')
      .eq('client_id', clientId)
      .in('preference_type', ['allergy', 'intolerance', 'dislike'])
    const out: ClientFoodRestrictions = { allergy: new Set(), intolerance: new Set(), dislike: new Set() }
    for (const r of ((data ?? []) as any[])) {
      const t = r.preference_type as ClientRestrictionType
      if (t === 'allergy' || t === 'intolerance' || t === 'dislike') out[t].add(r.food_id as string)
    }
    return out
  } catch {
    return { allergy: new Set(), intolerance: new Set(), dislike: new Set() }
  }
}

// ── Perfil corporal del alumno (objetivos por composición corporal — body_composition) ──

export interface ClientBodyProfile {
  weightKg: number | null
  heightCm: number | null
}

/**
 * Peso/altura del alumno para la calculadora por composición corporal (RLS-scoped).
 * Fuente canónica = `client_intake` (espejo web client-plan-page.queries); fallback a
 * `clients.initial_weight_kg`/`height_cm` si no hay intake.
 */
export async function getClientBodyProfile(clientId: string): Promise<ClientBodyProfile> {
  try {
    const { data: intake } = await supabase
      .from('client_intake')
      .select('weight_kg, height_cm')
      .eq('client_id', clientId)
      .maybeSingle()
    let weightKg = (intake as any)?.weight_kg != null ? Number((intake as any).weight_kg) : null
    let heightCm = (intake as any)?.height_cm != null ? Number((intake as any).height_cm) : null
    if (weightKg == null || heightCm == null) {
      const { data: c } = await supabase
        .from('clients')
        .select('initial_weight_kg, height_cm')
        .eq('id', clientId)
        .maybeSingle()
      if (weightKg == null && (c as any)?.initial_weight_kg != null) weightKg = Number((c as any).initial_weight_kg)
      if (heightCm == null && (c as any)?.height_cm != null) heightCm = Number((c as any).height_cm)
    }
    return { weightKg, heightCm }
  } catch {
    return { weightKg: null, heightCm: null }
  }
}

// ── Cálculo por composición corporal (espejo verbatim de @eva/nutrition-engine) ──
// Katch-McArdle / Cunningham / LBM + reparto protein-forward, igual que la web.

export type BodyCompFormula = 'katch' | 'cunningham'

export const BODYCOMP_FORMULA_LABELS: Record<BodyCompFormula, string> = {
  katch: 'Katch-McArdle',
  cunningham: 'Cunningham (atletas)',
}

const BC_ACTIVITY_FACTORS: Record<ActivityKeyBC, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}
const BC_GOAL_CALORIE_MULTIPLIER: Record<GoalKeyBC, number> = { lose: 0.85, maintain: 1, gain: 1.1 }
const BC_GOAL_PROTEIN_G_PER_KG: Record<GoalKeyBC, number> = { lose: 2.2, maintain: 1.8, gain: 1.6 }
const BC_GOAL_FAT_KCAL_FRACTION: Record<GoalKeyBC, number> = { lose: 0.3, maintain: 0.275, gain: 0.25 }
const BC_KCAL_PER_GRAM = { protein: 4, carbs: 4, fats: 9 }

// Las keys de actividad/objetivo del builder mobile (macro-calculator) usan otra convención
// (cut/maintain/bulk). Acá usamos las del engine (lose/maintain/gain) para el cálculo bodycomp.
export type ActivityKeyBC = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalKeyBC = 'lose' | 'maintain' | 'gain'

const bcRound = (n: number) => Math.round(n)

export function computeKatchMcArdle(leanBodyMassKg: number): number {
  return bcRound(370 + 21.6 * Math.max(0, leanBodyMassKg))
}
export function computeCunningham(leanBodyMassKg: number): number {
  return bcRound(500 + 22 * Math.max(0, leanBodyMassKg))
}
export function leanBodyMassFromBodyFat(weightKg: number, bodyFatPct: number): number {
  const pct = Math.min(100, Math.max(0, bodyFatPct))
  return weightKg * (1 - pct / 100)
}

export interface BodyCompGoals { calories: number; protein: number; carbs: number; fats: number }

/** Objetivos por composición corporal (Pro). Espejo de calcMacrosBodyComp (web sidebar). */
export function calcMacrosBodyComp(
  leanBodyMassKg: number,
  weightKg: number,
  activity: ActivityKeyBC,
  goal: GoalKeyBC,
  formula: BodyCompFormula
): BodyCompGoals {
  const bmr = formula === 'cunningham' ? computeCunningham(leanBodyMassKg) : computeKatchMcArdle(leanBodyMassKg)
  const tdee = bcRound(bmr * BC_ACTIVITY_FACTORS[activity])
  const calories = bcRound(tdee * BC_GOAL_CALORIE_MULTIPLIER[goal])
  const protein = bcRound(BC_GOAL_PROTEIN_G_PER_KG[goal] * weightKg)
  const fats = bcRound((calories * BC_GOAL_FAT_KCAL_FRACTION[goal]) / BC_KCAL_PER_GRAM.fats)
  const remaining = calories - protein * BC_KCAL_PER_GRAM.protein - fats * BC_KCAL_PER_GRAM.fats
  const carbs = bcRound(Math.max(0, remaining) / BC_KCAL_PER_GRAM.carbs)
  return { calories, protein, carbs, fats }
}
