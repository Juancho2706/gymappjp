import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendExpoPushToUsers, sendPushToClient } from './push'
import { getTestCoachIds } from './test-accounts'

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

/**
 * `lead_received` — push NATIVA al coach cuando alguien deja una solicitud en `/join/<código>`
 * (coach-leads W3.3).
 *
 * POR QUÉ existe: hasta acá el único aviso era el correo, y el riesgo #1 del SPEC es justamente
 * «el coach no revisa el correo y la solicitud muere». El push llega al mismo teléfono donde el
 * coach trabaja y aterriza directo en la bandeja.
 *
 * PII: viaja SOLO el nombre que la persona escribió (es lo que el coach necesita para reconocerla).
 * Ni teléfono, ni correo, ni el mensaje — el cuerpo de la notificación se muestra en la pantalla
 * bloqueada del teléfono y no es lugar para el contacto de un tercero (Ley 21.719, datos mínimos).
 *
 * Navegación dual: `url` es el path web que abre el service worker de la PWA; `screen` es la ruta
 * expo-router del tap nativo (`apps/mobile/app/_layout.tsx` hace `router.push(data.screen)`).
 *
 * Best-effort de punta a punta: `sendPushToClient` jamás lanza, y el try/catch de acá cubre
 * cualquier sorpresa. Una notificación fallida NUNCA puede tumbar la solicitud ya escrita.
 */
export async function notifyCoachOfLeadPush(input: {
    coachId: string
    fullName: string
}): Promise<void> {
    try {
        const firstName = input.fullName.trim().split(/\s+/)[0] || 'Alguien'
        await sendPushToClient(input.coachId, {
            event: 'lead_received',
            title: 'Nueva solicitud de alumno',
            body: `${firstName} quiere entrenar contigo. Tócalo para responderle`,
            url: '/coach/clients?solicitudes=1',
            screen: '/coach/leads',
        })
    } catch (err) {
        console.error('[push-events] lead_received failed:', err)
    }
}

/** Largo máximo del cuerpo en la bandeja del teléfono: iOS corta a ~4 líneas y 120 deja la idea entera. */
const NEWS_PUSH_BODY_MAX = 120

/**
 * Cuerpo de la push de una novedad: la primera línea de TEXTO del contenido markdown, sin marcas
 * (`**`, `- `, `---`), recortada a NEWS_PUSH_BODY_MAX con «…». Los subtítulos (`##`/`###`) se
 * saltan: son títulos, no cuerpo, y la push ya lleva el título de la novedad. El renderer de la
 * campanita solo entiende negrita, H2/H3, viñetas y `---`, así que con eso alcanza. Sin texto
 * útil → frase fija.
 */
export function newsPushBody(content: string): string {
    for (const raw of content.split(/\r?\n/)) {
        if (/^\s*#{1,6}\s/.test(raw)) continue
        const line = raw
            .replace(/^\s*([-*]\s+|---\s*$)/, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\s+/g, ' ')
            .trim()
        if (!line) continue
        if (line.length <= NEWS_PUSH_BODY_MAX) return line
        return `${line.slice(0, NEWS_PUSH_BODY_MAX - 1).trimEnd()}…`
    }
    return 'Hay novedades en EVA. Tócalo para verlas.'
}

/**
 * `news_published` — push NATIVA a todos los coaches activos cuando el admin publica una novedad
 * en la campanita (`/admin/novedades`). Decisión del owner (2026-09-06): SIEMPRE, para todo tipo;
 * título = título de la novedad, cuerpo = primera línea del contenido (`newsPushBody`).
 *
 * Destinatarios: `coaches.subscription_status = 'active'` menos las cuentas de prueba
 * (`getTestCoachIds`, que incluye la de App Review: los revisores no tienen por qué recibir
 * nuestras novedades). El tap abre el Home del coach, donde vive la campanita; en web, el topbar
 * de `/coach` la muestra en cualquier ruta.
 *
 * Solo aplica a una publicación NUEVA: el caller no la dispara al restaurar un archivado.
 * Best-effort: jamás lanza; devuelve conteos para la auditoría admin.
 */
export async function notifyCoachesOfNewsPublished(
    admin: DB,
    input: { newsItemId: string; title: string; content: string }
): Promise<{ users: number; tokens: number; sent: number }> {
    const empty = { users: 0, tokens: 0, sent: 0 }
    try {
        const { data: coaches } = await admin
            .from('coaches')
            .select('id')
            .eq('subscription_status', 'active')
        if (!coaches?.length) return empty

        const testIds = await getTestCoachIds(admin)
        const ids = coaches.map((c) => c.id).filter((id) => !testIds.has(id))

        return await sendExpoPushToUsers(ids, {
            event: 'news_published',
            title: input.title.trim(),
            body: newsPushBody(input.content),
            url: '/coach/dashboard',
            screen: '/coach/(tabs)/home',
        })
    } catch (err) {
        console.error(`[push-events] news_published failed (news=${input.newsItemId}):`, err)
        return empty
    }
}
