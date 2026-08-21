import { describe, it, expect } from 'vitest'
import {
    derivePdfPalette,
    resolvePdfBrand,
    pdfBrandFromProxyHeaders,
    hexToRgb,
    EVA_PDF_BRAND,
    EVA_PDF_BADGE_LABEL,
    EVA_PDF_ACCENT,
    EVA_PDF_HEADER_BG,
} from './nutrition-pdf-brand'

describe('resolvePdfBrand (resolución de marca por tenant)', () => {
    it('team Movida ⇒ marca del team (NO EVA) y SIN sello (la marca es del team)', () => {
        const b = resolvePdfBrand({ brandName: 'Movida', primaryColor: '#EC4899' })
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Movida')
        expect(b.primaryColor).toBe('#EC4899')
        expect(b.showsEvaBadge).toBe(false)
    })

    it('coach standalone con marca propia ⇒ su marca', () => {
        const b = resolvePdfBrand({
            brandName: 'Aurora Strength',
            primaryColor: '#F59E0B',
            subscriptionTier: 'elite',
        })
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Aurora Strength')
        expect(b.showsEvaBadge).toBe(false)
    })

    // Pricing v3 (owner 2026-08-21): free deja de caer a EVA — lleva SU marca + el sello.
    it('free ⇒ marca propia CON sello «Hecho con EVA»', () => {
        const b = resolvePdfBrand({
            brandName: 'Coach Free',
            primaryColor: '#FF0000',
            subscriptionTier: 'free',
        })
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Coach Free')
        expect(b.primaryColor).toBe('#FF0000')
        expect(b.showsEvaBadge).toBe(true)
    })

    // starter (LEGACY, fuera de venta) conserva `canUseBranding: false` en @eva/tiers ⇒ sigue
    // cayendo a la marca EVA. Lleva el sello igual (`showsEvaBadge: true`).
    it('starter ⇒ EVA (sin white-label, tier legacy) + sello', () => {
        const b = resolvePdfBrand({
            brandName: 'Coach Starter',
            primaryColor: '#FF0000',
            subscriptionTier: 'starter',
        })
        expect(b).toEqual(EVA_PDF_BRAND)
        expect(b.showsEvaBadge).toBe(true)
    })

    it('pro ⇒ marca propia SIN sello (ese es el gancho de Pro)', () => {
        const b = resolvePdfBrand({
            brandName: 'Coach Pro',
            primaryColor: '#EC4899',
            subscriptionTier: 'pro',
        })
        expect(b.poweredByEva).toBe(false)
        expect(b.showsEvaBadge).toBe(false)
    })

    it('tier inválido/stale ⇒ EVA entera + sello (fail-closed de marca, fail-open de sello)', () => {
        const b = resolvePdfBrand({
            brandName: 'Coach Raro',
            primaryColor: '#FF0000',
            subscriptionTier: 'plan_que_no_existe',
        })
        expect(b).toEqual(EVA_PDF_BRAND)
        expect(b.poweredByEva).toBe(true)
        expect(b.showsEvaBadge).toBe(true)
    })

    it('tenant nulo o sin nombre ⇒ fallback EVA (con sello)', () => {
        expect(resolvePdfBrand(null)).toEqual(EVA_PDF_BRAND)
        expect(resolvePdfBrand({ brandName: '  ', primaryColor: '#123456' })).toEqual(EVA_PDF_BRAND)
        expect(EVA_PDF_BRAND.showsEvaBadge).toBe(true)
    })

    it('color inválido ⇒ conserva nombre del tenant con color EVA', () => {
        const b = resolvePdfBrand({ brandName: 'Movida', primaryColor: 'magenta' })
        expect(b.poweredByEva).toBe(false)
        expect(b.primaryColor).toBe(EVA_PDF_BRAND.primaryColor)
    })
})

describe('pdfBrandFromProxyHeaders (alumno, headers del proxy)', () => {
    const headers = (map: Record<string, string | null>) => ({
        get: (k: string) => map[k] ?? null,
    })

    it('contexto team con marca completa', () => {
        const b = pdfBrandFromProxyHeaders(
            headers({
                'x-coach-brand-name': 'E2E Pool Vortex',
                'x-coach-primary-color': '#EC4899',
                'x-coach-subscription-tier': 'elite',
            })
        )
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('E2E Pool Vortex')
        expect(b.showsEvaBadge).toBe(false)
    })

    it('free tier en headers ⇒ marca propia + sello', () => {
        const b = pdfBrandFromProxyHeaders(
            headers({
                'x-coach-brand-name': 'Coach Free',
                'x-coach-primary-color': '#FF0000',
                'x-coach-subscription-tier': 'free',
            })
        )
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Coach Free')
        expect(b.showsEvaBadge).toBe(true)
    })

    it('sin headers ⇒ EVA (fail-safe) con sello', () => {
        const b = pdfBrandFromProxyHeaders(headers({}))
        expect(b.poweredByEva).toBe(true)
        expect(b.showsEvaBadge).toBe(true)
    })
})

describe('derivePdfPalette (threading de marca al PDF)', () => {
    it('rama poweredByEva reproduce la paleta EVA EXACTA del PDF legacy (baseline T0.1)', () => {
        const p = derivePdfPalette(EVA_PDF_BRAND)
        expect(p.accent).toEqual(EVA_PDF_ACCENT) // emerald-500 [16,185,129]
        expect(p.headerBg).toEqual(EVA_PDF_HEADER_BG) // slate-900 [15,23,42]
        expect(p.generatedWithLabel).toBe('Generado con EVA Fitness')
        expect(p.brandName).toBe('EVA FITNESS')
        expect(p.evaBadgeLabel).toBe(EVA_PDF_BADGE_LABEL)
    })

    it('marca de team usa su color como accent y footer con su nombre', () => {
        const p = derivePdfPalette({
            brandName: 'Movida',
            primaryColor: '#EC4899',
            poweredByEva: false,
            showsEvaBadge: false,
        })
        expect(p.accent).toEqual(hexToRgb('#EC4899'))
        expect(p.generatedWithLabel).toBe('Generado con Movida')
        expect(p.brandName).toBe('Movida')
        expect(p.evaBadgeLabel).toBeNull()
    })

    // El sello es ORTOGONAL al color: el free lleva SU paleta y ADEMÁS la línea de EVA.
    it('marca propia con sello ⇒ paleta del coach + línea «Hecho con EVA · eva-app.cl»', () => {
        const p = derivePdfPalette({
            brandName: 'Coach Free',
            primaryColor: '#8B5CF6',
            poweredByEva: false,
            showsEvaBadge: true,
        })
        expect(p.accent).toEqual(hexToRgb('#8B5CF6'))
        expect(p.generatedWithLabel).toBe('Generado con Coach Free')
        expect(p.evaBadgeLabel).toBe('Hecho con EVA · eva-app.cl')
    })

    it('marca clara deriva header oscurecido legible; marca oscura se usa tal cual', () => {
        const light = derivePdfPalette({ brandName: 'X', primaryColor: '#F59E0B', poweredByEva: false, showsEvaBadge: false })
        expect(light.headerBg).not.toEqual(light.accent)
        const dark = derivePdfPalette({ brandName: 'X', primaryColor: '#1E293B', poweredByEva: false, showsEvaBadge: false })
        expect(dark.headerBg).toEqual(hexToRgb('#1E293B'))
    })
})

describe('hexToRgb', () => {
    it('parsea con y sin #, rechaza inválidos', () => {
        expect(hexToRgb('#10B981')).toEqual([16, 185, 129])
        expect(hexToRgb('10B981')).toEqual([16, 185, 129])
        expect(hexToRgb('#FFF')).toBeNull()
        expect(hexToRgb('rojo')).toBeNull()
    })
})
