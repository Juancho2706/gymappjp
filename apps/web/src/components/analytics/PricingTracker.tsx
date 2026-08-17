'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePostHog } from 'posthog-js/react'
import { CONSENT_CHANGE_EVENT, type ConsentValue } from '@/lib/posthog/consent'
import type { SubscriptionTier } from '@/lib/constants'

// Reintento acotado (espejo del patron trackMetaEvent de lib/meta/pixel.ts): en un aterrizaje
// directo a /pricing el effect de este hijo corre ANTES del posthog.init() del provider (los
// effects de React van de hijo a padre), asi que el primer capture puede caer pre-init.
const RETRY_INTERVAL_MS = 500
const RETRY_MAX_ATTEMPTS = 6 // ~3s

/**
 * pricing_viewed — pageview propio del funnel de /pricing (Pricing v2 E1, invariante P8).
 *
 * MISMO gate de consentimiento que el resto de PostHog (Ley 21.719): el init corre con
 * opt_out_capturing_by_default, asi que `capture` devuelve undefined y NO manda nada por red
 * mientras el usuario no acepte el banner. Si el usuario acepta con /pricing ya abierta, el
 * banner emite CONSENT_CHANGE_EVENT (mismo mecanismo que armo MetaPixel en 7df9aa6c) y recien
 * ahi disparamos. Sin consentimiento: cero requests, cero eventos.
 */
export function PricingViewTracker() {
    const ph = usePostHog()
    const hasFired = useRef(false)

    useEffect(() => {
        if (!ph) return
        let attempts = 0
        let timer: number | undefined

        const fire = () => {
            if (hasFired.current) return
            // capture devuelve un CaptureResult SOLO si posthog ya inicio Y el usuario esta
            // opted-in; undefined = no salio nada (pre-init u opted-out) y el flag no se marca.
            if (ph.capture('pricing_viewed')) hasFired.current = true
        }

        const fireWithRetry = () => {
            fire()
            if (hasFired.current) return
            attempts += 1
            if (attempts >= RETRY_MAX_ATTEMPTS) return
            timer = window.setTimeout(fireWithRetry, RETRY_INTERVAL_MS)
        }
        fireWithRetry()

        // El banner despacha el evento ANTES de aplicar el opt-in sobre la instancia
        // (setStoredConsent → applyConsent en CookieConsent.handle): diferimos un tick para
        // capturar recien con el opt_in_capturing() ya aplicado.
        const onConsentChange = (event: Event) => {
            if ((event as CustomEvent<ConsentValue>).detail !== 'accepted') return
            window.setTimeout(fire, 0)
        }
        window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        return () => {
            if (timer !== undefined) window.clearTimeout(timer)
            window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        }
    }, [ph])

    return null
}

/**
 * CTA de plan en /pricing: captura pricing_plan_clicked({ tier }) al click y navega igual que
 * el Link original (patron UpgradeCTALink). Gated por consentimiento como todo capture: opted-out
 * ⇒ no-op sin requests. Client component aislado para poder usarse desde el Server Component.
 */
export function PricingPlanLink({
    tier,
    href,
    className,
    children,
}: {
    tier: SubscriptionTier
    href: string
    className?: string
    children: React.ReactNode
}) {
    const ph = usePostHog()
    return (
        <Link
            href={href}
            className={className}
            onClick={() => {
                ph?.capture('pricing_plan_clicked', { tier })
            }}
        >
            {children}
        </Link>
    )
}
