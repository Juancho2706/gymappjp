/**
 * Contrato compartido del alta de coach para analítica (W7.1 del embudo Free→Pro).
 *
 * Isomorfo A PROPÓSITO: lo importan tanto los hooks de cliente (`lib/posthog/events.ts`, con
 * `'use client'`) como los emisores de servidor (`lib/posthog/registration-events.ts`, con
 * `'server-only'`). Por eso acá no puede entrar NADA que toque red, `process.env` ni React: solo
 * constantes y funciones puras.
 *
 * Qué resuelve:
 *
 * 1. `platform` — de dónde salió el alta (`ios` / `android` / `web`). Sin esta propiedad no se
 *    puede responder la pregunta que gobierna la decisión de IAP: «¿qué porcentaje de las altas
 *    entra por iOS?» (gatillo declarado en `docs/specs/embudo-free-pro/SPEC.md`).
 * 2. `pricing_version` — con qué catálogo nació el coach. Un literal, nunca derivado de la fecha:
 *    cuando el catálogo cambie se sube acá y las cohortes se separan solas.
 * 3. El flag de URL con el que un aterrizaje web avisa que el evento YA lo emitió el servidor, para
 *    que el tracker del navegador no lo cuente dos veces.
 */

/** Sube cuando cambia el catálogo (Pricing v3, owner 2026-08-21). Espejo del literal de `events.ts`. */
export const PRICING_VERSION = 'v3'

export type RegistrationPlatform = 'ios' | 'android' | 'web' | 'unknown'

/** Cómo se autenticó el coach al darse de alta. */
export type RegistrationMethod = 'email' | 'google'

/**
 * Header explícito de plataforma. **Hoy la app NO lo manda**: `apps/mobile/lib/api.ts` (`apiFetch`)
 * solo setea `Content-Type` y `Authorization`, así que el resolver cae al `User-Agent`. Queda
 * declarado acá para que el día que la app lo mande no haya que tocar ningún endpoint: el header
 * gana siempre, porque es un dato afirmado por el cliente y no una inferencia.
 */
export const PLATFORM_HEADER = 'x-eva-platform'

/**
 * Marca en la URL de aterrizaje: «este alta ya la contó el servidor».
 *
 * `coach_registered` tiene dos emisores posibles en el mismo camino web — el server action (que sí
 * sale aunque el visitante no haya aceptado cookies) y `CoachRegisteredTracker` en el aterrizaje.
 * Si disparan los dos, el paso final del embudo queda inflado justo en la métrica que W7 existe
 * para arreglar. El server action que emite agrega este parámetro a su `redirect()` y el tracker
 * se apaga al verlo.
 */
export const SERVER_EMITTED_PARAM = 'ph'
export const SERVER_EMITTED_VALUE = 'srv'

/** `?...&ph=srv` para pegar al final de un `redirect()` que ya emitió el evento server-side. */
export const SERVER_EMITTED_QUERY = `${SERVER_EMITTED_PARAM}=${SERVER_EMITTED_VALUE}`

// Orden de evaluación: iOS PRIMERO. Expo Go en iPhone manda «Expo» y «CFNetwork» en el mismo
// User-Agent; si Android se evaluara antes, ese caso quedaría clasificado al revés.
// - iOS (React Native usa NSURLSession): `EVA/85 CFNetwork/1568.100.1 Darwin/24.0.0`.
// - Android (React Native usa okhttp):   `okhttp/4.9.2` — y `Dalvik/...` cuando sale por HttpURLConnection.
// `\b` en los bordes para que «Mac OS X» de un Chrome de escritorio no se confunda con Darwin.
const IOS_UA = /\b(cfnetwork|darwin|iphone|ipad|ipod)\b/i
const ANDROID_UA = /\b(okhttp|dalvik|android|expo)\b/i

type HeaderBag = { get(name: string): string | null }

function normalizeHeaderPlatform(raw: string | null): RegistrationPlatform | null {
    const value = raw?.trim().toLowerCase()
    if (value === 'ios' || value === 'android' || value === 'web') return value
    return null
}

/**
 * Plataforma de un alta que entra por `api/mobile/**`.
 *
 * Devuelve `'unknown'` —no `'web'`— cuando ni el header ni el User-Agent alcanzan: estos endpoints
 * los llama la app, así que decir «web» sería inventar un dato. Un `unknown` visible en PostHog es
 * la señal de que hay que mandar el header; un `web` falso no se nota nunca.
 */
export function resolveRegistrationPlatform(headers: HeaderBag): RegistrationPlatform {
    const declared = normalizeHeaderPlatform(headers.get(PLATFORM_HEADER))
    if (declared) return declared

    const ua = headers.get('user-agent') ?? ''
    if (IOS_UA.test(ua)) return 'ios'
    if (ANDROID_UA.test(ua)) return 'android'
    return 'unknown'
}
