import type { ViewStyle } from 'react-native'

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

export function applyCoachBranding(base: Theme, primaryColor?: string | null): Theme {
  if (!primaryColor) return base
  return { ...base, primary: primaryColor }
}
