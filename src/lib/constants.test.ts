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
        expect(isBillingCycleAllowedForTier('starter', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'quarterly')).toBe(false)
        expect(isBillingCycleAllowedForTier('pro', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('scale', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('free', 'monthly')).toBe(false)
        expect(isBillingCycleAllowedForTier('free', 'annual')).toBe(false)
        expect(isBillingCycleAllowedForTier('growth', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('growth', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('growth', 'annual')).toBe(true)
    })

    it('free tier — zero price, 3 clients, no features', () => {
        expect(getTierMaxClients('free')).toBe(3)
        expect(getTierPriceClp('free', 'monthly')).toBe(0)
        expect(getTierCapabilities('free').canUseNutrition).toBe(false)
        expect(getTierCapabilities('free').canUseBranding).toBe(false)
        expect(getTierCapabilities('free').canUseAdvancedReports).toBe(false)
    })

    it('growth tier — 120 clients, full features, correct price', () => {
        expect(getTierMaxClients('growth')).toBe(120)
        expect(getTierPriceClp('growth', 'monthly')).toBe(84990)
        expect(getTierPriceClp('growth', 'quarterly')).toBeLessThan(84990 * 3)
        expect(getTierPriceClp('growth', 'annual')).toBeLessThan(84990 * 12)
        expect(getTierCapabilities('growth').canUseNutrition).toBe(true)
        expect(getTierCapabilities('growth').canUseBranding).toBe(true)
    })
})
