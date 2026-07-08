import type { ViewStyle } from 'react-native'
import { resolveBrandTheme, deriveSportTokens } from '@eva/brand-kit'
import { GLOWS } from './shadows'
import { FONT } from './typography'

/**
 * ⚠️ THEMING FRONTIER — this imperative `Theme` object is a READ-ONLY SHIM and
 * a DEPRECATED second source of color. DO NOT add new consumers.
 *
 * Mobile has two theming mechanisms; the canonical one is NativeWind classes
 * (var-driven, dark-aware + white-label-aware at runtime via `brandVars`).
 * This StyleSheet `Theme` object exists ONLY for the handful of things
 * NativeWind classes cannot express in RN:
 *   - literal `shadowColor` (RN shadows need a concrete color)
 *   - color props of native libs (@gorhom/bottom-sheet backgroundStyle, etc.)
 *   - lucide icon `color`, `placeholderTextColor`, `ActivityIndicator color`
 *
 * Everything else — background / border / text of a <View>/<Text> — MUST come
 * from `className` so dark mode and the coach's white-label brand resolve
 * automatically. A color hardcoded from this object for something the brand
 * ramp should drive diverges from the coach accent.
 *
 * The objects below are frozen (Object.freeze) so no consumer can mutate them,
 * and every literal is derived from the SINGLE `DS` palette source (no hex is
 * written twice). Values mirror EVA DS (token-contract.md / web globals.css).
 * Shadows/glows live in `./shadows`; type faces in `./typography`.
 */

export interface Theme {
  /** Resolved appearance of this theme instance (drives scheme-aware elevation). */
  scheme: 'light' | 'dark'
  // Core (used across all screens)
  primary: string
  background: string
  card: string
  text: string
  textSecondary: string
  muted: string
  border: string
  destructive: string
  success: string
  // Extended (new - matches web design system)
  primaryForeground: string
  foreground: string
  mutedForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  cyan: string
  input: string
  // Border radius scale
  radius: {
    sm: number
    md: number
    lg: number
    xl: number
    '2xl': number
    '3xl': number
  }
  // Shadows / glow (sourced from ./shadows — single source)
  shadowGlowBlue: ViewStyle
  shadowGlowCyan: ViewStyle
  shadowGlowEmber: ViewStyle
  // Typography (face names — see ./typography FONT)
  fontSans: string
  fontDisplay: string
}

/**
 * Single palette source for the imperative shim. Every literal hex below is
 * written ONCE here and referenced by both themes — no duplication. Names/values
 * mirror the DS tokens (token-contract.md / web globals.css).
 */
const DS = {
  sport500: '#2680FF', // brand (applyCoachBranding overrides at runtime)
  danger500: '#F4365A',
  success500: '#1FB877',
  aqua500: '#18ABD4', // recovery
  white: '#FFFFFF',
  // Light neutrals
  inkStrong: '#0B0E13', // ink-950 / text-strong (light)
  inkMuted: '#5A6573', // ink-500 / text-muted (light)
  paper: '#FBFCFD', // surface-app (light)
  sunkenLight: '#F4F6F8', // ink-50 / surface-sunken (light)
  borderLight: '#E6E9ED', // ink-100 / border-subtle (light)
  // Dark neutrals
  textStrongDark: '#F4F6F8',
  textMutedDark: '#8A95A3',
  surfaceAppDark: '#0A0D12',
  surfaceCardDark: '#161B22',
  surfaceSunkenDark: '#1F262F',
  borderDark: 'rgba(255,255,255,0.07)', // border-subtle (dark)
} as const

const radius = Object.freeze({
  sm: 7,
  md: 10,
  lg: 12,
  xl: 17,
  '2xl': 22,
  '3xl': 26,
})

/** Shallow-freeze a Theme plus its nested style objects so it stays read-only. */
function freezeTheme(t: Theme): Theme {
  Object.freeze(t.radius)
  Object.freeze(t.shadowGlowBlue)
  Object.freeze(t.shadowGlowCyan)
  Object.freeze(t.shadowGlowEmber)
  return Object.freeze(t)
}

export const lightTheme: Theme = freezeTheme({
  scheme: 'light',
  // Core (backward compat)
  primary: DS.sport500,
  background: DS.paper,
  card: DS.white,
  text: DS.inkStrong,
  textSecondary: DS.inkMuted,
  muted: DS.sunkenLight,
  border: DS.borderLight,
  destructive: DS.danger500,
  success: DS.success500,
  // Extended
  primaryForeground: DS.white, // text-on-sport
  foreground: DS.inkStrong,
  mutedForeground: DS.inkMuted,
  secondary: DS.sunkenLight,
  secondaryForeground: DS.inkStrong,
  accent: DS.sunkenLight,
  accentForeground: DS.sport500, // brand; applyCoachBranding() overrides
  cyan: DS.aqua500,
  input: 'rgba(0,0,0,0.05)',
  radius,
  shadowGlowBlue: GLOWS.sport,
  shadowGlowCyan: GLOWS.aqua,
  shadowGlowEmber: GLOWS.ember,
  fontSans: FONT.ui,
  fontDisplay: FONT.display,
})

export const darkTheme: Theme = freezeTheme({
  scheme: 'dark',
  // Core (backward compat)
  primary: DS.sport500,
  background: DS.surfaceAppDark,
  card: DS.surfaceCardDark,
  text: DS.textStrongDark,
  textSecondary: DS.textMutedDark,
  muted: DS.surfaceSunkenDark,
  border: DS.borderDark,
  destructive: DS.danger500,
  success: DS.success500,
  // Extended
  primaryForeground: DS.white,
  foreground: DS.textStrongDark,
  mutedForeground: DS.textMutedDark,
  secondary: DS.surfaceSunkenDark,
  secondaryForeground: DS.textStrongDark,
  accent: DS.surfaceSunkenDark,
  accentForeground: DS.sport500, // brand; applyCoachBranding() overrides
  cyan: DS.aqua500,
  input: 'rgba(255,255,255,0.05)',
  radius,
  shadowGlowBlue: GLOWS.sport,
  shadowGlowCyan: GLOWS.aqua,
  shadowGlowEmber: GLOWS.ember,
  fontSans: FONT.ui,
  fontDisplay: FONT.display,
})

const DEFAULT_BRAND = '#007AFF'

/** "#rrggbb" -> "r g b" (channels for NativeWind rgb(var(--x) / <alpha>)). */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `${r} ${g} ${b}`
}

/**
 * "rgba(r, g, b, a)" -> "r g b" channels (alpha DROPPED — el sistema de vars de
 * NativeWind aplica el alpha en la utility `rgb(var(--x) / <alpha>)`). Espejo de
 * global.css `.dark --color-sport-100: 38 128 255` (comentado como rgba(...,.20)).
 */
function rgbaToChannels(rgba: string): string {
  const m = rgba.match(/-?\d+(?:\.\d+)?/g)
  if (!m || m.length < 3) return '0 0 0'
  return `${Math.round(+m[0])} ${Math.round(+m[1])} ${Math.round(+m[2])}`
}

/**
 * StyleSheet Theme branded via @eva/brand-kit (same engine as web/PWA): the
 * accent is contrast-clamped and matches the published org/coach brand.
 */
export function applyCoachBranding(base: Theme, primaryColor?: string | null): Theme {
  const scheme = base === darkTheme ? 'dark' : 'light'
  const t = resolveBrandTheme({ brandColor: primaryColor || DEFAULT_BRAND })[scheme]
  return {
    ...base,
    primary: t.accent,
    primaryForeground: t.accentText,
    accentForeground: t.accent,
  }
}

/**
 * NativeWind CSS-var overrides for the brand accent (per scheme). Spread the
 * result onto a wrapping <View style={...}> so Tailwind classes (bg-primary,
 * text-primary, border-accent…) pick up the live brand color.
 */
export function brandVars(primaryColor: string | null | undefined, scheme: 'light' | 'dark'): Record<string, string> {
  const brand = primaryColor || DEFAULT_BRAND
  const t = resolveBrandTheme({ brandColor: brand })[scheme]
  // D2 white-label: rampa SPORT derivada (misma engine que web/PWA) → recolorea --sport-* en vivo.
  // En dark, 600/700 usan los foregrounds aclarados legibles sobre la superficie oscura.
  const sport = deriveSportTokens(brand)
  // En dark, sport-100 FLIPEA a los canales de marca (el alpha .20 lo aplica la
  // utility) — espejo de global.css .dark --color-sport-100. Sin esto la rampa
  // CLARA del light se filtra al dark y los bg-sport-100 salen lila claro con
  // texto blanco = ilegible. dark['100'] es un string rgba(...), así que se
  // parsea a canales (NO pasa por hexToChannels). 600/700 = foregrounds aclarados.
  const sport100 = scheme === 'dark' ? rgbaToChannels(sport.dark['100']) : hexToChannels(sport.ramp['100'])
  const sport600 = scheme === 'dark' ? sport.dark['600'] : sport.ramp['600']
  const sport700 = scheme === 'dark' ? sport.dark['700'] : sport.ramp['700']
  return {
    '--color-primary': hexToChannels(t.accent),
    '--color-primary-foreground': hexToChannels(t.accentText),
    '--color-accent': hexToChannels(t.accent),
    '--color-accent-foreground': hexToChannels(t.accent),
    '--color-brand': hexToChannels(sport.ramp['500']),
    '--color-sport-100': sport100,
    '--color-sport-200': hexToChannels(sport.ramp['200']),
    '--color-sport-300': hexToChannels(sport.ramp['300']),
    '--color-sport-400': hexToChannels(sport.ramp['400']),
    '--color-sport-500': hexToChannels(sport.ramp['500']),
    '--color-sport-600': hexToChannels(sport600),
    '--color-sport-700': hexToChannels(sport700),
    '--color-cta-fill': hexToChannels(sport.ctaFill),
    '--color-focus-ring': hexToChannels(brand),
  }
}
