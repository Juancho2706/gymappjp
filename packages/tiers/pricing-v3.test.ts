import { describe, expect, it } from 'vitest'
import {
    EVA_BADGE_LABEL,
    PRICING_V3_CUTOVER,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    getEvaBadgeUrl,
    getRecommendedTier,
    getRecommendedTierFor,
    getTierCapabilities,
    isBrandingAllowed,
    showsEvaBadge,
    studentCountLabel,
    type EvaBadgeMedium,
    type SubscriptionTier,
} from './index'

// Pricing v3 (docs/specs/pricing-v3, decisiones del owner 2026-08-21: 1A 2A 3A 4A 5A 6A).
// Free = 1 alumno CON white-label completo; lo que paga Pro es el cupo (25) y sacarse el sello
// «Hecho con EVA». Este archivo fija el contrato NUEVO; ./pricing-v2.test.ts conserva la escalera
// histórica de fechas.

const TIER_INVALIDO = 'nope' as SubscriptionTier

describe('PRICING_V3_CUTOVER', () => {
    it('es el día D del deploy (2026-08-21, 00:00Z) y parsea a un instante válido', () => {
        expect(PRICING_V3_CUTOVER).toBe('2026-08-21T00:00:00Z')
        expect(Number.isFinite(Date.parse(PRICING_V3_CUTOVER))).toBe(true)
    })
})

describe('TIER_CAPABILITIES.free — white-label abierto + sello', () => {
    it('snapshot completo de free (D2=A branding completo, D3=A sello visible)', () => {
        expect(getTierCapabilities('free')).toEqual({
            canUseNutrition: true,
            canUseBranding: true,
            canUseAdvancedReports: false,
            canCreateCustomExercises: true,
            canImportClients: true,
            showsEvaBadge: true,
        })
    })
})

describe('showsEvaBadge — gancho de Pro (D3=A)', () => {
    it('free y starter llevan el sello; pro/elite/growth/scale no', () => {
        expect(showsEvaBadge('free')).toBe(true)
        expect(showsEvaBadge('starter')).toBe(true)
        expect(showsEvaBadge('pro')).toBe(false)
        expect(showsEvaBadge('elite')).toBe(false)
        expect(showsEvaBadge('growth')).toBe(false)
        expect(showsEvaBadge('scale')).toBe(false)
    })

    it('FAIL-OPEN: un tier inválido MUESTRA el sello (nunca regala el beneficio pago)', () => {
        expect(showsEvaBadge(TIER_INVALIDO)).toBe(true)
        expect(showsEvaBadge('' as SubscriptionTier)).toBe(true)
        expect(showsEvaBadge(null as unknown as SubscriptionTier)).toBe(true)
    })

    it('los dos gates apuntan al revés a propósito: sello fail-OPEN, marca fail-CLOSED', () => {
        expect(showsEvaBadge(TIER_INVALIDO)).toBe(true)
        expect(isBrandingAllowed(TIER_INVALIDO)).toBe(false)
    })

    it('isBrandingAllowed ahora es true para free (revierte «branding = Pro+ ENTERO»)', () => {
        expect(isBrandingAllowed('free')).toBe(true)
        // starter (fuera de venta, histórico) sigue sin marca propia.
        expect(isBrandingAllowed('starter')).toBe(false)
    })
})

describe('sello «Hecho con EVA» — texto y link únicos', () => {
    it('el texto es exactamente el aprobado', () => {
        expect(EVA_BADGE_LABEL).toBe('Hecho con EVA')
    })

    it('getEvaBadgeUrl arma el link con UTMs por superficie', () => {
        const MEDIOS: EvaBadgeMedium[] = [
            'student_app',
            'student_login',
            'nutrition_pdf',
            'student_email',
            'rn_export',
        ]
        for (const medium of MEDIOS) {
            expect(getEvaBadgeUrl(medium)).toBe(
                `https://www.eva-app.cl/?utm_source=badge&utm_medium=${medium}&utm_campaign=free_badge`
            )
        }
    })

    it('el medio por defecto es la app del alumno', () => {
        expect(getEvaBadgeUrl()).toBe(getEvaBadgeUrl('student_app'))
        expect(getEvaBadgeUrl()).toContain('utm_medium=student_app')
    })
})

describe('studentCountLabel — plural correcto (con free=1 el copy decía «1 alumnos»)', () => {
    it('español', () => {
        expect(studentCountLabel(0)).toBe('0 alumnos')
        expect(studentCountLabel(1)).toBe('1 alumno')
        expect(studentCountLabel(2)).toBe('2 alumnos')
        expect(studentCountLabel(25)).toBe('25 alumnos')
    })

    it('inglés (espejo de la landing v2)', () => {
        expect(studentCountLabel(0, 'en')).toBe('0 clients')
        expect(studentCountLabel(1, 'en')).toBe('1 client')
        expect(studentCountLabel(2, 'en')).toBe('2 clients')
        expect(studentCountLabel(25, 'en')).toBe('25 clients')
    })

    it('el default es español', () => {
        expect(studentCountLabel(1)).toBe(studentCountLabel(1, 'es'))
    })
})

describe('catálogo de venta free (D2=A)', () => {
    it('el label de venta vende la marca, no el cupo', () => {
        expect(TIER_STUDENT_RANGE_LABEL.free).toBe('1 alumno con tu marca')
    })

    it('free = 1 alumno con «Branding personalizado» entre sus bullets', () => {
        expect(TIER_CONFIG.free.maxClients).toBe(1)
        expect(TIER_CONFIG.free.features).toContain('Branding personalizado')
        expect(TIER_CONFIG.free.features).toContain('Planes de nutrición')
    })

    it('free y pro comparten bullets: la diferencia de venta es el cupo y el sello', () => {
        expect(TIER_CONFIG.free.features).toEqual(TIER_CONFIG.pro.features)
    })
})

describe('recomendación de plan con free = 1', () => {
    it('getRecommendedTier: 0–1 ⇒ free, 2–25 ⇒ pro, 26–60 ⇒ elite', () => {
        expect(getRecommendedTier(0)).toBe('free')
        expect(getRecommendedTier(1)).toBe('free')
        expect(getRecommendedTier(2)).toBe('pro')
        expect(getRecommendedTier(25)).toBe('pro')
        expect(getRecommendedTier(26)).toBe('elite')
        expect(getRecommendedTier(60)).toBe('elite')
    })

    it('getRecommendedTierFor respeta el bucket de fecha del coach', () => {
        // Coach nacido en v3 con 2 alumnos: su free topa en 1 ⇒ Pro.
        expect(getRecommendedTierFor(2, PRICING_V3_CUTOVER)).toBe('pro')
        // Coach de la ventana v2 con 2 alumnos: su free todavía topa en 2 ⇒ free.
        expect(getRecommendedTierFor(2, '2026-08-18T00:00:00Z')).toBe('free')
        // Coach pre-v2 con 3 alumnos: su free topa en 3 ⇒ free.
        expect(getRecommendedTierFor(3, '2026-01-01T00:00:00Z')).toBe('free')
    })
})
