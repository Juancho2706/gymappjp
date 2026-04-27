'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveMealGroup(groupData: { id?: string, name: string, items: { food_id: string, quantity: number, unit?: string }[] }, coachId: string) {
    const supabase = await createClient()

    try {
        let groupId = groupData.id

        if (groupId) {
            // Update existing group name
            const { error: updateError } = await supabase
                .from('saved_meals')
                .update({ name: groupData.name })
                .eq('id', groupId)
                .eq('coach_id', coachId)
            
            if (updateError) {
                console.error("[saveMealGroup] Error actualizando nombre del grupo:", {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                    code: updateError.code
                })
                throw updateError
            }

            // Delete existing items to replace them
            const { error: deleteError } = await supabase.from('saved_meal_items').delete().eq('saved_meal_id', groupId)
            if (deleteError) {
                console.error("[saveMealGroup] Error eliminando items antiguos:", {
                    message: deleteError.message,
                    details: deleteError.details,
                    hint: deleteError.hint,
                    code: deleteError.code
                })
                throw deleteError
            }
        } else {
            // Create new group
            const { data: newGroup, error: insertError } = await supabase
                .from('saved_meals')
                .insert({ name: groupData.name, coach_id: coachId })
                .select()
                .single()
            
            if (insertError) {
                console.error("[saveMealGroup] Error insertando nuevo grupo en saved_meals:", {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code
                })
                throw insertError
            }
            groupId = newGroup.id
        }

        // Insert items
        if (groupData.items.length > 0) {
            const itemsToInsert = groupData.items.map(item => ({
                saved_meal_id: groupId!,
                food_id: item.food_id,
                quantity: item.quantity,
                unit: item.unit || 'g'
            }))

            const { data: insertedItems, error: itemsError } = await supabase
                .from('saved_meal_items')
                .insert(itemsToInsert)
                .select()
            
            if (itemsError) {
                console.error("[saveMealGroup] Error insertando items en saved_meal_items:", {
                    message: itemsError.message,
                    details: itemsError.details,
                    hint: itemsError.hint,
                    code: itemsError.code
                })
                throw itemsError
            }
        }

        // Fetch the full object to return it
        const { data: fullGroup, error: fetchError } = await supabase
            .from('saved_meals')
            .select(`
                *,
                items:saved_meal_items(
                    id,
                    food_id,
                    quantity,
                    unit,
                    food:foods(*)
                )
            `)
            .eq('id', groupId)
            .single()

        if (fetchError) {
            console.error("[saveMealGroup] Error recuperando grupo completo:", {
                message: fetchError.message,
                details: fetchError.details,
                hint: fetchError.hint,
                code: fetchError.code
            })
            throw fetchError
        }

        revalidatePath('/coach/meal-groups')
        return { success: true, group: fullGroup }
    } catch (error: any) {
        console.error("[saveMealGroup] Error general en saveMealGroup:", error)
        return { 
            error: 'Error al guardar el grupo de alimentos.',
            details: error.message || error
        }
    }
}

export async function deleteMealGroup(groupId: string, coachId: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from('saved_meals')
            .delete()
            .eq('id', groupId)
            .eq('coach_id', coachId)

        if (error) throw error

        revalidatePath('/coach/meal-groups')
        return { success: true }
    } catch (error) {
        console.error("Error deleting meal group:", error)
        return { error: 'No se pudo eliminar el grupo de alimentos.' }
    }
}
