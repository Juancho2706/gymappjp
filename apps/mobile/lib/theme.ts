import type { ViewStyle } from 'react-native'
import { resolveBrandTheme, deriveSportTokens } from '@eva/brand-kit'

export interface Theme {
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
  // Shadows / glow
  shadowGlowBlue: ViewStyle
  shadowGlowCyan: ViewStyle
  // Typography
  fontSans: string
  fontDisplay: string
}

const radius = {
  sm: 7,
  md: 10,
  lg: 12,
  xl: 17,
  '2xl': 22,
  '3xl': 26,
}

export const lightTheme: Theme = {
  // Core (backward compat) — values from EVA DS (token-contract.md, light)
  primary: '#2680FF',           // sport-500 (brand); applyCoachBranding() overrides at runtime
  background: '#FBFCFD',        // surface-app (paper)
  card: '#FFFFFF',              // surface-card
  text: '#0B0E13',             // text-strong (ink-950)
  textSecondary: '#5A6573',    // text-muted (ink-500)
  muted: '#F4F6F8',            // surface-sunken (ink-50)
  border: '#E6E9ED',           // border-subtle (ink-100)
  destructive: '#F4365A',      // danger-500
  success: '#1FB877',          // success-500
  // Extended
  primaryForeground: '#FFFFFF',// text-on-sport
  foreground: '#0B0E13',       // text-strong
  mutedForeground: '#5A6573',  // text-muted
  secondary: '#F4F6F8',        // surface-sunken
  secondaryForeground: '#0B0E13',
  accent: '#F4F6F8',           // subtle surface
  accentForeground: '#2680FF', // brand; applyCoachBranding() overrides
  cyan: '#18ABD4',             // aqua-500 (recovery)
  input: 'rgba(0,0,0,0.05)',
  radius,
  shadowGlowBlue: {
    shadowColor: '#2680FF',    // glow-sport
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 8,
  },
  shadowGlowCyan: {
    shadowColor: '#18ABD4',    // aqua glow (recovery)
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  fontSans: 'HankenGrotesk_400Regular',
  fontDisplay: 'Archivo_700Bold',
}

export const darkTheme: Theme = {
  // Core (backward compat) — values from EVA DS (token-contract.md, dark)
  primary: '#2680FF',           // sport-500 (brand); applyCoachBranding() overrides at runtime
  background: '#0A0D12',        // surface-app (dark)
  card: '#161B22',             // surface-card (dark)
  text: '#F4F6F8',            // text-strong (dark)
  textSecondary: '#8A95A3',   // text-muted (dark)
  muted: '#1F262F',           // surface-sunken (dark)
  border: 'rgba(255,255,255,0.07)', // border-subtle (dark)
  destructive: '#F4365A',     // danger-500
  success: '#1FB877',         // success-500
  // Extended
  primaryForeground: '#FFFFFF',
  foreground: '#F4F6F8',      // text-strong (dark)
  mutedForeground: '#8A95A3', // text-muted (dark)
  secondary: '#1F262F',       // surface-sunken (dark)
  secondaryForeground: '#F4F6F8',
  accent: '#1F262F',          // subtle surface (dark)
  accentForeground: '#2680FF',// brand; applyCoachBranding() overrides
  cyan: '#18ABD4',            // aqua-500 (recovery)
  input: 'rgba(255,255,255,0.05)',
  radius,
  shadowGlowBlue: {
    shadowColor: '#2680FF',   // glow-sport
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 8,
  },
  shadowGlowCyan: {
    shadowColor: '#18ABD4',   // aqua glow (recovery)
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  fontSans: 'HankenGrotesk_400Regular',
  fontDisplay: 'Archivo_700Bold',
}

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
  const sport600 = scheme === 'dark' ? sport.dark['600'] : sport.ramp['600']
  const sport700 = scheme === 'dark' ? sport.dark['700'] : sport.ramp['700']
  return {
    '--color-primary': hexToChannels(t.accent),
    '--color-primary-foreground': hexToChannels(t.accentText),
    '--color-accent': hexToChannels(t.accent),
    '--color-accent-foreground': hexToChannels(t.accent),
    '--color-brand': hexToChannels(sport.ramp['500']),
    '--color-sport-100': hexToChannels(sport.ramp['100']),
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
