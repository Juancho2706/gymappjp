'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import type { SubscriptionTier } from '@/lib/constants'

type Gate = 'nutrition' | 'branding' | 'client_limit' | 'custom_exercises' | 'client_import'

interface Props {
    gate: Gate
    currentTier: SubscriptionTier
    currentLimit?: number
}

/** Mount this inside any upgrade gate UI to fire a PostHog event when the coach sees the gate. */
export function UpgradeGateTracker({ gate, currentTier, currentLimit }: Props) {
    const ph = usePostHog()

    useEffect(() => {
        ph?.capture('upgrade_gate_hit', {
            gate,
            current_tier: currentTier,
            ...(currentLimit !== undefined && { current_limit: currentLimit }),
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // fire once on mount only

    return null
}

interface UpgradeCTAProps {
    gate: Gate
    currentTier: SubscriptionTier
    targetTier: SubscriptionTier
    source: string
    children: React.ReactNode
    className?: string
    href: string
}

/**
 * Envuelve un CTA de upgrade (link/boton) para emitir `upgrade_initiated` al click.
 *
 * ⚠️ HALLAZGO (A4, 26-08): este wrapper tiene CERO usos en el arbol. `upgrade_initiated` lleva 0
 * ingestas all-time contra 65 `upgrade_gate_hit`, y la causa principal es estructural, no tecnica:
 * las dos superficies que MAS se chocan montan `UpgradeGateTracker` pero su CTA es un `<Link>`
 * pelado, sin capture —
 *   · `components/upgrade/UpsellGate.tsx:178` (gates `custom_exercises` / `client_import`)
 *   · `app/coach/nutrition-plans/page.tsx` (gate `nutrition`)
 * — y `gate: 'branding'` esta en el union del tipo pero NINGUN componente lo emite. Los unicos dos
 * sitios instrumentados (`CreateClientModal` y `AddStudentStepper`) viven detras del muro de cupo,
 * que es el camino menos transitado. Cerrar el eslabon exige envolver esos CTA con este componente;
 * ambos archivos quedaron FUERA del alcance de esta ola y estan reportados.
 *
 * `send_instantly` + `sendBeacon`: el click navega en el acto. El batch normal de posthog-js se
 * flushea por timer y muere con la pagina si el destino resuelve como carga dura — mismo criterio
 * que `checkout_started` / `register_submitted` en `lib/posthog/events.ts`.
 */
export function UpgradeCTALink({ gate, currentTier, targetTier, source, children, className, href }: UpgradeCTAProps) {
    const ph = usePostHog()

    return (
        <a
            href={href}
            className={className}
            onClick={() => {
                ph?.capture(
                    'upgrade_initiated',
                    {
                        gate,
                        source,
                        target_tier: targetTier,
                        current_tier: currentTier,
                    },
                    { send_instantly: true, transport: 'sendBeacon' }
                )
            }}
        >
            {children}
        </a>
    )
}
