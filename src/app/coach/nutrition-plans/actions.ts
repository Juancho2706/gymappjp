'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
    try {
        const templateId = formData.get('template_id') as string | null;
        console.log('[saveNutritionTemplate] Action started for coach:', coachId, 'templateId:', templateId);
        const startTime = Date.now();
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

        let currentTemplateId = templateId;

        if (templateId) {
            // 1a. Update Existing Template
            const { error: updateError } = await supabase
                .from('nutrition_plan_templates')
                .update({
                    name,
                    description: description || null,
                    daily_calories: safeParseInt(caloriesStr),
                    protein_g: safeParseInt(proteinStr),
                    carbs_g: safeParseInt(carbsStr),
                    fats_g: safeParseInt(fatsStr),
                    instructions: instructions || null,
                })
                .eq('id', templateId)
                .eq('coach_id', coachId)

            if (updateError) {
                console.error('[saveNutritionTemplate] Update Template Error:', updateError)
                return { error: 'Error al actualizar la plantilla del plan.' }
            }

            // Clean up old meals and groups for this template
            // We'll delete and re-insert to simplify logic
            const { error: deleteError } = await supabase
                .from('template_meals')
                .delete()
                .eq('template_id', templateId)

            if (deleteError) {
                console.error('[saveNutritionTemplate] Error cleaning up old meals:', deleteError)
                return { error: 'Error al limpiar datos antiguos de la plantilla.' }
            }
        } else {
            // 1b. Insert New Template
            const { data: template, error: templateError } = await supabase
                .from('nutrition_plan_templates')
                .insert({
                    coach_id: coachId,
                    name,
                    description: description || null,
                    daily_calories: safeParseInt(caloriesStr),
                    protein_g: safeParseInt(proteinStr),
                    carbs_g: safeParseInt(carbsStr),
                    fats_g: safeParseInt(fatsStr),
                    instructions: instructions || null,
                })
                .select('id')
                .single()

            if (templateError || !template) {
                console.error('[saveNutritionTemplate] Save Template Error:', templateError)
                return { error: templateError ? (templateError.message || 'Error al guardar la plantilla del plan.') : 'Error al guardar la plantilla del plan.' }
            }
            currentTemplateId = template.id;
        }

        console.log('[saveNutritionTemplate] Template ID to use:', currentTemplateId);

        // 2. Extract and Insert Meals
        let i = 0
        const mealsToProcess = [];
        while (formData.has(`meal_name_${i}`)) {
            const mealName = formData.get(`meal_name_${i}`) as string
            const groups = [];
            let j = 0
            while (formData.has(`meal_${i}_group_id_${j}`)) {
                const savedMealId = formData.get(`meal_${i}_group_id_${j}`) as string
                if (savedMealId) groups.push(savedMealId);
                j++
            }
            mealsToProcess.push({ name: mealName, groups });
            i++
        }

        for (let i = 0; i < mealsToProcess.length; i++) {
            const mealData = mealsToProcess[i];
            const { data: meal, error: mealError } = await supabase
                .from('template_meals')
                .insert({
                    template_id: currentTemplateId!,
                    name: mealData.name,
                    order_index: i
                })
                .select('id')
                .single()

            if (mealError || !meal) {
                return { error: `Error al guardar la comida ${mealData.name}: ${mealError?.message || 'Error desconocido'}` }
            }

            for (let j = 0; j < mealData.groups.length; j++) {
                const savedMealId = mealData.groups[j];
                await supabase.from('template_meal_groups').insert({
                    template_meal_id: meal.id,
                    saved_meal_id: savedMealId,
                    order_index: j
                })
            }
        }

        // 3. Propagation or Mass Assignment
        if (templateId) {
            // PROPAGATION: Update all active nutrition_plans linked to this template
            const { data: fullTemplate, error: tError } = await supabase
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

            if (!tError && fullTemplate) {
                const { data: linkedPlans } = await supabase
                    .from('nutrition_plans')
                    .select('client_id')
                    .eq('template_id', templateId)
                    .eq('is_active', true)

                if (linkedPlans && linkedPlans.length > 0) {
                    console.log(`[saveNutritionTemplate] Propagating changes to ${linkedPlans.length} active plans`);
                    await Promise.all(
                        linkedPlans.map(p => assignTemplateToClientWithData(fullTemplate, p.client_id, coachId))
                    );
                }
            }
        }

        if (selectedClientsStr) {
            try {
                const clientIds: string[] = JSON.parse(selectedClientsStr)
                if (clientIds.length > 0) {
                    const { data: fullTemplate } = await supabase
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
                        .eq('id', currentTemplateId!)
                        .single()

                    if (fullTemplate) {
                        await Promise.all(
                            clientIds.map(clientId => assignTemplateToClientWithData(fullTemplate, clientId, coachId))
                        );
                    }
                }
            } catch (e) {
                console.error('Error parsing selected clients or assigning:', e)
            }
        }

        const { data: coach } = await supabase.from('coaches').select('slug').eq('id', coachId).single()
        if (coach?.slug) {
            revalidatePath(`/c/${coach.slug}/nutrition`)
        }

        revalidatePath('/coach/nutrition-plans')
        return { success: true }
    } catch (error) {
        console.error('[saveNutritionTemplate] Unexpected error:', error)
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

async function assignTemplateToClientWithData(template: any, clientId: string, coachId: string): Promise<string | null> {
    const supabase = await createClient()

    try {
        // 1. Inactivate previous plans
        const { error: updateError } = await supabase
            .from('nutrition_plans')
            .update({ is_active: false })
            .eq('client_id', clientId)
        
        if (updateError) console.error(`Error inactivating plans for ${clientId}:`, updateError)

        // 2. Create new plan
        const { data: newPlan, error: pError } = await supabase
            .from('nutrition_plans')
            .insert({
                client_id: clientId,
                coach_id: coachId,
                template_id: template.id,
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

        if (pError || !newPlan) {
            console.error(`Error creating plan for ${clientId}:`, pError)
            return `Error plan p/cliente ${clientId}: ${pError?.message}`
        }

        // 3. Create meals and items
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

            if (mError || !newMeal) {
                console.error(`Error creating meal ${tMeal.name} for ${clientId}:`, mError)
                continue
            }

            // Flatten all items from all groups in this meal
            const allItemsToInsert: any[] = []
            if (tMeal.template_meal_groups && Array.isArray(tMeal.template_meal_groups)) {
                for (const tGroup of tMeal.template_meal_groups) {
                    const mealGroup = tGroup.saved_meals
                    if (mealGroup && mealGroup.saved_meal_items && Array.isArray(mealGroup.saved_meal_items)) {
                        mealGroup.saved_meal_items.forEach((item: any) => {
                            if (item.food_id) {
                                allItemsToInsert.push({
                                    meal_id: newMeal.id,
                                    food_id: item.food_id,
                                    quantity: item.quantity,
                                    unit: item.unit || 'g'
                                })
                            }
                        })
                    }
                }
            }

            if (allItemsToInsert.length > 0) {
                const { error: itemsError } = await supabase.from('food_items').insert(allItemsToInsert)
                if (itemsError) console.error(`Error inserting items for meal ${newMeal.id} (client ${clientId}):`, itemsError)
            }
        }
        return null;
    } catch (e: any) {
        return e.message || String(e);
    }
}

async function assignTemplateToClient(templateId: string, clientId: string, coachId: string) {
    // This function is now deprecated in favor of assignTemplateToClientWithData to avoid multiple fetches
    // Keeping it for backward compatibility if needed elsewhere, but updating it to be more robust
    const supabase = await createClient()

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

    await assignTemplateToClientWithData(template, clientId, coachId)
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
