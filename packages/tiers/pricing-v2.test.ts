import { describe, expect, it } from 'vitest'
import {
    PRICING_V2_CUTOVER,
    PRICING_V3_CUTOVER,
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

// Archivo HISTÓRICO de pricing v2 (specs/pricing-v2): fija el corte del 18-08 y el grandfather por
// fecha de creación (regla del dueño, literal: «los pro actuales retienen sus 30; los free actuales
// retienen sus 3; y los demás archivados igual»).
//
// Pricing v3 (specs/pricing-v3, owner 2026-08-21) NO borra ese contrato: le agrega un tercer
// peldaño (free 2 → 1) y abre el white-label a todos los planes vendidos. Las expectativas de acá
// se corrigieron a la escalera de 3 tramos; lo específico de v3 vive en ./pricing-v3.test.ts.

const BEFORE_V2_ISO = '2026-01-15T12:00:00Z'
// Último instante del mundo pre-v2 (1s antes del corte v2).
const LAST_PRE_V2_ISO = '2026-08-17T23:59:59Z'
// Ventana v2: desde el corte v2 (inclusive) hasta el corte v3 (exclusive).
const FIRST_V2_ISO = PRICING_V2_CUTOVER
const LAST_V2_ISO = '2026-08-20T23:59:59Z'
// Mundo v3: el corte v3 es inclusivo.
const FIRST_V3_ISO = PRICING_V3_CUTOVER
const AFTER_V3_ISO = '2026-09-01T00:00:00Z'

describe('PRICING_V2_CUTOVER', () => {
    it('es la fecha del deploy en ISO UTC y parsea a un instante válido', () => {
        expect(PRICING_V2_CUTOVER).toBe('2026-08-18T00:00:00Z')
        expect(Number.isFinite(Date.parse(PRICING_V2_CUTOVER))).toBe(true)
    })

    it('el corte v3 es POSTERIOR al v2 (la escalera nunca se invierte)', () => {
        expect(Date.parse(PRICING_V3_CUTOVER)).toBeGreaterThan(Date.parse(PRICING_V2_CUTOVER))
    })
})

describe('tierMaxClientsFor — escalera de 3 peldaños por fecha de creación (P2 + v3 D4)', () => {
    // [tier, límite pre-v2, límite en la ventana v2, límite v3]
    const CASES: Array<[SubscriptionTier, number, number, number]> = [
        ['free', 3, 2, 1],
        ['starter', 10, 10, 10], // starter no cambia de límite en ningún corte: solo sale de la VENTA
        ['pro', 30, 25, 25],
        ['elite', 100, 60, 60],
    ]

    for (const [tier, preV2, inV2, inV3] of CASES) {
        describe(tier, () => {
            it(`coach creado ANTES del corte v2 conserva ${preV2} (string ISO)`, () => {
                expect(tierMaxClientsFor(tier, BEFORE_V2_ISO)).toBe(preV2)
                expect(tierMaxClientsFor(tier, LAST_PRE_V2_ISO)).toBe(preV2)
            })

            it(`coach creado en la ventana v2 (18-08 a 20-08) entra con ${inV2}`, () => {
                expect(tierMaxClientsFor(tier, FIRST_V2_ISO)).toBe(inV2)
                expect(tierMaxClientsFor(tier, LAST_V2_ISO)).toBe(inV2)
            })

            it(`coach creado DESDE el corte v3 entra con ${inV3}`, () => {
                expect(tierMaxClientsFor(tier, FIRST_V3_ISO)).toBe(inV3)
                expect(tierMaxClientsFor(tier, AFTER_V3_ISO)).toBe(inV3)
            })

            it('acepta Date además de string, en los 3 tramos', () => {
                expect(tierMaxClientsFor(tier, new Date(BEFORE_V2_ISO))).toBe(preV2)
                expect(tierMaxClientsFor(tier, new Date(LAST_V2_ISO))).toBe(inV2)
                expect(tierMaxClientsFor(tier, new Date(AFTER_V3_ISO))).toBe(inV3)
            })

            it('fecha null ⇒ tratar como coach PRE-v2 (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, null)).toBe(preV2)
            })

            it('fecha undefined ⇒ tratar como coach PRE-v2 (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, undefined)).toBe(preV2)
            })

            it('fecha inválida ⇒ tratar como coach PRE-v2 (fail-safe generoso)', () => {
                expect(tierMaxClientsFor(tier, 'no-es-una-fecha')).toBe(preV2)
                expect(tierMaxClientsFor(tier, '')).toBe(preV2)
                expect(tierMaxClientsFor(tier, new Date('invalid'))).toBe(preV2)
            })
        })
    }

    it('el corte v2 es inclusivo: creado EXACTO en el corte ⇒ límites v2; 1ms antes ⇒ pre-v2', () => {
        expect(tierMaxClientsFor('pro', PRICING_V2_CUTOVER)).toBe(25)
        expect(tierMaxClientsFor('pro', new Date(Date.parse(PRICING_V2_CUTOVER) - 1))).toBe(30)
        expect(tierMaxClientsFor('free', PRICING_V2_CUTOVER)).toBe(2)
        expect(tierMaxClientsFor('free', new Date(Date.parse(PRICING_V2_CUTOVER) - 1))).toBe(3)
    })

    it('el corte v3 es inclusivo: creado EXACTO en el corte ⇒ free 1; 1ms antes ⇒ free 2', () => {
        expect(tierMaxClientsFor('free', PRICING_V3_CUTOVER)).toBe(1)
        expect(tierMaxClientsFor('free', new Date(Date.parse(PRICING_V3_CUTOVER) - 1))).toBe(2)
        // pro/elite NO se mueven en v3: el corte solo baja el free.
        expect(tierMaxClientsFor('pro', new Date(Date.parse(PRICING_V3_CUTOVER) - 1))).toBe(25)
        expect(tierMaxClientsFor('elite', new Date(Date.parse(PRICING_V3_CUTOVER) - 1))).toBe(60)
    })

    it('growth/scale (legacy puros) mantienen su techo en los 3 tramos', () => {
        for (const date of [BEFORE_V2_ISO, LAST_V2_ISO, AFTER_V3_ISO, null]) {
            expect(tierMaxClientsFor('growth', date)).toBe(120)
            expect(tierMaxClientsFor('scale', date)).toBe(500)
        }
    })

    it('tier fuera del union (string arbitrario de DB) cae al piso de free de SU tramo, no crashea', () => {
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, BEFORE_V2_ISO)).toBe(3)
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, LAST_V2_ISO)).toBe(2)
        expect(tierMaxClientsFor('enterprise' as SubscriptionTier, AFTER_V3_ISO)).toBe(1)
    })
})

describe('TIER_CONFIG.maxClients — catálogo de VENTA (coaches nuevos)', () => {
    it('free 1 (pricing v3) / starter 10 / pro 25 / elite 60; growth/scale intactos', () => {
        expect(getTierMaxClients('free')).toBe(1)
        expect(getTierMaxClients('starter')).toBe(10)
        expect(getTierMaxClients('pro')).toBe(25)
        expect(getTierMaxClients('elite')).toBe(60)
        expect(getTierMaxClients('growth')).toBe(120)
        expect(getTierMaxClients('scale')).toBe(500)
    })

    // Gap 2 del estudio de pricing (04-09): ningún tier ilegible puede resolverse a un plan PAGO.
    // `getTierMaxClients` hacía `TIER_CONFIG[tier].maxClients` directo y un valor fuera del union
    // (columna drifteada, form manipulado) reventaba con TypeError en pleno alta/gate.
    it('tier fuera del union → cupo de FREE, nunca starter ni un throw', () => {
        expect(getTierMaxClients('enterprise' as SubscriptionTier)).toBe(TIER_CONFIG.free.maxClients)
        expect(getTierMaxClients('' as SubscriptionTier)).toBe(TIER_CONFIG.free.maxClients)
        expect(getTierMaxClients('enterprise' as SubscriptionTier)).not.toBe(TIER_CONFIG.starter.maxClients)
    })

    it('los precios CLP NO cambian en pricing v3 (el IVA es otro estudio)', () => {
        expect(TIER_CONFIG.free.monthlyPriceClp).toBe(0)
        expect(TIER_CONFIG.pro.monthlyPriceClp).toBe(29990)
        expect(TIER_CONFIG.elite.monthlyPriceClp).toBe(44990)
        expect(TIER_CONFIG.starter.monthlyPriceClp).toBe(19990)
    })
})

describe('capabilities de free — TODO liberado, white-label incluido (pricing v3)', () => {
    it('snapshot completo de free', () => {
        expect(getTierCapabilities('free')).toEqual({
            canUseNutrition: true,
            // Pricing v3 (owner 2026-08-21): el white-label pasa a estar en todos los planes
            // vendidos. Revierte «branding = Pro+ ENTERO» (decision CEO 2026-06-21).
            canUseBranding: true,
            canCreateCustomExercises: true,
            canImportClients: true,
            // El gancho de Pro pasa a ser el sello, no la marca.
            showsEvaBadge: true,
        })
    })

    it('starter (fuera de venta) conserva su set histórico grandfathered', () => {
        expect(getTierCapabilities('starter')).toEqual({
            canUseNutrition: false,
            canUseBranding: false,
            canCreateCustomExercises: true,
            canImportClients: true,
            showsEvaBadge: true,
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

    it('getRecommendedTier ya no recomienda starter: 2..25 alumnos ⇒ pro (free topa en 1)', () => {
        expect(getRecommendedTier(0)).toBe('free')
        expect(getRecommendedTier(1)).toBe('free')
        expect(getRecommendedTier(2)).toBe('pro')
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
        expect(getRecommendedTierFor(28, BEFORE_V2_ISO)).toBe('pro')
        // El mismo conteo para un coach de la ventana v2 o de v3 ⇒ elite (pro nuevo tope 25).
        expect(getRecommendedTierFor(28, LAST_V2_ISO)).toBe('elite')
        expect(getRecommendedTierFor(28, AFTER_V3_ISO)).toBe('elite')
    })

    it('coach VIEJO con 3 alumnos ⇒ free (límite viejo 3); en v2/v3 con 3 ⇒ pro', () => {
        expect(getRecommendedTierFor(3, BEFORE_V2_ISO)).toBe('free')
        expect(getRecommendedTierFor(3, LAST_V2_ISO)).toBe('pro')
        expect(getRecommendedTierFor(3, AFTER_V3_ISO)).toBe('pro')
    })

    it('2 alumnos: free en la ventana v2 (tope 2), pro desde v3 (tope 1)', () => {
        expect(getRecommendedTierFor(2, LAST_V2_ISO)).toBe('free')
        expect(getRecommendedTierFor(2, FIRST_V3_ISO)).toBe('pro')
    })

    it('fecha null/desconocida ⇒ fail-safe pre-v2 (mismo criterio que tierMaxClientsFor)', () => {
        expect(getRecommendedTierFor(28, null)).toBe('pro')
        expect(getRecommendedTierFor(3, undefined)).toBe('free')
    })

    it('sobre el techo de elite en los 3 tramos ⇒ elite (el puente Teams lo maneja la UI)', () => {
        expect(getRecommendedTierFor(150, BEFORE_V2_ISO)).toBe('elite')
        expect(getRecommendedTierFor(150, LAST_V2_ISO)).toBe('elite')
        expect(getRecommendedTierFor(150, AFTER_V3_ISO)).toBe('elite')
    })
})
