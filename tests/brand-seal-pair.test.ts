import { describe, expect, it } from 'vitest'
// Import por el barrel `@eva/brand-kit` — la MISMA ruta que usan web (alias Next)
// y RN (workspace de Metro), así este test cubre la salida que ven ambas apps.
import { deriveSealSecondary, getThemePreset, sealPair } from '@eva/brand-kit'
// Import directo del módulo (bypass del barrel) para garantizar que barrel y
// módulo entregan EXACTAMENTE lo mismo (cero drift entre rutas de import).
import {
    deriveSealSecondary as deriveDirect,
    sealPair as sealPairDirect,
} from '../packages/brand-kit/seal'

// ────────────────────────────────────────────────────────────────────────────
// Sello EVA v2 (SPEC eva-seal-background D3) — golden de integración: el par
// del sello con presets REALES del catálogo y con brands custom sin secundario.
// ────────────────────────────────────────────────────────────────────────────

// Par curado esperado de los 3 presets (hex del catálogo, normalizado a minúsculas)
// + el derivado que saldría si el helper IGNORARA el preset (no debe salir jamás).
const PRESET_GOLDENS = [
    { key: 'ember', primary: '#e03a2f', curated: '#f59e0b', derivedTrap: '#e0c076' },
    { key: 'sport-blue', primary: '#2563eb', curated: '#06b6d4', derivedTrap: '#9771e7' },
    { key: 'violet', primary: '#7c3aed', curated: '#ec4899', derivedTrap: '#e774e7' },
] as const

describe('sealPair vía @eva/brand-kit — presets reales (sale el par CURADO, no el derivado)', () => {
    for (const g of PRESET_GOLDENS) {
        it(`${g.key}: ${g.primary} + ${g.curated}`, () => {
            const preset = getThemePreset(g.key)
            expect(preset, `${g.key} existe en el catálogo`).not.toBeNull()

            // Como lo montan los shells: tema resuelto (primario + secundario del preset + key).
            const pair = sealPair({
                brandColor: preset!.brandColor,
                secondaryColor: preset!.secondaryColor,
                themePresetKey: g.key,
            })
            expect(pair.primary).toBe(g.primary)
            expect(pair.secondary).toBe(g.curated)
            // El derivado del primario existe y es OTRO color — probamos que no se filtró.
            expect(deriveSealSecondary(preset!.brandColor)).toBe(g.derivedTrap)
            expect(pair.secondary).not.toBe(g.derivedTrap)
        })
    }
})

describe('sealPair vía @eva/brand-kit — customs sin secundario (fórmula D3.2)', () => {
    it('custom #E11D48: wrap de hue (346.84°+38 = 384.84° → 24.84°) ⇒ #df9866', () => {
        const pair = sealPair({ brandColor: '#E11D48', secondaryColor: null, themePresetKey: null })
        expect(pair.primary).toBe('#e11d48')
        expect(pair.secondary).toBe('#df9866')
    })

    it('custom #4ADE80: techo L 68% (L .5804+.14 = .7204 → .68) ⇒ #7ddddd', () => {
        const pair = sealPair({ brandColor: '#4ADE80', secondaryColor: null, themePresetKey: null })
        expect(pair.primary).toBe('#4ade80')
        expect(pair.secondary).toBe('#7ddddd')
    })
})

describe('sealPair — misma salida desde el barrel y desde el módulo directo', () => {
    it('barrel y módulo son la MISMA función (o al menos idéntico output)', () => {
        // pnpm dedupea el workspace: debería ser la misma referencia…
        // …y aunque no lo fuera, el output tiene que ser bit a bit idéntico.
        const inputs = [
            { brandColor: '#E03A2F', secondaryColor: '#F59E0B', themePresetKey: 'ember' },
            { brandColor: '#E11D48', secondaryColor: null, themePresetKey: null },
            { brandColor: '#4ADE80' },
        ]
        for (const input of inputs) {
            expect(sealPair(input)).toEqual(sealPairDirect(input))
        }
        expect(deriveSealSecondary('#E11D48')).toBe(deriveDirect('#E11D48'))
    })
})
