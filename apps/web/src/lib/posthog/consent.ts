'use client'

import posthog from 'posthog-js'

/**
 * Consentimiento de analítica (Ley 21.719) — única fuente de verdad compartida entre el banner
 * (`CookieConsent`) y el init de PostHog (`PostHogProvider`).
 *
 * BUG HISTÓRICO que esto arregla (PostHog mudo desde 2026-06-08): el banner llamaba
 * `window.posthog.opt_in_capturing()`, pero con el paquete npm la instancia viva es el MÓDULO
 * importado — `window.posthog` no existe → el opt-in caía al vacío y, con
 * `opt_out_capturing_by_default: true`, nadie quedaba jamás opted-in (cero eventos pese a que el
 * token, el proxy /ph y la ingesta estaban sanos). Además había carrera: el effect del banner corre
 * al montar, ANTES de que el provider llame `posthog.init()`. Ahora: el banner escribe la elección y
 * la aplica sobre la instancia del módulo; el provider re-aplica lo guardado en el callback `loaded`
 * (post-init), así el orden de montaje da lo mismo.
 */

const STORAGE_KEY = 'eva-cookie-consent-v1'

export type ConsentValue = 'accepted' | 'rejected' | null

export function getStoredConsent(): ConsentValue {
    try { return (localStorage.getItem(STORAGE_KEY) as ConsentValue) ?? null } catch { return null }
}

export function setStoredConsent(value: 'accepted' | 'rejected'): void {
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* noop */ }
}

/** Aplica una elección sobre la instancia REAL de posthog-js (el módulo, no window). */
export function applyConsent(value: ConsentValue): void {
    if (!value) return
    try {
        if (value === 'accepted') posthog.opt_in_capturing()
        else posthog.opt_out_capturing()
    } catch { /* posthog aún sin init: el provider re-aplica en `loaded` */ }
}
