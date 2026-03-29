'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type TemplateFormState = {
    error?: string
    success?: boolean
}

export async function saveNutritionTemplate(
    coachId: string,
    prevState: TemplateFormState,
    formData: FormData
): Promise<TemplateFormState> {
    const supabase = await createClient()

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const caloriesStr = formData.get('daily_calories') as string
    const proteinStr = formData.get('protein_g') as string
    const carbsStr = formData.get('carbs_g') as string
    const fatsStr = formData.get('fats_g') as string
    const instructions = formData.get('instructions') as string
    const selectedClientsStr = formData.get('selected_clients') as string // JSON array of client IDs

    if (!name) {
        return { error: 'El nombre del plan es requerido.' }
    }

    // 1. Insert Template
    const { data: template, error: templateError } = await supabase
        .from('nutrition_plan_templates')
        .insert({
            coach_id: coachId,
            name,
            description: description || null,
            daily_calories: caloriesStr ? parseInt(caloriesStr) : null,
            protein_g: proteinStr ? parseInt(proteinStr) : null,
            carbs_g: carbsStr ? parseInt(carbsStr) : null,
            fats_g: fatsStr ? parseInt(fatsStr) : null,
            instructions: instructions || null,
        })
        .select('id')
        .single()

    if (templateError || !template) {
        console.error('Save Template Error:', templateError)
        return { error: 'Error al guardar la plantilla del plan.' }
    }

    // 2. Extract and Insert Meals
    let i = 0
    while (formData.has(`meal_name_${i}`)) {
        const mealName = formData.get(`meal_name_${i}`) as string
        const { data: meal, error: mealError } = await supabase
            .from('template_meals')
            .insert({
                template_id: template.id,
                name: mealName,
                order_index: i
            })
            .select('id')
            .single()

        if (mealError || !meal) {
            console.error('Save Template Meal Error:', mealError)
            continue
        }

        // Extract Meal Groups (Saved Meals) for this meal
        let j = 0
        while (formData.has(`meal_${i}_group_id_${j}`)) {
            const savedMealId = formData.get(`meal_${i}_group_id_${j}`) as string
            if (savedMealId) {
                await supabase.from('template_meal_groups').insert({
                    template_meal_id: meal.id,
                    saved_meal_id: savedMealId,
                    order_index: j
                })
            }
            j++
        }
        i++
    }

    // 3. Mass Assignment to Clients
    if (selectedClientsStr) {
        try {
            const clientIds: string[] = JSON.parse(selectedClientsStr)
            if (clientIds.length > 0) {
                // For each client, we create a real nutrition_plan based on this template
                for (const clientId of clientIds) {
                    await assignTemplateToClient(template.id, clientId, coachId)
                }
            }
        } catch (e) {
            console.error('Error parsing selected clients:', e)
        }
    }

    revalidatePath('/coach/nutrition-plans')
    redirect('/coach/nutrition-plans')
}

async function assignTemplateToClient(templateId: string, clientId: string, coachId: string) {
    const supabase = await createClient()

    // 1. Get Template Data
    const { data: template, error: tError } = await supabase
        .from('nutrition_plan_templates')
        .select(`
            *,
            template_meals (
                *,
                template_meal_groups (
                    saved_meal_id,
                    saved_meals (
                        *,
                        saved_meal_items (
                            *,
                            foods (*)
                        )
                    )
                )
            )
        `)
        .eq('id', templateId)
        .single()

    if (tError || !template) return

    // 2. Inactivate previous plans
    await supabase
        .from('nutrition_plans')
        .update({ is_active: false })
        .eq('client_id', clientId)

    // 3. Create new plan
    const { data: newPlan, error: pError } = await supabase
        .from('nutrition_plans')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            name: template.name,
            daily_calories: template.daily_calories,
            protein_g: template.protein_g,
            carbs_g: template.carbs_g,
            fats_g: template.fats_g,
            instructions: template.instructions,
            is_active: true
        })
        .select('id')
        .single()

    if (pError || !newPlan) return

    // 4. Create meals and items
    for (const tMeal of template.template_meals) {
        const { data: newMeal, error: mError } = await supabase
            .from('nutrition_meals')
            .insert({
                plan_id: newPlan.id,
                name: tMeal.name,
                description: "",
                order_index: tMeal.order_index
            })
            .select('id')
            .single()

        if (mError || !newMeal) continue

        // Flatten all items from all groups in this meal
        for (const tGroup of tMeal.template_meal_groups) {
            const mealGroup = tGroup.saved_meals
            if (mealGroup && mealGroup.saved_meal_items) {
                const itemsToInsert = mealGroup.saved_meal_items.map(item => ({
                    meal_id: newMeal.id,
                    food_id: item.food_id,
                    quantity: item.quantity
                }))

                if (itemsToInsert.length > 0) {
                    await supabase.from('food_items').insert(itemsToInsert)
                }
            }
        }
    }
}

export async function deleteNutritionTemplate(templateId: string, coachId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('nutrition_plan_templates')
        .delete()
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Delete Template Error:', error)
        return { error: 'No se pudo eliminar la plantilla.' }
    }

    revalidatePath('/coach/nutrition-plans')
    return { success: true }
}
