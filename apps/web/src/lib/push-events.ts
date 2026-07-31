import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendPushToClient } from './push'

/**
 * Constructores de los eventos push W1 (catálogo aprobado por el owner 2026-07-29).
 * Cada helper es best-effort: usa `sendPushToClient`, que jamás lanza. La telemetría
 * (sent por canal) vive en el sender. Copys en español neutro, voz del coach cuando aplica.
 */

type DB = SupabaseClient<Database>

/**
 * `checkin_received` — push NATIVA al coach cuando un alumno envía su check-in.
 * Usada por el server action web (post-insert) y por el bridge RN
 * (`/api/mobile/checkin-submitted`, la app inserta por RLS y avisa después).
 * Resolución del destinatario: `clients.coach_id` (standalone/pool con coach asignado);
 * sin coach asignado → no hay a quién avisar, no-op.
 */
export async function notifyCoachOfCheckin(
    admin: DB,
    input: { clientId: string; weight: number | null; energyLevel: number | null }
): Promise<void> {
    try {
        const { data: client } = await admin
            .from('clients')
            .select('coach_id, full_name')
            .eq('id', input.clientId)
            .maybeSingle()
        if (!client?.coach_id) return

        const firstName = (client.full_name ?? '').trim().split(/\s+/)[0] || 'Un alumno'
        const parts: string[] = []
        if (input.weight != null) parts.push(`Peso ${input.weight} kg`)
        if (input.energyLevel != null) parts.push(`energía ${input.energyLevel}/10`)

        await sendPushToClient(client.coach_id, {
            event: 'checkin_received',
            title: `${firstName} envió su check-in 📸`,
            body: parts.length ? parts.join(' · ') : 'Toca para revisarlo',
            url: `/coach/clients/${input.clientId}`,
            screen: `/coach/cliente/${input.clientId}`,
        })
    } catch (err) {
        // Nunca romper el check-in del alumno por una notificación.
        console.error('[push-events] checkin_received failed:', err)
    }
}

/**
 * `program_assigned` — push al alumno cuando el coach le asigna un programa.
 * El caller entrega la marca ya resuelta (mismas reglas del email: white-label solo
 * standalone Pro+ vía `resolveStudentEmailBranding`).
 */
export async function notifyProgramAssigned(input: {
    clientId: string
    coachSlug: string
    brandName: string
    programName: string
    logoUrl: string | null
}): Promise<void> {
    await sendPushToClient(input.clientId, {
        event: 'program_assigned',
        title: 'Programa nuevo 💪',
        body: `${input.brandName} te asignó "${input.programName}". Tócalo para verlo`,
        url: `/c/${input.coachSlug}/dashboard`,
        screen: '/alumno/(tabs)/home',
        brandName: input.brandName,
        ...(input.logoUrl ? { iconUrl: input.logoUrl } : {}),
    })
}
