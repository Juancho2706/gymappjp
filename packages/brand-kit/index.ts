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
    /** Acento secundario (white-label v2, color2 independiente). Default = `accent` si no hay secundario. */
    accent2: string
    /** Texto legible sobre `accent2` (pickOnColor). */
    accent2Text: string
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
    /** Optional secondary accent (color2) for light mode (white-label v2). Defaults to the light accent. */
    secondaryLight?: string | null
    /** Optional secondary accent (color2) for dark mode (white-label v2). Defaults to the dark accent. */
    secondaryDark?: string | null
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
    // color2: default = el acento del mismo modo (sin secundario, accent2 === accent → no rompe nada).
    const lightAccent2 = clampAccent(input.secondaryLight || lightAccent, lightBg, AA_UI)

    const darkBg = oklchHex(0.16, nC, h)
    const darkSurface = oklchHex(0.21, nC, h)
    const darkBorder = oklchHex(0.32, nC * 1.6, h)
    const darkAccent = clampAccent(input.accentDark || input.brandColor, darkBg, AA_UI)
    const darkAccent2 = clampAccent(input.secondaryDark || darkAccent, darkBg, AA_UI)

    return {
        light: {
            bg: lightBg,
            surface: lightSurface,
            border: lightBorder,
            accent: lightAccent,
            accentText: pickOnColor(lightAccent),
            accent2: lightAccent2,
            accent2Text: pickOnColor(lightAccent2),
            text: pickOnColor(lightBg),
            textMuted: oklchHex(0.45, nC, h),
        },
        dark: {
            bg: darkBg,
            surface: darkSurface,
            border: darkBorder,
            accent: darkAccent,
            accentText: pickOnColor(darkAccent),
            accent2: darkAccent2,
            accent2Text: pickOnColor(darkAccent2),
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
        // color2 (white-label v2): el secundario también debe ser legible (publish-gate lo bloquea).
        check('Texto del acento 2', mode, t.accent2Text, t.accent2, AA_TEXT)
        check('Acento 2 sobre fondo', mode, t.accent2, t.bg, AA_UI)
    }
    return { passes: items.every((i) => i.passes), items }
}

/** Convenience guard for the publish gate. */
export function isThemeReadable(input: BrandThemeInput): boolean {
    return contrastReport(resolveBrandTheme(input)).passes
}

// ============================================================================
// D2 — White-label SPORT ramp (redesign 2026, token-contract §7)
// ----------------------------------------------------------------------------
// El diseño nuevo recolorea TODO el white-label sobreescribiendo la rampa
// `--sport-100..700` (7 pasos) derivada del ÚNICO color de marca del coach.
// Ember/aqua/ink/status son FIJOS (no se derivan acá). Este motor produce esa
// rampa con el MISMO stack OKLCH + clamp WCAG que ya usa resolveBrandTheme, así
// web y RN renderizan idéntico.
//
// Pareo de texto del diseño (token-contract §2/§7):
//   - 500 = marca exacta. Los fills 500/600/700 cargan TEXTO BLANCO
//     (`--text-on-sport`). `cta-fill` (~600) es white-safe (≥4.5:1 con blanco)
//     para botones sólidos.
//   - 600/700 (modo CLARO) además son legibles como TEXTO sobre el surface
//     claro (`--surface-app` = #FBFCFD).
//   - 100/200 son tints CLAROS: su texto legible es OSCURO (ink/strong) cuando
//     son chip-bg en claro, y ELLOS sirven de foreground claro sobre el surface
//     OSCURO (#0A0D12) en dark mode.
//   - Zona muerta de luminancia: un MISMO color sólido NO puede pasar 4.5:1 como
//     texto sobre #FBFCFD (claro) Y #0A0D12 (oscuro) a la vez. Por eso el modo
//     oscuro usa foregrounds aclarados `dark['600'|'700']` — espejo de
//     theme-dark.css, que en el diseño base mapea sport-600→#7FB0FF / 700→#A9CBFF.
// ============================================================================

/** Light app surface (design `--surface-app` light = `--paper`). */
const SURFACE_APP_LIGHT = '#FBFCFD'
/** Dark app surface (design `--surface-app` under `.dark`). */
const SURFACE_APP_DARK = '#0A0D12'

const toRgb = converter('rgb')

/** `rgba(r, g, b, a)` string from a hex + alpha (focus ring / translucent tints). */
function rgbaFromHex(hex: string, alpha: number): string {
    const c = toRgb(hex)
    const r = Math.round(clamp(c?.r ?? 0, 0, 1) * 255)
    const g = Math.round(clamp(c?.g ?? 0, 0, 1) * 255)
    const b = Math.round(clamp(c?.b ?? 0, 0, 1) * 255)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 7-step sport scale (light-mode base). Keys mirror `--sport-100..700`. */
export type SportRamp = {
    '100': string
    '200': string
    '300': string
    '400': string
    '500': string
    '600': string
    '700': string
}

export type SportTokens = {
    /** Rampa de 7 pasos (modo claro). `500` === marca exacta; hue heredado del brand. */
    ramp: SportRamp
    /** Fill sólido de CTA (~paso 600), white-safe (≥4.5:1 con texto blanco) → `--cta-fill`. */
    ctaFill: string
    /** Anillo de foco = marca @ 0.40 alpha, string `rgba(...)` → `--focus-ring`. */
    focusRing: string
    /** Texto legible SOBRE el fill de marca (white|ink) — espejo de `--text-on-sport`. */
    textOnSport: string
    /**
     * Overrides sport para modo OSCURO. `100` = tint TRASLÚCIDO de marca @ 0.20
     * alpha (espejo exacto de globals.css `.dark --sport-100`) — sin él, la rampa
     * CLARA del :root se filtra al dark y los `bg-sport-100` (day-cards del
     * dashboard alumno, Badge soft, chips) quedan lila claro con texto blanco =
     * ilegible. `600`/`700` = foregrounds ACLARADOS (legibles ≥4.5:1 sobre #0A0D12).
     */
    dark: { '100': string; '600': string; '700': string }
}

/**
 * Derive the 7-step SPORT ramp from a single coach brand color.
 *
 * `500` is returned VERBATIM (the brand, exactly). The other steps inherit the
 * brand hue, desaturate toward the light tints, and clamp chroma to stay
 * in-gamut. The dark steps (600/700) are pushed (lightness only, via the
 * existing `clampAccent`) until they read as text on the LIGHT surface AND are
 * white-text safe. Pure/framework-free — same output on web and RN.
 */
export function deriveSportRamp(brandHex: string): SportRamp {
    const h = hueOf(brandHex)
    const cBrand = chromaOf(brandHex)
    // Clamp brand lightness into a sane mid range purely to GENERATE the
    // siblings (the 500 swatch itself is emitted verbatim, untouched).
    const bl = clamp(lightnessOf(brandHex), 0.45, 0.72)

    const lightOf = (t: number) => bl + (0.965 - bl) * t
    const darkOf = (t: number) => bl - (bl - 0.4) * t

    const step100 = oklchHex(lightOf(0.86), Math.min(cBrand * 0.22, 0.05), h)
    const step200 = oklchHex(lightOf(0.66), Math.min(cBrand * 0.42, 0.09), h)
    const step300 = oklchHex(lightOf(0.4), Math.min(cBrand * 0.62, 0.14), h)
    const step400 = oklchHex(lightOf(0.18), cBrand * 0.85, h)
    const cand600 = oklchHex(darkOf(0.32), cBrand * 0.95, h)
    const cand700 = oklchHex(darkOf(0.62), cBrand * 0.85, h)

    // 600/700 must read as text on the light surface AND carry white text.
    // Clamping against the (slightly off-white) light surface guarantees both:
    // pure white yields ≥ the same contrast as paper, so white-on-fill passes too.
    const step600 = clampAccent(cand600, SURFACE_APP_LIGHT, AA_TEXT)
    const step700 = clampAccent(cand700, SURFACE_APP_LIGHT, AA_TEXT)

    return {
        '100': step100,
        '200': step200,
        '300': step300,
        '400': step400,
        '500': brandHex,
        '600': step600,
        '700': step700,
    }
}

/**
 * Full white-label sport token bundle: the 7-step ramp + the derived
 * `cta-fill`, `focus-ring`, on-sport text color, and dark-mode sport
 * foregrounds. This is the single entry point web (`coach/layout.tsx` inline
 * `<style>`, `/c/[slug]` via headers) and mobile (`brandVars()` →
 * `nativewind.vars()`) wire into `--sport-*` / `--cta-fill` / `--focus-ring`.
 *
 * Free coach → pass `#007AFF` (SYSTEM_PRIMARY). Default EVA → `#2680FF`.
 */
export function deriveSportTokens(brandHex: string): SportTokens {
    const ramp = deriveSportRamp(brandHex)
    const h = hueOf(brandHex)
    const cBrand = chromaOf(brandHex)

    // cta-fill = white-safe brand fill (~step 600). The ramp's 600 is already
    // clamped white-safe against the light surface, so reuse it.
    const ctaFill = ramp['600']

    // Dark-mode sport foregrounds: lightened brand, legible ON the dark surface.
    const dark600 = clampAccent(oklchHex(0.72, Math.min(cBrand * 0.7, 0.16), h), SURFACE_APP_DARK, AA_TEXT)
    const dark700 = clampAccent(oklchHex(0.8, Math.min(cBrand * 0.55, 0.13), h), SURFACE_APP_DARK, AA_TEXT)
    // Dark-mode sport-100: tint traslúcido de marca @ 0.20 alpha — espejo exacto
    // de globals.css `.dark --sport-100: rgba(38,128,255,0.20)` (default #2680FF).
    const dark100 = rgbaFromHex(brandHex, 0.2)

    return {
        ramp,
        ctaFill,
        focusRing: rgbaFromHex(brandHex, 0.4),
        textOnSport: pickOnColor(ctaFill),
        dark: { '100': dark100, '600': dark600, '700': dark700 },
    }
}

// Tokens de motion compartidos (duraciones/easings/springs). Pure TS.
export * from './motion'

// Catálogo de temas preset curados (white-label v2.1) + resolvePresetBranding. Pure TS, DOM-free.
export * from './presets'
