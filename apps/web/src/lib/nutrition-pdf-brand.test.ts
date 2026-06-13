import { describe, it, expect } from 'vitest'
import {
    derivePdfPalette,
    resolvePdfBrand,
    pdfBrandFromProxyHeaders,
    hexToRgb,
    EVA_PDF_BRAND,
    EVA_PDF_ACCENT,
    EVA_PDF_HEADER_BG,
} from './nutrition-pdf-brand'

describe('resolvePdfBrand (resolución de marca por tenant)', () => {
    it('team Movida ⇒ marca del team (NO EVA)', () => {
        const b = resolvePdfBrand({ brandName: 'Movida', primaryColor: '#EC4899' })
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Movida')
        expect(b.primaryColor).toBe('#EC4899')
    })

    it('coach standalone con marca propia ⇒ su marca', () => {
        const b = resolvePdfBrand({
            brandName: 'Aurora Strength',
            primaryColor: '#F59E0B',
            subscriptionTier: 'elite',
        })
        expect(b.poweredByEva).toBe(false)
        expect(b.brandName).toBe('Aurora Strength')
    })

    it('free tier fuerza EVA aunque tenga marca configurada (AC4)', () => {
        const b = resolvePdfBrand({
            brandName: 'Coach Free',
            primaryColor: '#FF0000',
            subscriptionTier: 'free',
        })
        expect(b).toEqual(EVA_PDF_BRAND)
        expect(b.poweredByEva).toBe(true)
    })

    it('tenant nulo o sin nombre ⇒ fallback EVA', () => {
        expect(resolvePdfBrand(null)).toEqual(EVA_PDF_BRAND)
        expect(resolvePdfBrand({ brandName: '  ', primaryColor: '#123456' })).toEqual(EVA_PDF_BRAND)
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
    })

    it('free tier en headers ⇒ EVA', () => {
        const b = pdfBrandFromProxyHeaders(
            headers({
                'x-coach-brand-name': 'Coach Free',
                'x-coach-primary-color': '#FF0000',
                'x-coach-subscription-tier': 'free',
            })
        )
        expect(b.poweredByEva).toBe(true)
    })

    it('sin headers ⇒ EVA (fail-safe)', () => {
        expect(pdfBrandFromProxyHeaders(headers({})).poweredByEva).toBe(true)
    })
})

describe('derivePdfPalette (threading de marca al PDF)', () => {
    it('rama poweredByEva reproduce la paleta EVA EXACTA del PDF legacy (baseline T0.1)', () => {
        const p = derivePdfPalette(EVA_PDF_BRAND)
        expect(p.accent).toEqual(EVA_PDF_ACCENT) // emerald-500 [16,185,129]
        expect(p.headerBg).toEqual(EVA_PDF_HEADER_BG) // slate-900 [15,23,42]
        expect(p.generatedWithLabel).toBe('Generado con EVA Fitness')
        expect(p.brandName).toBe('EVA FITNESS')
    })

    it('marca de team usa su color como accent y footer con su nombre', () => {
        const p = derivePdfPalette({
            brandName: 'Movida',
            primaryColor: '#EC4899',
            poweredByEva: false,
        })
        expect(p.accent).toEqual(hexToRgb('#EC4899'))
        expect(p.generatedWithLabel).toBe('Generado con Movida')
        expect(p.brandName).toBe('Movida')
    })

    it('marca clara deriva header oscurecido legible; marca oscura se usa tal cual', () => {
        const light = derivePdfPalette({ brandName: 'X', primaryColor: '#F59E0B', poweredByEva: false })
        expect(light.headerBg).not.toEqual(light.accent)
        const dark = derivePdfPalette({ brandName: 'X', primaryColor: '#1E293B', poweredByEva: false })
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
