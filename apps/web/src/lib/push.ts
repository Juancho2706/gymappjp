import webpush from 'web-push'
import { createServiceRoleClient } from './supabase/admin-client'

/**
 * Envío unificado de push (Web Push PWA + Expo nativo) — W1 de notificaciones.
 *
 * - Kill-switch por evento SIN deploy: `EVA_PUSH_DISABLED_EVENTS` (CSV de eventos, `*` = todos).
 *   Lista de apagado (no allowlist) para que el default preserve lo que ya está vivo.
 * - VAPID lazy: se configura en el primer envío web (no al importar el módulo — un import no debe
 *   crashear si faltan las env). Acepta ambos nombres históricos de la clave pública
 *   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` del banner client-side y `VAPID_PUBLIC_KEY` del cron).
 * - Payload dual de navegación: `url` = path web (SW/notificationclick) y `screen` = ruta
 *   expo-router (el tap nativo hace `router.push(data.screen)`, `apps/mobile/app/_layout.tsx:111`);
 *   si `screen` falta se cae a `url` (comportamiento previo).
 */

export type PushEventKey =
    | 'meal_reminder'
    | 'program_assigned'
    | 'checkin_received'
    | 'checkin_due'
    /** Solicitud nueva en `/join/<código>` (coach-leads W3.3). Destinatario: el COACH. */
    | 'lead_received'
    /** Novedad publicada en la campanita (`news_items`). Destinatarios: TODOS los coaches activos. */
    | 'news_published'

export type PushPayload = {
    /** Evento del catálogo — gobierna el kill-switch y la telemetría. */
    event: PushEventKey
    title: string
    body: string
    /** Path web (lo abre el service worker en `notificationclick`). */
    url: string
    /** Ruta expo-router para el tap nativo. Fallback: `url`. */
    screen?: string
    icon?: string
    /**
     * White-label (W2): marca del coach para que la notificación NO muestre EVA.
     * `iconUrl` = logo del coach (URL absoluta; el caller lo gatea a Pro+). `brandName`
     * = nombre del coach; el SW lo usa como título fallback en vez de 'EVA Fitness'.
     */
    iconUrl?: string
    brandName?: string
}

/** `EVA_PUSH_DISABLED_EVENTS=checkin_due,meal_reminder` apaga esos eventos; `*` apaga todos. */
export function isPushEventEnabled(event: PushEventKey): boolean {
    const raw = process.env.EVA_PUSH_DISABLED_EVENTS?.trim()
    if (!raw) return true
    const disabled = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return !disabled.includes('*') && !disabled.includes(event)
}

let vapidReady = false
function ensureVapid(): boolean {
    if (vapidReady) return true
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const email = process.env.VAPID_EMAIL || 'mailto:contacto@eva-app.cl'
    if (!publicKey || !privateKey) return false
    webpush.setVapidDetails(email.startsWith('mailto:') ? email : `mailto:${email}`, publicKey, privateKey)
    vapidReady = true
    return true
}

/** Expo acepta hasta 100 mensajes por request; el fan-out a coaches lo supera. */
const EXPO_PUSH_BATCH = 100

async function sendExpoTokens(
    tokens: string[],
    payload: PushPayload,
): Promise<number> {
    if (!tokens.length) return 0
    const messages = tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: { screen: payload.screen ?? payload.url, url: payload.url, event: payload.event },
        sound: 'default',
        channelId: 'default',
    }))
    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH) {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages.slice(i, i + EXPO_PUSH_BATCH)),
        })
    }
    return tokens.length
}

/** `.in()` con listas largas infla la URL de PostgREST; se pagina de a 200 ids. */
const TOKEN_LOOKUP_CHUNK = 200

/**
 * Fan-out NATIVO (Expo) a muchos usuarios de una vez — hoy, los coaches al publicar una novedad
 * (`news_published`). No pasa por Web Push: `push_subscriptions` es por `client_id` (alumnos) y
 * los coaches no tienen suscripción web, así que el único canal real para ellos es la app.
 *
 * Un mismo token puede estar repetido bajo varios `device_id` del mismo usuario (reinstalaciones):
 * se deduplica para que nadie reciba la notificación dos veces.
 *
 * Best-effort como `sendPushToClient`: jamás lanza; devuelve conteos para la auditoría del caller.
 */
export async function sendExpoPushToUsers(
    userIds: string[],
    payload: PushPayload,
): Promise<{ users: number; tokens: number; sent: number }> {
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    const result = { users: ids.length, tokens: 0, sent: 0 }
    try {
        if (!ids.length || !isPushEventEnabled(payload.event)) return result

        const admin = createServiceRoleClient()
        const tokens = new Set<string>()
        for (let i = 0; i < ids.length; i += TOKEN_LOOKUP_CHUNK) {
            // `push_tokens` no está en los tipos generados (misma deuda que en sendPushToClient).
            const { data } = await (admin as any)
                .from('push_tokens')
                .select('token')
                .in('user_id', ids.slice(i, i + TOKEN_LOOKUP_CHUNK))
            for (const row of (data ?? []) as { token: string }[]) {
                if (row.token) tokens.add(row.token)
            }
        }
        result.tokens = tokens.size
        if (!tokens.size) return result

        result.sent = await sendExpoTokens(Array.from(tokens), payload)
        console.log(`[push] event=${payload.event} users=${ids.length} expo=${result.sent}/${result.tokens}`)
    } catch (err) {
        console.error(`[push] event=${payload.event} fan-out failed:`, err)
    }
    return result
}

/**
 * Envía a TODOS los destinos del usuario: suscripciones Web Push (PWA — hoy solo existen para
 * alumnos, la tabla es por `client_id`) + tokens Expo (app nativa — alumnos Y coaches, la tabla
 * es por `user_id`). Para notificar a un COACH esto funciona vía el camino Expo (web devuelve 0
 * filas y no molesta). Duplicado PWA+app en el mismo teléfono: aceptado y medido en W1 (decisión
 * CEO 2026-07-29); si molesta, W2 agrega supresión por preferencia.
 *
 * Best-effort de punta a punta: jamás lanza — el caller nunca debe revertir una mutación de
 * producto porque falló una notificación.
 */
export async function sendPushToClient(clientId: string, payload: PushPayload): Promise<void> {
    try {
        if (!isPushEventEnabled(payload.event)) return

        const admin = createServiceRoleClient()

        const [{ data: subs }, { data: mobileSubs }] = await Promise.all([
            admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('client_id', clientId),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (admin as any).from('push_tokens').select('token').eq('user_id', clientId),
        ])

        const webSubs = subs ?? []
        const expoTokens = ((mobileSubs ?? []) as { token: string }[]).map((r) => r.token)
        if (!webSubs.length && !expoTokens.length) return

        const json = JSON.stringify({
            ...payload,
            // Logo del coach (white-label) tiene prioridad; si no, ícono por defecto (EVA).
            icon: payload.iconUrl ?? payload.icon ?? '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
        })

        let webSent = 0
        const results = await Promise.allSettled([
            // Web push (PWA) — requiere VAPID; si falta, solo se pierde el canal web (log abajo).
            ...(!ensureVapid()
                ? []
                : webSubs.map(async (sub) => {
                      try {
                          await webpush.sendNotification(
                              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                              json
                          )
                          webSent++
                      } catch (err: unknown) {
                          const status = (err as { statusCode?: number }).statusCode
                          // 410 Gone / 404 = suscripción expirada → limpiar
                          if (status === 410 || status === 404) {
                              await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
                          }
                      }
                  })),
            // Mobile push (Expo)
            sendExpoTokens(expoTokens, payload),
        ])
        const expoSent = results[results.length - 1]?.status === 'fulfilled' ? expoTokens.length : 0

        // Telemetría W1 (visible en runtime logs de Vercel): volumen por evento y canal.
        console.log(`[push] event=${payload.event} user=${clientId} web=${webSent}/${webSubs.length} expo=${expoSent}/${expoTokens.length}`)
    } catch (err) {
        console.error(`[push] event=${payload.event} user=${clientId} failed:`, err)
    }
}

/**
 * OJO multi-tenant: filtra SOLO por coach_id ⇒ válido para coaches standalone. Para coaches de
 * org (clients por org_id+assignments) o de team (clients por team_id) devuelve 0 — si se agrega
 * un caller en esos contextos, aceptar scope {orgId|teamId} y resolver los clientes acorde.
 * Hoy SIN callers (mantenida por compatibilidad de API).
 */
export async function sendPushToCoachClients(coachId: string, payload: PushPayload): Promise<void> {
    const admin = createServiceRoleClient()
    const { data: clients } = await admin
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
        .eq('is_active', true)

    if (!clients?.length) return
    await Promise.allSettled(clients.map((c) => sendPushToClient(c.id, payload)))
}
