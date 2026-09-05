import { describe, expect, it } from 'vitest'
// F6: la fuente única de tiers es @eva/tiers (paquete puro compartido web+mobile).
// El test apunta DIRECTO al paquete — '@/lib/constants' solo re-exporta de acá.
import {
    getDefaultBillingCycleForTier,
    getRecommendedTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    getTierRank,
    isBillingCycleAllowedForTier,
    isBrandingAllowed,
    isSaleTier,
    SALE_TIERS,
    TIER_CONFIG,
    TIER_LABELS,
    TIER_STUDENT_RANGE_LABEL,
    type SubscriptionTier,
} from '@eva/tiers'
import { MUSCLE_GROUPS as ENGINE_MUSCLE_GROUPS } from '@eva/workout-engine'
import { MUSCLE_GROUPS } from './constants'

describe('subscription constants', () => {
    it('applies quarterly and annual discounts correctly', () => {
        const monthly = getTierPriceClp('pro', 'monthly')
        const quarterly = getTierPriceClp('pro', 'quarterly')
        const annual = getTierPriceClp('pro', 'annual')

        expect(monthly).toBe(29990)
        expect(quarterly).toBeLessThan(monthly * 3)
        expect(annual).toBeLessThan(monthly * 12)
    })

    it('pins exact prices (Math.round of global discounts, no special annual branch — D3)', () => {
        // 29990 × 3 × 0.9 = 80973
        expect(getTierPriceClp('pro', 'quarterly')).toBe(80973)
        // scale annual: rama especial annualPriceClp eliminada → 190000 × 12 × 0.8 = 1824000
        // (pin del drift D3/F0-d; antes devolvía el hardcode 1.900.000)
        expect(getTierPriceClp('scale', 'annual')).toBe(1824000)
    })

    it('returns max clients and capabilities by tier', () => {
        // Pricing v2: catálogo de VENTA (coaches nuevos) — pro baja a 25; los pro
        // existentes retienen 30 vía tierMaxClientsFor (ver packages/tiers/pricing-v2.test.ts).
        expect(getTierMaxClients('pro')).toBe(25)
        expect(getTierCapabilities('pro').canUseNutrition).toBe(true)
        expect(getTierCapabilities('pro').canUseBranding).toBe(true)
    })

    it('branding gate (isBrandingAllowed) — abierto en free desde pricing v3, sigue fail-closed', () => {
        // Pricing v3 (owner 2026-08-21): free ve SU marca. Revierte «branding = Pro+ ENTERO»
        // (decision CEO 2026-06-21). Los 5 tiers vivos tienen marca; el false solo lo produce un
        // tier corrupto (fail-closed).
        expect(isBrandingAllowed('free')).toBe(true)
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
        // los tiers pagos a la venta (pro/elite) habilitan los 3 ciclos, incluido trimestral
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
    it('SALE_TIERS has exactly the 3 tiers on sale (starter fuera de venta)', () => {
        expect(SALE_TIERS.length).toBe(3)
        expect([...SALE_TIERS]).toEqual(['free', 'pro', 'elite'])
    })

    it('isSaleTier discriminates sale vs fuera-de-venta/legacy/unknown', () => {
        expect(isSaleTier('free')).toBe(true)
        expect(isSaleTier('pro')).toBe(true)
        expect(isSaleTier('elite')).toBe(true)
        // retirado del catálogo (2026-09): fuera del union y de TIER_CONFIG, vivo solo en el CHECK
        // de DB por el histórico contable. `isSaleTier` toma `string`, así que el literal no rompe.
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
        // free topa en 1 y starter ya no existe como plan: 2..25 ⇒ pro
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

// Pin estructural (mejora #10 + #2 / F6): los 5 valores del union de tiers vivos
// (free/pro/elite/growth/scale) deben tener label y display.
// Desde el retiro de Starter (docs/specs/retiro-starter-y-enterprise, D3=A) el union es MÁS CHICO
// que el CHECK de DB (`coaches_subscription_tier_check`, baseline.sql:938), que sigue aceptando
// `'starter'` por el histórico contable: el CHECK no se toca. La puerta entre los dos es
// `parseSubscriptionTier`, que degrada a `'free'` todo valor fuera del union.
// Como TIER_CONFIG / TIER_STUDENT_RANGE_LABEL / TIER_LABELS viven en @eva/tiers (paquete puro),
// este UN test pinnea web Y mobile a la vez (mobile re-exporta TIER_LABELS del paquete).
// Si alguien agrega un tier al union sin entrada acá, el test rompe en ambas plataformas.
// NOTA: los mapas de display acoplados a React/RN (iconos Lucide de subscription/page.tsx)
// NO se pueden mover al paquete puro → quedan en su superficie con comentario LEGACY.
describe('tier labels — los 5 valores del union tienen label y display (web + mobile vía @eva/tiers)', () => {
    const ALL_UNION_TIERS: SubscriptionTier[] = ['free', 'pro', 'elite', 'growth', 'scale']

    for (const tier of ALL_UNION_TIERS) {
        it(`${tier} has a label, student-range label and short TIER_LABEL`, () => {
            expect(TIER_CONFIG[tier]).toBeDefined()
            expect(TIER_CONFIG[tier].label.length).toBeGreaterThan(0)
            expect(TIER_STUDENT_RANGE_LABEL[tier].length).toBeGreaterThan(0)
            expect(TIER_LABELS[tier].length).toBeGreaterThan(0)
        })
    }

    // El único lugar donde el CHECK de DB y el union se miran de frente: una fila residual con
    // `'starter'` NO tiene entrada de display y ningún helper puede crashear por eso.
    it("un valor del CHECK fuera del union ('starter') no crashea ningún helper y cae a free", () => {
        // Cast obligado: `'starter'` salió del union, entra como valor crudo de DB.
        const RETIRADO = 'starter' as unknown as SubscriptionTier
        expect(getTierPriceClp(RETIRADO, 'monthly')).toBe(0)
        expect(getTierRank(RETIRADO)).toBe(0)
        expect(getTierCapabilities(RETIRADO)).toEqual(getTierCapabilities('free'))
        expect(getTierAllowedBillingCycles(RETIRADO)).toEqual([])
        expect(getDefaultBillingCycleForTier(RETIRADO)).toBe('monthly')
    })
})

/**
 * `@/lib/constants` mantiene el LITERAL de los grupos musculares en vez de re-exportar
 * `@eva/workout-engine`: lo importan client components de la landing y el barrel del motor
 * (~50 `export *`, sin `"sideEffects": false`) terminaría en el bundle de la página con
 * tráfico pagado. El precio de esa decisión es que la lista puede quedar desalineada, y esto
 * es lo que lo impide: misma fuente de verdad, verificada por test y no en tiempo de bundle.
 */
describe('MUSCLE_GROUPS (web) vs. @eva/workout-engine', () => {
    it('es exactamente la lista del motor, en el mismo orden', () => {
        expect([...MUSCLE_GROUPS]).toEqual([...ENGINE_MUSCLE_GROUPS])
    })

    it('conserva el orden histórico y los dos grupos que faltaban en LIVE', () => {
        // Este orden ordena los encabezados y los filtros del catálogo del coach.
        expect(MUSCLE_GROUPS.length).toBe(19)
        expect(MUSCLE_GROUPS[0]).toBe('Hombros')
        expect(MUSCLE_GROUPS).toContain('Movilidad')
        expect(MUSCLE_GROUPS).toContain('Rehabilitación')
    })
})
