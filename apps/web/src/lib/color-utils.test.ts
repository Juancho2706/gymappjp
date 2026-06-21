import { describe, expect, it } from 'vitest'
import { generateBrandPalette, getContrastInfo } from './color-utils'

describe('generateBrandPalette — color2 (white-label v2)', () => {
    it('single-arg: las vars secondary* salen undefined (compat hacia atrás)', () => {
        const p = generateBrandPalette('#8B5CF6')
        expect(p.primary).toBe('#8B5CF6')
        expect(p.primaryRgb).toBe('139, 92, 246')
        expect(p.secondary).toBeUndefined()
        expect(p.secondaryRgb).toBeUndefined()
        expect(p.secondaryForeground).toBeUndefined()
    })

    it('con secundario: emite shades espejo + rgb + foreground de mejor contraste', () => {
        const p = generateBrandPalette('#8B5CF6', '#00C7BE')
        expect(p.secondary).toBe('#00C7BE')
        expect(p.secondaryRgb).toBe('0, 199, 190')
        expect(typeof p.secondaryDark).toBe('string')
        expect(typeof p.secondaryLight).toBe('string')
        expect(typeof p.secondarySurface).toBe('string')
        expect(['#ffffff', '#000000']).toContain(p.secondaryForeground)
        expect(p.secondaryForeground).toBe(getContrastInfo('#00C7BE').textColor)
        // el primario sigue intacto cuando hay secundario
        expect(p.primary).toBe('#8B5CF6')
    })

    it('secondaryHex null/empty = comportamiento single-arg', () => {
        expect(generateBrandPalette('#8B5CF6', null).secondary).toBeUndefined()
        expect(generateBrandPalette('#8B5CF6', '').secondary).toBeUndefined()
    })
})
