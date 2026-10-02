import { describe, expect, it } from 'vitest'
import {
    PRICING_V2_CUTOVER,
    PRICING_V3_CUTOVER,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    getRecommendedTierFor,
    getTierMaxClients,
    getTierPriceClp,
    tierMaxClientsFor,
    type SubscriptionTier,
} from './index'

// Pricing v4 (docs/specs/pricing-v4, propuesta del socio traída por el owner 2026-10-02, opción A):
// Pro 2–10 · Elite 11–60 · precios sin cambio. Grandfather por COMPRA: el pagador al corte v4
// (`coaches.paid_caps_grandfathered = true`) conserva sus cupos pagos previos; todo el resto —los
// Free de hoy incluidos, aunque se hayan registrado antes— compra con el catálogo nuevo.

const PRE_V2 = '2026-01-15T12:00:00Z'
const IN_V2 = '2026-08-19T12:00:00Z'
const POST_V3 = '2026-09-15T12:00:00Z'
const AFTER_V4 = '2026-11-01T12:00:00Z'

describe('catálogo de venta v4', () => {
    it('free 1 · pro 10 · elite 60; growth/scale legacy intactos', () => {
        expect(getTierMaxClients('free')).toBe(1)
        expect(getTierMaxClients('pro')).toBe(10)
        expect(getTierMaxClients('elite')).toBe(60)
        expect(getTierMaxClients('growth')).toBe(120)
        expect(getTierMaxClients('scale')).toBe(500)
    })

    it('los rangos de venta son 2–10 y 11–60, contiguos con el cupo Free', () => {
        expect(TIER_STUDENT_RANGE_LABEL.pro).toBe('2–10 alumnos')
        expect(TIER_STUDENT_RANGE_LABEL.elite).toBe('11–60 alumnos')
        expect(TIER_CONFIG.free.maxClients + 1).toBe(2)
        expect(TIER_CONFIG.pro.maxClients + 1).toBe(11)
    })

    it('los precios NO cambian (decisión owner 2026-10-02)', () => {
        expect(getTierPriceClp('pro', 'monthly')).toBe(29990)
        expect(getTierPriceClp('elite', 'monthly')).toBe(44990)
    })
})

describe('tierMaxClientsFor — coach SIN marca (paidCapsGrandfathered = false)', () => {
    it('compra Pro ⇒ 10 y Elite ⇒ 60, sin importar su fecha de alta', () => {
        for (const createdAt of [PRE_V2, IN_V2, POST_V3, AFTER_V4, null]) {
            expect(tierMaxClientsFor('pro', createdAt, false)).toBe(10)
            expect(tierMaxClientsFor('elite', createdAt, false)).toBe(60)
        }
    })

    it('un Free VIEJO (pre-v2) que compra Elite recibe 60, no los 100 del mundo pre-v2', () => {
        expect(tierMaxClientsFor('elite', PRE_V2, false)).toBe(60)
    })

    it('la escalera de fecha del Free NO cambia con v4 (3 / 2 / 1)', () => {
        expect(tierMaxClientsFor('free', PRE_V2, false)).toBe(3)
        expect(tierMaxClientsFor('free', IN_V2, false)).toBe(2)
        expect(tierMaxClientsFor('free', POST_V3, false)).toBe(1)
    })

    it('tier fuera del union sigue cayendo al piso de free de su tramo', () => {
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, PRE_V2, false)).toBe(3)
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, POST_V3, false)).toBe(1)
    })
})

describe('tierMaxClientsFor — pagador al corte v4 (paidCapsGrandfathered = true)', () => {
    it('pro viejo (pre-v2) conserva 30 al renovar o recomprar', () => {
        expect(tierMaxClientsFor('pro', PRE_V2, true)).toBe(30)
        expect(tierMaxClientsFor('pro', new Date(Date.parse(PRICING_V2_CUTOVER) - 1), true)).toBe(30)
    })

    it('pro de la ventana v2 o posterior a v3 conserva 25', () => {
        expect(tierMaxClientsFor('pro', PRICING_V2_CUTOVER, true)).toBe(25)
        expect(tierMaxClientsFor('pro', IN_V2, true)).toBe(25)
        expect(tierMaxClientsFor('pro', PRICING_V3_CUTOVER, true)).toBe(25)
        expect(tierMaxClientsFor('pro', POST_V3, true)).toBe(25)
    })

    it('elite conserva 100 (pre-v2) o 60; growth/scale su techo', () => {
        expect(tierMaxClientsFor('elite', PRE_V2, true)).toBe(100)
        expect(tierMaxClientsFor('elite', POST_V3, true)).toBe(60)
        expect(tierMaxClientsFor('growth', POST_V3, true)).toBe(120)
        expect(tierMaxClientsFor('scale', POST_V3, true)).toBe(500)
    })

    it('si vuelve a Free, su cupo Free sigue la escalera de fecha (v4 no lo toca)', () => {
        expect(tierMaxClientsFor('free', PRE_V2, true)).toBe(3)
        expect(tierMaxClientsFor('free', POST_V3, true)).toBe(1)
    })
})

describe('tierMaxClientsFor — marca desconocida (null/undefined) ⇒ fail-safe generoso', () => {
    it('se comporta como pagador grandfathered (nunca le quita cupo a nadie)', () => {
        for (const flag of [null, undefined]) {
            expect(tierMaxClientsFor('pro', PRE_V2, flag)).toBe(30)
            expect(tierMaxClientsFor('pro', POST_V3, flag)).toBe(25)
            expect(tierMaxClientsFor('elite', PRE_V2, flag)).toBe(100)
            expect(tierMaxClientsFor('free', POST_V3, flag)).toBe(1)
        }
    })
})

describe('getRecommendedTierFor con la marca v4', () => {
    it('coach sin marca: 2–10 ⇒ pro, 11–60 ⇒ elite', () => {
        expect(getRecommendedTierFor(2, POST_V3, false)).toBe('pro')
        expect(getRecommendedTierFor(10, POST_V3, false)).toBe('pro')
        expect(getRecommendedTierFor(11, POST_V3, false)).toBe('elite')
        expect(getRecommendedTierFor(15, PRE_V2, false)).toBe('elite')
    })

    it('ex-pagador con 15 o 28 alumnos ⇒ pro (su Pro es de 25/30), no elite', () => {
        expect(getRecommendedTierFor(15, POST_V3, true)).toBe('pro')
        expect(getRecommendedTierFor(28, PRE_V2, true)).toBe('pro')
        expect(getRecommendedTierFor(28, POST_V3, true)).toBe('elite')
    })
})
