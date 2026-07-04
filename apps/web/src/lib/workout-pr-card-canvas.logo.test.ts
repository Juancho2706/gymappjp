import { describe, expect, it } from 'vitest'
import { resolveShareCardLogo } from './workout-pr-card-canvas'

// Bug CEO: las share-cards mostraban la inicial ("J") en vez del logo de Jose Fit porque solo se leía
// el logo DARK del DOM. josefit tiene logo_url (claro) pero logo_url_dark NULL → caía al fallback de
// inicial. Esta suite fija la cadena de fallback dark → claro (con backplate) → inicial.
describe('resolveShareCardLogo — cadena de fallback dark → claro → inicial', () => {
    it('usa el logo DARK cuando existe, sin backplate (dibujado a sangre)', () => {
        expect(resolveShareCardLogo('https://cdn/dark.png', 'https://cdn/light.png')).toEqual({
            logoUrl: 'https://cdn/dark.png',
            logoNeedsBackplate: false,
        })
    })

    it('cae al logo CLARO cuando no hay dark, con backplate (chip blanco)', () => {
        expect(resolveShareCardLogo(null, 'https://cdn/light.png')).toEqual({
            logoUrl: 'https://cdn/light.png',
            logoNeedsBackplate: true,
        })
    })

    it('trata el dark vacío/espacios como ausente y cae al claro con backplate', () => {
        expect(resolveShareCardLogo('   ', 'https://cdn/light.png')).toEqual({
            logoUrl: 'https://cdn/light.png',
            logoNeedsBackplate: true,
        })
    })

    it('sin ningún logo → null (la card cae a la inicial), sin backplate', () => {
        expect(resolveShareCardLogo(null, null)).toEqual({
            logoUrl: null,
            logoNeedsBackplate: false,
        })
        expect(resolveShareCardLogo('', '  ')).toEqual({
            logoUrl: null,
            logoNeedsBackplate: false,
        })
    })

    it('caso josefit (dark undefined/NULL, claro presente) → usa el claro con backplate, NO la inicial', () => {
        const r = resolveShareCardLogo(undefined, 'https://cdn/josefit-logo.png')
        expect(r.logoUrl).toBe('https://cdn/josefit-logo.png')
        expect(r.logoNeedsBackplate).toBe(true)
    })
})
