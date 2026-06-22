import { describe, expect, it } from 'vitest'
import {
    clampAccent,
    contrastRatio,
    contrastReport,
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
