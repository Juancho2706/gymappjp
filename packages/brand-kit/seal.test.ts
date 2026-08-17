import { describe, expect, it } from 'vitest'
import { THEME_PRESETS } from './presets'
import { deriveSealSecondary, sealPair, sealSecondaryLightPaint } from './seal'

// ────────────────────────────────────────────────────────────────────────────
// Golden del Sello EVA v2 (SPEC eva-seal-background D3). Los hex esperados de
// la fórmula derivada `hsl(H+38° wrap 360, S×0.85, min(L+14%, 68%))` fueron
// calculados con el MISMO stack (culori hsl → formatHex) — cualquier drift en
// la matemática o en la lib rompe estos asserts.
// ────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-f]{6}$/

describe('sealPair — presets del catálogo (D3.1: el par curado manda)', () => {
    it('los 14 presets devuelven SU par curado (normalizado), nunca el derivado', () => {
        for (const p of THEME_PRESETS) {
            const pair = sealPair({ brandColor: p.brandColor, secondaryColor: p.secondaryColor })
            expect(pair.primary, `${p.key} primary`).toBe(p.brandColor.toLowerCase())
            expect(pair.secondary, `${p.key} secondary`).toBe(p.secondaryColor.toLowerCase())
            // El curado NO es el derivado (si coincidieran, el test no probaría nada).
            expect(pair.secondary, `${p.key} curado≠derivado`).not.toBe(deriveSealSecondary(p.brandColor))
        }
    })

    it('con themePresetKey que resuelve, el par sale del CATÁLOGO aunque falte secondaryColor', () => {
        for (const p of THEME_PRESETS) {
            const pair = sealPair({ brandColor: p.brandColor, themePresetKey: p.key })
            expect(pair.secondary, p.key).toBe(p.secondaryColor.toLowerCase())
        }
    })
})

describe('sealPair — regla B2 (legacy/custom sin preset ⇒ el hex suelto NO cuenta)', () => {
    it('themePresetKey null + brand_secondary_color legacy ⇒ se IGNORA y se deriva', () => {
        const pair = sealPair({
            brandColor: '#E11D48',
            secondaryColor: '#00FF00', // hex suelto viejo — jamás debe salir
            themePresetKey: null,
        })
        expect(pair.secondary).toBe(deriveSealSecondary('#E11D48'))
        expect(pair.secondary).not.toBe('#00ff00')
    })

    it('themePresetKey desconocida ⇒ mismo trato que null (deriva)', () => {
        const pair = sealPair({
            brandColor: '#E11D48',
            secondaryColor: '#00FF00',
            themePresetKey: 'no-existe-este-preset',
        })
        expect(pair.secondary).toBe(deriveSealSecondary('#E11D48'))
    })

    it('modo confiado (sin campo themePresetKey): secondaryColor válido se respeta', () => {
        // El caller que omite la key declara que YA aplicó B2 aguas arriba.
        const pair = sealPair({ brandColor: '#E11D48', secondaryColor: '#F59E0B' })
        expect(pair.secondary).toBe('#f59e0b')
    })
})

describe('deriveSealSecondary — fórmula D3.2 (goldens)', () => {
    it('caso base: #E11D48 (H 346.84° wrapea a 24.84°) ⇒ #df9866', () => {
        expect(deriveSealSecondary('#E11D48')).toBe('#df9866')
    })

    it('wrap de hue: H+38 > 360 se pliega con % 360 (no se clampa a 360)', () => {
        // #E11D48 → hsl(346.84, .7717, .4980) → hsl(24.84, .6559, .6380).
        // Si el hue se clampara en vez de wrapear quedaría un rojo (~360°), no un naranja.
        const derived = deriveSealSecondary('#E11D48')
        expect(derived).toBe('#df9866')
        expect(derived).not.toBe(deriveSealSecondary('#E11D00')) // sanity: el input importa
    })

    it('techo de lightness: L+14% se corta en 68% ⇒ #4ADE80 (L .5804) da #7ddddd', () => {
        // .5804 + .14 = .7204 > .68 ⇒ L final .68 exacto.
        expect(deriveSealSecondary('#4ADE80')).toBe('#7ddddd')
    })

    it('sin techo alcanzado: #0EA5E9 (L .4843 → .6243) ⇒ #575fe7', () => {
        expect(deriveSealSecondary('#0EA5E9')).toBe('#575fe7')
    })

    it('saturación ×0.85: gris azulado #94A3B8 (S .2022 → .1719) ⇒ #a59fbb', () => {
        expect(deriveSealSecondary('#94A3B8')).toBe('#a59fbb')
    })

    it('acromático (S=0, hue undefined en culori) no revienta y solo empuja L', () => {
        const derived = deriveSealSecondary('#808080')
        expect(derived).toMatch(HEX_RE)
        // S×0.85 = 0 ⇒ sigue siendo gris (r=g=b), solo más claro.
        const [r, g, b] = [derived.slice(1, 3), derived.slice(3, 5), derived.slice(5, 7)]
        expect(r).toBe(g)
        expect(g).toBe(b)
    })
})

describe('sealPair — normalización y fail-safe', () => {
    it('normaliza a #rrggbb minúsculas (shorthand y mayúsculas)', () => {
        const pair = sealPair({ brandColor: '#ABC', secondaryColor: '#F59E0B' })
        expect(pair.primary).toBe('#aabbcc')
        expect(pair.secondary).toBe('#f59e0b')
    })

    it('secondaryColor no parseable ⇒ se deriva (sin throw)', () => {
        const pair = sealPair({ brandColor: '#2563EB', secondaryColor: 'no-es-color' })
        expect(pair.secondary).toBe(deriveSealSecondary('#2563EB'))
    })

    it('secondaryColor null/vacío ⇒ se deriva', () => {
        expect(sealPair({ brandColor: '#2563EB', secondaryColor: null }).secondary)
            .toBe(deriveSealSecondary('#2563EB'))
        expect(sealPair({ brandColor: '#2563EB' }).secondary)
            .toBe(deriveSealSecondary('#2563EB'))
    })

    it('es determinístico: mismo input ⇒ mismo output (llamadas repetidas)', () => {
        const a = sealPair({ brandColor: '#7C3AED', themePresetKey: 'violet' })
        const b = sealPair({ brandColor: '#7C3AED', themePresetKey: 'violet' })
        expect(a).toEqual(b)
    })

    it('todo output es hex de 6 dígitos minúsculas', () => {
        for (const brand of ['#E03A2F', '#2563EB', '#7C3AED', '#E11D48', '#4ADE80']) {
            const pair = sealPair({ brandColor: brand })
            expect(pair.primary).toMatch(HEX_RE)
            expect(pair.secondary).toMatch(HEX_RE)
        }
    })
})

describe('sealSecondaryLightPaint — pintado claro del blob 2 (S1.2, artifact L+8)', () => {
    // Goldens precomputados con el MISMO stack (culori hsl → formatHex), igual que arriba.
    it('par derivado de EVA #1462DC (#7855e2) pinta claro como #633bde (−6 pts de L)', () => {
        const pair = sealPair({ brandColor: '#1462DC', themePresetKey: null })
        expect(pair.secondary).toBe('#7855e2')
        expect(sealSecondaryLightPaint(pair.secondary)).toBe('#633bde')
    })

    it('par curado (sport-blue #06B6D4) recibe la misma calibración: #059cb6', () => {
        const pair = sealPair({ brandColor: '#2563EB', themePresetKey: 'sport-blue' })
        expect(pair.secondary).toBe('#06b6d4')
        expect(sealSecondaryLightPaint(pair.secondary)).toBe('#059cb6')
    })

    it('derivado bajo el techo: verde #22C55E ⇒ par #59d5d5, pintado claro #41cfcf', () => {
        expect(sealSecondaryLightPaint(deriveSealSecondary('#22C55E'))).toBe('#41cfcf')
    })

    it('clamp inferior: un secundario casi negro no baja de L=0 (sin throw)', () => {
        expect(sealSecondaryLightPaint('#050505')).toMatch(HEX_RE)
    })

    it('input no parseable cae al fail-safe (hsl 0/0/0 ⇒ negro), jamás throw', () => {
        expect(sealSecondaryLightPaint('no-es-color')).toBe('#000000')
    })
})
