'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
    deleteBodyComposition,
    saveBodyComposition,
} from '@/services/bodycomp/body-composition.service'

export type BodyCompositionActionState = {
    ok?: boolean
    error?: string
    measurementId?: string
}

/**
 * Guarda una medicion (BIA o ISAK). Valida server-side con el MISMO schema que el formulario
 * (dentro del service). El gating (kill-switch + module + write-access + consentimiento) vive en
 * el service. `input` es el payload ya estructurado (no FormData) — el form arma el objeto.
 */
export async function saveBodyCompositionAction(
    input: unknown
): Promise<BodyCompositionActionState> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Vuelve a ingresar.' }

    try {
        const { row } = await saveBodyComposition(supabase, user.id, input)
        revalidatePath(`/coach/clients/${row.client_id}/bodycomp`)
        revalidatePath(`/coach/clients/${row.client_id}`)
        return { ok: true, measurementId: row.id }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'No se pudo guardar la medición.' }
    }
}

/** Soft-delete (deleted_at) de una medicion. Mismas guardas que el guardado. */
export async function deleteBodyCompositionAction(
    measurementId: string,
    clientId: string
): Promise<BodyCompositionActionState> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Vuelve a ingresar.' }

    try {
        await deleteBodyComposition(supabase, user.id, measurementId)
        revalidatePath(`/coach/clients/${clientId}/bodycomp`)
        revalidatePath(`/coach/clients/${clientId}`)
        return { ok: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'No se pudo eliminar la medición.' }
    }
}
