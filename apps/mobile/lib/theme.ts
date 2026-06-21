import type { ViewStyle } from 'react-native'
import { resolveBrandTheme } from '@eva/brand-kit'

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
  // Nutrition overhaul — canonical macro palette (scheme-aware, mirrors web --color-macro-*)
  macro: {
    protein: string
    carbs: string
    fats: string
    over: string
    goal: string
  }
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
  // Core (backward compat)
  primary: '#007AFF',
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#121212',
  textSecondary: '#6B7280',
  muted: '#E5E7EB',
  border: 'rgba(0,0,0,0.1)',
  destructive: '#FF3B30',
  success: '#34C759',
  // Extended
  primaryForeground: '#FFFFFF',
  foreground: '#121212',
  mutedForeground: '#6B7280',
  secondary: '#E5E7EB',
  secondaryForeground: '#121212',
  accent: '#E5E7EB',
  accentForeground: '#007AFF',
  cyan: '#00E5FF',
  input: 'rgba(0,0,0,0.05)',
  macro: { protein: '#5E9FD6', carbs: '#FFB74D', fats: '#81C784', over: '#EF4444', goal: '#10B981' },
  radius,
  shadowGlowBlue: {
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  shadowGlowCyan: {
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  fontSans: 'Inter_400Regular',
  fontDisplay: 'Montserrat_600SemiBold',
}

export const darkTheme: Theme = {
  // Core (backward compat)
  primary: '#007AFF',
  background: '#121212',
  card: '#1E1E1E',
  text: '#F8F9FA',
  textSecondary: '#A1A1AA',
  muted: '#27272A',
  border: 'rgba(255,255,255,0.1)',
  destructive: '#FF3B30',
  success: '#30D158',
  // Extended
  primaryForeground: '#FFFFFF',
  foreground: '#F8F9FA',
  mutedForeground: '#A1A1AA',
  secondary: '#27272A',
  secondaryForeground: '#F8F9FA',
  accent: '#27272A',
  accentForeground: '#00E5FF',
  cyan: '#00E5FF',
  input: 'rgba(255,255,255,0.05)',
  macro: { protein: '#7FB3E0', carbs: '#FFC97A', fats: '#A0D6A3', over: '#EF4444', goal: '#10B981' },
  radius,
  shadowGlowBlue: {
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  shadowGlowCyan: {
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  fontSans: 'Inter_400Regular',
  fontDisplay: 'Montserrat_600SemiBold',
}

/**
 * Canonical macro palette (static) for non-scheme-aware consumers (e.g. food-row
 * siglas). Mirrors web --color-macro-* light tokens. Scheme-aware surfaces (rings)
 * should read `theme.macro.*` instead. Single source of truth for macro colors.
 */
export const MACRO_COLORS = {
  kcal: '#10B981',
  protein: '#5E9FD6',
  carbs: '#FFB74D',
  fats: '#81C784',
} as const

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
  const t = resolveBrandTheme({ brandColor: primaryColor || DEFAULT_BRAND })[scheme]
  return {
    '--color-primary': hexToChannels(t.accent),
    '--color-primary-foreground': hexToChannels(t.accentText),
    '--color-accent': hexToChannels(t.accent),
    '--color-accent-foreground': hexToChannels(t.accent),
  }
}
