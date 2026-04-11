import { describe, expect, it } from 'vitest'
import { mapProviderStatus, resolveCurrentPeriodEnd } from '@/lib/payments/subscription-state'

describe('mapProviderStatus', () => {
    it('maps trialing', () => {
        expect(mapProviderStatus('trialing')).toBe('trialing')
    })

    it('maps authorized to active', () => {
        expect(mapProviderStatus('authorized')).toBe('active')
    })
})

describe('resolveCurrentPeriodEnd', () => {
    it('computes period for trialing like active when provider gives date', () => {
        const end = resolveCurrentPeriodEnd({
            status: 'trialing',
            billingCycle: 'monthly',
            currentPeriodEnd: null,
            providerCurrentPeriodEnd: '2030-01-01T00:00:00.000Z',
        })
        expect(end).toBe('2030-01-01T00:00:00.000Z')
    })

    it('returns null for canceled', () => {
        expect(
            resolveCurrentPeriodEnd({
                status: 'canceled',
                billingCycle: 'monthly',
                providerCurrentPeriodEnd: '2030-01-01T00:00:00.000Z',
            })
        ).toBeNull()
    })
})
