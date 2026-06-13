import webpush from 'web-push'
import { createServiceRoleClient } from './supabase/admin-client'

webpush.setVapidDetails(
    'mailto:contacto@eva-app.cl',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = {
    title: string
    body: string
    url: string
    icon?: string
}

async function sendExpoTokens(
    tokens: string[],
    payload: PushPayload,
): Promise<void> {
    if (!tokens.length) return
    const messages = tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: { screen: payload.url },
        sound: 'default',
        channelId: 'default',
    }))
    await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
    })
}

export async function sendPushToClient(clientId: string, payload: PushPayload): Promise<void> {
    const admin = createServiceRoleClient()

    const [{ data: subs }, { data: mobileSubs }] = await Promise.all([
        admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('client_id', clientId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from('push_tokens').select('token').eq('user_id', clientId),
    ])

    const json = JSON.stringify({
        ...payload,
        icon: payload.icon ?? '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
    })

    await Promise.allSettled([
        // Web push (PWA)
        ...(subs ?? []).map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    json
                )
            } catch (err: unknown) {
                const status = (err as { statusCode?: number }).statusCode
                // 410 Gone / 404 = suscripción expirada → limpiar
                if (status === 410 || status === 404) {
                    await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
                }
            }
        }),
        // Mobile push (Expo)
        sendExpoTokens((mobileSubs ?? []).map((r: { token: string }) => r.token), payload),
    ])
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
