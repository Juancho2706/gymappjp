import { describe, expect, it } from 'vitest'
import { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE } from '@eva/schemas'
import {
    contrastRatio,
    contrastReport,
    deriveSportTokens,
    isThemeReadable,
    pickOnColor,
    resolveBrandTheme,
    type BrandThemeInput,
} from './index'
import {
    getThemePreset,
    resolvePresetBranding,
    THEME_PRESETS,
    type BrandPreset,
} from './presets'

// Mapea un preset a los inputs EXACTOS que los layouts/login pasan a resolveBrandTheme
// (color2 = mismo hex en ambos modos; accents opcionales por-modo).
function themeInputOf(p: BrandPreset): BrandThemeInput {
    return {
        brandColor: p.brandColor,
        accentLight: p.accentLight ?? null,
        accentDark: p.accentDark ?? null,
        secondaryLight: p.secondaryColor,
        secondaryDark: p.secondaryColor,
        neutralTint: p.neutralTint,
    }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

describe('THEME_PRESETS — integridad del catálogo', () => {
    it('trae 14 presets con keys únicas', () => {
        expect(THEME_PRESETS.length).toBe(14)
        const keys = THEME_PRESETS.map((p) => p.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('cada preset usa una fuente y un loader EXISTENTES (sin drift con @eva/schemas)', () => {
        for (const p of THEME_PRESETS) {
            expect(FONT_KEY_TUPLE as readonly string[], `${p.key} fontKey`).toContain(p.fontKey)
            expect(LOADER_VARIANT_TUPLE as readonly string[], `${p.key} loaderVariant`).toContain(p.loaderVariant)
        }
    })

    it('colores de semilla son hex de 6 dígitos y label/feel presentes', () => {
        const feels = ['bold', 'calm', 'techy', 'warm']
        for (const p of THEME_PRESETS) {
            expect(p.brandColor, `${p.key} brandColor`).toMatch(HEX_RE)
            expect(p.secondaryColor, `${p.key} secondaryColor`).toMatch(HEX_RE)
            expect(p.label.length, `${p.key} label`).toBeGreaterThan(0)
            expect(feels, `${p.key} feel`).toContain(p.feel)
        }
    })
})

// ────────────────────────────────────────────────────────────────────────────
// GATE DE CURADURÍA — ningún preset ships si es ilegible. Mismo clamp WCAG que
// un color libre → un tema curado NUNCA puede ser ilegible (claro NI oscuro).
// ────────────────────────────────────────────────────────────────────────────
describe('THEME_PRESETS — gate de contraste WCAG (claro + oscuro)', () => {
    const SURFACE_LIGHT = '#FBFCFD'
    const SURFACE_DARK = '#0A0D12'
    const WHITE = '#ffffff'

    for (const p of THEME_PRESETS) {
        describe(`${p.key} (${p.label})`, () => {
            const input = themeInputOf(p)

            it('resolveBrandTheme pasa contrastReport en claro Y oscuro', () => {
                const report = contrastReport(resolveBrandTheme(input))
                expect(
                    report.passes,
                    `${p.key} → ${JSON.stringify(report.items.filter((i) => !i.passes))}`,
                ).toBe(true)
            })

            it('isThemeReadable === true', () => {
                expect(isThemeReadable(input)).toBe(true)
            })

            it('deriveSportTokens: 500 verbatim + 600/700 white-safe + tints legibles en dark', () => {
                const t = deriveSportTokens(p.brandColor)
                expect(t.ramp['500']).toBe(p.brandColor)
                // fills 600/700 + cta cargan texto blanco (≥4.5:1)
                expect(contrastRatio(t.ramp['600'], WHITE)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(t.ramp['700'], WHITE)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(t.ctaFill, WHITE)).toBeGreaterThanOrEqual(4.5)
                // 600/700 legibles como texto sobre el surface CLARO
                expect(contrastRatio(t.ramp['600'], SURFACE_LIGHT)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(t.ramp['700'], SURFACE_LIGHT)).toBeGreaterThanOrEqual(4.5)
                // tints 100/200 legibles como foreground sobre el surface OSCURO
                expect(contrastRatio(t.ramp['100'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(t.ramp['200'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
                // dark.100 = tint traslúcido de marca @ 0.20 (evita que la rampa CLARA
                // se filtre al dark → bg-sport-100 lila claro con texto blanco = ilegible)
                expect(t.dark['100']).toMatch(/^rgba\(/)
                expect(t.dark['100']).toMatch(/, 0\.2\)$/)
                // foregrounds sport de modo oscuro legibles sobre el surface oscuro
                expect(contrastRatio(t.dark['600'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(t.dark['700'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
            })

            it('el texto derivado (pickOnColor) nunca es invisible', () => {
                const theme = resolveBrandTheme(input)
                for (const mode of ['light', 'dark'] as const) {
                    const m = theme[mode]
                    expect(contrastRatio(m.accent, pickOnColor(m.accent))).toBeGreaterThanOrEqual(4.5)
                    expect(contrastRatio(m.accent2, pickOnColor(m.accent2))).toBeGreaterThanOrEqual(4.5)
                }
            })
        })
    }
})

describe('resolvePresetBranding', () => {
    it('key válida ⇒ COLORES del preset mandan; fuente/loader del preset solo si el coach no eligió', () => {
        const p = THEME_PRESETS[0]
        // Coach SIN elección explícita de fuente/loader (loader 'eva' = default, fuente vacía)
        const out = resolvePresetBranding({
            theme_preset_key: p.key,
            primary_color: '#000000',
            brand_secondary_color: '#000000',
            accent_light: '#000000',
            accent_dark: '#000000',
            neutral_tint: false,
            brand_font_key: '',
            loader_variant: 'eva',
        })
        expect(out.primary_color).toBe(p.brandColor)
        expect(out.brand_secondary_color).toBe(p.secondaryColor)
        expect(out.brand_font_key).toBe(p.fontKey)
        expect(out.loader_variant).toBe(p.loaderVariant)
        expect(out.neutral_tint).toBe(p.neutralTint)
        expect(out.appliedPreset?.key).toBe(p.key)
    })

    it('key válida + elección EXPLÍCITA del coach ⇒ fuente/loader del coach GANAN (sugerencia editable)', () => {
        const p = THEME_PRESETS[0]
        const out = resolvePresetBranding({
            theme_preset_key: p.key,
            primary_color: '#000000',
            brand_font_key: 'inter',
            loader_variant: 'ritmo',
        })
        // Colores: siempre del preset (elegir tema = cambiar la paleta)
        expect(out.primary_color).toBe(p.brandColor)
        // Fuente/loader: la elección explícita del coach le gana a la sugerencia del tema
        expect(out.brand_font_key).toBe('inter')
        expect(out.loader_variant).toBe('ritmo')
        expect(out.appliedPreset?.key).toBe(p.key)
    })

    it('key NULL ⇒ passthrough intacto (grandfather)', () => {
        const out = resolvePresetBranding({
            theme_preset_key: null,
            primary_color: '#123456',
            brand_secondary_color: '#654321',
            accent_light: '#abcdef',
            brand_font_key: 'montserrat',
            loader_variant: 'progreso',
            neutral_tint: true,
        })
        expect(out.primary_color).toBe('#123456')
        expect(out.brand_secondary_color).toBe('#654321')
        expect(out.accent_light).toBe('#abcdef')
        expect(out.brand_font_key).toBe('montserrat')
        expect(out.loader_variant).toBe('progreso')
        expect(out.neutral_tint).toBe(true)
        expect(out.appliedPreset).toBeNull()
    })

    it('key desconocida ⇒ passthrough (no revienta ni inventa preset)', () => {
        const out = resolvePresetBranding({
            theme_preset_key: 'no-existe-este-preset',
            primary_color: '#0f0f0f',
        })
        expect(out.primary_color).toBe('#0f0f0f')
        expect(out.appliedPreset).toBeNull()
    })

    it('fila vacía ⇒ todo null (sin throw)', () => {
        const out = resolvePresetBranding({})
        expect(out.primary_color).toBeNull()
        expect(out.brand_font_key).toBeNull()
        expect(out.appliedPreset).toBeNull()
    })
})

describe('getThemePreset', () => {
    it('resuelve por key y falla-closed en entradas inválidas', () => {
        expect(getThemePreset(THEME_PRESETS[3].key)?.key).toBe(THEME_PRESETS[3].key)
        expect(getThemePreset(null)).toBeNull()
        expect(getThemePreset(undefined)).toBeNull()
        expect(getThemePreset('')).toBeNull()
        expect(getThemePreset('zzz-unknown')).toBeNull()
    })
})
