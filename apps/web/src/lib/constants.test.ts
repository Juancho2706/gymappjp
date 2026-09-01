import { describe, expect, it } from 'vitest'
// F6: la fuente única de tiers es @eva/tiers (paquete puro compartido web+mobile).
// El test apunta DIRECTO al paquete — '@/lib/constants' solo re-exporta de acá.
import {
    getRecommendedTier,
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    isBrandingAllowed,
    isSaleTier,
    SALE_TIERS,
    TIER_CONFIG,
    TIER_LABELS,
    TIER_STUDENT_RANGE_LABEL,
    type SubscriptionTier,
} from '@eva/tiers'

describe('subscription constants', () => {
    it('applies quarterly and annual discounts correctly', () => {
        const monthly = getTierPriceClp('starter', 'monthly')
        const quarterly = getTierPriceClp('starter', 'quarterly')
        const annual = getTierPriceClp('starter', 'annual')

        expect(monthly).toBe(19990)
        expect(quarterly).toBeLessThan(monthly * 3)
        expect(annual).toBeLessThan(monthly * 12)
    })

    it('pins exact prices (Math.round of global discounts, no special annual branch — D3)', () => {
        // 19990 × 3 × 0.9 = 53973
        expect(getTierPriceClp('starter', 'quarterly')).toBe(53973)
        // 29990 × 3 × 0.9 = 80973
        expect(getTierPriceClp('pro', 'quarterly')).toBe(80973)
        // scale annual: rama especial annualPriceClp eliminada → 190000 × 12 × 0.8 = 1824000
        // (pin del drift D3/F0-d; antes devolvía el hardcode 1.900.000)
        expect(getTierPriceClp('scale', 'annual')).toBe(1824000)
    })

    it('returns max clients and capabilities by tier', () => {
        expect(getTierMaxClients('starter')).toBe(10)
        // Pricing v2: catálogo de VENTA (coaches nuevos) — pro baja a 25; los pro
        // existentes retienen 30 vía tierMaxClientsFor (ver packages/tiers/pricing-v2.test.ts).
        expect(getTierMaxClients('pro')).toBe(25)
        expect(getTierCapabilities('starter').canUseNutrition).toBe(false)
        // Pricing v3 abre el white-label a los tiers VENDIDOS; starter está fuera de venta y
        // conserva su set histórico ⇒ sigue siendo el único sin marca propia.
        expect(getTierCapabilities('starter').canUseBranding).toBe(false)
        expect(getTierCapabilities('pro').canUseNutrition).toBe(true)
        expect(getTierCapabilities('pro').canUseBranding).toBe(true)
    })

    it('branding gate (isBrandingAllowed) — abierto en free desde pricing v3, sigue fail-closed', () => {
        // Pricing v3 (owner 2026-08-21): free ve SU marca. Revierte «branding = Pro+ ENTERO»
        // (decision CEO 2026-06-21). starter (fuera de venta) queda como único tier sin marca.
        expect(isBrandingAllowed('free')).toBe(true)
        expect(isBrandingAllowed('starter')).toBe(false)
        expect(isBrandingAllowed('pro')).toBe(true)
        expect(isBrandingAllowed('elite')).toBe(true)
        expect(isBrandingAllowed('growth')).toBe(true)
        expect(isBrandingAllowed('scale')).toBe(true)
        // fail-closed: un tier inválido (string fuera del union) cae a false, nunca filtra marca.
        expect(isBrandingAllowed('' as SubscriptionTier)).toBe(false)
        expect(isBrandingAllowed('enterprise' as SubscriptionTier)).toBe(false)
        expect(isBrandingAllowed(null as unknown as SubscriptionTier)).toBe(false)
    })

    it('pins elite ceiling at 60 (pricing v2; los elite existentes retienen 100 vía grandfather)', () => {
        expect(getTierMaxClients('elite')).toBe(60)
    })

    it('enforces allowed billing cycles by tier', () => {
        // sale tiers (starter/pro/elite) habilitan los 3 ciclos, incluido trimestral
        expect(isBillingCycleAllowedForTier('starter', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('starter', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('starter', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('pro', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('elite', 'annual')).toBe(true)

        // free no tiene ningún ciclo de cobro
        expect(isBillingCycleAllowedForTier('free', 'monthly')).toBe(false)
        expect(isBillingCycleAllowedForTier('free', 'quarterly')).toBe(false)
        expect(isBillingCycleAllowedForTier('free', 'annual')).toBe(false)

        // growth/scale fuera de venta pero INTACTOS en runtime (grandfathered): los 3 ciclos siguen válidos
        expect(isBillingCycleAllowedForTier('growth', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('growth', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('growth', 'annual')).toBe(true)
        expect(isBillingCycleAllowedForTier('scale', 'monthly')).toBe(true)
        expect(isBillingCycleAllowedForTier('scale', 'quarterly')).toBe(true)
        expect(isBillingCycleAllowedForTier('scale', 'annual')).toBe(true)
    })

    // Pricing v3 (owner 2026-08-21): free = 1 alumno (catálogo de venta; los free existentes
    // conservan su cupo en la columna coaches.max_clients) con TODO liberado, white-label incluido.
    // Lo que paga Pro es el cupo y sacarse el sello «Hecho con EVA» (showsEvaBadge).
    it('free tier — zero price, 1 client (venta), todo liberado incluido branding, con sello EVA', () => {
        expect(getTierMaxClients('free')).toBe(1)
        expect(getTierPriceClp('free', 'monthly')).toBe(0)
        expect(getTierCapabilities('free').canUseNutrition).toBe(true)
        expect(getTierCapabilities('free').canCreateCustomExercises).toBe(true)
        expect(getTierCapabilities('free').canImportClients).toBe(true)
        expect(getTierCapabilities('free').canUseBranding).toBe(true)
        expect(getTierCapabilities('free').showsEvaBadge).toBe(true)
        expect(getTierCapabilities('pro').showsEvaBadge).toBe(false)
    })

    it('growth tier — grandfathered: 120 clients, full features, correct price', () => {
        expect(getTierMaxClients('growth')).toBe(120)
        expect(getTierPriceClp('growth', 'monthly')).toBe(84990)
        expect(getTierPriceClp('growth', 'quarterly')).toBeLessThan(84990 * 3)
        expect(getTierPriceClp('growth', 'annual')).toBeLessThan(84990 * 12)
        expect(getTierCapabilities('growth').canUseNutrition).toBe(true)
        expect(getTierCapabilities('growth').canUseBranding).toBe(true)
    })
})

describe('sale tiers (D1 + pricing v2)', () => {
    it('SALE_TIERS has exactly the 3 tiers on sale (starter fuera de venta — pricing v2)', () => {
        expect(SALE_TIERS.length).toBe(3)
        expect([...SALE_TIERS]).toEqual(['free', 'pro', 'elite'])
    })

    it('isSaleTier discriminates sale vs fuera-de-venta/legacy/unknown', () => {
        expect(isSaleTier('free')).toBe(true)
        expect(isSaleTier('pro')).toBe(true)
        expect(isSaleTier('elite')).toBe(true)
        // fuera de venta desde pricing v2 (sigue en union/TIER_CONFIG/CHECK, patrón growth/scale)
        expect(isSaleTier('starter')).toBe(false)
        // legacy fuera de venta
        expect(isSaleTier('growth')).toBe(false)
        expect(isSaleTier('scale')).toBe(false)
        // basura arbitraria
        expect(isSaleTier('enterprise')).toBe(false)
        expect(isSaleTier('')).toBe(false)
    })
})

describe('getRecommendedTier (SALE_TIERS only, fallback elite)', () => {
    it('recommends the smallest sale tier that fits the client count (pricing v3: sin starter)', () => {
        expect(getRecommendedTier(0)).toBe('free')
        expect(getRecommendedTier(1)).toBe('free')
        // free ahora topa en 1 y starter salió de la venta: 2..25 ⇒ pro
        expect(getRecommendedTier(2)).toBe('pro')
        expect(getRecommendedTier(8)).toBe('pro')
        expect(getRecommendedTier(25)).toBe('pro')
        expect(getRecommendedTier(40)).toBe('elite')
    })

    it('falls back to elite above the elite ceiling (Teams bridge, not a tier)', () => {
        // 80 supera el techo nuevo de elite (60) ⇒ fallback elite
        expect(getRecommendedTier(80)).toBe('elite')
        expect(getRecommendedTier(1000)).toBe('elite')
    })

    it('never recommends starter nor a legacy tier', () => {
        for (const count of [5, 10, 200, 350, 500, 5000]) {
            expect(['free', 'pro', 'elite']).toContain(getRecommendedTier(count))
        }
    })
})

// Pin estructural (mejora #10 + #2 / F6): los 6 valores del CHECK de DB
// (baseline.sql:938 — free/starter/pro/elite/growth/scale) deben tener label y display.
// Como TIER_CONFIG / TIER_STUDENT_RANGE_LABEL / TIER_LABELS ahora viven en @eva/tiers (paquete
// puro), este UN test pinnea web Y mobile a la vez (mobile re-exporta TIER_LABELS del paquete).
// Si alguien agrega un tier al CHECK sin entrada acá, el test rompe en ambas plataformas.
// NOTA: los mapas de display acoplados a React/RN (iconos Lucide de subscription/page.tsx)
// NO se pueden mover al paquete puro → quedan en su superficie con comentario LEGACY.
describe('tier labels — all 6 CHECK values have display entries (web + mobile vía @eva/tiers)', () => {
    const ALL_CHECK_TIERS: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']

    for (const tier of ALL_CHECK_TIERS) {
        it(`${tier} has a label, student-range label and short TIER_LABEL`, () => {
            expect(TIER_CONFIG[tier]).toBeDefined()
            expect(TIER_CONFIG[tier].label.length).toBeGreaterThan(0)
            expect(TIER_STUDENT_RANGE_LABEL[tier].length).toBeGreaterThan(0)
            expect(TIER_LABELS[tier].length).toBeGreaterThan(0)
        })
    }
})
