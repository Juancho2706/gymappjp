'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Detalle on-demand de UN ejercicio (instrucciones + media alterna), al abrir su tarjeta.
 * Mantiene el listado del catálogo liviano (sin `instructions` para los 818): el blob pesado
 * solo viaja para el ejercicio que el alumno realmente abre. User-scoped → RLS es el techo
 * (el alumno solo lee ejercicios de su sistema/coach/team).
 */
export async function getExerciseInstructions(
    exerciseId: string
): Promise<{ instructions: string[] | null; image_url: string | null } | null> {
    if (!exerciseId) return null
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('exercises')
        .select('instructions, image_url')
        .eq('id', exerciseId)
        .is('deleted_at', null)
        .maybeSingle()

    if (error || !data) return null
    return { instructions: data.instructions ?? null, image_url: data.image_url ?? null }
}
