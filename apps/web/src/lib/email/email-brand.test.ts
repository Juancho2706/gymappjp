import { describe, expect, it } from 'vitest'
import { resolveStudentEmailBranding } from './email-brand'
import { brandCtaColors } from './base-layout'

describe('resolveStudentEmailBranding (W2 white-label de borde)', () => {
    const logoUrl = 'https://cdn.example.com/logo.png'
    const primaryColor = '#7C3AED'

    it('devuelve logo/color para standalone Pro+', () => {
        const out = resolveStudentEmailBranding({ isStandalone: true, tier: 'pro', logoUrl, primaryColor })
        expect(out).toEqual({ logoUrl, primaryColor })
    })

    it('gatea free/starter a EVA (sin logo/color) aunque sea standalone', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'free', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null })
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'starter', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null })
    })

    it('gatea team/org (no standalone) a EVA aunque sea Pro+ — nunca la marca equivocada', () => {
        expect(resolveStudentEmailBranding({ isStandalone: false, tier: 'pro', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null })
    })

    it('tier nulo/desconocido cae a EVA (fail-closed)', () => {
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: null, logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null })
        expect(resolveStudentEmailBranding({ isStandalone: true, tier: 'bogus', logoUrl, primaryColor }))
            .toEqual({ logoUrl: null, primaryColor: null })
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
