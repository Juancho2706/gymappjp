import { describe, expect, it } from 'vitest'
import { mapProviderStatus, resolveCurrentPeriodEnd, resolveTerminalEvent } from '@/lib/payments/subscription-state'

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

describe('resolveTerminalEvent', () => {
    it('expires a paid coach on a rejected/expired event', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'expired', periodExpiredOrNull: true, subscriptionTier: 'pro' })
        ).toBe('expire')
    })

    it('expires a paid coach on a cancellation once the paid period has lapsed', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: true, subscriptionTier: 'starter' })
        ).toBe('expire')
    })

    it('does not block a cancellation while the paid period is still active', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: false, subscriptionTier: 'pro' })
        ).toBe('none')
    })

    it('ignores a stale terminal event for a free-tier coach (activate-free race)', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'canceled', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('ignore-free')
        expect(
            resolveTerminalEvent({ statusForUpdate: 'expired', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('ignore-free')
    })

    it('returns none for non-terminal events', () => {
        expect(
            resolveTerminalEvent({ statusForUpdate: 'active', periodExpiredOrNull: true, subscriptionTier: 'pro' })
        ).toBe('none')
        expect(
            resolveTerminalEvent({ statusForUpdate: 'pending_payment', periodExpiredOrNull: true, subscriptionTier: 'free' })
        ).toBe('none')
    })

    // El hueco del caso Joaquin (19-08): un decline de renovación con período PAGADO vigente
    // expulsaba al coach con días pagados adentro. La decisión vive en el status CRUDO del
    // gateway porque mapProviderStatus colapsa rejected/refunded/charged_back en 'expired'.
    it('grants dunning grace on a rejected renewal while the paid period is still running', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'pro',
                providerStatus: 'rejected',
            })
        ).toBe('past-due')
    })

    it('still expires a rejected renewal once the paid period has lapsed (Joaquin timing)', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: true,
                subscriptionTier: 'pro',
                providerStatus: 'rejected',
            })
        ).toBe('expire')
    })

    it('refund/chargeback expire on the spot even with a running period — the money went back', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'elite',
                providerStatus: 'refunded',
            })
        ).toBe('expire')
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'pro',
                providerStatus: 'charged_back',
            })
        ).toBe('expire')
    })

    it('free tier keeps its guard even on a rejected renewal with a running period', () => {
        expect(
            resolveTerminalEvent({
                statusForUpdate: 'expired',
                periodExpiredOrNull: false,
                subscriptionTier: 'free',
                providerStatus: 'rejected',
            })
        ).toBe('ignore-free')
    })
})
