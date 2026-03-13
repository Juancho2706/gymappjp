'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type NutritionFormState = {
    error?: string
    success?: boolean
}

interface FoodItemPayload {
    food_id: string
    quantity: number
}

interface MealPayload {
    name: string
    description: string
    order_index: number
    items: FoodItemPayload[]
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

    // Extract Meals and Food Items
    const meals: MealPayload[] = []
    let i = 0
    while (formData.has(`meal_name_${i}`)) {
        const mealName = formData.get(`meal_name_${i}`) as string
        const mealItems: FoodItemPayload[] = []
        
        let j = 0
        while (formData.has(`meal_${i}_food_id_${j}`)) {
            const foodId = formData.get(`meal_${i}_food_id_${j}`) as string
            const quantity = formData.get(`meal_${i}_quantity_${j}`) as string
            if (foodId && quantity) {
                mealItems.push({ 
                    food_id: foodId, 
                    quantity: parseInt(quantity) || 0 
                })
            }
            j++
        }

        meals.push({ 
            name: mealName, 
            description: "", // Default empty as per current UI
            order_index: i,
            items: mealItems
        })
        i++
    }

    // 1. Invalidate previous active plans
    await supabase
        .from('nutrition_plans')
        .update({ is_active: false })
        .eq('client_id', clientId)

    // 2. Insert new plan
    const { data: newPlan, error: planError } = await supabase
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

    // 3. Insert meals and their items
    for (const meal of meals) {
        const { data: insertedMeal, error: mealError } = await supabase
            .from('nutrition_meals')
            .insert({
                plan_id: newPlan.id,
                name: meal.name,
                description: meal.description,
                order_index: meal.order_index
            })
            .select('id')
            .single()

        if (mealError || !insertedMeal) {
            console.error('Save Meal Error:', mealError)
            continue // Or handle error more strictly
        }

        if (meal.items.length > 0) {
            const itemsToInsert = meal.items.map(item => ({
                meal_id: insertedMeal.id,
                food_id: item.food_id,
                quantity: item.quantity
            }))

            const { error: itemsError } = await supabase
                .from('food_items')
                .insert(itemsToInsert)

            if (itemsError) {
                console.error('Save Food Items Error:', itemsError)
            }
        }
    }

    revalidatePath(`/coach/clients/${clientId}`)
    redirect(`/coach/clients/${clientId}`)
}
