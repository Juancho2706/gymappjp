import { describe, expect, it } from 'vitest'
import { parseCheckoutExternalReference } from './checkout-external-reference'

describe('parseCheckoutExternalReference', () => {
    it('parses coach tier and cycle', () => {
        const r = parseCheckoutExternalReference('uuid-1|pro|monthly')
        expect(r).toEqual({
            coachId: 'uuid-1',
            tier: 'pro',
            billingCycle: 'monthly',
        })
    })

    it('returns coachId only when reference is incomplete', () => {
        expect(parseCheckoutExternalReference('uuid-1')).toEqual({
            coachId: 'uuid-1',
            tier: null,
            billingCycle: null,
        })
    })

    it('rejects invalid tier', () => {
        const r = parseCheckoutExternalReference('uuid-1|nope|monthly')
        expect(r?.coachId).toBe('uuid-1')
        expect(r?.tier).toBeNull()
    })
})
