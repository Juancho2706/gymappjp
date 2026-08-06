'use server'

/**
 * Acciones de "grupos de comidas" (`saved_meals`).
 *
 * La RUTA `/coach/meal-groups` se retiró (P15): la biblioteca dedicada ya no existe. Estas
 * acciones siguen VIVAS porque el creador de planes V1 las consume: `PlanBuilder` guarda una
 * comida como grupo (`saveMealGroup`) y `FoodSearchDrawer` los lista para insertarlos
 * (`listCoachMealGroups`). Por eso tampoco quedan `revalidatePath` de la ruta muerta.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { getMealGroups } from '../_data/meal-groups.queries'

const listMealGroupsSchema = z.object({ coachId: z.string().uuid() })

// Cast acotado (mismo patrón que `RpcClient` en `services/nutrition-v2-read.service.ts`): el
// cliente tipado generado todavía no conoce `save_meal_group_v2` — la crea la migración
// aditiva `20260728132500_save_meal_group_v2_transactional.sql`. Retirar el cast al regenerar
// `database.types.ts` con la migración LIVE.
type MealGroupRpcClient = {
    rpc: (
        name: string,
        args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

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

/**
 * NUT-028 — Guardado ATÓMICO del grupo y su composición completa.
 *
 * Antes esto eran cuatro round-trips PostgREST (update → delete de todos los items →
 * insert de los nuevos → select). Si el insert fallaba, el grupo quedaba con cero items y
 * la composición anterior era irrecuperable; y con `items: []` el delete se ejecutaba, el
 * insert se saltaba y la action devolvía `success: true` — vaciado silencioso.
 *
 * Ahora todo vive en `save_meal_group_v2` (SECURITY INVOKER: la RLS de `saved_meals` /
 * `saved_meal_items` sigue siendo el guardián real), que además rechaza la lista vacía.
 * `org_id` se sigue derivando del workspace ACTIVO server-side, nunca del body.
 */
// Nota: el antiguo segundo argumento `coachId` desapareció — la identidad del coach la fija
// `auth.uid()` dentro del RPC (y la RLS), nunca un argumento que llegue del cliente.
export async function saveMealGroup(
    groupData: { id?: string, name: string, items: { food_id: string, quantity: number, unit?: string }[] },
) {
    const supabase = await createClient()

    const name = groupData.name.trim()
    if (name.length === 0) {
        return { error: 'Indica un nombre para el grupo.' }
    }
    // Espejo cliente del guard del RPC: evita el round-trip y da un mensaje accionable.
    if (groupData.items.length === 0) {
        return { error: 'Agrega al menos un alimento al grupo.' }
    }

    try {
        let orgId: string | null = null
        if (!groupData.id) {
            // org_id se deriva del workspace ACTIVO server-side (nunca del body): en enterprise el
            // grupo pertenece a la org; en standalone/team es de la librería personal del coach.
            const { data: { user } } = await supabase.auth.getUser()
            const workspace = user ? await resolvePreferredWorkspace(supabase, user.id) : null
            orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
        }

        const { data: fullGroup, error } = await (supabase as unknown as MealGroupRpcClient).rpc('save_meal_group_v2', {
            p_name: name,
            p_items: groupData.items.map((item) => ({
                food_id: item.food_id,
                quantity: item.quantity,
                unit: item.unit || 'g',
            })),
            p_group_id: groupData.id ?? null,
            p_org_id: orgId,
        })

        if (error) throw new Error(error.message)

        return { success: true, group: fullGroup }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { error: 'Error al guardar el grupo de alimentos.', details: message }
    }
}
