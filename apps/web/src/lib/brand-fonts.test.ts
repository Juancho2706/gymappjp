import { describe, expect, it } from 'vitest'
import { resolveBrandFontStack, isFontKey, CURATED_FONTS, FONT_KEY_TUPLE } from './brand-fonts'

describe('brand-fonts (white-label v2)', () => {
    it('isFontKey es fail-closed', () => {
        expect(isFontKey('poppins')).toBe(true)
        expect(isFontKey('inter')).toBe(true)
        expect(isFontKey('')).toBe(false)
        expect(isFontKey(null)).toBe(false)
        expect(isFontKey(undefined)).toBe(false)
        expect(isFontKey('comic-sans')).toBe(false)
        expect(isFontKey('<script>')).toBe(false)
    })

    it('sin fuente custom → default de display (Montserrat); NUNCA interpola el string crudo', () => {
        expect(resolveBrandFontStack('')).toContain('--font-montserrat')
        expect(resolveBrandFontStack(null)).toContain('--font-montserrat')
        // clave anti CSS-injection: una key inválida cae al default, no se interpola el valor recibido
        const evil = 'red; } body { display:none } /*'
        expect(resolveBrandFontStack(evil)).toBe('var(--font-montserrat), var(--font-inter), ui-sans-serif')
        expect(resolveBrandFontStack(evil)).not.toContain('display:none')
    })

    it('fuente custom → su var con fallback Inter (degrada legible)', () => {
        expect(resolveBrandFontStack('poppins')).toBe('var(--font-brand-poppins), var(--font-inter), sans-serif')
        expect(resolveBrandFontStack('inter')).toBe('var(--font-inter), sans-serif')
        expect(resolveBrandFontStack('montserrat')).toBe('var(--font-montserrat), var(--font-inter), sans-serif')
    })

    it('cada key tiene metadata + cssVar válida', () => {
        expect(FONT_KEY_TUPLE.length).toBe(12)
        for (const k of FONT_KEY_TUPLE) {
            expect(CURATED_FONTS[k].cssVar).toMatch(/^--font-/)
            expect(CURATED_FONTS[k].label.length).toBeGreaterThan(0)
        }
    })
})
