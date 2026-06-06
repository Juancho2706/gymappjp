import { supabase } from './supabase'
import { getCoachOrgContext } from './org'
import { selectWithFallback } from './db-compat'
import { emptyPlanDraft, parseSwapOptions, serializeSwapOptions, type DraftMeal, type PlanDraft } from './nutrition-builder'

// Coach nutrition TEMPLATES — mirrors web `nutrition.service.ts`
// (createOrUpdateTemplateFromJson / propagateTemplateChanges). Templates live in
// nutrition_plan_templates + template_meals, and each meal's foods live in
// saved_meals → saved_meal_items linked via template_meal_groups (1 group/meal here).
// Assign = create a fresh active nutrition_plans for each client from the template
// (deactivates the previous active plan; logs untouched — like duplicatePlanToClient).

export interface TemplateSummary {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  mealCount: number
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

const TEMPLATE_SELECT = `
  id, name, daily_calories, protein_g, carbs_g, fats_g, instructions,
  template_meals (
    id, name, description, order_index, day_of_week,
    template_meal_groups (
      saved_meals (
        saved_meal_items ( food_id, quantity, unit, swap_options, foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid ) )
      )
    )
  )
`

export async function listTemplates(): Promise<TemplateSummary[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  // N-F5/TX-4: scoping de org explícito (fallback seguro si no existe la columna org_id).
  const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
  const cols = 'id, name, daily_calories, protein_g, carbs_g, fats_g, template_meals ( id )'
  const { data } = await selectWithFallback<any>(
    () => {
      const q = supabase.from('nutrition_plan_templates').select(cols).eq('coach_id', coachId)
      return (orgId ? q.eq('org_id', orgId) : q.is('org_id', null)).order('updated_at', { ascending: false })
    },
    () => supabase.from('nutrition_plan_templates').select(cols).eq('coach_id', coachId).order('updated_at', { ascending: false })
  )
  return (data ?? []).map((t: any) => ({
    id: t.id, name: t.name, daily_calories: t.daily_calories, protein_g: t.protein_g,
    carbs_g: t.carbs_g, fats_g: t.fats_g, mealCount: t.template_meals?.length ?? 0,
  }))
}

/** First saved-meal group's items flattened (basic case = 1 group/meal). */
function templateMealItems(tMeal: any): any[] {
  const groups = tMeal.template_meal_groups ?? []
  for (const g of groups) {
    const items = g.saved_meals?.saved_meal_items
    if (items?.length) return items
  }
  return []
}

export async function getTemplateDraft(templateId: string): Promise<PlanDraft | null> {
  const { data: t } = await supabase.from('nutrition_plan_templates').select(TEMPLATE_SELECT).eq('id', templateId).maybeSingle()
  if (!t) return null
  const meals: DraftMeal[] = ((t as any).template_meals ?? [])
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((m: any) => ({
      uid: uid('meal'),
      id: null,
      name: m.name,
      notes: m.description ?? '',
      day_of_week: m.day_of_week ?? null,
      order_index: m.order_index ?? 0,
      items: templateMealItems(m).map((fi: any) => ({
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
        is_liquid: !!fi.foods?.is_liquid || (fi.foods?.serving_unit ?? 'g') === 'ml',
        swapOptions: parseSwapOptions(fi.swap_options),
      })),
    }))
  return {
    id: (t as any).id,
    name: (t as any).name ?? '',
    daily_calories: (t as any).daily_calories ?? 0,
    protein_g: (t as any).protein_g ?? 0,
    carbs_g: (t as any).carbs_g ?? 0,
    fats_g: (t as any).fats_g ?? 0,
    instructions: (t as any).instructions ?? '',
    meals,
  }
}

export function emptyTemplateDraft(): PlanDraft {
  return emptyPlanDraft()
}

export async function saveTemplate(draft: PlanDraft): Promise<{ ok: boolean; templateId?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (draft.name.trim().length < 2) return { ok: false, error: 'Indicá un nombre para la plantilla.' }
  const ctx = await getCoachOrgContext()

  const templateData = {
    coach_id: coachId,
    ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
    name: draft.name.trim(),
    daily_calories: Math.round(draft.daily_calories) || 0,
    protein_g: Math.round(draft.protein_g) || 0,
    carbs_g: Math.round(draft.carbs_g) || 0,
    fats_g: Math.round(draft.fats_g) || 0,
    instructions: draft.instructions.trim() || null,
  }

  try {
    let templateId = draft.id
    if (templateId) {
      const { error } = await supabase.from('nutrition_plan_templates').update(templateData).eq('id', templateId).eq('coach_id', coachId)
      if (error) throw error
      await supabase.from('template_meals').delete().eq('template_id', templateId)
    } else {
      const { data, error } = await supabase.from('nutrition_plan_templates').insert(templateData).select('id').single()
      if (error) throw error
      templateId = data.id
    }

    const sorted = [...draft.meals].sort((a, b) => a.order_index - b.order_index)
    for (let i = 0; i < sorted.length; i++) {
      const meal = sorted[i]
      const { data: tMeal, error: mErr } = await supabase
        .from('template_meals')
        .insert({ template_id: templateId, name: meal.name, description: meal.notes ?? '', order_index: i, day_of_week: meal.day_of_week ?? null })
        .select('id').single()
      if (mErr) throw mErr
      if (!meal.items.length) continue

      const { data: savedMeal, error: smErr } = await supabase
        .from('saved_meals')
        .insert({ coach_id: coachId, name: `Internal_${meal.name}_${Date.now()}_${i}` })
        .select('id').single()
      if (smErr) throw smErr

      await supabase.from('saved_meal_items').insert(
        meal.items.map((it) => ({ saved_meal_id: savedMeal.id, food_id: it.food_id, quantity: Math.round(it.quantity) || 0, unit: it.unit, swap_options: serializeSwapOptions(it.swapOptions) }))
      )
      await supabase.from('template_meal_groups').insert({ template_meal_id: tMeal.id, saved_meal_id: savedMeal.id, order_index: 0 })
    }

    // Re-propagar a los alumnos sincronizados (plan activo con esta plantilla y no personalizado).
    await propagateTemplate(templateId!, coachId)

    return { ok: true, templateId: templateId ?? undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo guardar la plantilla.' }
  }
}

export async function deleteTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const { error } = await supabase.from('nutrition_plan_templates').delete().eq('id', templateId).eq('coach_id', coachId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Assign a template to clients: each gets a fresh active plan (template-linked). */
export async function assignTemplateToClients(templateId: string, clientIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (!clientIds.length) return { ok: true }
  const ctx = await getCoachOrgContext()
  const orgId = ctx.orgId

  const { data: t } = await supabase.from('nutrition_plan_templates').select(TEMPLATE_SELECT).eq('id', templateId).eq('coach_id', coachId).maybeSingle()
  if (!t) return { ok: false, error: 'Plantilla no encontrada.' }
  const tmpl = t as any
  const mealsSorted = [...(tmpl.template_meals ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  try {
    for (const clientId of clientIds) {
      await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId).eq('coach_id', coachId).eq('is_active', true)

      const { data: np, error: planErr } = await supabase
        .from('nutrition_plans')
        .insert({
          client_id: clientId, coach_id: coachId, ...(orgId ? { org_id: orgId } : {}),
          name: tmpl.name, daily_calories: tmpl.daily_calories, protein_g: tmpl.protein_g,
          carbs_g: tmpl.carbs_g, fats_g: tmpl.fats_g, instructions: tmpl.instructions ?? null,
          is_active: true, is_custom: false, template_id: templateId,
        })
        .select('id').single()
      if (planErr) throw planErr

      for (let i = 0; i < mealsSorted.length; i++) {
        const tMeal = mealsSorted[i]
        const { data: nm, error: mErr } = await supabase
          .from('nutrition_meals')
          .insert({ plan_id: np.id, name: tMeal.name, description: tMeal.description ?? '', order_index: i, day_of_week: tMeal.day_of_week ?? null })
          .select('id').single()
        if (mErr) throw mErr
        const items = templateMealItems(tMeal)
        if (items.length) {
          await supabase.from('food_items').insert(
            items.map((it: any) => ({ meal_id: nm.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit, swap_options: it.swap_options ?? [] }))
          )
        }
      }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo asignar la plantilla.' }
  }
}

/** Re-propaga la plantilla a los alumnos SINCRONIZADOS (plan activo con template_id = esta y is_custom = false). */
async function propagateTemplate(templateId: string, coachId: string): Promise<void> {
  const { data: synced } = await supabase
    .from('nutrition_plans')
    .select('id')
    .eq('template_id', templateId)
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .eq('is_custom', false)
  if (!synced?.length) return

  const { data: t } = await supabase.from('nutrition_plan_templates').select(TEMPLATE_SELECT).eq('id', templateId).maybeSingle()
  if (!t) return
  const tmpl = t as any
  const mealsSorted = [...(tmpl.template_meals ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  for (const plan of synced) {
    const planId = (plan as any).id as string
    // Macros/nombre/instrucciones desde la plantilla.
    await supabase.from('nutrition_plans').update({
      name: tmpl.name, daily_calories: tmpl.daily_calories, protein_g: tmpl.protein_g,
      carbs_g: tmpl.carbs_g, fats_g: tmpl.fats_g, instructions: tmpl.instructions ?? null,
    }).eq('id', planId)
    // N-F15: propagación IN-PLACE — emparejar comidas por order_index para PRESERVAR el
    // meal_id (así `nutrition_meal_logs` del alumno no quedan huérfanos). Antes borraba+recreaba.
    const { data: oldMealsRaw } = await supabase.from('nutrition_meals').select('id, order_index').eq('plan_id', planId)
    const oldMeals = [...((oldMealsRaw ?? []) as any[])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

    for (let i = 0; i < mealsSorted.length; i++) {
      const tMeal = mealsSorted[i]
      const items = templateMealItems(tMeal)
      const existing = oldMeals[i]
      let mealId: string | null = null
      if (existing) {
        await supabase.from('nutrition_meals')
          .update({ name: tMeal.name, description: tMeal.description ?? '', order_index: i, day_of_week: tMeal.day_of_week ?? null })
          .eq('id', existing.id)
        mealId = existing.id
        await supabase.from('food_items').delete().eq('meal_id', mealId)
      } else {
        const { data: nm } = await supabase.from('nutrition_meals')
          .insert({ plan_id: planId, name: tMeal.name, description: tMeal.description ?? '', order_index: i, day_of_week: tMeal.day_of_week ?? null })
          .select('id').single()
        mealId = nm ? (nm as any).id : null
      }
      if (!mealId) continue
      if (items.length) {
        await supabase.from('food_items').insert(
          items.map((it: any) => ({ meal_id: mealId, food_id: it.food_id, quantity: it.quantity, unit: it.unit, swap_options: it.swap_options ?? [] }))
        )
      }
    }
    // Borrar comidas sobrantes (plantilla con menos comidas que el plan previo).
    const surplus = oldMeals.slice(mealsSorted.length).map((m: any) => m.id)
    if (surplus.length) {
      await supabase.from('food_items').delete().in('meal_id', surplus)
      await supabase.from('nutrition_meals').delete().in('id', surplus)
    }
  }
}
