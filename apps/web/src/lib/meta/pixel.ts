/**
 * Meta Pixel (en 2026 Meta lo llama "Dataset"; el Pixel ID y el Dataset ID son el MISMO numero) —
 * helpers de navegador. Este modulo NO monta nada: solo tipa `window.fbq`, decide en que rutas se
 * permite trackear y expone el disparo seguro de eventos.
 *
 * Reglas de negocio codificadas aca (informe `private/marketing/meta-ads-research/`):
 * - Sin `NEXT_PUBLIC_FB_PIXEL_ID` no hay pixel: todo queda en no-op silencioso.
 * - NUNCA se trackea en superficies de ALUMNOS / white-label (`/join`, `/c`, `/e`, `/t`). Esa gente
 *   no es la audiencia del ad; meterla al dataset envenena lookalikes y custom audiences.
 * - `_fbc` solo se fabrica cuando hay un `fbclid` REAL en la URL. Inventarlo rompe el matching.
 *
 * Solo debe importarse desde componentes `'use client'` (toca `window` / `document`).
 */

/** Digits-only: el ID viaja a un `<Script>` inline, asi que se sanea en la frontera. */
export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_FB_PIXEL_ID ?? '').replace(/\D/g, '')

export type MetaStandardEvent =
    | 'PageView'
    | 'ViewContent'
    | 'InitiateCheckout'
    | 'CompleteRegistration'
    | 'StartTrial'
    | 'Subscribe'
    | 'Lead'
    | 'Contact'
    | 'Purchase'

/** Subconjunto de parametros estandar que EVA usa. Moneda SIEMPRE 'CLP' y valores enteros. */
export type MetaEventParams = {
    content_name?: string
    content_category?: string
    content_type?: string
    content_ids?: string[]
    value?: number
    currency?: 'CLP'
    predicted_ltv?: number
    status?: string
}

/** `eventID` (camelCase) es el nombre que espera fbq; el server manda `event_id`. Mismo valor. */
export type MetaEventOptions = { eventID: string }

type FbqFunction = {
    (method: 'init', pixelId: string): void
    (method: 'track', event: MetaStandardEvent, params?: MetaEventParams, options?: MetaEventOptions): void
    (method: 'trackCustom', event: string, params?: MetaEventParams, options?: MetaEventOptions): void
    (method: 'consent', action: 'grant' | 'revoke'): void
}

declare global {
    interface Window {
        fbq?: FbqFunction
    }
}

/**
 * Superficies de alumno / white-label. Se comparan con match exacto o prefijo + '/' para que `/c`
 * NO se coma `/coach` ni `/t` a `/terminos`.
 */
const UNTRACKED_ROUTE_PREFIXES = ['/join', '/c', '/e', '/t'] as const

export function isMetaTrackableRoute(pathname: string | null | undefined): boolean {
    if (!pathname) return false
    return !UNTRACKED_ROUTE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
}

const FBQ_WAIT_INTERVAL_MS = 250
const FBQ_WAIT_MAX_ATTEMPTS = 20 // ~5s: si el usuario no dio consentimiento, fbq no existe nunca.

/**
 * Dispara un evento estandar. Si el `<Script afterInteractive>` todavia no ejecuto (o el usuario
 * aun no acepto el banner) reintenta de forma acotada en vez de perder el evento en silencio.
 */
export function trackMetaEvent(
    event: MetaStandardEvent,
    params?: MetaEventParams,
    options?: MetaEventOptions
): void {
    if (typeof window === 'undefined' || !META_PIXEL_ID) return

    let attempts = 0
    const fire = (): void => {
        const fbq = window.fbq
        if (typeof fbq === 'function') {
            if (options) fbq('track', event, params ?? {}, options)
            else fbq('track', event, params ?? {})
            return
        }
        attempts += 1
        if (attempts > FBQ_WAIT_MAX_ATTEMPTS) return
        window.setTimeout(fire, FBQ_WAIT_INTERVAL_MS)
    }
    fire()
}

const FBC_COOKIE = '_fbc'
const FBC_MAX_AGE_SECONDS = 90 * 24 * 60 * 60 // 90 dias (ventana que documenta Meta)

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
}

/**
 * Guarda el click-id de Meta como cookie first-party `_fbc` en el formato oficial
 * `fb.<subdomainIndex>.<creationTimeMs>.<fbclid>`.
 *
 * - Solo escribe si hay `fbclid` real (jamas se fabrica un fbc).
 * - Solo escribe si NO existe ya (el propio pixel la crea; no la pisamos).
 * - Host-only a proposito: el server la lee del mismo host y asi no compite con la que el pixel
 *   setea a nivel de dominio registrable.
 */
export function captureFbclidCookie(fbclid: string | null | undefined): void {
    if (typeof document === 'undefined') return
    if (!fbclid) return
    if (readCookie(FBC_COOKIE)) return

    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const value = `fb.1.${Date.now()}.${fbclid}`
    document.cookie = `${FBC_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${FBC_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}
