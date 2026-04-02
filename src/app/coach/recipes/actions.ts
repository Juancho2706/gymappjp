'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveRecipe(recipeData: any, coachId: string) {
    const supabase = await createClient()

    try {
        // 1. Insertar o actualizar la receta principal
        const recipePayload = {
            coach_id: coachId,
            name: recipeData.title || recipeData.name,
            description: recipeData.description || (recipeData.sourceUrl ? `Fuente: ${recipeData.sourceUrl}` : null),
            instructions: recipeData.instructions,
            prep_time_minutes: recipeData.prepTime || recipeData.prep_time_minutes,
            calories: recipeData.calories,
            protein_g: recipeData.protein || recipeData.protein_g,
            carbs_g: recipeData.carbs || recipeData.carbs_g,
            fats_g: recipeData.fat || recipeData.fats_g,
            category: recipeData.category,
            source_api: recipeData.sourceUrl ? 'edamam' : (recipeData.id ? null : 'manual'),
            source_api_id: recipeData.source_api_id || recipeData.id,
            image_url: recipeData.image || recipeData.image_url
        }

        let result;
        if (recipeData.id && !recipeData.sourceUrl) {
            // Actualización de receta manual existente
            result = await supabase
                .from('recipes')
                .update(recipePayload)
                .eq('id', recipeData.id)
                .eq('coach_id', coachId)
                .select()
                .single()
        } else {
            // Nueva receta (desde API o manual)
            result = await supabase
                .from('recipes')
                .insert(recipePayload)
                .select()
                .single()
        }

        const { data: newRecipe, error: recipeError } = result

        if (recipeError) {
            console.error("Error guardando receta:", recipeError)
            return { error: 'Error al guardar la receta principal.' }
        }

        // 2. Manejar ingredientes si se proporcionan
        if (recipeData.ingredients && recipeData.ingredients.length > 0) {
            // Si es edición, podríamos querer borrar ingredientes previos
            if (recipeData.id) {
                await supabase.from('recipe_ingredients').delete().eq('recipe_id', newRecipe.id)
            }

            const ingredientsToInsert = recipeData.ingredients.map((ing: any) => ({
                recipe_id: newRecipe.id,
                name: ing.name || ing.text || ing.food,
                quantity: ing.quantity || 1,
                unit: ing.unit || 'unidad',
                food_id: ing.food_id || null
            }))

            const { error: ingredientsError } = await supabase
                .from('recipe_ingredients')
                .insert(ingredientsToInsert)

            if (ingredientsError) {
                console.error("Error guardando ingredientes:", ingredientsError)
            }
        }

        // 3. Crear/Actualizar un registro en la tabla `foods` para que pueda ser añadido a los planes
        const foodPayload = {
            coach_id: coachId,
            name: `[Receta] ${recipeData.title || recipeData.name}`,
            serving_size: 100,
            serving_unit: "g",
            calories: recipeData.calories,
            protein_g: recipeData.protein || recipeData.protein_g,
            carbs_g: recipeData.carbs || recipeData.carbs_g,
            fats_g: recipeData.fat || recipeData.fats_g
        }

        // Buscar si ya existe el alimento virtual para esta receta
        const { data: existingFood } = await supabase
            .from('foods')
            .select('id')
            .eq('coach_id', coachId)
            .eq('name', `[Receta] ${recipeData.title || recipeData.name}`)
            .single()

        if (existingFood) {
            await supabase.from('foods').update(foodPayload).eq('id', existingFood.id)
        } else {
            await supabase.from('foods').insert(foodPayload)
        }

        revalidatePath('/coach/recipes')
        return { success: true, recipe: newRecipe }

    } catch (error) {
        console.error("Excepción en saveRecipe:", error)
        return { error: 'Error inesperado al guardar la receta.' }
    }
}

export async function deleteRecipe(recipeId: string, coachId: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId)
            .eq('coach_id', coachId)

        if (error) throw error

        revalidatePath('/coach/recipes')
        return { success: true }
    } catch (error) {
        console.error("Error deleting recipe:", error)
        return { error: 'No se pudo eliminar la receta.' }
    }
}
