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
 * written twice). Values mirror EVA DS (TOKENS.md / web globals.css).
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
  /** border-subtle: hairline divisor/superficie. Dark = white 7%, light = ink-100 solid. */
  border: string
  /**
   * border-default: borde algo más marcado (botones outline, borde de Card).
   * Existe porque el token NativeWind `border-default` es blanco puro en dark
   * (global.css:209 `255 255 255`) y la clase bare compila `<alpha-value>`=1 →
   * blanco OPACO; en web es rgba(255,255,255,0.13) (globals.css:601). Se pasa por
   * style.borderColor (igual que `border` para el divisor) para resolver el alpha.
   */
  borderDefault: string
  /**
   * aqua-700 (recovery foreground): color imperativo scheme-aware para el icono
   * lucide de descanso (RestDayCard). Lucide-react-native toma `color`, no className
   * dark-aware, así que el flip (light #0A6E8D / dark #6FD3EA) se resuelve acá.
   * Espejo de `--color-aqua-700` (web globals.css: light :366 / dark :632).
   */
  aqua700: string
  destructive: string
  success: string
  /** --warning-500; imperative status color for native/SVG props. */
  warning: string
  // Extended (new - matches web design system)
  primaryForeground: string
  foreground: string
  mutedForeground: string
  secondary: string
  secondaryForeground: string
  /**
   * ink-300 (border-strong / empty-ring stroke): color imperativo scheme-aware
   * para trazos DS que una className no expresa (SVG `stroke` del ProgressRing
   * vacío). FLIPEA en dark. Espejo de `--ink-300` web (globals.css: light :340
   * #A8B1BD / dark :638 #414C5A); web `ComplianceRing.tsx:26` usa var(--ink-300)
   * como `emptyStroke`.
   */
  ink300: string
  /** Neutral fijo para navegación inactiva; --ink-400 no cambia por scheme/brand. */
  ink400: string
  accent: string
  accentForeground: string
  cyan: string
  input: string
  // Border radius scale (mirror de web globals.css @theme --radius-xs..3xl + semánticos)
  radius: {
    xs: number
    sm: number
    md: number
    lg: number
    xl: number
    '2xl': number
    '3xl': number
    /** DS semantic: rounded-card web = 20px */
    card: number
    /** DS semantic: rounded-control web = 14px */
    control: number
    /** DS semantic: rounded-pill web = 999px */
    pill: number
    /** DS semantic: rounded-sheet web = 28px */
    sheet: number
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
 * mirror the DS tokens (TOKENS.md / web globals.css).
 */
const DS = {
  sport500: '#2680FF', // brand (applyCoachBranding overrides at runtime)
  danger500: '#F4365A',
  success500: '#1FB877',
  warning500: '#F5A524',
  ember500: '#FF6A3D',
  ember100: '#FFEDE6',
  aqua500: '#18ABD4', // recovery
  // aqua-700 (recovery foreground): FLIPEA en dark. Icono/foreground sobre chip aqua-100.
  // Espejo web globals.css: light :root #0A6E8D (:366) / dark .dark #6FD3EA (:632).
  aqua700Light: '#0A6E8D', // --aqua-700 light
  aqua700Dark: '#6FD3EA', // --aqua-700 dark
  white: '#FFFFFF',
  // Light neutrals
  inkStrong: '#0B0E13', // ink-950 / text-strong (light)
  inkMuted: '#5A6573', // ink-500 / text-muted (light)
  ink300Light: '#A8B1BD', // ink-300 / border-strong / empty-ring stroke (light) — web globals.css:340
  ink400: '#818C9A', // --ink-400; tabs inactivos, fijo en light/dark
  paper: '#FBFCFD', // surface-app (light)
  sunkenLight: '#F4F6F8', // ink-50 / surface-sunken (light)
  borderLight: '#E6E9ED', // ink-100 / border-subtle (light)
  borderDefaultLight: '#CDD3DB', // ink-200 / border-default (light) — web globals.css:414
  borderDefaultDark: 'rgba(255,255,255,0.13)', // border-default (dark) — web globals.css:601
  // Dark neutrals
  textStrongDark: '#F4F6F8',
  textMutedDark: '#8A95A3',
  ink300Dark: '#414C5A', // ink-300 (dark) — web globals.css:638
  surfaceAppDark: '#0A0D12',
  surfaceCardDark: '#161B22',
  surfaceSunkenDark: '#1F262F',
  borderDark: 'rgba(255,255,255,0.07)', // border-subtle (dark)
} as const

// Mirror 1:1 de la escala de radios del web (globals.css @theme --radius-xs..3xl
// + --radius-card/-control/-pill/-sheet). Antes era la escala legacy 7/10/12/17/22/26,
// que divergía del contrato (web rounded-lg = 20, no 12).
const radius = Object.freeze({
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
  '3xl': 44,
  card: 20,
  control: 14,
  pill: 999,
  sheet: 28,
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
  borderDefault: DS.borderDefaultLight,
  aqua700: DS.aqua700Light,
  destructive: DS.danger500,
  success: DS.success500,
  warning: DS.warning500,
  // Extended
  primaryForeground: DS.white, // text-on-sport
  foreground: DS.inkStrong,
  mutedForeground: DS.inkMuted,
  secondary: DS.sunkenLight,
  secondaryForeground: DS.inkStrong,
  ink300: DS.ink300Light,
  ink400: DS.ink400,
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
  borderDefault: DS.borderDefaultDark,
  aqua700: DS.aqua700Dark,
  destructive: DS.danger500,
  success: DS.success500,
  warning: DS.warning500,
  // Extended
  primaryForeground: DS.white,
  foreground: DS.textStrongDark,
  mutedForeground: DS.textMutedDark,
  secondary: DS.surfaceSunkenDark,
  secondaryForeground: DS.textStrongDark,
  ink300: DS.ink300Dark,
  ink400: DS.ink400,
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

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)" for imperative color props (lucide,
 *  MotiView backgroundColor) that need a literal when a className can't express it. */
export function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToChannels(hex).replace(/ /g, ', ')}, ${alpha})`
}

/** "r g b" channels -> "#rrggbb". Inverse of `hexToChannels`; lets an imperative
 *  color prop reuse the SAME channel source that feeds a NativeWind `--color-*` var. */
function channelsToHex(channels: string): string {
  const [r, g, b] = channels.trim().split(/\s+/).map((n) => Math.max(0, Math.min(255, Number(n) || 0)))
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Canales de los neutros "on dark" (texto sobre superficie oscura) — MISMO valor que
// las vars NativeWind `--color-text-on-dark`/`-muted` (global.css:102-103 y :203-204;
// idénticos en light y dark ⇒ scheme-independent, NO white-label). Espejo del contrato
// web globals.css:408-409 (`--text-on-dark: var(--ink-50)` #F4F6F8 / `--text-on-dark-muted: #939DAB`).
const ON_DARK_CHANNELS = '244 246 248' // ink-50 #F4F6F8
const ON_DARK_MUTED_CHANNELS = '147 157 171' // #939DAB

/**
 * Neutros "on dark" resueltos como hex imperativo para props de color que una
 * className no puede animar (lucide icon `color`). Se atan a los MISMOS canales que
 * alimentan `--color-text-on-dark`/`-muted` de NativeWind (igual que `resolveSportRamp`
 * hace con `--sport-*`), en vez de clavar el literal en el consumidor: mantiene el valor
 * actual (#F4F6F8 / #939DAB) pero lo liga al token, así no deriva si el token cambiara.
 * Sin arg de scheme/branding porque estos neutros no flipean ni son white-label.
 */
export function resolveOnDark(): { onDark: string; onDarkMuted: string } {
  return { onDark: channelsToHex(ON_DARK_CHANNELS), onDarkMuted: channelsToHex(ON_DARK_MUTED_CHANNELS) }
}

/**
 * Runtime-resolved SPORT ramp hexes (300/400/500) for the CURRENT white-label
 * brand — the SAME `deriveSportTokens` source that `brandVars` feeds into the
 * NativeWind `--color-sport-*` vars. Use it for imperative color props a
 * className can't drive (lucide icon `color`, MotiView `backgroundColor`) so
 * they track the coach override in lockstep with the `sport-*` utility classes.
 * Steps 300/400/500 are scheme-independent in `brandVars` (only 100/600/700 flip
 * in dark), so no scheme arg is needed. Mirrors the `primaryColor || DEFAULT_BRAND`
 * fallback so a free/default coach resolves to the identical ramp NativeWind uses.
 */
export function resolveSportRamp(primaryColor?: string | null): {
  sport300: string
  sport400: string
  sport500: string
} {
  const { ramp } = deriveSportTokens(primaryColor || DEFAULT_BRAND)
  return { sport300: ramp['300'], sport400: ramp['400'], sport500: ramp['500'] }
}

/** Exact gradient stops used by tokenized `ember-100 → sport-100` celebratory surfaces. */
export function resolveCelebrationSurfaceRamp(
  primaryColor: string | null | undefined,
  scheme: 'light' | 'dark',
): { ember100: string; sport100: string } {
  const sport = deriveSportTokens(primaryColor || DEFAULT_BRAND)
  return {
    ember100: scheme === 'dark' ? hexToRgba(DS.ember500, 0.2) : DS.ember100,
    sport100: scheme === 'dark' ? sport.dark['100'] : sport.ramp['100'],
  }
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

/**
 * Valores LIGHT (canales "r g b") de EXACTAMENTE los CSS-vars que el bloque
 * `.dark` de `global.css` sobreescribe. Se spreadean con `vars()` en la <View>
 * de `ForceLightTheme` (context/ThemeContext) para SCOPEAR el tema claro a la
 * familia de entrada: el var mas cercano gana sobre el `.dark` del root, asi que
 * los tokens semanticos (bg-surface-app, text-strong, border-subtle…) resuelven
 * claro SOLO en ese subarbol —sin tocar el colorScheme GLOBAL— y las clases
 * dark: quedan inertes ahi. El resto de la app sigue dark-aware.
 *
 * ⚠️ MANTENIMIENTO: espejo del bloque `.dark:root, .dark { … }` de global.css.
 * Si ahi se agrega/quita un token que flipea en dark, reflejarlo aca (mismos
 * valores que el bloque `:root` LIGHT). Las keys de marca (primary/accent/sport-*
 * /cta-fill/focus-ring) las pisa `brandVars(color,'light')` al mergearse despues.
 */
export const LIGHT_SCHEME_VARS: Record<string, string> = {
  // Rampa neutra (chips / tracks / icon fills)
  '--color-ink-100': '230 233 237',
  '--color-ink-200': '205 211 219',
  '--color-ink-300': '168 177 189',
  '--color-ink-700': '42 50 61',
  '--color-ink-800': '27 33 41',
  // Foregrounds de status (soft-chips)
  '--color-success-700': '14 122 80',
  '--color-success-600': '15 125 80',
  '--color-warning-700': '143 90 5',
  '--color-warning-600': '168 105 10',
  '--color-danger-700': '168 22 58',
  '--color-danger-600': '190 24 60',
  '--color-info-600': '20 98 220',
  '--color-sport-700': '11 71 176',
  '--color-sport-600': '20 98 220',
  '--color-ember-600': '232 81 30',
  '--color-ember-700': '194 62 20',
  '--color-aqua-700': '10 110 141',
  '--color-aqua-600': '14 143 184',
  // Tints suaves de status
  '--color-success-100': '219 245 234',
  '--color-warning-100': '253 239 211',
  '--color-danger-100': '252 221 228',
  '--color-info-100': '232 241 255',
  '--color-sport-100': '232 241 255',
  '--color-ember-100': '255 237 230',
  '--color-aqua-100': '227 245 251',
  // Superficies
  '--color-surface-app': '251 252 253',
  '--color-surface-card': '255 255 255',
  '--color-surface-sunken': '244 246 248',
  '--color-surface-inverse': '11 14 19',
  '--color-surface-inverse-2': '18 22 29',
  '--color-surface-overlay': '11 14 19',
  // Texto
  '--color-text-strong': '11 14 19',
  '--color-text-body': '27 33 41',
  '--color-text-muted': '90 101 115',
  '--color-text-subtle': '100 111 125',
  '--color-text-on-dark': '244 246 248',
  '--color-text-on-dark-muted': '147 157 171',
  '--color-text-link': '20 98 220',
  // Bordes / divisores — subtle/default/strong son COLOR COMPLETO (no canal): la clase
  // bare border-* los consume via var() directo (tailwind.config.js), así que el valor
  // forzado-claro debe ser el hex sólido (ink-100/200/300), no los canales "r g b".
  '--color-border-subtle': '#E6E9ED',
  '--color-border-default': '#CDD3DB',
  '--color-border-strong': '#A8B1BD',
  '--color-track': '230 233 237',
  // Accion / marca fuerte
  '--color-action-primary': '11 14 19',
  '--color-action-primary-hover': '27 33 41',
  '--color-brand-strong': '20 98 220',
  // Legacy compat
  '--color-primary': '38 128 255',
  '--color-primary-foreground': '255 255 255',
  '--color-background': '251 252 253',
  '--color-card': '255 255 255',
  '--color-foreground': '11 14 19',
  '--color-muted': '244 246 248',
  '--color-muted-foreground': '90 101 115',
  '--color-border': '0 0 0',
  '--color-accent': '38 128 255',
  '--color-accent-foreground': '38 128 255',
  '--color-cyan': '24 171 212',
  '--color-destructive': '244 54 90',
  '--color-success': '31 184 119',
}
