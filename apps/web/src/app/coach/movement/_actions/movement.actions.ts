'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
    MovementDeleteSchema,
    MovementDraftUpsertSchema,
    MovementFinalizeSchema,
} from '@eva/schemas/screening'
import {
    deleteMovementAssessment,
    finalizeMovementAssessment,
    upsertDraftItem,
} from '@/services/assessment/movement-assessment.service'

// Actions DELGADAS: Zod en server + delegacion total al service (gating, consentimiento,
// recalculo, bitacora). revalidatePath del hub y del detalle del alumno.

export type MovementActionState = {
    success?: boolean
    error?: string
    assessmentId?: string
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Error inesperado. Intenta de nuevo.'
}

function revalidateMovement(clientId: string) {
    revalidatePath('/coach/movement')
    revalidatePath(`/coach/movement/${clientId}`)
}

/** Autosave por paso del wizard (upsert de UN item del borrador). */
export async function upsertDraftItemAction(input: unknown): Promise<MovementActionState> {
    const parsed = MovementDraftUpsertSchema.safeParse(input)
    if (!parsed.success) return { error: 'Datos del patrón inválidos.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    try {
        const { assessmentId } = await upsertDraftItem(supabase, user.id, parsed.data)
        revalidateMovement(parsed.data.client_id)
        return { success: true, assessmentId }
    } catch (e) {
        return { error: errorMessage(e) }
    }
}

/** Finalizacion (useActionState): consentimiento bloqueante + recalculo server. */
export async function finalizeAssessmentAction(
    _prev: MovementActionState,
    formData: FormData
): Promise<MovementActionState> {
    const parsed = MovementFinalizeSchema.safeParse({
        client_id: String(formData.get('client_id') ?? ''),
        assessment_id: String(formData.get('assessment_id') ?? ''),
        notes: String(formData.get('notes') ?? ''),
        consent_attested: formData.get('consent_attested') === 'on' || formData.get('consent_attested') === 'true',
    })
    if (!parsed.success) return { error: 'Datos de finalización inválidos.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    try {
        const { assessmentId } = await finalizeMovementAssessment(supabase, user.id, parsed.data)
        revalidateMovement(parsed.data.client_id)
        return { success: true, assessmentId }
    } catch (e) {
        return { error: errorMessage(e) }
    }
}

/** Final inmutable: corregir = eliminar (queda en bitacora) + re-evaluar. */
export async function deleteAssessmentAction(input: unknown): Promise<MovementActionState> {
    const parsed = MovementDeleteSchema.safeParse(input)
    if (!parsed.success) return { error: 'Datos inválidos.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    try {
        await deleteMovementAssessment(supabase, user.id, parsed.data)
        revalidateMovement(parsed.data.client_id)
        return { success: true }
    } catch (e) {
        return { error: errorMessage(e) }
    }
}
