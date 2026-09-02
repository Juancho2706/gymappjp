'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { convertCoachLead } from '@/services/coach/leads.service'

/**
 * Acciones del inbox «Solicitudes» (`coach_leads`) — panel del coach en /coach/clients.
 *
 * Régimen de permisos (migración 20260821030821): la tabla NO tiene policy ni grants de
 * insert/update; se escribe SOLO con service_role. Por eso cada acción de acá hace primero un
 * SELECT con el cliente del USUARIO (que pasa por la policy `coach_id = auth.uid()`) y recién
 * después escribe con service_role. El orden importa: si se escribiera con service_role sin ese
 * SELECT previo, cualquier coach autenticado podría mover el lead de otro pasando su uuid.
 *
 * Además, TODOS los writes con service_role repiten `.eq('coach_id', coachId)` en el `where`:
 * verificar y escribir son dos viajes distintos, y el segundo no hereda la garantía del primero.
 */

export type LeadActionResult = { ok?: true; error?: string }

const NOT_FOUND = 'Solicitud no encontrada.'
const NOT_AUTHED = 'No autenticado.'

type OwnedLead = {
    id: string
    status: string
}

/**
 * Boundary de autorización de las acciones que NO convierten (contactar/descartar): devuelve el
 * lead SOLO si pertenece al coach de la sesión. Un uuid mal formado hace que PostgREST devuelva
 * error (22P02) ⇒ `data` null ⇒ mismo «no encontrada» que un lead ajeno. Nunca se distingue
 * "no existe" de "no es tuyo".
 *
 * La conversión NO pasa por acá: su verificación (lead + alumno destino) vive en el servicio, que
 * es el mismo código que corre el bridge móvil.
 */
async function resolveOwnedLead(
    leadId: string
): Promise<{ error: string } | { coachId: string; lead: OwnedLead }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: NOT_AUTHED }

    const { data } = await supabase
        .from('coach_leads')
        .select('id, status')
        .eq('id', leadId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!data) return { error: NOT_FOUND }
    return { coachId: user.id, lead: data as OwnedLead }
}

/** `status = 'contacted'`: el coach ya escribió por WhatsApp y quiere que deje de verse "nueva". */
export async function markLeadContactedAction(leadId: string): Promise<LeadActionResult> {
    const owned = await resolveOwnedLead(leadId)
    if ('error' in owned) return owned
    // Una solicitud ya convertida o descartada no vuelve a "contactada": sería un downgrade de
    // estado que reabre la fila en el inbox.
    if (owned.lead.status !== 'new') return { ok: true }

    const { error } = await createServiceRoleClient()
        .from('coach_leads')
        .update({ status: 'contacted' })
        .eq('id', leadId)
        .eq('coach_id', owned.coachId)

    if (error) return { error: 'No pudimos actualizar la solicitud.' }

    revalidatePath('/coach/clients')
    return { ok: true }
}

/** `status = 'dismissed'`: sale del inbox. No borra la fila (queda el rastro del consentimiento). */
export async function dismissLeadAction(leadId: string): Promise<LeadActionResult> {
    const owned = await resolveOwnedLead(leadId)
    if ('error' in owned) return owned

    const { error } = await createServiceRoleClient()
        .from('coach_leads')
        .update({ status: 'dismissed' })
        .eq('id', leadId)
        .eq('coach_id', owned.coachId)

    if (error) return { error: 'No pudimos descartar la solicitud.' }

    revalidatePath('/coach/clients')
    return { ok: true }
}

/**
 * Cierre del loop de growth: el coach creó el alumno desde la solicitud.
 *
 * La lógica (copia de atribución a `clients`, `converted_client_id`, `coach_client_referred` y
 * `coach_lead_converted`) vive en `services/coach/leads.service.ts` — el MISMO camino que corre el
 * bridge móvil cuando la app manda `clientId` en el PATCH. Acá solo queda lo que es de Next:
 * resolver la sesión y revalidar la ruta.
 */
export async function markLeadConvertedAction(
    leadId: string,
    clientId: string
): Promise<LeadActionResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: NOT_AUTHED }

    const result = await convertCoachLead(
        { userDb: supabase, admin: createServiceRoleClient() },
        user.id,
        leadId,
        clientId,
        { surface: 'web' },
    )

    if (!result.ok) return { error: result.error }

    revalidatePath('/coach/clients')
    return { ok: true }
}
