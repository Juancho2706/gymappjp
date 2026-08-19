'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import * as Sentry from '@sentry/nextjs'
import { useIdentifyCoach } from '@/lib/posthog/events'
import { CONSENT_CHANGE_EVENT, getStoredConsent, type ConsentValue } from '@/lib/posthog/consent'
import type { SubscriptionTier } from '@/lib/constants'

// Mismo reintento acotado que `useDeferredCapture`: el effect de este hijo corre ANTES del
// posthog.init() del provider (los effects de React van de hijo a padre).
const RETRY_INTERVAL_MS = 500
const RETRY_MAX_ATTEMPTS = 6 // ~3s

/**
 * Identidad de analítica del coach — el puente que faltaba entre PostHog y Sentry.
 *
 * Sin esto, un error de Sentry no se puede cruzar con el embudo (ni saber si el que revienta es un
 * Free o un Elite), y todo PostHog del panel quedaba anónimo pese a que `useIdentifyCoach` existía
 * desde siempre (sin un solo caller).
 *
 * Qué viaja y qué NO:
 *  - `coachId` es el UUID de `coaches.id`: un PSEUDÓNIMO opaco. Nada de email, nombre ni marca —
 *    ni a PostHog ni a Sentry.
 *  - `identify` (perfil de persona PERSISTENTE en PostHog) solo con el consentimiento explícito
 *    guardado; sin él, el panel sigue capturando anónimo. Si el coach acepta el banner estando ya
 *    dentro, `CONSENT_CHANGE_EVENT` identifica en ese momento.
 *  - Sentry sí recibe el id siempre: es monitoreo de errores del propio servicio, y el tag
 *    `posthog_session_id` es lo que permite saltar de un crash a la sesión que lo produjo.
 *
 * El corte de la identidad vive en el logout (`useCoachSignOut`): `posthog.reset()` +
 * `Sentry.setUser(null)`, para que el próximo coach de ese navegador no herede al anterior.
 */
export function IdentifyOnMount({ coachId, tier }: { coachId: string; tier: SubscriptionTier }) {
    const identifyCoach = useIdentifyCoach()

    useEffect(() => {
        Sentry.setUser({ id: coachId })
        Sentry.setTag('tier', tier)
    }, [coachId, tier])

    useEffect(() => {
        let attempts = 0
        let timer: number | undefined
        let linked = false

        const identifyIfConsented = () => {
            if (getStoredConsent() !== 'accepted') return
            identifyCoach(coachId, tier, true)
        }

        const link = () => {
            if (linked) return
            identifyIfConsented()
            try {
                // `get_session_id` revienta pre-init (no hay sessionManager todavía) ⇒ try + reintento.
                const sessionId = posthog.get_session_id()
                if (sessionId) {
                    Sentry.setTag('posthog_session_id', sessionId)
                    linked = true
                }
            } catch {
                /* posthog aún sin init: reintentamos */
            }
        }

        const linkWithRetry = () => {
            link()
            if (linked) return
            attempts += 1
            if (attempts >= RETRY_MAX_ATTEMPTS) return
            timer = window.setTimeout(linkWithRetry, RETRY_INTERVAL_MS)
        }
        linkWithRetry()

        // El banner despacha el evento ANTES de aplicar el opt-in sobre la instancia: diferimos un
        // tick para identificar recién con el opt_in_capturing() ya aplicado.
        const onConsentChange = (domEvent: Event) => {
            if ((domEvent as CustomEvent<ConsentValue>).detail !== 'accepted') return
            window.setTimeout(identifyIfConsented, 0)
        }
        window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        return () => {
            if (timer !== undefined) window.clearTimeout(timer)
            window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        }
    }, [coachId, tier, identifyCoach])

    return null
}
