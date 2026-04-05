'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TemplateFormState = {
    error?: string
    success?: boolean
}

function safeParseInt(value: string | null): number | null {
    if (!value) return null
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? null : parsed
}

/**
 * Guarda o actualiza una plantilla maestra de nutrición.
 * Implementa limpieza atómica de comidas y alimentos para evitar duplicados.
 */
export async function saveNutritionTemplate(
    coachId: string,
    prevState: TemplateFormState,
    formData: FormData
): Promise<TemplateFormState> {
    const supabase = await createClient()
    
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
            coach_id: coachId
        }

        let currentTemplateId = templateId

        if (templateId) {
            // Actualizar plantilla existente
            const { error: updateError } = await supabase
                .from('nutrition_plan_templates')
                .update(templateData)
                .eq('id', templateId)
                .eq('coach_id', coachId)

            if (updateError) throw updateError

            // Limpieza atómica de comidas antiguas (las FKey cascada o manual)
            // Para plantillas usamos template_meals
            await supabase.from('template_meals').delete().eq('template_id', templateId)
        } else {
            // Crear nueva plantilla
            const { data: newTemplate, error: insertError } = await supabase
                .from('nutrition_plan_templates')
                .insert(templateData)
                .select('id')
                .single()

            if (insertError) throw insertError
            currentTemplateId = newTemplate.id
        }

        // Insertar comidas y alimentos extraídos del FormData
        await insertTemplateMealsFromFormData(supabase, currentTemplateId!, formData)

        // Propagación a alumnos vinculados (Solo si no son "Custom")
        await propagateTemplateChanges(supabase, currentTemplateId!, coachId, selectedClientsStr)

        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (err: any) {
        console.error('[saveNutritionTemplate] Error:', err)
        return { error: err.message || 'Error inesperado al guardar la plantilla.' }
    }
}

async function insertTemplateMealsFromFormData(supabase: any, templateId: string, formData: FormData) {
    let i = 0
    while (formData.has(`meal_name_${i}`)) {
        const mealName = formData.get(`meal_name_${i}`) as string
        
        const { data: meal, error: mealError } = await supabase
            .from('template_meals')
            .insert({
                template_id: templateId,
                name: mealName,
                order_index: i
            })
            .select('id')
            .single()

        if (mealError) throw mealError

        // En plantillas actuales guardamos alimentos a través de saved_meals/groups
        // Para simplificar el editor unificado, crearemos una "comida guardada" interna o similar
        // Pero basándonos en la estructura actual de nutrition_robust_plan.md, 
        // procesaremos los food items directos si vienen en el formData
        
        let j = 0
        const foodsToInsert = []
        while (formData.has(`meal_${i}_food_${j}`)) {
            const foodData = JSON.parse(formData.get(`meal_${i}_food_${j}`) as string)
            // Para plantillas, necesitamos vincular a saved_meals para mantener la estructura actual
            // O simplificar el esquema. Mantendremos compatibilidad creando un saved_meal temporal.
            foodsToInsert.push(foodData)
            j++
        }

        if (foodsToInsert.length > 0) {
            const { data: savedMeal } = await supabase.from('saved_meals').insert({
                coach_id: (await supabase.auth.getUser()).data.user.id,
                name: `Internal_${mealName}_${Date.now()}`
            }).select('id').single()

            await supabase.from('saved_meal_items').insert(
                foodsToInsert.map(f => ({
                    saved_meal_id: savedMeal.id,
                    food_id: f.food_id,
                    quantity: f.quantity,
                    unit: f.unit
                }))
            )

            await supabase.from('template_meal_groups').insert({
                template_meal_id: meal.id,
                saved_meal_id: savedMeal.id,
                order_index: 0
            })
        }
        i++
    }
}

async function propagateTemplateChanges(supabase: any, templateId: string, coachId: string, selectedClientsStr: string) {
    const selectedClients: string[] = selectedClientsStr ? JSON.parse(selectedClientsStr) : []
    
    // 1. Obtener alumnos que ya usan esta plantilla y NO son custom
    const { data: existingClients } = await supabase
        .from('nutrition_plans')
        .select('client_id')
        .eq('template_id', templateId)
        .eq('is_active', true)
        .eq('is_custom', false)

    const allClientIds = new Set([...selectedClients, ...(existingClients?.map((c: any) => c.client_id) || [])])

    if (allClientIds.size === 0) return

    // Obtener datos completos de la plantilla para replicar
    const { data: template } = await supabase
        .from('nutrition_plan_templates')
        .select(`
            *,
            template_meals (
                *,
                template_meal_groups (
                    saved_meals (
                        *,
                        saved_meal_items (*)
                    )
                )
            )
        `)
        .eq('id', templateId)
        .single()

    for (const clientId of allClientIds) {
        // Desactivar planes anteriores
        await supabase.from('nutrition_plans').update({ is_active: false }).eq('client_id', clientId)

        // Crear nuevo plan vinculado
        const { data: newPlan } = await supabase.from('nutrition_plans').insert({
            client_id: clientId,
            coach_id: coachId,
            template_id: templateId,
            name: template.name,
            daily_calories: template.daily_calories,
            protein_g: template.protein_g,
            carbs_g: template.carbs_g,
            fats_g: template.fats_g,
            instructions: template.instructions,
            is_active: true,
            is_custom: false
        }).select('id').single()

        // Replicar comidas y alimentos
        for (const tMeal of template.template_meals) {
            const { data: newMeal } = await supabase.from('nutrition_meals').insert({
                plan_id: newPlan.id,
                name: tMeal.name,
                description: '',
                order_index: tMeal.order_index
            }).select('id').single()

            const items = tMeal.template_meal_groups?.[0]?.saved_meals?.saved_meal_items || []
            if (items.length > 0) {
                await supabase.from('food_items').insert(
                    items.map((it: any) => ({
                        meal_id: newMeal.id,
                        food_id: it.food_id,
                        quantity: it.quantity,
                        unit: it.unit
                    }))
                )
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

    if (error) return { error: 'No se pudo eliminar la plantilla.' }
    revalidatePath('/coach/nutrition-plans')
    return { success: true }
}

export async function duplicateNutritionTemplate(templateId: string, coachId: string) {
    const supabase = await createClient()

    try {
        const { data: template, error: fetchError } = await supabase
            .from('nutrition_plan_templates')
            .select(`
                *,
                template_meals (
                    *,
                    template_meal_groups (
                        saved_meals (
                            *,
                            saved_meal_items (*)
                        )
                    )
                )
            `)
            .eq('id', templateId)
            .eq('coach_id', coachId)
            .single()

        if (fetchError || !template) throw new Error('Plantilla no encontrada')

        const { data: newTemplate, error: insertError } = await supabase
            .from('nutrition_plan_templates')
            .insert({
                name: `${template.name} (Copia)`,
                daily_calories: template.daily_calories,
                protein_g: template.protein_g,
                carbs_g: template.carbs_g,
                fats_g: template.fats_g,
                instructions: template.instructions,
                coach_id: coachId
            })
            .select('id')
            .single()

        if (insertError) throw insertError

        for (const tMeal of template.template_meals) {
            const { data: newMeal } = await supabase.from('template_meals').insert({
                template_id: newTemplate.id,
                name: tMeal.name,
                order_index: tMeal.order_index
            }).select('id').single()

            if (!newMeal) continue;

            const items = tMeal.template_meal_groups?.[0]?.saved_meals?.saved_meal_items || []
            if (items.length > 0) {
                const { data: savedMeal } = await supabase.from('saved_meals').insert({
                    coach_id: coachId,
                    name: `Internal_${tMeal.name}_${Date.now()}`
                }).select('id').single()

                if (savedMeal) {
                    await supabase.from('saved_meal_items').insert(
                        items.map((it: any) => ({
                            saved_meal_id: savedMeal.id,
                            food_id: it.food_id,
                            quantity: it.quantity,
                            unit: it.unit
                        }))
                    )

                    await supabase.from('template_meal_groups').insert({
                        template_meal_id: newMeal.id,
                        saved_meal_id: savedMeal.id,
                        order_index: 0
                    })
                }
            }
        }

        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (err: any) {
        console.error('[duplicateNutritionTemplate] Error:', err)
        return { error: err.message || 'Error al duplicar la plantilla.' }
    }
}

export async function unassignNutritionPlan(clientId: string, planId: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('nutrition_plans')
            .update({ is_active: false })
            .eq('id', planId)
            .eq('client_id', clientId)

        if (error) throw error

        revalidatePath('/coach/nutrition-plans')
        revalidatePath(`/coach/clients/${clientId}`)
        return { success: true }
    } catch (err: any) {
        console.error('[unassignNutritionPlan] Error:', err)
        return { error: 'Error al desasignar el plan.' }
    }
}

export async function assignTemplateToClients(templateId: string, coachId: string, clientIds: string[]) {
    const supabase = await createClient()

    try {
        if (clientIds.length === 0) return { success: true }

        // Aprovechamos la función de propagación existente
        await propagateTemplateChanges(supabase, templateId, coachId, JSON.stringify(clientIds))

        revalidatePath('/coach/nutrition-plans')
        revalidatePath('/coach/clients')
        return { success: true }
    } catch (err: any) {
        console.error('[assignTemplateToClients] Error:', err)
        return { error: err.message || 'Error al asignar la plantilla.' }
    }
}
