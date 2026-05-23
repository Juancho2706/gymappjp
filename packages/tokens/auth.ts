// Portable auth surface tokens for web (Tailwind v4 / CSS vars)
// and React Native (StyleSheet / Reanimated). Mirror packages/tokens/theme.css
// vars for [data-eva-surface="enterprise"].

export const authTokens = {
    coach: {
        bg: '#F5F5F5',
        bgDark: '#121212',
        fg: '#121212',
        fgDark: '#F8F9FA',
        accent: '#007AFF',
        accentFg: '#FFFFFF',
        border: 'rgba(0,0,0,0.1)',
        borderDark: 'rgba(255,255,255,0.1)',
        mutedFg: '#6B7280',
        mutedFgDark: '#A1A1AA',
        danger: '#FF3B30',
    },
    enterprise: {
        bg: '#09090b',
        fg: '#f4f4f5',
        accent: '#F59E0B',
        accentFg: '#09090b',
        border: '#27272a',
        mutedFg: '#71717a',
        danger: '#EF4444',
    },
} as const

export type AuthSurface = keyof typeof authTokens
export type AuthSurfaceTokens = (typeof authTokens)[AuthSurface]
