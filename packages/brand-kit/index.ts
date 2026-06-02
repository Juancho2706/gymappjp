/**
 * @eva/brand-kit — framework-agnostic white-label color engine.
 *
 * Pure TypeScript (culori, OKLCH). NO React / Next / DOM imports, so the SAME
 * logic runs on web (Next) and the future React Native (Expo) app → identical
 * brand rendering across platforms.
 *
 * Principle: the customer picks a brand color (+ optional per-mode accent).
 * Backgrounds and text are DERIVED, never hand-picked, and text-on-surface is
 * computed for legibility (WCAG AA) so text can never be invisible.
 */
import { converter, formatHex, wcagContrast, clampChroma } from 'culori'

const toOklch = converter('oklch')

export type ThemeMode = 'light' | 'dark'

export type BrandThemeTokens = {
    bg: string
    surface: string
    border: string
    accent: string
    accentText: string
    text: string
    textMuted: string
}

export type BrandTheme = { light: BrandThemeTokens; dark: BrandThemeTokens }

export type BrandThemeInput = {
    brandColor: string
    /** Optional accent override for light mode (defaults to brandColor). */
    accentLight?: string | null
    /** Optional accent override for dark mode (defaults to brandColor). */
    accentDark?: string | null
    /** Tint neutrals (bg/surface/border) with the brand hue for a premium feel. */
    neutralTint?: boolean
}

const NEAR_WHITE = '#ffffff'
const NEAR_BLACK = '#0b0b0c'
const AA_TEXT = 4.5 // WCAG AA normal text
const AA_UI = 3 // WCAG AA UI / large text

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
}

function oklchHex(l: number, c: number, h: number): string {
    const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
    return formatHex(clamped) ?? '#000000'
}

function hueOf(hex: string): number {
    const o = toOklch(hex)
    return (o && typeof o.h === 'number') ? o.h : 0
}

function chromaOf(hex: string): number {
    const o = toOklch(hex)
    return (o && typeof o.c === 'number') ? o.c : 0
}

function lightnessOf(hex: string): number {
    const o = toOklch(hex)
    return (o && typeof o.l === 'number') ? o.l : 0
}

/** WCAG contrast ratio (1–21). */
export function contrastRatio(a: string, b: string): number {
    return Number(wcagContrast(a, b).toFixed(2))
}

/**
 * Pick the most legible text color (near-white or near-black) for a background.
 * Guarantees text is never invisible — returns whichever maximizes contrast.
 */
export function pickOnColor(bg: string): string {
    return contrastRatio(bg, NEAR_WHITE) >= contrastRatio(bg, NEAR_BLACK) ? NEAR_WHITE : NEAR_BLACK
}

/**
 * Adjust an accent's lightness (keeping hue/chroma) until it meets `min` contrast
 * against `bg`. Solves "the brand color is too light/dark to read on this surface".
 * Returns the best-effort color if the minimum is unreachable at gamut extremes.
 */
export function clampAccent(accent: string, bg: string, min: number = AA_UI): string {
    let best = accent
    let bestCr = contrastRatio(accent, bg)
    if (bestCr >= min) return accent

    const c = chromaOf(accent)
    const h = hueOf(accent)
    const startL = lightnessOf(accent)
    const dir = lightnessOf(bg) > 0.5 ? -1 : 1 // light bg → darken accent; dark bg → lighten

    for (let step = 1; step <= 45; step++) {
        const nl = clamp(startL + dir * step * 0.02, 0.05, 0.98)
        const cand = oklchHex(nl, c, h)
        const cr = contrastRatio(cand, bg)
        if (cr > bestCr) { bestCr = cr; best = cand }
        if (cr >= min) return cand
    }
    return best
}

/**
 * Derive a full light + dark theme from a single brand color (+ optional accent
 * overrides). Backgrounds/borders come from a tinted neutral scale; accents are
 * contrast-clamped; text is computed via pickOnColor.
 */
export function resolveBrandTheme(input: BrandThemeInput): BrandTheme {
    const h = hueOf(input.brandColor)
    const nC = input.neutralTint ? 0.012 : 0

    const lightBg = oklchHex(0.99, nC, h)
    const lightSurface = oklchHex(0.97, nC, h)
    const lightBorder = oklchHex(0.90, nC * 1.6, h)
    const lightAccent = clampAccent(input.accentLight || input.brandColor, lightBg, AA_UI)

    const darkBg = oklchHex(0.16, nC, h)
    const darkSurface = oklchHex(0.21, nC, h)
    const darkBorder = oklchHex(0.32, nC * 1.6, h)
    const darkAccent = clampAccent(input.accentDark || input.brandColor, darkBg, AA_UI)

    return {
        light: {
            bg: lightBg,
            surface: lightSurface,
            border: lightBorder,
            accent: lightAccent,
            accentText: pickOnColor(lightAccent),
            text: pickOnColor(lightBg),
            textMuted: oklchHex(0.45, nC, h),
        },
        dark: {
            bg: darkBg,
            surface: darkSurface,
            border: darkBorder,
            accent: darkAccent,
            accentText: pickOnColor(darkAccent),
            text: pickOnColor(darkBg),
            textMuted: oklchHex(0.72, nC, h),
        },
    }
}

export type ContrastItem = { label: string; mode: ThemeMode; ratio: number; min: number; passes: boolean }
export type ContrastReport = { passes: boolean; items: ContrastItem[] }

/** Audit the critical contrast pairs of a theme against WCAG AA. */
export function contrastReport(theme: BrandTheme): ContrastReport {
    const items: ContrastItem[] = []
    const check = (label: string, mode: ThemeMode, a: string, b: string, min: number) =>
        items.push({ label, mode, ratio: contrastRatio(a, b), min, passes: contrastRatio(a, b) >= min })

    for (const mode of ['light', 'dark'] as const) {
        const t = theme[mode]
        check('Texto sobre fondo', mode, t.text, t.bg, AA_TEXT)
        check('Texto sobre superficie', mode, t.text, t.surface, AA_TEXT)
        check('Texto del acento', mode, t.accentText, t.accent, AA_TEXT)
        check('Acento sobre fondo', mode, t.accent, t.bg, AA_UI)
    }
    return { passes: items.every((i) => i.passes), items }
}

/** Convenience guard for the publish gate. */
export function isThemeReadable(input: BrandThemeInput): boolean {
    return contrastReport(resolveBrandTheme(input)).passes
}
