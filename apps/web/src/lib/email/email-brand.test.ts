import { describe, expect, it } from 'vitest'
import { resolveStudentEmailBranding } from './email-brand'
import { brandCtaColors, wrapEmailLayout } from './base-layout'
import { buildClientWelcomeEmail } from './transactional-templates'
import { EVA_BADGE_LABEL, getEvaBadgeUrl } from '@eva/tiers'

describe('resolveStudentEmailBranding (W2 white-label de borde + sello v3)', () => {
    const logoUrl = 'https://cdn.example.com/logo.png'
    const primaryColor = '#7C3AED'

    it('devuelve logo/color para standalone Pro SIN sello (gancho de Pro)', () => {
        const out = resolveStudentEmailBranding({ isStandalone: true, tier: 'pro', logoUrl, primaryColor })
        expect(out).toEqual({ logoUrl, primaryColor, showsEvaBadge: false })
    })

    it('elite standalone: marca propia, sin sello', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'elite', logoUrl, primaryColor }))
            .toEqual({ logoUrl, primaryColor, showsEvaBadge: false })
    })

    // Pricing v3 (owner 2026-08-21): free deja de ver skin EVA — lleva su marca + el sello.
    it('free standalone ⇒ marca propia CON sello «Hecho con EVA»', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'free', logoUrl, primaryColor }))
            .toEqual({ logoUrl, primaryColor, showsEvaBadge: true })
    })

    // Un tier fuera del catálogo (cuenta legacy con dato viejo) no tiene canUseBranding en
    // @eva/tiers ⇒ header EVA por fail-closed, pero el sello es fail-open y sí se pinta.
    it('tier fuera del catálogo standalone ⇒ header EVA (sin white-label) pero CON sello', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'legacy_unknown', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null, showsEvaBadge: true })
    })

    it('team/org (no standalone) ⇒ EVA y SIN sello: la marca de ahí no es del coach', () => {
        expect(resolveStudentEmailBranding({ isStandalone: false, tier: 'pro', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null, showsEvaBadge: false })
        expect(resolveStudentEmailBranding({ isStandalone: false, tier: 'free', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null, showsEvaBadge: false })
    })

    it('tier nulo ⇒ free: marca propia + sello', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: null, logoUrl, primaryColor }))
            .toEqual({ logoUrl, primaryColor, showsEvaBadge: true })
    })

    it('tier desconocido ⇒ marca EVA (fail-closed) + sello (fail-open)', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'bogus', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null, showsEvaBadge: true })
    })
})

describe('wrapEmailLayout (sello «Hecho con EVA» en el footer)', () => {
    const logoUrl = 'https://cdn.example.com/logo.png'

    it('con showsEvaBadge pinta el sello con el link UTM student_email', () => {
        const html = wrapEmailLayout('<p>hola</p>', {
            brand: { brandName: 'Coach Free', logoUrl, primaryColor: '#7C3AED', showsEvaBadge: true },
        })
        expect(html).toContain(EVA_BADGE_LABEL)
        expect(html).toContain(getEvaBadgeUrl('student_email'))
        // El sello NO reemplaza al remitente: identifica quién manda desde eva-app.cl.
        expect(html).toContain('Enviado por <strong>Coach Free</strong> · con tecnología de EVA')
    })

    it('sin showsEvaBadge (Pro) el footer no menciona el sello ni su link', () => {
        const html = wrapEmailLayout('<p>hola</p>', {
            brand: { brandName: 'Coach Pro', logoUrl, primaryColor: '#7C3AED', showsEvaBadge: false },
        })
        expect(html).not.toContain(getEvaBadgeUrl('student_email'))
        expect(html).toContain('Enviado por <strong>Coach Pro</strong>')
    })

    it('emails al coach (sin brand) tampoco llevan sello', () => {
        const html = wrapEmailLayout('<p>hola</p>')
        expect(html).not.toContain(getEvaBadgeUrl('student_email'))
        expect(html).toContain('EVA Fitness Platform')
    })
})

/**
 * Cadena COMPLETA del sello: el flag tiene que sobrevivir el salto
 * `resolveStudentEmailBranding` → ctx del template → `brand` de `wrapEmailLayout`.
 * Sin este test el flag puede quedarse en el resolver y el footer nunca pintarlo.
 */
describe('buildClientWelcomeEmail (el sello llega del ctx al footer)', () => {
    const base = {
        brandName: 'Coach Free',
        coachName: 'Fran',
        clientName: 'Ana',
        loginUrl: 'https://eva-app.cl/c/coach-free/login',
        tempPassword: 'abc12345',
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#7C3AED',
    }

    it('showsEvaBadge: true ⇒ footer con «Hecho con EVA» y utm_medium=student_email', () => {
        const { html } = buildClientWelcomeEmail({ ...base, showsEvaBadge: true })
        expect(html).toContain('utm_medium=student_email')
        expect(html).toContain(EVA_BADGE_LABEL) // «Hecho con EVA»
    })

    it('showsEvaBadge: false (Pro) ⇒ sin sello ni link con UTM', () => {
        const { html } = buildClientWelcomeEmail({ ...base, showsEvaBadge: false })
        expect(html).not.toContain('utm_medium=student_email')
        expect(html).not.toContain(EVA_BADGE_LABEL)
    })
})

/**
 * F3.8 — las 5 marcas ya guardadas en LIVE al día D (2026-08-21). El sello del email usa
 * `accent` (= `brandCtaColors(primaryColor).bg`, el step 600 "white-safe" de la rampa) sobre el
 * footer gris #f9fafb: verificamos que ninguna de las 5 quede por debajo de AA (4.5:1).
 */
describe('sello del email: legibilidad con las marcas reales de LIVE', () => {
    const FOOTER_BG = '#f9fafb'
    const LIVE_BRANDS: [string, string][] = [
        ['pauli-coach', '#8B5CF6'],
        ['robin-coach', '#4c2020'],
        ['anais-perez', '#0000ff'],
        // dudu usa el preset emerald y coach-derek solo logo (color EVA por defecto).
        ['dudu (preset emerald)', '#10B981'],
        ['coach-derek (default EVA)', '#1462DC'],
    ]

    const srgb = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const luminance = (hex: string) => {
        const n = parseInt(hex.replace('#', ''), 16)
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => srgb(c / 255))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
        return (hi + 0.05) / (lo + 0.05)
    }

    it.each(LIVE_BRANDS)('%s: el link del sello pasa AA sobre el footer', (_slug, color) => {
        const { bg } = brandCtaColors(color)
        expect(contrast(bg, FOOTER_BG)).toBeGreaterThanOrEqual(4.5)
    })
})

describe('brandCtaColors (CTA de email WCAG-safe)', () => {
    it('deriva un fill white-safe + texto legible desde el color del coach', () => {
        const { bg, text } = brandCtaColors('#7C3AED')
        expect(bg).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(['#ffffff', '#0b0b0c']).toContain(text.toLowerCase())
    })

    it('cae a verde EVA + texto blanco sin color válido', () => {
        expect(brandCtaColors(null)).toEqual({ bg: '#10B981', text: '#ffffff' })
        expect(brandCtaColors('not-a-hex')).toEqual({ bg: '#10B981', text: '#ffffff' })
    })
})
