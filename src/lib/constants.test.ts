import { describe, expect, it } from 'vitest'
import { getTierCapabilities, getTierMaxClients, getTierPriceClp } from './constants'

describe('subscription constants', () => {
    it('applies quarterly and annual discounts correctly', () => {
        const monthly = getTierPriceClp('starter', 'monthly')
        const quarterly = getTierPriceClp('starter', 'quarterly')
        const annual = getTierPriceClp('starter', 'annual')

        expect(monthly).toBe(14990)
        expect(quarterly).toBeLessThan(monthly * 3)
        expect(annual).toBeLessThan(monthly * 12)
    })

    it('returns max clients and capabilities by tier', () => {
        expect(getTierMaxClients('starter_lite')).toBe(5)
        expect(getTierCapabilities('starter_lite').canUseNutrition).toBe(false)
        expect(getTierCapabilities('pro').canUseBranding).toBe(true)
    })
})
