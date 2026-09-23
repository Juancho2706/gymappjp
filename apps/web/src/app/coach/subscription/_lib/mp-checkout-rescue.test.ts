import { describe, expect, it } from 'vitest'

import { MP_RESCUE_TTL_MS, parseMpRescueMark, serializeMpRescueMark } from './mp-checkout-rescue'

/**
 * Rescate «volvió de Mercado Pago sin pagar» (caso 23-09). La marca decide qué plan se
 * pre-selecciona al volver y viaja a create-preference: solo se acepta un intento RECIENTE de un
 * plan a la venta con un ciclo que ese plan admite.
 */
const NOW = Date.parse('2026-09-23T02:10:00Z')

describe('parseMpRescueMark', () => {
    it('acepta la marca que escribe el checkout (ida y vuelta)', () => {
        const raw = serializeMpRescueMark('pro', 'monthly', NOW - 60_000)
        expect(parseMpRescueMark(raw, NOW)).toEqual({ tier: 'pro', cycle: 'monthly', at: NOW - 60_000 })
    })

    it('acepta elite anual', () => {
        const raw = serializeMpRescueMark('elite', 'annual', NOW)
        expect(parseMpRescueMark(raw, NOW)).toEqual({ tier: 'elite', cycle: 'annual', at: NOW })
    })

    it('descarta una marca vencida (más vieja que el TTL)', () => {
        const raw = serializeMpRescueMark('pro', 'monthly', NOW - MP_RESCUE_TTL_MS - 1)
        expect(parseMpRescueMark(raw, NOW)).toBeNull()
    })

    it('descarta una marca con fecha futura', () => {
        const raw = serializeMpRescueMark('pro', 'monthly', NOW + 1)
        expect(parseMpRescueMark(raw, NOW)).toBeNull()
    })

    it('descarta free, tiers fuera de venta y tiers inventados', () => {
        for (const tier of ['free', 'growth', 'scale', 'starter', 'gold']) {
            expect(parseMpRescueMark(serializeMpRescueMark(tier, 'monthly', NOW), NOW)).toBeNull()
        }
    })

    it('descarta ciclos inexistentes', () => {
        expect(parseMpRescueMark(serializeMpRescueMark('pro', 'weekly', NOW), NOW)).toBeNull()
    })

    it('descarta basura: null, vacío, JSON roto, tipos incorrectos', () => {
        expect(parseMpRescueMark(null, NOW)).toBeNull()
        expect(parseMpRescueMark('', NOW)).toBeNull()
        expect(parseMpRescueMark('{nope', NOW)).toBeNull()
        expect(parseMpRescueMark('"pro"', NOW)).toBeNull()
        expect(parseMpRescueMark(JSON.stringify({ tier: 'pro', cycle: 'monthly', at: 'ayer' }), NOW)).toBeNull()
        expect(parseMpRescueMark(JSON.stringify({ tier: 'pro', cycle: 'monthly' }), NOW)).toBeNull()
    })
})
