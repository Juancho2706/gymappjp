import { describe, expect, it } from 'vitest'
import { deriveSealSecondary, sealSecondaryLightPaint } from '@eva/brand-kit'
import { buildSealCssVars } from './seal-vars'
import { hexToRgb } from './color-utils'

// Goldens precomputados con el mismo stack culori de @eva/brand-kit (ver seal.test.ts).

describe('buildSealCssVars — publicación web del par del sello', () => {
    it('sin preset (EVA #1462DC): deriva el par y aplica el pintado claro L−6 al blob 2', () => {
        const vars = buildSealCssVars({
            lightBrandColor: '#1462DC',
            darkBrandColor: '#1462DC',
            themePresetKey: null,
        })
        expect(vars.light.primaryRgb).toBe('20, 98, 220')
        // Par derivado #7855e2; pintado claro #633bde (artifact: L+8 vs L+14 del par).
        expect(vars.dark.secondaryRgb).toBe('120, 85, 226')
        expect(vars.light.secondaryRgb).toBe('99, 59, 222')
    })

    it('preset curado (sport-blue): el secundario sale del catálogo, no de la fórmula', () => {
        const vars = buildSealCssVars({
            lightBrandColor: '#2563EB',
            darkBrandColor: '#2563EB',
            themePresetKey: 'sport-blue',
        })
        // Curado #06B6D4 en dark; pintado claro #059cb6 en light.
        expect(vars.dark.secondaryRgb).toBe('6, 182, 212')
        expect(vars.light.secondaryRgb).toBe('5, 156, 182')
        expect(vars.dark.secondaryRgb).not.toBe(hexToRgb(deriveSealSecondary('#2563EB')))
    })

    it('primarios distintos por modo (accentLight/accentDark) derivan cada uno su secundario', () => {
        const vars = buildSealCssVars({
            lightBrandColor: '#0EA5E9',
            darkBrandColor: '#22C55E',
            themePresetKey: null,
        })
        expect(vars.light.primaryRgb).toBe(hexToRgb('#0ea5e9'))
        expect(vars.dark.primaryRgb).toBe(hexToRgb('#22c55e'))
        expect(vars.dark.secondaryRgb).toBe(hexToRgb(deriveSealSecondary('#22C55E')))
        expect(vars.light.secondaryRgb).toBe(
            hexToRgb(sealSecondaryLightPaint(deriveSealSecondary('#0EA5E9'))),
        )
    })

    it('key desconocida = legacy (B2): ignora cualquier secundario suelto y deriva', () => {
        const vars = buildSealCssVars({
            lightBrandColor: '#E11D48',
            darkBrandColor: '#E11D48',
            themePresetKey: 'no-existe',
        })
        expect(vars.dark.secondaryRgb).toBe(hexToRgb(deriveSealSecondary('#E11D48')))
    })
})
