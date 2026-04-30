'use server'

import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { NutritionService } from '@/services/nutrition.service'
import {
  TemplateUpsertSchema,
  ClientPlanSchema,
  CustomFoodSchema,
} from '@/lib/nutrition-schemas'
import { fetchClientPlanSnapshotPayload } from '@/lib/nutrition-plan-snapshot'
import {
  nutritionPlanCycleUpsertSchema,
  type NutritionPlanCycleUpsertInput,
} from '@/lib/nutrition-plan-cycle-schema'

// ─── Tipos públicos (usados por componentes del builder) ───────────────────────

export type CoachTemplateMealFoodItem = {
  food_id: string
  quantity: number
  unit: string
  swap_options?: Array<{
    food_id: string
    is_liquid?: boolean
    quantity?: number
    unit?: 'g' | 'un' | 'ml'
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit?: string | null
  }>
}

export type CoachTemplateMealJson = {
  name: string
  notes?: string | null
  order_index: number
  /** 1=Lun … 7=Dom; omitir = todos los días */
  day_of_week?: number | null
  foodItems: CoachTemplateMealFoodItem[]
}

export type CoachTemplateUpsertPayload = {
  id?: string
  name: string
  daily_calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  instructions?: string | null
  goal_type?: string | null
  tags?: string[] | null
  is_favorite?: boolean | null
  meals: CoachTemplateMealJson[]
  /** Clientes a los que propagar la plantilla tras guardar (planes sync). */
  propagateClientIds?: string[]
}

export type CoachClientPlanUpsertPayload = {
  id?: string
  name: string
  daily_calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  instructions?: string | null
  meals: CoachTemplateMealJson[]
}

export type CoachCustomFoodInput = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string
  category: string
}

// ─── Helpers internos ──────────────────────────────────────────────────────────

async function requireCoachSession(coachId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== coachId) {
    return { supabase: null as null, error: 'No autorizado.' }
  }
  return { supabase, error: null as null }
}

async function revalidateClientNutritionPaths(coachId: string, clientId: string) {
  const supabase = await createClient()
  const { data: coach } = await supabase.from('coaches').select('slug').eq('id', coachId).maybeSingle()
  revalidatePath(`/coach/clients/${clientId}`)
  if (coach?.slug) {
    revalidatePath(`/c/${coach.slug}/nutrition`)
  }
}

function zodErrorMessage(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join('. ')
}

// ─── Acciones principales ──────────────────────────────────────────────────────

/**
 * Crear / actualizar plantilla desde JSON con validación Zod.
 * Usa createOrUpdateTemplateFromJson → sin FormData indexado.
 */
export async function upsertCoachNutritionTemplate(
  coachId: string,
  data: CoachTemplateUpsertPayload
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  const parsed = TemplateUpsertSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: zodErrorMessage(parsed.error.issues) }
  }

  const { id, name, daily_calories, protein_g, carbs_g, fats_g, instructions,
    goal_type, tags, is_favorite, meals, propagateClientIds } = parsed.data

  try {
    const templateData = {
      name,
      daily_calories,
      protein_g,
      carbs_g,
      fats_g,
      instructions: instructions ?? null,
      coach_id: coachId,
      goal_type: goal_type ?? null,
      tags: tags ?? null,
      is_favorite: is_favorite ?? null,
    }

    const service = new NutritionService(supabase)
    const templateId = await service.createOrUpdateTemplateFromJson(
      id ?? null,
      templateData,
      meals
    )
    await service.propagateTemplateChanges(
      templateId,
      coachId,
      JSON.stringify(propagateClientIds ?? [])
    )

    revalidatePath('/coach/nutrition-plans')
    revalidatePath('/coach/clients')
    return { success: true, templateId }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al guardar la plantilla.'
    console.error('[upsertCoachNutritionTemplate]', e)
    return { success: false, error: msg }
  }
}

/**
 * Asignar plantilla existente a clientes (preserva plan_id vía propagateTemplateChanges).
 */
export async function assignTemplateToClientIds(
  coachId: string,
  templateId: string,
  clientIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  try {
    if (clientIds.length === 0) return { success: true }
    const service = new NutritionService(supabase)
    await service.propagateTemplateChanges(templateId, coachId, JSON.stringify(clientIds))
    revalidatePath('/coach/nutrition-plans')
    revalidatePath('/coach/clients')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al asignar.'
    console.error('[assignTemplateToClientIds]', e)
    return { success: false, error: msg }
  }
}

/**
 * Plan custom por alumno — JSON directo con validación Zod.
 * Sin FormData roundtrip.
 */
export async function upsertClientNutritionPlanJson(
  coachId: string,
  clientId: string,
  data: CoachClientPlanUpsertPayload
): Promise<{ success: boolean; planId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  const parsed = ClientPlanSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: zodErrorMessage(parsed.error.issues) }
  }

  const { id, name, daily_calories, protein_g, carbs_g, fats_g, instructions, meals } = parsed.data

  try {
    const planData = {
      client_id: clientId,
      coach_id: coachId,
      name,
      daily_calories,
      protein_g,
      carbs_g,
      fats_g,
      instructions: instructions ?? null,
      is_active: true,
      is_custom: true,
    }

    let currentPlanId = id ?? null

    const sorted = [...meals].sort((a, b) => a.order_index - b.order_index)

    if (currentPlanId) {
      const snapshotPayload = await fetchClientPlanSnapshotPayload(supabase, currentPlanId, coachId)
      if (snapshotPayload) {
        const label = format(new Date(), 'yyyy-MM-dd HH:mm')
        const { error: histErr } = await supabase.from('nutrition_plan_history').insert({
          coach_id: coachId,
          client_id: clientId,
          nutrition_plan_id: currentPlanId,
          snapshot: JSON.parse(JSON.stringify(snapshotPayload)) as Json,
          label,
          source: 'auto_before_save',
        })
        if (histErr) console.warn('[nutrition_plan_history]', histErr)
      }

      const { error: updateError } = await supabase
        .from('nutrition_plans')
        .update(planData)
        .eq('id', currentPlanId)
        .eq('coach_id', coachId)

      if (updateError) throw updateError

      // Fetch existing meals to match by order_index (preserves IDs → nutrition_meal_logs survive)
      const { data: existingMeals } = await supabase
        .from('nutrition_meals')
        .select('id, order_index, day_of_week, description')
        .eq('plan_id', currentPlanId)
        .order('order_index', { ascending: true })

      const existingByIndex = new Map<number, string>(
        (existingMeals ?? []).map((m) => [m.order_index as number, m.id as string])
      )
      const newIndices = new Set(sorted.map((m) => m.order_index))

      // Delete only meals whose position no longer exists in the new set
      const toDelete = (existingMeals ?? [])
        .filter((m) => !newIndices.has(m.order_index as number))
        .map((m) => m.id as string)

      if (toDelete.length) {
        await supabase.from('food_items').delete().in('meal_id', toDelete)
        await supabase.from('nutrition_meals').delete().in('id', toDelete)
      }

      for (const meal of sorted) {
        const existingId = existingByIndex.get(meal.order_index)
        if (existingId) {
          // UPDATE in-place: keep meal ID → nutrition_meal_logs survive
          await supabase
            .from('nutrition_meals')
            .update({
              name: meal.name,
              description: meal.notes ?? '',
              order_index: meal.order_index,
              day_of_week: meal.day_of_week ?? null,
            })
            .eq('id', existingId)
          await supabase.from('food_items').delete().eq('meal_id', existingId)
          if (meal.foodItems.length > 0) {
            await supabase.from('food_items').insert(
              meal.foodItems.map((fi) => ({
                meal_id: existingId,
                food_id: fi.food_id,
                quantity: fi.quantity,
                unit: fi.unit,
                swap_options: fi.swap_options ?? [],
              }))
            )
          }
        } else {
          const { data: newMeal, error: mealError } = await supabase
            .from('nutrition_meals')
            .insert({
              plan_id: currentPlanId!,
              name: meal.name,
              description: meal.notes ?? '',
              order_index: meal.order_index,
              day_of_week: meal.day_of_week ?? null,
            })
            .select('id')
            .single()
          if (mealError) throw mealError
          if (meal.foodItems.length > 0) {
            await supabase.from('food_items').insert(
              meal.foodItems.map((fi) => ({
                meal_id: newMeal.id,
                food_id: fi.food_id,
                quantity: fi.quantity,
                unit: fi.unit,
                swap_options: fi.swap_options ?? [],
              }))
            )
          }
        }
      }
    } else {
      await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId)

      const { data: newPlan, error: planError } = await supabase
        .from('nutrition_plans')
        .insert(planData)
        .select('id')
        .single()

      if (planError) throw planError
      currentPlanId = newPlan.id

      for (const meal of sorted) {
        const { data: insertedMeal, error: mealError } = await supabase
          .from('nutrition_meals')
          .insert({
            plan_id: currentPlanId!,
            name: meal.name,
            description: meal.notes ?? '',
            order_index: meal.order_index,
            day_of_week: meal.day_of_week ?? null,
          })
          .select('id')
          .single()

        if (mealError) throw mealError

        if (meal.foodItems.length > 0) {
          await supabase.from('food_items').insert(
            meal.foodItems.map((fi) => ({
              meal_id: insertedMeal.id,
              food_id: fi.food_id,
              quantity: fi.quantity,
              unit: fi.unit,
              swap_options: fi.swap_options ?? [],
            }))
          )
        }
      }
    }

    await revalidateClientNutritionPaths(coachId, clientId)
    revalidatePath('/coach/nutrition-plans')
    return { success: true, planId: currentPlanId ?? undefined }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al guardar el plan.'
    console.error('[upsertClientNutritionPlanJson]', e)
    return { success: false, error: msg }
  }
}

/**
 * Alta de alimento custom del coach con validación Zod.
 */
export async function addCoachCustomFood(
  coachId: string,
  food: CoachCustomFoodInput
): Promise<{ success: boolean; foodId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  const parsed = CustomFoodSchema.safeParse(food)
  if (!parsed.success) {
    return { success: false, error: zodErrorMessage(parsed.error.issues) }
  }

  const { name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category } = parsed.data

  const { data, error } = await supabase
    .from('foods')
    .insert({
      name: name.trim(),
      calories,
      protein_g,
      carbs_g,
      fats_g,
      serving_size,
      serving_unit,
      category,
      coach_id: coachId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[addCoachCustomFood]', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/coach/foods')
  revalidatePath('/coach/nutrition-plans')
  return { success: true, foodId: data.id }
}

// ─── Acciones legacy (FormData) ────────────────────────────────────────────────

export type TemplateFormState = {
  error?: string
  success?: boolean
}

function safeParseInt(value: string | null): number | null {
  if (!value) return null
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? null : parsed
}

function parseLegacyTemplateMeals(formData: FormData): CoachTemplateMealJson[] {
  const mealIndexes = new Set<number>()
  for (const [key] of formData.entries()) {
    const m = /^meal_name_(\d+)$/.exec(key)
    if (m) mealIndexes.add(Number(m[1]))
  }

  const sortedIndexes = [...mealIndexes].sort((a, b) => a - b)
  return sortedIndexes.map((idx, orderIdx) => {
    const rawName = formData.get(`meal_name_${idx}`)
    const name = typeof rawName === 'string' && rawName.trim().length > 0
      ? rawName.trim()
      : `Comida ${orderIdx + 1}`

    const items: CoachTemplateMealFoodItem[] = []
    for (const [key, value] of formData.entries()) {
      const fm = new RegExp(`^meal_${idx}_food_(\\d+)$`).exec(key)
      if (!fm || typeof value !== 'string') continue
      try {
        const parsed = JSON.parse(value) as Partial<CoachTemplateMealFoodItem>
        if (!parsed.food_id) continue
        items.push({
          food_id: parsed.food_id,
          quantity: Number(parsed.quantity) || 0,
          unit: parsed.unit ?? 'g',
        })
      } catch {
        continue
      }
    }

    return {
      name,
      order_index: orderIdx,
      foodItems: items,
    }
  })
}

/** @deprecated Usar upsertCoachNutritionTemplate. Mantenido para compatibilidad con formularios legacy. */
export async function saveNutritionTemplate(
  coachId: string,
  prevState: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  try {
    void prevState
    const templateIdRaw = formData.get('id')
    const templateId = typeof templateIdRaw === 'string' && templateIdRaw.length > 0 ? templateIdRaw : undefined
    const name = formData.get('name') as string
    const caloriesStr = formData.get('daily_calories') as string
    const proteinStr = formData.get('protein_g') as string
    const carbsStr = formData.get('carbs_g') as string
    const fatsStr = formData.get('fats_g') as string
    const instructions = formData.get('instructions') as string
    const selectedClientsStr = (formData.get('selected_clients') as string) || '[]'
    const meals = parseLegacyTemplateMeals(formData)
    let parsedClientIds: string[] = []
    try {
      const parsed = JSON.parse(selectedClientsStr) as unknown
      parsedClientIds = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      parsedClientIds = []
    }

    const res = await upsertCoachNutritionTemplate(coachId, {
      id: templateId,
      name,
      daily_calories: safeParseInt(caloriesStr) ?? 0,
      protein_g: safeParseInt(proteinStr) ?? 0,
      carbs_g: safeParseInt(carbsStr) ?? 0,
      fats_g: safeParseInt(fatsStr) ?? 0,
      instructions: instructions || null,
      meals,
      propagateClientIds: parsedClientIds,
    })
    if (!res.success) return { error: res.error ?? 'No se pudo guardar la plantilla.' }
    return { success: true }
  } catch (err: unknown) {
    console.error('[saveNutritionTemplate] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar la plantilla.'
    return { error: msg }
  }
}

export async function deleteNutritionTemplate(templateId: string, coachId: string) {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.' }

  const { error } = await supabase
    .from('nutrition_plan_templates')
    .delete()
    .eq('id', templateId)
    .eq('coach_id', coachId)

  if (error) return { error: 'No se pudo eliminar la plantilla.' }
  revalidatePath('/coach/nutrition-plans')
  return { success: true }
}

export async function duplicateNutritionTemplate(templateId: string, coachId: string) {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.' }

  const nutritionService = new NutritionService(supabase)

  try {
    await nutritionService.duplicateTemplate(templateId, coachId)
    revalidatePath('/coach/nutrition-plans')
    return { success: true }
  } catch (err: unknown) {
    console.error('[duplicateNutritionTemplate] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error al duplicar la plantilla.'
    return { error: msg }
  }
}

export async function unassignNutritionPlan(coachId: string, clientId: string, planId: string) {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.' }

  try {
    const { data: row, error: findErr } = await supabase
      .from('nutrition_plans')
      .select('id')
      .eq('id', planId)
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .maybeSingle()

    if (findErr) throw findErr
    if (!row) return { error: 'Plan no encontrado o no pertenece a tu cuenta.' }

    const { error } = await supabase.from('nutrition_plans').update({ is_active: false }).eq('id', planId)

    if (error) throw error

    revalidatePath('/coach/nutrition-plans')
    revalidatePath(`/coach/clients/${clientId}`)
    return { success: true }
  } catch (err: unknown) {
    console.error('[unassignNutritionPlan] Error:', err)
    return { error: 'Error al desasignar el plan.' }
  }
}

/** Orden de args histórico — delega en assignTemplateToClientIds. */
export async function assignTemplateToClients(templateId: string, coachId: string, clientIds: string[]) {
  return assignTemplateToClientIds(coachId, templateId, clientIds)
}

/** Lightweight list of coach clients for the duplicate-plan modal. */
export async function getCoachClientsLite(
  coachId: string
): Promise<{ id: string; full_name: string }[]> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase || authErr) return []
  const { data } = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('coach_id', coachId)
    .order('full_name')
  return (data ?? []).map((c) => ({ id: c.id as string, full_name: c.full_name as string }))
}

export async function saveCustomFood(coachId: string, prevState: unknown, formData: FormData) {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.', success: false }

  try {
    const name = (formData.get('name') as string)?.trim()
    const calories = Math.round(parseFloat(formData.get('calories') as string))
    const protein_g = Math.round(parseFloat(formData.get('protein') as string) || 0)
    const carbs_g = Math.round(parseFloat(formData.get('carbs') as string) || 0)
    const fats_g = Math.round(parseFloat(formData.get('fats') as string) || 0)
    const category = (formData.get('category') as string | null)?.trim() || 'otro'
    const serving_unit = ((formData.get('unit') as string | null)?.trim() || 'g') === 'un' ? 'un' : 'g'
    const servingSizeRaw = formData.get('serving_size') as string | null
    const servingParsed = parseFloat(servingSizeRaw ?? '')
    const serving_size = !isNaN(servingParsed) && servingParsed > 0 ? servingParsed : 100

    const parsed = CustomFoodSchema.safeParse({
      name,
      calories: isNaN(calories) ? -1 : calories,
      protein_g,
      carbs_g,
      fats_g,
      serving_size,
      serving_unit,
      category,
    })

    if (!parsed.success) {
      return { error: zodErrorMessage(parsed.error.issues), success: false }
    }

    const { error } = await supabase.from('foods').insert({
      name: parsed.data.name,
      calories: parsed.data.calories,
      protein_g: parsed.data.protein_g,
      carbs_g: parsed.data.carbs_g,
      fats_g: parsed.data.fats_g,
      serving_size: parsed.data.serving_size,
      serving_unit: parsed.data.serving_unit,
      category: parsed.data.category,
      coach_id: coachId,
    })

    if (error) throw error

    revalidatePath('/coach/nutrition-plans')
    revalidatePath('/coach/foods')
    return { success: true }
  } catch (err: unknown) {
    console.error('[saveCustomFood] Error:', err)
    const msg =
      err instanceof Error ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
    return { error: `Error al guardar: ${msg}`, success: false }
  }
}

/**
 * Clona un plan activo (SYNCED o CUSTOM) de un alumno a otro como plan CUSTOM.
 * No modifica el plan origen ni su historial. El alumno destino recibe un plan nuevo.
 * Los daily_nutrition_logs del destino (si los hay de un plan anterior) quedan intactos
 * en DB — solo se desactiva el plan previo, los logs no se tocan.
 */
export async function duplicatePlanToClient(
  coachId: string,
  sourcePlanId: string,
  targetClientId: string
): Promise<{ success: boolean; planId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  try {
    // 1. Fetch source plan — verify it belongs to this coach
    const { data: sourcePlan, error: srcErr } = await supabase
      .from('nutrition_plans')
      .select('id, name, daily_calories, protein_g, carbs_g, fats_g, instructions')
      .eq('id', sourcePlanId)
      .eq('coach_id', coachId)
      .maybeSingle()

    if (srcErr) throw srcErr
    if (!sourcePlan) return { success: false, error: 'Plan origen no encontrado.' }

    // 2. Fetch source meals + food_items
    const { data: sourceMeals, error: mealsErr } = await supabase
      .from('nutrition_meals')
      .select('id, name, order_index, day_of_week, description')
      .eq('plan_id', sourcePlanId)
      .order('order_index', { ascending: true })

    if (mealsErr) throw mealsErr

    const mealIds = (sourceMeals ?? []).map((m) => m.id as string)

    const { data: sourceFoodItems, error: fiErr } = mealIds.length
      ? await supabase
          .from('food_items')
      .select('meal_id, food_id, quantity, unit, swap_options')
          .in('meal_id', mealIds)
      : { data: [], error: null }

    if (fiErr) throw fiErr

    const foodsByMeal = new Map<
      string,
      {
        food_id: string
        quantity: number
        unit: string
        swap_options?: Array<{
            food_id: string
            is_liquid?: boolean
            quantity?: number
            unit?: 'g' | 'un' | 'ml'
            name: string
          calories: number
          protein_g: number
          carbs_g: number
          fats_g: number
          serving_size: number
          serving_unit?: string | null
        }>
      }[]
    >()
    for (const fi of sourceFoodItems ?? []) {
      const list = foodsByMeal.get(fi.meal_id as string) ?? []
      list.push({
        food_id: fi.food_id as string,
        quantity: fi.quantity as number,
        unit: fi.unit as string,
        swap_options:
          (fi.swap_options as Array<{
            food_id: string
            is_liquid?: boolean
            quantity?: number
            unit?: 'g' | 'un' | 'ml'
            name: string
            calories: number
            protein_g: number
            carbs_g: number
            fats_g: number
            serving_size: number
            serving_unit?: string | null
          }> | null) ?? [],
      })
      foodsByMeal.set(fi.meal_id as string, list)
    }

    // 3. Deactivate any current active plan for the target (keeps logs intact)
    await supabase
      .from('nutrition_plans')
      .update({ is_active: false })
      .eq('client_id', targetClientId)
      .eq('coach_id', coachId)
      .eq('is_active', true)

    // 4. Create new plan as CUSTOM for target
    const { data: newPlan, error: planErr } = await supabase
      .from('nutrition_plans')
      .insert({
        client_id: targetClientId,
        coach_id: coachId,
        name: sourcePlan.name as string,
        daily_calories: sourcePlan.daily_calories as number,
        protein_g: sourcePlan.protein_g as number,
        carbs_g: sourcePlan.carbs_g as number,
        fats_g: sourcePlan.fats_g as number,
        instructions: (sourcePlan.instructions as string | null) ?? null,
        is_active: true,
        is_custom: true,
        template_id: null,
      })
      .select('id')
      .single()

    if (planErr) throw planErr

    // 5. Clone meals + food_items
    for (const meal of sourceMeals ?? []) {
      const { data: newMeal, error: mealErr } = await supabase
        .from('nutrition_meals')
        .insert({
          plan_id: newPlan.id,
          name: meal.name as string,
          description: (meal.description as string | null) ?? '',
          order_index: meal.order_index as number,
          day_of_week: (meal.day_of_week as number | null) ?? null,
        })
        .select('id')
        .single()

      if (mealErr) throw mealErr

      const items = foodsByMeal.get(meal.id as string) ?? []
      if (items.length > 0) {
        await supabase.from('food_items').insert(
          items.map((fi) => ({
            meal_id: newMeal.id,
            food_id: fi.food_id,
            quantity: fi.quantity,
            unit: fi.unit,
            swap_options: fi.swap_options ?? [],
          }))
        )
      }
    }

    await revalidateClientNutritionPaths(coachId, targetClientId)
    revalidatePath('/coach/nutrition-plans')
    return { success: true, planId: newPlan.id }
  } catch (err: unknown) {
    console.error('[duplicatePlanToClient]', err)
    const msg = err instanceof Error ? err.message : 'Error al duplicar el plan.'
    return { success: false, error: msg }
  }
}

export async function restoreClientNutritionPlanFromHistory(
  coachId: string,
  clientId: string,
  historyId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  const { data: row, error: fetchErr } = await supabase
    .from('nutrition_plan_history')
    .select('nutrition_plan_id, snapshot, client_id')
    .eq('id', historyId)
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (fetchErr || !row) return { success: false, error: 'Versión no encontrada.' }

  const parsed = ClientPlanSchema.safeParse(row.snapshot)
  if (!parsed.success) {
    return { success: false, error: 'Snapshot inválido o incompatible con el validador actual.' }
  }

  const d = parsed.data
  return upsertClientNutritionPlanJson(coachId, clientId, {
    id: row.nutrition_plan_id,
    name: d.name,
    daily_calories: d.daily_calories,
    protein_g: d.protein_g,
    carbs_g: d.carbs_g,
    fats_g: d.fats_g,
    instructions: d.instructions ?? null,
    meals: d.meals.map((m) => ({
      name: m.name,
      order_index: m.order_index,
      day_of_week: m.day_of_week ?? null,
      foodItems: m.foodItems.map((fi) => ({
        food_id: fi.food_id,
        quantity: fi.quantity,
        unit: fi.unit,
        swap_options: fi.swap_options,
      })),
    })),
  })
}

export async function upsertNutritionPlanCycle(
  coachId: string,
  clientId: string,
  data: NutritionPlanCycleUpsertInput
): Promise<{ success: boolean; error?: string; cycleId?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  const parsed = nutritionPlanCycleUpsertSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: zodErrorMessage(parsed.error.issues) }
  }

  const { id, name, start_date, blocks, is_active } = parsed.data
  const now = new Date().toISOString()

  try {
    if (is_active) {
      await supabase
        .from('nutrition_plan_cycles')
        .update({ is_active: false, updated_at: now })
        .eq('client_id', clientId)
        .eq('coach_id', coachId)
    }

    const base = {
      coach_id: coachId,
      client_id: clientId,
      name,
      start_date,
      blocks: JSON.parse(JSON.stringify(blocks)) as Json,
      is_active,
      updated_at: now,
    }

    if (id) {
      const { data: updated, error } = await supabase
        .from('nutrition_plan_cycles')
        .update(base)
        .eq('id', id)
        .eq('coach_id', coachId)
        .select('id')
        .single()
      if (error) throw error
      await revalidateClientNutritionPaths(coachId, clientId)
      revalidatePath('/coach/nutrition-plans')
      return { success: true, cycleId: updated.id }
    }

    const { data: inserted, error } = await supabase.from('nutrition_plan_cycles').insert(base).select('id').single()
    if (error) throw error
    await revalidateClientNutritionPaths(coachId, clientId)
    revalidatePath('/coach/nutrition-plans')
    return { success: true, cycleId: inserted.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al guardar el ciclo.'
    console.error('[upsertNutritionPlanCycle]', e)
    return { success: false, error: msg }
  }
}

// ─── Preferencias de alimentos del cliente ────────────────────────────────────

/**
 * Returns the set of food_ids a client has marked as 'favorite'.
 * Coach can read their own clients' preferences via RLS policy.
 */
export async function getClientFoodFavorites(clientId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
  return (data ?? []).map((r) => r.food_id)
}
