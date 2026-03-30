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
            console.log("Inserting items for group:", groupId, groupData.items)
            const itemsToInsert = groupData.items.map(item => ({
                saved_meal_id: groupId!,
                food_id: item.food_id,
                quantity: Math.round(item.quantity),
                unit: item.unit || 'g'
            }))

            const { error: itemsError } = await supabase
                .from('saved_meal_items')
                .insert(itemsToInsert)
            
            if (itemsError) {
                console.error("Error inserting items:", itemsError)
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
                    quantity,
                    unit,
                    food:foods(*)
                )
            `)
            .eq('id', groupId)
            .single()

        if (fetchError) throw fetchError

        revalidatePath('/coach/meal-groups')
        return { success: true, group: fullGroup }
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
