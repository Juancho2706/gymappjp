import { describe, expect, it } from 'vitest'
import {
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
} from './constants'

describe('subscription constants', () => {
    it('applies quarterly and annual discounts correctly', () => {
        const monthly = getTierPriceClp('starter', 'monthly')
        const quarterly = getTierPriceClp('starter', 'quarterly')
        const annual = getTierPriceClp('starter', 'annual')

        expect(monthly).toBe(19990)
        expect(quarterly).toBeLessThan(monthly * 3)
        expect(annual).toBeLessThan(monthly * 12)
    })

    it('returns max clients and capabilities by tier', () => {
        expect(getTierMaxClients('starter_lite')).toBe(5)
        expect(getTierMaxClients('pro')).toBe(30)
        expect(getTierCapabilities('starter_lite').canUseNutrition).toBe(false)
        expect(getTierCapabilities('starter_lite').canUseBranding).toBe(true)
        expect(getTierCapabilities('starter').canUseNutrition).toBe(false)
        expect(getTierCapabilities('pro').canUseNutrition).toBe(true)
        expect(getTierCapabilities('pro').canUseBranding).toBe(true)
    })

    it('enforces allowed billing cycles by tier', () => {
        expect(isBillingCycleAllowedForTier('starter_lite', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('starter_lite', 'quarterly')).toBe(false)
        expect(isBillingCycleAllowedForTier('pro', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'monthly')).toBe(false)
        expect(isBillingCycleAllowedForTier('elite', 'annual')).toBe(true)
    })
})
