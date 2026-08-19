'use client'

import { useEffect, useRef } from 'react'
import { CONSENT_CHANGE_EVENT, type ConsentValue } from '@/lib/posthog/consent'

// Reintento acotado (espejo del patron trackMetaEvent de lib/meta/pixel.ts): en un aterrizaje
// directo el effect de este hijo corre ANTES del posthog.init() del provider (los effects de React
// van de hijo a padre), asi que el primer capture puede caer pre-init.
const RETRY_INTERVAL_MS = 500
const RETRY_MAX_ATTEMPTS = 6 // ~3s

/**
 * Dispara UNA sola vez un capture «de aterrizaje» (la pantalla existe ⇒ el evento ocurrio),
 * reintentando hasta que salga de verdad.
 *
 * Nace de EXTRAER el patron que ya vivia inline en `PricingViewTracker` (Pricing v2 E1): ahora lo
 * necesitan tres superficies (los precios de /pricing, los de la landing y el alta completada) y
 * tener tres copias del mismo reintento sutil es como se rompen los eventos en silencio.
 *
 *  - Gate de consentimiento (Ley 21.719): `capture` devuelve un CaptureResult SOLO si posthog ya
 *    inicio Y el usuario no esta opted-out; `undefined` = no salio nada ⇒ se reintenta.
 *  - Si el usuario acepta el banner con la pagina ya abierta, `CONSENT_CHANGE_EVENT` reintenta
 *    (mismo mecanismo que armo MetaPixel en 7df9aa6c).
 *
 * @param fire     debe DEVOLVER lo que devuelve `posthog.capture` (truthy = el evento salio).
 * @param enabled  arma el disparo; sirve para esperar a que algo entre en pantalla. Al pasar de
 *                 false a true el reintento arranca de cero.
 */
export function useDeferredCapture(fire: () => unknown, enabled: boolean = true): void {
    const hasFired = useRef(false)
    // `fire` se lee recien al disparar (el reintento puede correr segundos despues): ref, para no
    // re-armar el effect en cada render por la identidad de la closure.
    const fireRef = useRef(fire)
    useEffect(() => {
        fireRef.current = fire
    })

    useEffect(() => {
        if (!enabled) return
        let attempts = 0
        let timer: number | undefined

        const attempt = () => {
            if (hasFired.current) return
            if (fireRef.current()) hasFired.current = true
        }

        const attemptWithRetry = () => {
            attempt()
            if (hasFired.current) return
            attempts += 1
            if (attempts >= RETRY_MAX_ATTEMPTS) return
            timer = window.setTimeout(attemptWithRetry, RETRY_INTERVAL_MS)
        }
        attemptWithRetry()

        // El banner despacha el evento ANTES de aplicar el opt-in sobre la instancia
        // (setStoredConsent → applyConsent en CookieConsent.handle): diferimos un tick para
        // capturar recien con el opt_in_capturing() ya aplicado.
        const onConsentChange = (domEvent: Event) => {
            if ((domEvent as CustomEvent<ConsentValue>).detail !== 'accepted') return
            window.setTimeout(attempt, 0)
        }
        window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        return () => {
            if (timer !== undefined) window.clearTimeout(timer)
            window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        }
    }, [enabled])
}
