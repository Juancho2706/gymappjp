import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Librería personal del coach; en enterprise se scopea por org (saved_meals.org_id). */
export const getMealGroups = cache(async (coachId: string, orgId: string | null = null) => {
    const supabase = await createClient()
    let query = supabase
        .from('saved_meals')
        .select(`*, items:saved_meal_items(id, quantity, unit, food:foods(*))`)
        .eq('coach_id', coachId)
        // Oculta los artefactos internos del service al duplicar/propagar planes
        // (filas `Internal_<comida>_<ts>`). Solo lectura: no se borran de la tabla.
        .not('name', 'like', 'Internal\\_%')
        .order('name')
    query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
    const { data } = await query
    return data ?? []
})
