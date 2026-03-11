'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type NutritionFormState = {
    error?: string
    success?: boolean
}

interface MealPayload {
    name: string
    description: string
    order_index: number
}

export async function saveNutritionPlan(
    clientId: string,
    coachId: string,
    prevState: NutritionFormState,
    formData: FormData
): Promise<NutritionFormState> {
    const supabase = await createClient()

    // Extract Plan Details
    const name = formData.get('name') as string
    const caloriesStr = formData.get('daily_calories') as string
    const proteinStr = formData.get('protein_g') as string
    const carbsStr = formData.get('carbs_g') as string
    const fatsStr = formData.get('fats_g') as string
    const instructions = formData.get('instructions') as string

    if (!name) {
        return { error: 'El nombre del plan es requerido.' }
    }

    // Extract Meals (Dynamic Fields)
    // Meals are submitted as arrays: meal_name_0, meal_desc_0, meal_name_1, etc.
    const meals: MealPayload[] = []
    let i = 0
    while (formData.has(`meal_name_${i}`)) {
        const mealName = formData.get(`meal_name_${i}`) as string
        const mealDesc = formData.get(`meal_desc_${i}`) as string
        if (mealName && mealDesc) {
            meals.push({ name: mealName, description: mealDesc, order_index: i })
        }
        i++
    }

    // 1. Invalidate previous active plans
    await (supabase as any)
        .from('nutrition_plans')
        .update({ is_active: false })
        .eq('client_id', clientId)

    // 2. Insert new plan
    const { data: newPlan, error: planError } = await (supabase as any)
        .from('nutrition_plans')
        .insert({
            client_id: clientId,
            coach_id: coachId,
            name,
            daily_calories: caloriesStr ? parseInt(caloriesStr) : null,
            protein_g: proteinStr ? parseInt(proteinStr) : null,
            carbs_g: carbsStr ? parseInt(carbsStr) : null,
            fats_g: fatsStr ? parseInt(fatsStr) : null,
            instructions: instructions || null,
            is_active: true
        })
        .select('id')
        .single()

    if (planError || !newPlan) {
        console.error('Save Nutrition Plan Error:', planError)
        return { error: 'Error al guardar el plan nutricional.' }
    }

    // 3. Insert meals if any
    if (meals.length > 0) {
        const mealsToInsert = meals.map(m => ({
            plan_id: newPlan.id,
            ...m
        }))

        const { error: mealsError } = await (supabase as any)
            .from('nutrition_meals')
            .insert(mealsToInsert)

        if (mealsError) {
            console.error('Save Meals Error:', mealsError)
            return { error: 'El plan se guardó, pero hubo un error al guardar las comidas.' }
        }
    }

    revalidatePath(`/coach/clients/${clientId}`)
    redirect(`/coach/clients/${clientId}`)
}
