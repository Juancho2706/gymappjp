'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NutritionService } from '@/services/nutrition.service'

export type CoachTemplateMealFoodItem = {
  food_id: string
  quantity: number
  unit: string
}

export type CoachTemplateMealJson = {
  name: string
  order_index: number
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

function templatePayloadToFormData(data: CoachTemplateUpsertPayload): FormData {
  const fd = new FormData()
  if (data.id) fd.set('id', data.id)
  fd.set('name', data.name)
  fd.set('daily_calories', String(data.daily_calories))
  fd.set('protein_g', String(data.protein_g))
  fd.set('carbs_g', String(data.carbs_g))
  fd.set('fats_g', String(data.fats_g))
  fd.set('instructions', data.instructions ?? '')

  const sorted = [...data.meals].sort((a, b) => a.order_index - b.order_index)
  sorted.forEach((meal, i) => {
    fd.set(`meal_name_${i}`, meal.name)
    meal.foodItems.forEach((fi, j) => {
      fd.set(
        `meal_${i}_food_${j}`,
        JSON.stringify({ food_id: fi.food_id, quantity: fi.quantity, unit: fi.unit })
      )
    })
  })
  return fd
}

function clientPlanPayloadToFormData(data: CoachClientPlanUpsertPayload): FormData {
  const fd = new FormData()
  if (data.id) fd.set('id', data.id)
  fd.set('name', data.name)
  fd.set('daily_calories', String(data.daily_calories))
  fd.set('protein_g', String(data.protein_g))
  fd.set('carbs_g', String(data.carbs_g))
  fd.set('fats_g', String(data.fats_g))
  fd.set('instructions', data.instructions ?? '')

  const sorted = [...data.meals].sort((a, b) => a.order_index - b.order_index)
  sorted.forEach((meal, i) => {
    fd.set(`meal_name_${i}`, meal.name)
    meal.foodItems.forEach((fi, j) => {
      fd.set(
        `meal_${i}_food_${j}`,
        JSON.stringify({ food_id: fi.food_id, quantity: fi.quantity, unit: fi.unit })
      )
    })
  })
  return fd
}

async function revalidateClientNutritionPaths(coachId: string, clientId: string) {
  const supabase = await createClient()
  const { data: coach } = await supabase.from('coaches').select('slug').eq('id', coachId).maybeSingle()
  revalidatePath(`/coach/clients/${clientId}`)
  if (coach?.slug) {
    revalidatePath(`/c/${coach.slug}/nutrition`)
  }
}

/**
 * Crear / actualizar plantilla desde JSON (API programática).
 * Reutiliza `NutritionService` + FormData compatible con el editor actual.
 */
export async function upsertCoachNutritionTemplate(
  coachId: string,
  data: CoachTemplateUpsertPayload
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  if (!data.name?.trim()) {
    return { success: false, error: 'El nombre es obligatorio.' }
  }

  try {
    const formData = templatePayloadToFormData(data)
    const propagate = data.propagateClientIds ?? []
    formData.set('selected_clients', JSON.stringify(propagate))

    const templateData = {
      name: data.name,
      daily_calories: data.daily_calories,
      protein_g: data.protein_g,
      carbs_g: data.carbs_g,
      fats_g: data.fats_g,
      instructions: data.instructions ?? null,
      coach_id: coachId,
      goal_type: data.goal_type ?? null,
      tags: data.tags ?? null,
      is_favorite: data.is_favorite ?? null,
    }

    const service = new NutritionService(supabase)
    const templateId = await service.createOrUpdateTemplate(
      data.id ?? null,
      templateData,
      formData
    )
    await service.propagateTemplateChanges(templateId, coachId, JSON.stringify(propagate))

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
 * Asignar plantilla existente a clientes (desactiva plan previo y crea plan sync).
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
 * Plan custom por alumno (JSON). Equivale a `saveNutritionPlan` con FormData generado.
 */
export async function upsertClientNutritionPlanJson(
  coachId: string,
  clientId: string,
  data: CoachClientPlanUpsertPayload
): Promise<{ success: boolean; planId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  if (!data.name?.trim()) {
    return { success: false, error: 'El nombre del plan es requerido.' }
  }

  try {
    const formData = clientPlanPayloadToFormData(data)
    const planId = data.id ?? null
    const planData = {
      client_id: clientId,
      coach_id: coachId,
      name: data.name,
      daily_calories: data.daily_calories,
      protein_g: data.protein_g,
      carbs_g: data.carbs_g,
      fats_g: data.fats_g,
      instructions: data.instructions ?? null,
      is_active: true,
      is_custom: true,
    }

    let currentPlanId = planId

    if (planId) {
      const { error: updateError } = await supabase
        .from('nutrition_plans')
        .update(planData)
        .eq('id', planId)
        .eq('coach_id', coachId)

      if (updateError) throw updateError
      await supabase.from('nutrition_meals').delete().eq('plan_id', planId)
    } else {
      await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId)

      const { data: newPlan, error: planError } = await supabase
        .from('nutrition_plans')
        .insert(planData)
        .select('id')
        .single()

      if (planError) throw planError
      currentPlanId = newPlan.id
    }

    let i = 0
    while (formData.has(`meal_name_${i}`)) {
      const mealName = formData.get(`meal_name_${i}`) as string
      const { data: insertedMeal, error: mealError } = await supabase
        .from('nutrition_meals')
        .insert({
          plan_id: currentPlanId!,
          name: mealName,
          description: '',
          order_index: i,
        })
        .select('id')
        .single()

      if (mealError) throw mealError

      let j = 0
      const itemsToInsert: { meal_id: string; food_id: string; quantity: number; unit: string }[] = []
      while (formData.has(`meal_${i}_food_${j}`)) {
        const raw = formData.get(`meal_${i}_food_${j}`) as string
        const foodData = JSON.parse(raw) as { food_id: string; quantity: number; unit: string }
        itemsToInsert.push({
          meal_id: insertedMeal.id,
          food_id: foodData.food_id,
          quantity: foodData.quantity,
          unit: foodData.unit || 'g',
        })
        j++
      }

      if (itemsToInsert.length > 0) {
        await supabase.from('food_items').insert(itemsToInsert)
      }
      i++
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

/**
 * Alta de alimento custom del coach (JSON + categoría).
 */
export async function addCoachCustomFood(
  coachId: string,
  food: CoachCustomFoodInput
): Promise<{ success: boolean; foodId?: string; error?: string }> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { success: false, error: authErr ?? 'No autorizado.' }

  if (!food.name?.trim()) {
    return { success: false, error: 'El nombre es obligatorio.' }
  }

  const { data, error } = await supabase
    .from('foods')
    .insert({
      name: food.name.trim(),
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fats_g: food.fats_g,
      serving_size: food.serving_size,
      serving_unit: food.serving_unit || 'g',
      category: food.category || 'otro',
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

// --- Legacy hub actions (FormData + TemplateLibrary / AssignModal / FoodLibrary) — con sesión coach ---

export type TemplateFormState = {
  error?: string
  success?: boolean
}

function safeParseInt(value: string | null): number | null {
  if (!value) return null
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? null : parsed
}

export async function saveNutritionTemplate(
  coachId: string,
  prevState: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.' }

  const nutritionService = new NutritionService(supabase)

  try {
    const templateId = formData.get('id') as string | null
    const name = formData.get('name') as string
    const caloriesStr = formData.get('daily_calories') as string
    const proteinStr = formData.get('protein_g') as string
    const carbsStr = formData.get('carbs_g') as string
    const fatsStr = formData.get('fats_g') as string
    const instructions = formData.get('instructions') as string
    const selectedClientsStr = formData.get('selected_clients') as string

    if (!name) return { error: 'El nombre es obligatorio.' }

    const templateData = {
      name,
      daily_calories: safeParseInt(caloriesStr),
      protein_g: safeParseInt(proteinStr),
      carbs_g: safeParseInt(carbsStr),
      fats_g: safeParseInt(fatsStr),
      instructions: instructions || null,
      coach_id: coachId,
    }

    const newTemplateId = await nutritionService.createOrUpdateTemplate(templateId, templateData, formData)
    await nutritionService.propagateTemplateChanges(newTemplateId, coachId, selectedClientsStr)

    revalidatePath('/coach/nutrition-plans')
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

/** Orden de args histórico (templateId, coachId, clientIds) — delega en `assignTemplateToClientIds`. */
export async function assignTemplateToClients(templateId: string, coachId: string, clientIds: string[]) {
  return assignTemplateToClientIds(coachId, templateId, clientIds)
}

export async function saveCustomFood(coachId: string, prevState: unknown, formData: FormData) {
  const { supabase, error: authErr } = await requireCoachSession(coachId)
  if (!supabase) return { error: authErr ?? 'No autorizado.', success: false }

  try {
    const name = (formData.get('name') as string)?.trim()
    const calories = Math.round(parseFloat(formData.get('calories') as string))
    const protein = Math.round(parseFloat(formData.get('protein') as string) || 0)
    const carbs = Math.round(parseFloat(formData.get('carbs') as string) || 0)
    const fats = Math.round(parseFloat(formData.get('fats') as string) || 0)
    const categoryRaw = (formData.get('category') as string | null)?.trim() || null
    const unit = (formData.get('unit') as string | null)?.trim() || 'g'
    const servingSizeRaw = formData.get('serving_size') as string | null
    const servingParsed = parseFloat(servingSizeRaw ?? '')
    const serving_size = !isNaN(servingParsed) && servingParsed > 0 ? servingParsed : 100

    if (!name) return { error: 'El nombre es obligatorio.', success: false }
    if (isNaN(calories)) return { error: 'Las calorías son obligatorias.', success: false }

    const validCategories = ['proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura', 'legumbre', 'bebida', 'snack', 'otro']
    const category = categoryRaw && validCategories.includes(categoryRaw) ? categoryRaw : null

    const { error } = await supabase.from('foods').insert({
      name,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fats_g: fats,
      serving_size,
      serving_unit: unit,
      category,
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
