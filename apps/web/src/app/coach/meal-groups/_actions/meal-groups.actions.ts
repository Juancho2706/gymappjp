'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { getMealGroups } from '../_data/meal-groups.queries'
import { revalidatePath } from 'next/cache'

const listMealGroupsSchema = z.object({ coachId: z.string().uuid() })

/**
 * Lectura de los grupos del coach para el builder de planes (tab "Grupos" del
 * FoodSearchDrawer). Reusa el query canónico `getMealGroups` (ya filtra los
 * artefactos `Internal_*`) y deriva el scope de org del workspace ACTIVO
 * server-side — nunca del body. RLS de `saved_meals` es el guardián real.
 */
export async function listCoachMealGroups(coachId: string) {
    const parsed = listMealGroupsSchema.safeParse({ coachId })
    if (!parsed.success) return []

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

    // coachId de la SESIÓN (coaches.id === auth.uid), nunca del argumento del caller.
    return getMealGroups(user.id, orgId)
}

export async function saveMealGroup(groupData: { id?: string, name: string, items: { food_id: string, quantity: number, unit?: string }[] }, coachId: string) {
    const supabase = await createClient()

    try {
        let groupId = groupData.id

        if (groupId) {
            const { error: updateError } = await supabase
                .from('saved_meals')
                .update({ name: groupData.name })
                .eq('id', groupId)
                .eq('coach_id', coachId)

            if (updateError) throw updateError

            const { error: deleteError } = await supabase.from('saved_meal_items').delete().eq('saved_meal_id', groupId)
            if (deleteError) throw deleteError
        } else {
            // org_id se deriva del workspace ACTIVO server-side (nunca del body): en enterprise el
            // grupo pertenece a la org; en standalone/team es de la librería personal del coach.
            const { data: { user } } = await supabase.auth.getUser()
            const workspace = user ? await resolvePreferredWorkspace(supabase, user.id) : null
            const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

            const { data: newGroup, error: insertError } = await supabase
                .from('saved_meals')
                .insert({ name: groupData.name, coach_id: coachId, org_id: orgId })
                .select()
                .single()

            if (insertError) throw insertError
            groupId = newGroup.id
        }

        if (groupData.items.length > 0) {
            const itemsToInsert = groupData.items.map(item => ({
                saved_meal_id: groupId!,
                food_id: item.food_id,
                quantity: item.quantity,
                unit: item.unit || 'g'
            }))

            const { error: itemsError } = await supabase
                .from('saved_meal_items')
                .insert(itemsToInsert)
                .select()

            if (itemsError) throw itemsError
        }

        const { data: fullGroup, error: fetchError } = await supabase
            .from('saved_meals')
            .select(`*, items:saved_meal_items(id, food_id, quantity, unit, food:foods(*))`)
            .eq('id', groupId)
            .single()

        if (fetchError) throw fetchError

        revalidatePath('/coach/meal-groups')
        return { success: true, group: fullGroup }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { error: 'Error al guardar el grupo de alimentos.', details: message }
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
    } catch {
        return { error: 'No se pudo eliminar el grupo de alimentos.' }
    }
}
