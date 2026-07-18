import { describe, expect, it } from 'vitest'
import { resolveThemedLogoSrcs } from './ThemedLogo'

describe('resolveThemedLogoSrcs', () => {
    it('dark presente ⇒ usa dark en oscuro y claro en claro', () => {
        expect(resolveThemedLogoSrcs('light.png', 'dark.png')).toEqual({
            light: 'light.png',
            dark: 'dark.png',
        })
    })

    it('dark ausente ⇒ el oscuro cae al claro (nunca queda sin logo)', () => {
        expect(resolveThemedLogoSrcs('light.png', null)).toEqual({
            light: 'light.png',
            dark: 'light.png',
        })
        expect(resolveThemedLogoSrcs('light.png', undefined)).toEqual({
            light: 'light.png',
            dark: 'light.png',
        })
    })

    it('dark vacío o espacios ⇒ cae al claro', () => {
        expect(resolveThemedLogoSrcs('light.png', '   ')).toEqual({
            light: 'light.png',
            dark: 'light.png',
        })
    })

    it('sin logo claro ⇒ ambos null (el consumidor cae a inicial/avatar)', () => {
        expect(resolveThemedLogoSrcs(null, 'dark.png')).toEqual({
            light: null,
            dark: 'dark.png',
        })
        expect(resolveThemedLogoSrcs(null, null)).toEqual({ light: null, dark: null })
        expect(resolveThemedLogoSrcs('  ', null)).toEqual({ light: null, dark: null })
    })
})
