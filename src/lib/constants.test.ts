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
        expect(getTierMaxClients('starter')).toBe(10)
        expect(getTierMaxClients('pro')).toBe(30)
        expect(getTierCapabilities('starter').canUseNutrition).toBe(false)
        expect(getTierCapabilities('starter').canUseBranding).toBe(true)
        expect(getTierCapabilities('pro').canUseNutrition).toBe(true)
        expect(getTierCapabilities('pro').canUseBranding).toBe(true)
    })

    it('enforces allowed billing cycles by tier', () => {
        expect(isBillingCycleAllowedForTier('starter', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('starter', 'quarterly')).toBe(false)
        expect(isBillingCycleAllowedForTier('pro', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'quarterly')).toBe(false)
        expect(isBillingCycleAllowedForTier('elite', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('scale', 'monthly')).toBe(true)
    })
})
