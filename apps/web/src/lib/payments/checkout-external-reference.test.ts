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

    it('parses elite monthly checkout reference', () => {
        const r = parseCheckoutExternalReference('uuid-2|elite|monthly')
        expect(r).toEqual({
            coachId: 'uuid-2',
            tier: 'elite',
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

    // Grandfather (D4 del plan 04): un preapproval growth/scale EN VUELO debe seguir
    // resolviendo tier+ciclo. TIER_CONFIG conserva las 6 entradas como runtime legacy,
    // por lo que el parse acepta growth aunque growth ya no esté a la venta.
    it('parses legacy growth tier (grandfathered preapproval in flight)', () => {
        const r = parseCheckoutExternalReference('uuid-3|growth|quarterly')
        expect(r).toEqual({
            coachId: 'uuid-3',
            tier: 'growth',
            billingCycle: 'quarterly',
        })
    })

    // Ciclo trimestral recién habilitado en starter/pro (decisión dueño 2026-06-11).
    it('parses starter with the newly allowed quarterly cycle', () => {
        const r = parseCheckoutExternalReference('uuid-4|starter|quarterly')
        expect(r).toEqual({
            coachId: 'uuid-4',
            tier: 'starter',
            billingCycle: 'quarterly',
        })
    })
})
