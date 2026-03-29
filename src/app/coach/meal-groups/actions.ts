'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveMealGroup(groupData: { id?: string, name: string, items: { food_id: string, quantity: number }[] }, coachId: string) {
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
            
            if (updateError) throw updateError

            // Delete existing items to replace them
            await supabase.from('saved_meal_items').delete().eq('saved_meal_id', groupId)
        } else {
            // Create new group
            const { data: newGroup, error: insertError } = await supabase
                .from('saved_meals')
                .insert({ name: groupData.name, coach_id: coachId })
                .select()
                .single()
            
            if (insertError) throw insertError
            groupId = newGroup.id
        }

        // Insert items
        if (groupData.items.length > 0) {
            const itemsToInsert = groupData.items.map(item => ({
                saved_meal_id: groupId!,
                food_id: item.food_id,
                quantity: item.quantity
            }))

            const { error: itemsError } = await supabase
                .from('saved_meal_items')
                .insert(itemsToInsert)
            
            if (itemsError) throw itemsError
        }

        revalidatePath('/coach/meal-groups')
        return { success: true, id: groupId }
    } catch (error) {
        console.error("Error saving meal group:", error)
        return { error: 'Error al guardar el grupo de alimentos.' }
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
