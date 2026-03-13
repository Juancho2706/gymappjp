'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveRecipe(recipeData: any, coachId: string) {
    const supabase = await createClient()

    try {
        // 1. Insertar la receta principal
        const { data: newRecipe, error: recipeError } = await supabase
            .from('recipes')
            .insert({
                coach_id: coachId,
                name: recipeData.title,
                description: recipeData.sourceUrl ? `Fuente: ${recipeData.sourceUrl}` : null,
                instructions: recipeData.instructions,
                prep_time_minutes: recipeData.prepTime,
                calories: recipeData.calories,
                protein_g: recipeData.protein,
                carbs_g: recipeData.carbs,
                fats_g: recipeData.fat,
                source_api: recipeData.sourceUrl ? 'edamam' : 'mock',
                source_api_id: recipeData.id,
                image_url: recipeData.image
            })
            .select()
            .single()

        if (recipeError) {
            console.error("Error guardando receta:", recipeError)
            return { error: 'Error al guardar la receta principal.' }
        }

        // 2. Intentar vincular ingredientes con alimentos locales
        // Por ahora, guardamos el nombre tal cual. Una mejora futura sería
        // usar similitud de texto para encontrar el `food_id`.
        if (recipeData.ingredients && recipeData.ingredients.length > 0) {
            const ingredientsToInsert = recipeData.ingredients.map((ing: any) => ({
                recipe_id: newRecipe.id,
                name: ing.text || ing.food,
                quantity: ing.quantity || 1,
                unit: ing.unit || 'unidad',
                food_id: null // TODO: Implementar lógica de emparejamiento con `foods`
            }))

            const { error: ingredientsError } = await supabase
                .from('recipe_ingredients')
                .insert(ingredientsToInsert)

            if (ingredientsError) {
                console.error("Error guardando ingredientes:", ingredientsError)
                // No retornamos error fatal, la receta ya se guardó
            }
        }

        // 3. Crear un registro en la tabla `foods` para que pueda ser añadido a los planes
        const { error: foodError } = await supabase
            .from('foods')
            .insert({
                coach_id: coachId,
                name: `[Receta] ${recipeData.title}`,
                serving_size_g: 100, // Usamos 100 como base o '1 porción' si tuviéramos unidades
                calories: recipeData.calories,
                protein_g: recipeData.protein,
                carbs_g: recipeData.carbs,
                fats_g: recipeData.fat
            })

        if (foodError) {
            console.error("Error creando el alimento virtual para la receta:", foodError)
        }

        revalidatePath('/coach/recipes')
        return { success: true, recipe: newRecipe }

    } catch (error) {
        console.error("Excepción en saveRecipe:", error)
        return { error: 'Error inesperado al guardar la receta.' }
    }
}
