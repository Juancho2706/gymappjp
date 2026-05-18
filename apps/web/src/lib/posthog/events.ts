'use client'

import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'
import type { SubscriptionTier } from '@/lib/constants'

/** Identify coach after login/registration (only when they opted in). */
export function useIdentifyCoach() {
    const ph = usePostHog()
    return useCallback(
        (coachId: string, tier: SubscriptionTier, hasConsent: boolean) => {
            if (!ph || !hasConsent) return
            ph.identify(coachId, { tier, platform: 'coach' })
        },
        [ph]
    )
}

/** Coach hit a feature gate (nutrition, branding, client limit). */
export function useCaptureUpgradeGate() {
    const ph = usePostHog()
    return useCallback(
        (gate: 'nutrition' | 'branding' | 'client_limit', currentTier: SubscriptionTier, currentLimit?: number) => {
            ph?.capture('upgrade_gate_hit', { gate, current_tier: currentTier, current_limit: currentLimit })
        },
        [ph]
    )
}

/** Coach dismissed the upgrade modal without upgrading. */
export function useCaptureUpgradeDismissed() {
    const ph = usePostHog()
    return useCallback(
        (gate: string, currentTier: SubscriptionTier) => {
            ph?.capture('upgrade_modal_dismissed', { gate, current_tier: currentTier })
        },
        [ph]
    )
}

/** Coach clicked upgrade CTA — initiated the upgrade flow. */
export function useCaptureUpgradeInitiated() {
    const ph = usePostHog()
    return useCallback(
        (source: string, targetTier: SubscriptionTier, currentTier: SubscriptionTier) => {
            ph?.capture('upgrade_initiated', { source, target_tier: targetTier, current_tier: currentTier })
        },
        [ph]
    )
}

/** Coach completed registration — free or paid. */
export function useCaptureRegistration() {
    const ph = usePostHog()
    return useCallback(
        (tier: SubscriptionTier, billingCycle?: string) => {
            ph?.capture('coach_registered', { tier, billing_cycle: billingCycle ?? null })
        },
        [ph]
    )
}
