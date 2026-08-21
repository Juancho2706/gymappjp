'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

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
    referred_by_client_id: string | null
    referral_source: string | null
    referral_card_kind: string | null
}

/**
 * Boundary de autorización compartido: devuelve el lead SOLO si pertenece al coach de la sesión.
 * Un uuid mal formado hace que PostgREST devuelva error (22P02) ⇒ `data` null ⇒ mismo
 * «no encontrada» que un lead ajeno. Nunca se distingue "no existe" de "no es tuyo".
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
        .select('id, status, referred_by_client_id, referral_source, referral_card_kind')
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
 * Copia la atribución de la tarjeta compartida (`referred_by_client_id` / `referral_source` /
 * `referral_card_kind`) del lead a la fila `clients`. POR QUÉ acá y no en el alta: cuando el
 * desconocido dejó la solicitud todavía NO existía un alumno al que atribuir, y esas tres
 * columnas de `clients` no tienen grant de usuario (migración 20260819223729) ⇒ service_role.
 *
 * La copia NO es fatal: si falla, el alumno ya existe y el lead igual queda convertido. Perder
 * el crédito del referente es malo; dejar el inbox mintiendo es peor.
 */
export async function markLeadConvertedAction(
    leadId: string,
    clientId: string
): Promise<LeadActionResult> {
    const owned = await resolveOwnedLead(leadId)
    if ('error' in owned) return owned
    const { coachId, lead } = owned

    const supabase = await createClient()
    // El alumno destino tiene que ser del MISMO coach: el uuid viene del navegador (respuesta de
    // `createClientAction`) y no se confía. Lectura user-scoped ⇒ la RLS de `clients` es el techo.
    const { data: client } = await supabase
        .from('clients')
        .select('id, referred_by_client_id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const admin = createServiceRoleClient()
    const hasAttribution = Boolean(lead.referred_by_client_id)

    // Solo si el alumno no traía atribución propia: convertir un lead sobre una ficha que ya
    // tiene referente le robaría el crédito al primero.
    if (hasAttribution && !client.referred_by_client_id) {
        const { error: copyError } = await admin
            .from('clients')
            .update({
                referred_by_client_id: lead.referred_by_client_id,
                referral_source: lead.referral_source,
                referral_card_kind: lead.referral_card_kind,
            })
            .eq('id', clientId)
            .eq('coach_id', coachId)

        if (copyError) console.error('[coach-leads] copia de atribución falló:', copyError.message)
    }

    const { error } = await admin
        .from('coach_leads')
        .update({ status: 'converted', converted_client_id: clientId })
        .eq('id', leadId)
        .eq('coach_id', coachId)

    if (error) return { error: 'No pudimos marcar la solicitud como convertida.' }

    // Mismo evento que emitía el alta directa standalone antes de la reversión (F6.3 de
    // docs/specs/workout-share): el embudo de la tarjeta compartida se sigue midiendo end-to-end,
    // ahora con el coach como intermediario. Props del COACH y de la tarjeta, nada del alumno.
    if (hasAttribution) {
        await capturePostHogServerEvent({
            event: 'coach_client_referred',
            distinctId: coachId,
            properties: {
                referred_by_client_id: lead.referred_by_client_id,
                card_kind: lead.referral_card_kind,
                source: lead.referral_source,
            },
        })
    }

    await capturePostHogServerEvent({
        event: 'coach_lead_converted',
        distinctId: coachId,
        properties: { referred: hasAttribution },
    })

    revalidatePath('/coach/clients')
    return { ok: true }
}
