import { describe, expect, it } from 'vitest'
import {
    TIER_RANK,
    getTierRank,
    comparePlanDirection,
    type SubscriptionTier,
} from './index'

// FUNDACION F1 (plan estrategia 06): orden total de tiers para decidir la dirección de un cambio
// de plan. Cubre los 6 tiers (incl. los LEGACY growth/scale) para que un coach grandfathered nunca
// produzca rank `undefined` al comparar contra un tier a la venta.

const ALL_TIERS: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']

describe('TIER_RANK / getTierRank — orden total sobre los 6 tiers', () => {
    it('mapea los 6 tiers a un rank numérico definido (ninguno undefined)', () => {
        for (const t of ALL_TIERS) {
            expect(typeof getTierRank(t)).toBe('number')
            expect(Number.isFinite(getTierRank(t))).toBe(true)
        }
    })

    it('rangos estrictamente crecientes free<starter<pro<elite<growth<scale', () => {
        expect(getTierRank('free')).toBe(0)
        expect(getTierRank('starter')).toBe(1)
        expect(getTierRank('pro')).toBe(2)
        expect(getTierRank('elite')).toBe(3)
        expect(getTierRank('growth')).toBe(4)
        expect(getTierRank('scale')).toBe(5)
        // monotonía estricta
        for (let i = 1; i < ALL_TIERS.length; i++) {
            expect(getTierRank(ALL_TIERS[i])).toBeGreaterThan(getTierRank(ALL_TIERS[i - 1]))
        }
    })

    it('TIER_RANK tiene exactamente las 6 claves del union', () => {
        expect(Object.keys(TIER_RANK).sort()).toEqual(
            ['elite', 'free', 'growth', 'pro', 'scale', 'starter']
        )
    })
})

describe('comparePlanDirection', () => {
    it('next mayor → upgrade', () => {
        expect(comparePlanDirection('free', 'starter')).toBe('upgrade')
        expect(comparePlanDirection('starter', 'pro')).toBe('upgrade')
        expect(comparePlanDirection('pro', 'elite')).toBe('upgrade')
    })

    it('next menor → downgrade', () => {
        expect(comparePlanDirection('elite', 'pro')).toBe('downgrade')
        expect(comparePlanDirection('pro', 'starter')).toBe('downgrade')
        expect(comparePlanDirection('starter', 'free')).toBe('downgrade')
    })

    it('mismo tier → same (el cambio de ciclo lo trata aparte el llamador)', () => {
        for (const t of ALL_TIERS) {
            expect(comparePlanDirection(t, t)).toBe('same')
        }
    })

    it('coach grandfathered (growth/scale) nunca produce rank undefined al comparar contra un tier a la venta', () => {
        // growth/scale están por ENCIMA de los tiers a la venta → bajar a elite/pro es downgrade.
        expect(comparePlanDirection('growth', 'elite')).toBe('downgrade')
        expect(comparePlanDirection('scale', 'pro')).toBe('downgrade')
        // y nunca da NaN/undefined.
        expect(comparePlanDirection('scale', 'free')).toBe('downgrade')
        expect(comparePlanDirection('free', 'scale')).toBe('upgrade')
    })
})
