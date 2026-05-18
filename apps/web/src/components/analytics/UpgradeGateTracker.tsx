'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import type { SubscriptionTier } from '@/lib/constants'

type Gate = 'nutrition' | 'branding' | 'client_limit'

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

/** Wrap an upgrade CTA link/button to capture upgrade_initiated on click. */
export function UpgradeCTALink({ gate, currentTier, targetTier, source, children, className, href }: UpgradeCTAProps) {
    const ph = usePostHog()

    return (
        <a
            href={href}
            className={className}
            onClick={() => {
                ph?.capture('upgrade_initiated', {
                    gate,
                    source,
                    target_tier: targetTier,
                    current_tier: currentTier,
                })
            }}
        >
            {children}
        </a>
    )
}
