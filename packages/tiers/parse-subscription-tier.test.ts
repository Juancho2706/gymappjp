import { describe, expect, it } from 'vitest'
import {
    LEGACY_TIER_ALIASES,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierCapabilities,
    getTierPriceClp,
    getTierRank,
    isBillingCycleAllowedForTier,
    isBrandingAllowed,
    parseSubscriptionTier,
    showsEvaBadge,
    type BillingCycle,
    type SubscriptionTier,
} from './index'

// Retiro de Starter (docs/specs/retiro-starter-y-enterprise, S1 «Blindaje»).
//
// Contrato ÚNICO que este archivo pinnea: «un tier fuera del catálogo se trata como free (precio 0,
// capabilities de free, ciclos [], rank 0)». La excepción también se pinnea: `isBrandingAllowed`
// sigue fail-closed y `showsEvaBadge` fail-open porque leen `TIER_CAPABILITIES` directo, sin pasar
// por `getTierCapabilities`.

/** Un valor que la columna `coaches.subscription_tier` podría traer y el union NO cubre. */
const TIER_DESCONOCIDO = 'legacy_unknown' as SubscriptionTier

const CICLOS: BillingCycle[] = ['monthly', 'quarterly', 'annual']

describe('tier fuera del catálogo ⇒ free en los 7 helpers blindados', () => {
    it('getTierPriceClp devuelve 0 en los 3 ciclos (money-path: nunca un NaN ni un TypeError)', () => {
        for (const ciclo of CICLOS) {
            expect(getTierPriceClp(TIER_DESCONOCIDO, ciclo)).toBe(0)
        }
    })

    it('getTierCapabilities devuelve las capabilities de free', () => {
        expect(getTierCapabilities(TIER_DESCONOCIDO)).toEqual(getTierCapabilities('free'))
    })

    it('getTierAllowedBillingCycles devuelve []', () => {
        expect(getTierAllowedBillingCycles(TIER_DESCONOCIDO)).toEqual([])
    })

    it('isBillingCycleAllowedForTier devuelve false en los 3 ciclos', () => {
        for (const ciclo of CICLOS) {
            expect(isBillingCycleAllowedForTier(TIER_DESCONOCIDO, ciclo)).toBe(false)
        }
    })

    it('getDefaultBillingCycleForTier cae al placeholder «monthly»', () => {
        expect(getDefaultBillingCycleForTier(TIER_DESCONOCIDO)).toBe('monthly')
    })

    it('getTierBillingCycleSummary no lanza y devuelve el copy de plan sin cobro', () => {
        expect(() => getTierBillingCycleSummary(TIER_DESCONOCIDO)).not.toThrow()
        expect(getTierBillingCycleSummary(TIER_DESCONOCIDO)).toBe('Plan gratuito')
    })

    it('getTierRank devuelve 0 (cuenta como free al comparar dirección de cambio de plan)', () => {
        expect(getTierRank(TIER_DESCONOCIDO)).toBe(0)
    })

    it('la excepción se mantiene: isBrandingAllowed fail-closed y showsEvaBadge fail-open', () => {
        expect(isBrandingAllowed(TIER_DESCONOCIDO)).toBe(false)
        expect(showsEvaBadge(TIER_DESCONOCIDO)).toBe(true)
    })
})

describe('parseSubscriptionTier — parser tolerante único del valor crudo de DB', () => {
    it.each<SubscriptionTier>(['free', 'pro', 'elite', 'growth', 'scale'])(
        'deja pasar el tier vivo «%s» tal cual',
        (tier) => {
            expect(parseSubscriptionTier(tier)).toBe(tier)
        }
    )

    it('degrada starter y starter_lite a free (retiro de Starter)', () => {
        expect(parseSubscriptionTier('starter')).toBe('free')
        expect(parseSubscriptionTier('starter_lite')).toBe('free')
    })

    it('normaliza mayúsculas antes de decidir', () => {
        expect(parseSubscriptionTier('STARTER')).toBe('free')
        expect(parseSubscriptionTier('PRO')).toBe('pro')
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['string vacío', ''],
        ['un número', 42],
        ['un objeto', {}],
    ])('degrada %s a free', (_caso, raw) => {
        expect(parseSubscriptionTier(raw)).toBe('free')
    })
})

describe('LEGACY_TIER_ALIASES — solo para deep-links de VENTA viejos', () => {
    it('mapea starter y starter_lite al plan que los reemplazó (pro)', () => {
        expect(LEGACY_TIER_ALIASES.starter).toBe('pro')
        expect(LEGACY_TIER_ALIASES.starter_lite).toBe('pro')
    })

    it('no es un catálogo: solo lleva los alias retirados', () => {
        expect(Object.keys(LEGACY_TIER_ALIASES).sort()).toEqual(['starter', 'starter_lite'])
    })

    it('NO es el camino de las filas de DB: ahí manda parseSubscriptionTier (⇒ free)', () => {
        expect(parseSubscriptionTier('starter')).not.toBe(LEGACY_TIER_ALIASES.starter)
    })
})
