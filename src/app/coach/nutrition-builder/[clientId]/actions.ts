'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type NutritionFormState = {
    error?: string
    success?: boolean
}

/**
 * Guarda o actualiza un plan nutricional individual para un alumno.
 * Implementa la lógica de desvinculación (Custom) si el plan venía de una plantilla.
 */
export async function saveNutritionPlan(
    clientId: string,
    coachId: string,
    prevState: NutritionFormState,
    formData: FormData
): Promise<NutritionFormState> {
    const supabase = await createClient()

    try {
        const planId = formData.get('id') as string | null
        const name = formData.get('name') as string
        const caloriesStr = formData.get('daily_calories') as string
        const proteinStr = formData.get('protein_g') as string
        const carbsStr = formData.get('carbs_g') as string
        const fatsStr = formData.get('fats_g') as string
        const instructions = formData.get('instructions') as string

        if (!name) return { error: 'El nombre del plan es requerido.' }

        // Datos base del plan
        const planData = {
            client_id: clientId,
            coach_id: coachId,
            name,
            daily_calories: caloriesStr ? parseInt(caloriesStr) : null,
            protein_g: proteinStr ? parseInt(proteinStr) : null,
            carbs_g: carbsStr ? parseInt(carbsStr) : null,
            fats_g: fatsStr ? parseInt(fatsStr) : null,
            instructions: instructions || null,
            is_active: true,
            is_custom: true // Siempre que se edita individualmente, se vuelve CUSTOM
        }

        let currentPlanId = planId

        if (planId) {
            // Actualizar plan existente
            const { error: updateError } = await supabase
                .from('nutrition_plans')
                .update(planData)
                .eq('id', planId)
                .eq('coach_id', coachId)

            if (updateError) throw updateError

            // Limpieza atómica de comidas antiguas
            await supabase.from('nutrition_meals').delete().eq('plan_id', planId)
        } else {
            // 1. Inactivar planes previos
            await supabase.from('nutrition_plans')
                .update({ is_active: false })
                .eq('client_id', clientId)

            // 2. Insertar nuevo plan
            const { data: newPlan, error: planError } = await supabase
                .from('nutrition_plans')
                .insert(planData)
                .select('id')
                .single()

            if (planError) throw planError
            currentPlanId = newPlan.id
        }

        // 3. Insertar comidas y alimentos extraídos del FormData
        let i = 0
        while (formData.has(`meal_name_${i}`)) {
            const mealName = formData.get(`meal_name_${i}`) as string
            
            const { data: insertedMeal, error: mealError } = await supabase
                .from('nutrition_meals')
                .insert({
                    plan_id: currentPlanId!,
                    name: mealName,
                    description: "",
                    order_index: i
                })
                .select('id')
                .single()

            if (mealError) throw mealError

            let j = 0
            const itemsToInsert = []
            while (formData.has(`meal_${i}_food_${j}`)) {
                const foodData = JSON.parse(formData.get(`meal_${i}_food_${j}`) as string)
                itemsToInsert.push({
                    meal_id: insertedMeal.id,
                    food_id: foodData.food_id,
                    quantity: foodData.quantity,
                    unit: foodData.unit || 'g'
                })
                j++
            }

            if (itemsToInsert.length > 0) {
                await supabase.from('food_items').insert(itemsToInsert)
            }
            i++
        }

        const { data: coach } = await supabase.from('coaches').select('slug').eq('id', coachId).single()
        
        revalidatePath(`/coach/clients/${clientId}`)
        if (coach?.slug) {
            revalidatePath(`/c/${coach.slug}/nutrition`)
        }
        
        return { success: true }
    } catch (err: any) {
        console.error('[saveNutritionPlan] Error:', err)
        return { error: err.message || 'Error al procesar el plan nutricional.' }
    }
}
