import {
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

export type ParsedCheckoutExternalReference = {
    coachId: string
    tier: SubscriptionTier | null
    billingCycle: BillingCycle | null
}

/** Mercado Pago `external_reference` format: `coachId|tier|billingCycle` */
export function parseCheckoutExternalReference(
    reference?: string | null
): ParsedCheckoutExternalReference | null {
    if (!reference) return null
    const parts = reference.split('|')
    const coachId = parts[0]?.trim()
    if (!coachId) return null

    const tierRaw = parts[1]?.trim()
    const cycleRaw = parts[2]?.trim()
    if (!tierRaw || !cycleRaw) return { coachId, tier: null, billingCycle: null }

    if (!(tierRaw in TIER_CONFIG)) return { coachId, tier: null, billingCycle: null }
    const tier = tierRaw as SubscriptionTier

    if (cycleRaw !== 'monthly' && cycleRaw !== 'quarterly' && cycleRaw !== 'annual') {
        return { coachId, tier, billingCycle: null }
    }
    const billingCycle = cycleRaw as BillingCycle
    if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
        return { coachId, tier, billingCycle: null }
    }
    return { coachId, tier, billingCycle }
}
