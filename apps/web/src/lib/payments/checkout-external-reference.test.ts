import { describe, expect, it } from 'vitest'
import { parseCheckoutExternalReference } from './checkout-external-reference'

describe('parseCheckoutExternalReference', () => {
    it('parses coach tier and cycle', () => {
        const r = parseCheckoutExternalReference('uuid-1|pro|monthly')
        expect(r).toEqual({
            coachId: 'uuid-1',
            tier: 'pro',
            billingCycle: 'monthly',
            addons: [],
        })
    })

    it('parses elite monthly checkout reference', () => {
        const r = parseCheckoutExternalReference('uuid-2|elite|monthly')
        expect(r).toEqual({
            coachId: 'uuid-2',
            tier: 'elite',
            billingCycle: 'monthly',
            addons: [],
        })
    })

    it('returns coachId only when reference is incomplete', () => {
        expect(parseCheckoutExternalReference('uuid-1')).toEqual({
            coachId: 'uuid-1',
            tier: null,
            billingCycle: null,
            addons: [],
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
            addons: [],
        })
    })

    // Ciclo trimestral recién habilitado en starter/pro (decisión dueño 2026-06-11).
    it('parses starter with the newly allowed quarterly cycle', () => {
        const r = parseCheckoutExternalReference('uuid-4|starter|quarterly')
        expect(r).toEqual({
            coachId: 'uuid-4',
            tier: 'starter',
            billingCycle: 'quarterly',
            addons: [],
        })
    })

    // ── 4ª parte opcional: add-ons (plan 05 F2) ──────────────────────────────────
    describe('add-ons (4ª parte opcional)', () => {
        it('parses a single add-on', () => {
            const r = parseCheckoutExternalReference('uuid-5|pro|monthly|cardio')
            expect(r).toEqual({
                coachId: 'uuid-5',
                tier: 'pro',
                billingCycle: 'monthly',
                addons: ['cardio'],
            })
        })

        it('parses multiple add-ons joined by +', () => {
            const r = parseCheckoutExternalReference(
                'uuid-6|pro|annual|cardio+nutrition_exchanges'
            )
            expect(r).toEqual({
                coachId: 'uuid-6',
                tier: 'pro',
                billingCycle: 'annual',
                addons: ['cardio', 'nutrition_exchanges'],
            })
        })

        it('drops invalid add-on keys but keeps the valid ones', () => {
            const r = parseCheckoutExternalReference('uuid-7|pro|monthly|cardio+nope+body_composition')
            expect(r?.addons).toEqual(['cardio', 'body_composition'])
        })

        it('returns [] when all add-on keys are invalid', () => {
            const r = parseCheckoutExternalReference('uuid-8|pro|monthly|nope+invalid')
            expect(r?.addons).toEqual([])
        })

        it('collapses duplicate add-on keys', () => {
            const r = parseCheckoutExternalReference('uuid-9|pro|monthly|cardio+cardio')
            expect(r?.addons).toEqual(['cardio'])
        })

        it('keeps add-ons even when tier/cycle are missing', () => {
            const r = parseCheckoutExternalReference('uuid-10|||cardio')
            expect(r).toEqual({
                coachId: 'uuid-10',
                tier: null,
                billingCycle: null,
                addons: ['cardio'],
            })
        })
    })

    // ── Round-trip: legacy de 3 partes sigue válido (backward compatible) ──────────
    it('parses a legacy 3-part reference with empty addons (backward compatible)', () => {
        const r = parseCheckoutExternalReference('uuid-11|elite|annual')
        expect(r).toEqual({
            coachId: 'uuid-11',
            tier: 'elite',
            billingCycle: 'annual',
            addons: [],
        })
    })

    it('does NOT confuse a one-shot reference with a subscription one (coachId is the literal token)', () => {
        // addon_oneshot|coachId|moduleKey|termsVersion — la 1ª parte no es un uuid de coach,
        // por lo que el parser de suscripción lo trata como coachId='addon_oneshot' y tier inválido.
        const r = parseCheckoutExternalReference('addon_oneshot|uuid-x|cardio|v1-2026-06')
        expect(r?.coachId).toBe('addon_oneshot')
        expect(r?.tier).toBeNull()
        expect(r?.billingCycle).toBeNull()
    })
})
