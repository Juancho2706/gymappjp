import { describe, expect, it } from 'vitest'
import {
    clampAccent,
    contrastRatio,
    contrastReport,
    deriveSportRamp,
    deriveSportTokens,
    isThemeReadable,
    pickOnColor,
    resolveBrandTheme,
} from './index'

describe('pickOnColor', () => {
    it('returns dark text on light backgrounds and light text on dark', () => {
        expect(contrastRatio('#ffffff', pickOnColor('#ffffff'))).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio('#0b0b0c', pickOnColor('#0b0b0c'))).toBeGreaterThanOrEqual(4.5)
    })

    it('never yields invisible text even for mid-tones', () => {
        for (const bg of ['#10B981', '#F59E0B', '#8B5CF6', '#777777', '#fefefe', '#101010']) {
            expect(contrastRatio(bg, pickOnColor(bg))).toBeGreaterThanOrEqual(3)
        }
    })
})

describe('clampAccent', () => {
    it('keeps an already-readable accent unchanged', () => {
        const accent = '#1d4ed8'
        expect(clampAccent(accent, '#ffffff', 3)).toBe(accent)
    })

    it('corrects a near-white accent on a white background', () => {
        const fixed = clampAccent('#fafafa', '#ffffff', 3)
        expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(3)
    })

    it('corrects a near-black accent on a dark background', () => {
        const fixed = clampAccent('#050505', '#16161a', 3)
        expect(contrastRatio(fixed, '#16161a')).toBeGreaterThanOrEqual(3)
    })
})

describe('resolveBrandTheme', () => {
    it('produces readable light + dark themes from one brand color', () => {
        for (const brandColor of ['#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#0EA5E9']) {
            const theme = resolveBrandTheme({ brandColor })
            const report = contrastReport(theme)
            expect(report.passes, `${brandColor} → ${JSON.stringify(report.items.filter(i => !i.passes))}`).toBe(true)
        }
    })

    it('is deterministic (same input → same output) for web/RN parity', () => {
        const a = resolveBrandTheme({ brandColor: '#10B981', neutralTint: true })
        const b = resolveBrandTheme({ brandColor: '#10B981', neutralTint: true })
        expect(a).toEqual(b)
    })

    it('honors per-mode accent overrides', () => {
        const theme = resolveBrandTheme({ brandColor: '#10B981', accentDark: '#34d399', accentLight: '#047857' })
        // dark accent must be readable on dark bg, light accent on light bg
        expect(contrastRatio(theme.dark.accent, theme.dark.bg)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(theme.light.accent, theme.light.bg)).toBeGreaterThanOrEqual(3)
    })

    it('rescues an unreadable extreme accent via the gate', () => {
        // pure white accent is unreadable raw, but the resolved theme must still pass
        expect(isThemeReadable({ brandColor: '#ffffff' })).toBe(true)
    })
})

describe('resolveBrandTheme — color2 / accent2 (white-label v2)', () => {
    it('sin secundario: accent2 === accent (no altera los defaults existentes)', () => {
        const t = resolveBrandTheme({ brandColor: '#10B981' })
        expect(t.light.accent2).toBe(t.light.accent)
        expect(t.dark.accent2).toBe(t.dark.accent)
        expect(t.light.accent2Text).toBe(t.light.accentText)
        expect(t.dark.accent2Text).toBe(t.dark.accentText)
    })

    it('secundarios adversariales: el tema sigue pasando AA en light Y dark (clamp rescata)', () => {
        const adversarial = ['#ffffff', '#000000', '#39FF14', '#808000']
        for (const brandColor of ['#8B5CF6', '#10B981']) {
            for (const sec of adversarial) {
                const report = contrastReport(
                    resolveBrandTheme({ brandColor, secondaryLight: sec, secondaryDark: sec })
                )
                expect(
                    report.passes,
                    `${brandColor}+${sec} → ${JSON.stringify(report.items.filter((i) => !i.passes))}`
                ).toBe(true)
            }
        }
    })

    it('el publish-gate considera el secundario (accent2 contrast-clamp por modo)', () => {
        expect(
            isThemeReadable({ brandColor: '#8B5CF6', secondaryLight: '#ffffff', secondaryDark: '#000000' })
        ).toBe(true)
        // el secundario clampeado es legible sobre su fondo en ambos modos
        const t = resolveBrandTheme({ brandColor: '#8B5CF6', secondaryLight: '#fafafa', secondaryDark: '#050505' })
        expect(contrastRatio(t.light.accent2, t.light.bg)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(t.dark.accent2, t.dark.bg)).toBeGreaterThanOrEqual(3)
    })
})

// ────────────────────────────────────────────────────────────────────────────
// D2 — White-label SPORT ramp (--sport-100..700) — TOKENS.md §7
// ────────────────────────────────────────────────────────────────────────────
describe('deriveSportRamp / deriveSportTokens (D2 white-label sport ramp)', () => {
    // design `--surface-app`: light = paper, dark = #0A0D12
    const SURFACE_LIGHT = '#FBFCFD'
    const SURFACE_DARK = '#0A0D12'
    const WHITE = '#ffffff' // --text-on-sport
    const RAMP_KEYS = ['100', '200', '300', '400', '500', '600', '700'] as const

    const brands: Record<string, string> = {
        'EVA default (#2680FF)': '#2680FF',
        'system blue (#007AFF)': '#007AFF',
        'green (#10B981)': '#10B981',
        'magenta (#C026D3)': '#C026D3',
    }

    for (const [name, brand] of Object.entries(brands)) {
        describe(name, () => {
            const ramp = deriveSportRamp(brand)
            const tokens = deriveSportTokens(brand)

            it('500 === brand exactly (verbatim)', () => {
                expect(ramp['500']).toBe(brand)
                expect(tokens.ramp['500']).toBe(brand)
            })

            it('exposes all 7 ramp keys + ctaFill + focusRing + textOnSport + dark', () => {
                for (const k of RAMP_KEYS) {
                    expect(typeof ramp[k]).toBe('string')
                    expect(ramp[k]).toMatch(/^#/)
                }
                expect(tokens.ctaFill).toMatch(/^#/)
                expect(tokens.focusRing).toMatch(/^rgba\(/)
                expect(tokens.focusRing).toContain('0.4') // brand @ 0.40 alpha
                expect(typeof tokens.textOnSport).toBe('string')
                expect(tokens.dark['100']).toMatch(/^rgba\(/)
                expect(tokens.dark['100']).toContain('0.2') // marca @ 0.20 alpha
                expect(typeof tokens.dark['600']).toBe('string')
                expect(typeof tokens.dark['700']).toBe('string')
            })

            it('600/700 pass AA (>=4.5:1) as text/CTA on the LIGHT surface (#FBFCFD)', () => {
                expect(contrastRatio(ramp['600'], SURFACE_LIGHT)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(ramp['700'], SURFACE_LIGHT)).toBeGreaterThanOrEqual(4.5)
            })

            it('600/700 + ctaFill are white-text safe (--text-on-sport white, >=4.5:1)', () => {
                expect(contrastRatio(ramp['600'], WHITE)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(ramp['700'], WHITE)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(tokens.ctaFill, WHITE)).toBeGreaterThanOrEqual(4.5)
                // textOnSport is genuinely legible on the fill it labels
                expect(contrastRatio(tokens.textOnSport, tokens.ctaFill)).toBeGreaterThanOrEqual(4.5)
            })

            it('light tints 100/200 are legible foregrounds on the DARK surface (#0A0D12, >=4.5:1)', () => {
                expect(contrastRatio(ramp['100'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(ramp['200'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
            })

            it('light tints 100/200 carry legible dark text (chip bg, >=4.5:1)', () => {
                expect(contrastRatio(ramp['100'], pickOnColor(ramp['100']))).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(ramp['200'], pickOnColor(ramp['200']))).toBeGreaterThanOrEqual(4.5)
            })

            it('dark-mode sport foregrounds pass AA on the DARK surface (#0A0D12, >=4.5:1)', () => {
                expect(contrastRatio(tokens.dark['600'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
                expect(contrastRatio(tokens.dark['700'], SURFACE_DARK)).toBeGreaterThanOrEqual(4.5)
            })

            it('is deterministic (web/RN parity)', () => {
                expect(deriveSportTokens(brand)).toEqual(deriveSportTokens(brand))
            })
        })
    }

    it('focusRing encodes the brand RGB at 0.40 alpha (default #2680FF → 38,128,255)', () => {
        expect(deriveSportTokens('#2680FF').focusRing).toBe('rgba(38, 128, 255, 0.4)')
    })

    it('dark.100 = tint traslúcido de marca @ 0.20 alpha (espejo exacto de globals.css .dark --sport-100)', () => {
        expect(deriveSportTokens('#2680FF').dark['100']).toBe('rgba(38, 128, 255, 0.2)')
    })

    it('survives achromatic / extreme brand inputs (no throw, still WCAG-safe)', () => {
        for (const brand of ['#808080', '#000000', '#ffffff']) {
            const t = deriveSportTokens(brand)
            expect(t.ramp['500']).toBe(brand)
            expect(contrastRatio(t.ctaFill, '#ffffff')).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(t.ramp['100'], '#0A0D12')).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(t.dark['600'], '#0A0D12')).toBeGreaterThanOrEqual(4.5)
        }
    })
})
