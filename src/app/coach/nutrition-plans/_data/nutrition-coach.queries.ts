import { cache } from 'react'
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  type MealWithFoodItems,
  type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'

const DEFAULT_FOOD_PAGE_SIZE = 50

/**
 * Plantillas del coach con comidas anidadas y clientes asignados (planes activos).
 * Misma forma que consume el hub (`NutritionHub` / `TemplateLibrary`).
 */
/** Una plantilla por id (valida `coach_id`). */
export const getCoachTemplateById = cache(async (coachId: string, templateId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nutrition_plan_templates')
    .select(
      `
      id, coach_id, name, description, instructions, is_favorite, tags, goal_type, daily_calories, protein_g, carbs_g, fats_g, created_at, updated_at,
      template_meals (
        id,
        name,
        order_index,
        template_meal_groups (
          id,
          order_index,
          saved_meals (
            id,
            name,
            saved_meal_items (
              id,
              quantity,
              unit,
              food_id,
              food:foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit )
            )
          )
        )
      )
    `
    )
    .eq('id', templateId)
    .eq('coach_id', coachId)
    .maybeSingle()
  return data
})

export const getCoachTemplates = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nutrition_plan_templates')
    .select(
      `
      id, coach_id, name, description, instructions, is_favorite, tags, goal_type, daily_calories, protein_g, carbs_g, fats_g, created_at, updated_at,
      assigned_clients:nutrition_plans(
        client:clients(id, full_name),
        is_active
      ),
      template_meals (
        id,
        name,
        order_index,
        template_meal_groups (
          id,
          order_index,
          saved_meals (
            id,
            name,
            saved_meal_items (
              id,
              quantity,
              unit,
              food:foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit )
            )
          )
        )
      )
    `
    )
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .order('order_index', { referencedTable: 'template_meals', ascending: true })

  const rows = data ?? []
  return rows.map((t) => ({
    ...t,
    assigned_clients:
      t.assigned_clients
        ?.filter((p: { is_active?: boolean }) => p.is_active)
        .map((p: { client: { id: string; full_name: string } }) => p.client) ?? [],
  }))
})

/**
 * Planes nutricionales activos por coach (board / hub).
 */
export const getActiveClientPlans = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nutrition_plans')
    .select(
      `
      id, client_id, template_id, name, is_custom, is_active, daily_calories, protein_g, carbs_g, fats_g, updated_at,
      clients ( id, full_name ),
      nutrition_plan_templates ( name )
    `
    )
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
  return data ?? []
})

export type ActivePlanBoardRow = {
  id: string
  name: string
  is_custom: boolean
  client_id: string
  updated_at?: string
  clients: { id: string; full_name: string } | null
  /** % adherencia por día (0–100), últimos 7 días en orden cronológico. */
  sparkline7d: number[]
  /** Kcal consumidas hoy (comidas completadas), según `nutrition-utils`. */
  todayCaloriesConsumed: number
  dailyTargetCalories: number | null
}

/**
 * Planes activos del coach + mini-serie 7d de adherencia y kcal de hoy (zona Santiago).
 */
export const getActivePlansBoardData = cache(async (coachId: string): Promise<ActivePlanBoardRow[]> => {
  const plans = await getActiveClientPlans(coachId)
  if (plans.length === 0) return []

  const supabase = await createClient()
  const planIds = plans.map((p) => p.id as string)
  const clientIds = [...new Set(plans.map((p) => p.client_id as string))]

  const { iso: todayIso } = getTodayInSantiago()
  const end = parseISO(`${todayIso}T12:00:00`)
  const start = subDays(end, 6)
  const dayLabels = eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'))

  const [{ data: logs }, { data: mealsDetail }] = await Promise.all([
    supabase
      .from('daily_nutrition_logs')
      .select(
        `
        client_id,
        plan_id,
        log_date,
        nutrition_meal_logs ( meal_id, is_completed )
      `
      )
      .in('client_id', clientIds)
      .gte('log_date', dayLabels[0]!)
      .lte('log_date', dayLabels[dayLabels.length - 1]!),
    supabase
      .from('nutrition_meals')
      .select(
        `
        id,
        plan_id,
        food_items ( quantity, unit, foods ( name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit ) )
      `
      )
      .in('plan_id', planIds),
  ])

  type LogRow = {
    client_id: string
    plan_id: string
    log_date: string
    nutrition_meal_logs: { meal_id: string; is_completed: boolean }[] | null
  }

  const logsByKey = new Map<string, LogRow[]>()
  for (const l of (logs ?? []) as LogRow[]) {
    const k = `${l.client_id}|${l.plan_id}`
    if (!logsByKey.has(k)) logsByKey.set(k, [])
    logsByKey.get(k)!.push(l)
  }

  const mealCountByPlan = new Map<string, number>()
  const mealsByPlan = new Map<string, MealWithFoodItems[]>()
  for (const m of mealsDetail ?? []) {
    const pid = m.plan_id as string
    mealCountByPlan.set(pid, (mealCountByPlan.get(pid) ?? 0) + 1)
    const normalized = normalizeMealForMacros(m as NutritionMealMacroSource)
    if (!mealsByPlan.has(pid)) mealsByPlan.set(pid, [])
    mealsByPlan.get(pid)!.push(normalized)
  }

  return plans.map((plan) => {
    const pid = plan.id as string
    const cid = plan.client_id as string
    const key = `${cid}|${pid}`
    const planLogs = logsByKey.get(key) ?? []
    const totalMeals = Math.max(mealCountByPlan.get(pid) ?? 1, 1)

    const sparkline7d = dayLabels.map((d) => {
      const log = planLogs.find((x) => x.log_date === d)
      const rows = log?.nutrition_meal_logs ?? []
      if (rows.length === 0) return 0
      const done = rows.filter((x) => x.is_completed).length
      return Math.min(100, Math.round((done / totalMeals) * 100))
    })

    const todayLog = planLogs.find((x) => x.log_date === todayIso)
    const completed = new Set<string>()
    for (const ml of todayLog?.nutrition_meal_logs ?? []) {
      if (ml.is_completed) completed.add(ml.meal_id)
    }

    const consumed = calculateConsumedMacrosWithCompletionFallback(
      mealsByPlan.get(pid) ?? [],
      completed,
      {
        calories: (plan.daily_calories as number | null) ?? 0,
        protein: (plan.protein_g as number | null) ?? 0,
        carbs: (plan.carbs_g as number | null) ?? 0,
        fats: (plan.fats_g as number | null) ?? 0,
      }
    )

    const clients = plan.clients as { id: string; full_name: string } | null

    return {
      id: pid,
      name: plan.name as string,
      is_custom: Boolean(plan.is_custom),
      client_id: cid,
      updated_at: plan.updated_at as string | undefined,
      clients,
      sparkline7d,
      todayCaloriesConsumed: Math.round(consumed.calories),
      dailyTargetCalories: (plan.daily_calories as number | null) ?? null,
    }
  })
})

export type FoodLibraryOptions = {
  search?: string
  category?: string
  maxCalories?: number
  page?: number
  pageSize?: number
}

/**
 * Catálogo global + alimentos custom del coach (paginado).
 */
export const getFoodLibrary = cache(async (coachId: string, options: FoodLibraryOptions = {}) => {
  const supabase = await createClient()
  const { search, category, maxCalories, page = 0, pageSize = DEFAULT_FOOD_PAGE_SIZE } = options

  let query = supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id, is_liquid, brand', { count: 'exact' })
    .or(`coach_id.is.null,coach_id.eq.${coachId}`)
    .order('coach_id', { ascending: false })
    .order('name')
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (search?.trim()) {
    const term = search
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/%/g, '\\%')
    query = query.ilike('name_search', `%${term}%`)
  }
  if (category && category !== 'todos') {
    query = query.eq('category', category)
  }
  if (maxCalories != null && maxCalories > 0) {
    query = query.lte('calories', maxCalories)
  }

  const { data, count } = await query
  return { foods: data ?? [], total: count ?? 0 }
})

/**
 * Plan activo de un alumno (validado por coach).
 */
export const getClientNutritionPlan = cache(async (clientId: string, coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nutrition_plans')
    .select(
      `
      id, client_id, coach_id, template_id, name, is_custom, is_active, daily_calories, protein_g, carbs_g, fats_g,
      nutrition_meals (
        id, plan_id, name, order_index,
        food_items (
          id, meal_id, food_id, quantity, unit,
          foods(id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit)
        )
      ),
      clients ( id, full_name )
    `
    )
    .eq('client_id', clientId)
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('order_index', { referencedTable: 'nutrition_meals', ascending: true })
    .maybeSingle()
  return data
})

/**
 * Adherencia últimos 30 días (calendario desde hoy en America/Santiago).
 */
export const getClientAdherence = cache(async (clientId: string, planId: string) => {
  const supabase = await createClient()
  const { iso: todayIso } = getTodayInSantiago()
  const dateFrom = format(subDays(parseISO(`${todayIso}T12:00:00`), 30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('daily_nutrition_logs')
    .select(
      `
      log_date,
      nutrition_meal_logs ( meal_id, is_completed )
    `
    )
    .eq('client_id', clientId)
    .eq('plan_id', planId)
    .gte('log_date', dateFrom)
    .order('log_date', { ascending: true })
  return data ?? []
})

/**
 * Todos los clientes del coach con sus planes (activos o no), para asignación.
 */
export const getCoachClients = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select(
      `
      id, full_name,
      nutrition_plans ( id, name, is_active )
    `
    )
    .eq('coach_id', coachId)
    .order('full_name')
  return data ?? []
})

/** Clientes activos con plan activo — mismo criterio que la página `nutrition-plans`. */
export const getActiveClientsWithNutritionPlan = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select(
      `
      id,
      full_name,
      active_plans:nutrition_plans(id, name, template_id, is_active)
    `
    )
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .eq('active_plans.is_active', true)
    .order('full_name')

  return (data ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    active_plan: c.active_plans?.[0] ?? null,
  }))
})

/** Grupos / comidas guardadas del coach (catálogo en editor). */
export const getCoachSavedMeals = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saved_meals')
    .select(
      `
      id,
      name,
      items:saved_meal_items(
        id,
        quantity,
        unit,
        food:foods(id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit)
      )
    `
    )
    .eq('coach_id', coachId)
    .order('name')
  return data ?? []
})

/**
 * Todos los alimentos visibles para el coach (lista completa — misma semántica que la page legacy).
 */
export const getCoachFoodsCatalog = cache(async (coachId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('foods')
    .select('id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id, is_liquid, brand')
    .or(`coach_id.eq.${coachId},coach_id.is.null`)
    .order('name')
  return data ?? []
})
