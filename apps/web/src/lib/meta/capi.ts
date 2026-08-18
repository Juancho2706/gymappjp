/**
 * Meta Conversions API (CAPI) — helper SERVER-ONLY reutilizable.
 *
 * Por que existe: el navegador pierde conversiones de forma sistematica (adblockers, ITP de Safari,
 * pestaña cerrada, pago que vuelve desde la app del banco). El evento server-side es el que si
 * llega. La pareja pixel + CAPI con el MISMO `event_id` da ~25-40% mas conversiones atribuibles.
 *
 * Contrato de deduplicacion (Meta): se cruza UNICAMENTE `event_name` + `event_id`, ventana 48h.
 * Ni el email ni `fbp`/`fbc` participan del dedupe — esos sirven para MATCHEAR al usuario (EMQ).
 *
 * Reglas duras:
 * - `fbp` y `fbc` NUNCA se hashean. Hashearlos rompe el matching por completo.
 * - Los identificadores (`em`, `external_id`, ...) se normalizan (trim + lowercase) ANTES del
 *   SHA-256; sin normalizar el hash no matchea con la base de Meta.
 * - Sin `META_CAPI_TOKEN` o sin `NEXT_PUBLIC_FB_PIXEL_ID` → no-op SILENCIOSO. El token todavia no
 *   existe: nada de esto puede romper un registro.
 *
 * No importar desde componentes cliente (usa `node:crypto` + `next/headers`).
 * Reutilizable tal cual para `Subscribe` desde el webhook de MercadoPago/Flow.
 */
import { createHash, randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_HOST = 'https://graph.facebook.com'

export type MetaCapiEventName =
    | 'CompleteRegistration'
    | 'Subscribe'
    | 'StartTrial'
    | 'Purchase'
    | 'Lead'
    | 'InitiateCheckout'
    | 'ViewContent'

/** Datos en CLARO. El hasheo lo hace este modulo; el caller nunca hashea. */
export type MetaCapiUserData = {
    email?: string | null
    phone?: string | null
    /** ID estable del usuario (Supabase auth uid). Sube el EMQ tanto como el email. */
    externalId?: string | null
    firstName?: string | null
    lastName?: string | null
}

/** Moneda SIEMPRE 'CLP' y valores ENTEROS (CLP no tiene decimales: 30000, no 30000.00). */
export type MetaCapiCustomData = {
    value?: number
    currency?: 'CLP'
    content_name?: string
    predicted_ltv?: number
}

/** Señales del request HTTP. Se recolectan en el handler y viajan al POST diferido. */
export type MetaCapiRequestContext = {
    fbp: string | null
    fbc: string | null
    clientIpAddress: string | null
    clientUserAgent: string | null
    origin: string | null
}

export type MetaCapiEventInput = {
    eventName: MetaCapiEventName
    /** Mismo string que el `eventID` del pixel. Generar con `newMetaEventId()`. */
    eventId: string
    /** Absoluta, o relativa ('/register') para resolverla contra el origin del request. */
    eventSourceUrl?: string | null
    actionSource?: 'website' | 'app' | 'system_generated'
    userData?: MetaCapiUserData
    customData?: MetaCapiCustomData
    context?: MetaCapiRequestContext
    /** Unix SEGUNDOS. Default: ahora. */
    eventTime?: number
}

type MetaCapiUserDataPayload = {
    em?: string[]
    ph?: string[]
    fn?: string[]
    ln?: string[]
    external_id?: string[]
    fbp?: string
    fbc?: string
    client_ip_address?: string
    client_user_agent?: string
}

type MetaCapiEventPayload = {
    event_name: MetaCapiEventName
    event_time: number
    event_id: string
    action_source: 'website' | 'app' | 'system_generated'
    event_source_url?: string
    user_data: MetaCapiUserDataPayload
    custom_data?: MetaCapiCustomData
}

function readPixelId(): string {
    return (process.env.NEXT_PUBLIC_FB_PIXEL_ID ?? '').replace(/\D/g, '')
}

/** true solo si hay dataset + token. Todo lo demas es no-op. */
export function isMetaCapiConfigured(): boolean {
    return Boolean(readPixelId() && process.env.META_CAPI_TOKEN)
}

export function newMetaEventId(): string {
    return randomUUID()
}

/** SHA-256 hex sobre el valor normalizado (trim + lowercase). `null` si no hay dato util. */
export function hashMetaIdentifier(raw: string | null | undefined): string | null {
    if (!raw) return null
    const normalized = raw.trim().toLowerCase()
    if (!normalized) return null
    return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

function firstForwardedIp(forwardedFor: string | null): string | null {
    if (!forwardedFor) return null
    const first = forwardedFor.split(',')[0]?.trim()
    return first ? first : null
}

/**
 * Lee cookies (`_fbp` / `_fbc`) y headers del request en curso. Hay que llamarlo DENTRO del
 * handler/action, no dentro del callback diferido.
 */
export async function collectMetaCapiContext(): Promise<MetaCapiRequestContext> {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])

    const proto = headerStore.get('x-forwarded-proto') ?? 'https'
    const host = headerStore.get('host')
    const origin = headerStore.get('origin') ?? (host ? `${proto}://${host}` : null)

    return {
        fbp: cookieStore.get('_fbp')?.value ?? null,
        fbc: cookieStore.get('_fbc')?.value ?? null,
        clientIpAddress:
            firstForwardedIp(headerStore.get('x-forwarded-for')) ?? headerStore.get('x-real-ip'),
        clientUserAgent: headerStore.get('user-agent'),
        origin,
    }
}

function buildUserDataPayload(
    userData: MetaCapiUserData | undefined,
    context: MetaCapiRequestContext
): MetaCapiUserDataPayload {
    const payload: MetaCapiUserDataPayload = {}

    const em = hashMetaIdentifier(userData?.email)
    if (em) payload.em = [em]
    const ph = hashMetaIdentifier(userData?.phone?.replace(/[^\d]/g, ''))
    if (ph) payload.ph = [ph]
    const fn = hashMetaIdentifier(userData?.firstName)
    if (fn) payload.fn = [fn]
    const ln = hashMetaIdentifier(userData?.lastName)
    if (ln) payload.ln = [ln]
    const externalId = hashMetaIdentifier(userData?.externalId)
    if (externalId) payload.external_id = [externalId]

    // fbp/fbc van EN CLARO. Hashearlos rompe el matching.
    if (context.fbp) payload.fbp = context.fbp
    if (context.fbc) payload.fbc = context.fbc
    if (context.clientIpAddress) payload.client_ip_address = context.clientIpAddress
    if (context.clientUserAgent) payload.client_user_agent = context.clientUserAgent

    return payload
}

function resolveEventSourceUrl(
    eventSourceUrl: string | null | undefined,
    origin: string | null
): string | undefined {
    if (!eventSourceUrl) return undefined
    if (/^https?:\/\//i.test(eventSourceUrl)) return eventSourceUrl
    if (!origin) return undefined
    return `${origin}${eventSourceUrl.startsWith('/') ? '' : '/'}${eventSourceUrl}`
}

/**
 * POST directo al Graph API. Resuelve SIEMPRE (nunca lanza): un fallo de Meta jamas puede tumbar
 * un registro ni un webhook de pago.
 */
export async function sendMetaCapiEvent(input: MetaCapiEventInput): Promise<void> {
    const pixelId = readPixelId()
    const token = process.env.META_CAPI_TOKEN
    if (!pixelId || !token) return

    try {
        const context = input.context ?? (await collectMetaCapiContext())
        const event: MetaCapiEventPayload = {
            event_name: input.eventName,
            event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: input.actionSource ?? 'website',
            user_data: buildUserDataPayload(input.userData, context),
        }

        const sourceUrl = resolveEventSourceUrl(input.eventSourceUrl, context.origin)
        if (sourceUrl) event.event_source_url = sourceUrl
        if (input.customData) event.custom_data = input.customData

        const response = await fetch(
            `${GRAPH_API_HOST}/${GRAPH_API_VERSION}/${pixelId}/events`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // `access_token` en el body: nunca en la URL (queda en logs de proxies).
                body: JSON.stringify({ data: [event], access_token: token }),
                cache: 'no-store',
            }
        )

        if (!response.ok) {
            // Sin body loggeado: contiene el access_token.
            console.warn('[meta-capi] rechazado', input.eventName, response.status)
        } else {
            // Confirmacion positiva: es la UNICA forma de saber desde los logs que el evento
            // server-side llego a Meta (el Events Manager tarda horas en reflejarlo).
            console.warn('[meta-capi] enviado', input.eventName, input.eventId)
        }
    } catch (error) {
        console.warn('[meta-capi] fallo de red', input.eventName, error)
    }
}

/**
 * Recolecta el contexto del request y hace el POST a Meta.
 *
 * 🔴 POR QUE ESTO **NO** USA `after()` (18-08-2026, verificado en produccion): el registro free
 * termina en `redirect()`, y en ese camino el callback de `after()` NUNCA se ejecuto — ni el log de
 * exito ni el de rechazo aparecieron en Vercel, con el token bien cargado y el `POST /register`
 * respondiendo 200. Resultado: CERO eventos server-side en Events Manager mientras todo "parecia"
 * bien. Se cambio por un `await` directo: cuesta ~200-400 ms sobre una accion que ya espera al
 * proveedor de email, y a cambio el evento SALE. `sendMetaCapiEvent` nunca lanza, asi que esperarlo
 * no puede romper el registro.
 */
export async function queueMetaCapiEvent(
    input: Omit<MetaCapiEventInput, 'context'>
): Promise<void> {
    if (!isMetaCapiConfigured()) {
        // Sin este log el no-op es INDISTINGUIBLE de un envio exitoso (18-08-2026: dos horas
        // perdidas sin poder decidir si el token estaba cargado o no). Solo dice QUE falta, nunca
        // el valor.
        console.warn(
            '[meta-capi] no configurado — falta',
            readPixelId() ? 'META_CAPI_TOKEN' : 'NEXT_PUBLIC_FB_PIXEL_ID',
            input.eventName
        )
        return
    }

    const context = await collectMetaCapiContext()
    const payload: MetaCapiEventInput = { ...input, context }

    await sendMetaCapiEvent(payload)
}
