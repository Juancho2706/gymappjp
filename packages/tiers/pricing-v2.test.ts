import { describe, expect, it } from 'vitest'
import {
    PRICING_V2_CUTOVER,
    SALE_TIERS,
    TIER_CONFIG,
    getRecommendedTier,
    getRecommendedTierFor,
    getTierCapabilities,
    getTierMaxClients,
    isSaleTier,
    tierMaxClientsFor,
    type SubscriptionTier,
} from './index'

// Pricing v2 (specs/pricing-v2): catálogo nuevo free 2 / pro 25 / elite 60, starter fuera de
// venta, y grandfather por fecha de creación (regla del dueño, literal: «los pro actuales
// retienen sus 30; los free actuales retienen sus 3; y los demás archivados igual»).

const BEFORE_CUTOVER_ISO = '2026-01-15T12:00:00Z'
const AFTER_CUTOVER_ISO = '2026-09-01T00:00:00Z'

describe('PRICING_V2_CUTOVER', () => {
    it('es la fecha del deploy en ISO UTC y parsea a un instante válido', () => {
        expect(PRICING_V2_CUTOVER).toBe('2026-08-18T00:00:00Z')
        expect(Number.isFinite(Date.parse(PRICING_V2_CUTOVER))).toBe(true)
    })
})

describe('tierMaxClientsFor — grandfather por fecha de creación (P2)', () => {
    // [tier, límite viejo (pre-corte), límite nuevo (post-corte)]
    const CASES: Array<[SubscriptionTier, number, number]> = [
        ['free', 3, 2],
        ['starter', 10, 10], // starter no cambia de límite: solo sale de la VENTA
        ['pro', 30, 25],
        ['elite', 100, 60],
    ]

    for (const [tier, oldLimit, newLimit] of CASES) {
        describe(tier, () => {
            it(`coach creado ANTES del corte conserva ${oldLimit} (string ISO)`, () => {
                expect(tierMaxClientsFor(tier, BEFORE_CUTOVER_ISO)).toBe(oldLimit)
            })

            it(`coach creado DESPUÉS del corte entra con ${newLimit} (string ISO)`, () => {
                expect(tierMaxClientsFor(tier, AFTER_CUTOVER_ISO)).toBe(newLimit)
            })

            it('acepta Date además de string, a ambos lados del corte', () => {
                expect(tierMaxClientsFor(tier, new Date(BEFORE_CUTOVER_ISO))).toBe(oldLimit)
                expect(tierMaxClientsFor(tier, new Date(AFTER_CUTOVER_ISO))).toBe(newLimit)
            })

            it('fecha null ⇒ tratar como coach VIEJO (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, null)).toBe(oldLimit)
            })

            it('fecha undefined ⇒ tratar como coach VIEJO (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, undefined)).toBe(oldLimit)
            })

            it('fecha inválida ⇒ tratar como coach VIEJO (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, 'no-es-una-fecha')).toBe(oldLimit)
                expect(tierMaxClientsFor(tier, '')).toBe(oldLimit)
                expect(tierMaxClientsFor(tier, new Date('invalid'))).toBe(oldLimit)
            })
        })
    }

    it('el corte es inclusivo: creado EXACTO en el corte ⇒ límites nuevos; 1ms antes ⇒ viejos', () => {
        expect(tierMaxClientsFor('pro', PRICING_V2_CUTOVER)).toBe(25)
        expect(tierMaxClientsFor('pro', new Date(Date.parse(PRICING_V2_CUTOVER) - 1))).toBe(30)
    })

    it('growth/scale (legacy puros) mantienen su techo a ambos lados del corte', () => {
        for (const date of [BEFORE_CUTOVER_ISO, AFTER_CUTOVER_ISO, null]) {
            expect(tierMaxClientsFor('growth', date)).toBe(120)
            expect(tierMaxClientsFor('scale', date)).toBe(500)
        }
    })

    it('tier fuera del union (string arbitrario de DB) cae al piso de free, no crashea', () => {
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, BEFORE_CUTOVER_ISO)).toBe(3)
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, AFTER_CUTOVER_ISO)).toBe(2)
    })
})

describe('TIER_CONFIG.maxClients — catálogo de VENTA (coaches nuevos)', () => {
    it('free 2 / starter 10 / pro 25 / elite 60; growth/scale intactos', () => {
        expect(getTierMaxClients('free')).toBe(2)
        expect(getTierMaxClients('starter')).toBe(10)
        expect(getTierMaxClients('pro')).toBe(25)
        expect(getTierMaxClients('elite')).toBe(60)
        expect(getTierMaxClients('growth')).toBe(120)
        expect(getTierMaxClients('scale')).toBe(500)
    })

    it('los precios CLP NO cambian en esta tanda (el IVA es otro estudio)', () => {
        expect(TIER_CONFIG.free.monthlyPriceClp).toBe(0)
        expect(TIER_CONFIG.pro.monthlyPriceClp).toBe(29990)
        expect(TIER_CONFIG.elite.monthlyPriceClp).toBe(44990)
        expect(TIER_CONFIG.starter.monthlyPriceClp).toBe(19990)
    })
})

describe('capabilities de free — todo liberado EXCEPTO branding (P1/P4)', () => {
    it('snapshot completo de free', () => {
        expect(getTierCapabilities('free')).toEqual({
            canUseNutrition: true,
            canUseBranding: false, // white-label sigue siendo Pro+ ENTERO
            canUseAdvancedReports: false, // gate aún no activo — sin cambio en esta tanda
            canCreateCustomExercises: true,
            canImportClients: true,
        })
    })

    it('starter (fuera de venta) conserva su set histórico grandfathered', () => {
        expect(getTierCapabilities('starter')).toEqual({
            canUseNutrition: false,
            canUseBranding: false,
            canUseAdvancedReports: true,
            canCreateCustomExercises: true,
            canImportClients: true,
        })
    })
})

describe('SALE_TIERS — starter fuera de venta (P1)', () => {
    it('la venta es exactamente free/pro/elite, en orden', () => {
        expect([...SALE_TIERS]).toEqual(['free', 'pro', 'elite'])
    })

    it('isSaleTier rechaza starter pero starter SIGUE en el union/TIER_CONFIG (histórico)', () => {
        expect(isSaleTier('starter')).toBe(false)
        expect(TIER_CONFIG.starter).toBeDefined()
        expect(TIER_CONFIG.starter.maxClients).toBe(10)
    })

    it('getRecommendedTier ya no recomienda starter: 3..25 alumnos ⇒ pro', () => {
        expect(getRecommendedTier(0)).toBe('free')
        expect(getRecommendedTier(2)).toBe('free')
        expect(getRecommendedTier(3)).toBe('pro')
        expect(getRecommendedTier(8)).toBe('pro')
        expect(getRecommendedTier(25)).toBe('pro')
        expect(getRecommendedTier(26)).toBe('elite')
        expect(getRecommendedTier(60)).toBe('elite')
        // sobre el techo de elite: fallback elite (el puente Teams lo maneja la UI)
        expect(getRecommendedTier(61)).toBe('elite')
    })
})

describe('getRecommendedTierFor — recomendación con grandfather (waves B)', () => {
    it('coach VIEJO con 28 alumnos ⇒ pro (su límite real es 30, no 25)', () => {
        expect(getRecommendedTierFor(28, BEFORE_CUTOVER_ISO)).toBe('pro')
        // El mismo conteo para un coach NUEVO ⇒ elite (pro nuevo tope 25).
        expect(getRecommendedTierFor(28, AFTER_CUTOVER_ISO)).toBe('elite')
    })

    it('coach VIEJO con 3 alumnos ⇒ free (límite viejo 3); nuevo con 3 ⇒ pro (free nuevo tope 2)', () => {
        expect(getRecommendedTierFor(3, BEFORE_CUTOVER_ISO)).toBe('free')
        expect(getRecommendedTierFor(3, AFTER_CUTOVER_ISO)).toBe('pro')
    })

    it('fecha null/desconocida ⇒ fail-safe viejo (mismo criterio que tierMaxClientsFor)', () => {
        expect(getRecommendedTierFor(28, null)).toBe('pro')
        expect(getRecommendedTierFor(3, undefined)).toBe('free')
    })

    it('sobre el techo de elite en ambos mundos ⇒ elite (el puente Teams lo maneja la UI)', () => {
        expect(getRecommendedTierFor(150, BEFORE_CUTOVER_ISO)).toBe('elite')
        expect(getRecommendedTierFor(150, AFTER_CUTOVER_ISO)).toBe('elite')
    })
})
