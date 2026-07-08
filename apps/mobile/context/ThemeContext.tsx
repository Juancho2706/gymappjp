import { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { colorScheme as nwColorScheme, vars } from 'nativewind'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyCoachBranding, brandVars, darkTheme, lightTheme, type Theme } from '../lib/theme'
import { type CoachBranding, loadStoredBranding } from '../lib/branding'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  branding: CoachBranding | null
  setBranding: (b: CoachBranding | null) => void
  /** User preference: 'system' follows the OS, 'light'/'dark' pin the appearance. */
  mode: ThemeMode
  /** Appearance actually applied right now (mode resolved against the OS). */
  resolvedScheme: 'light' | 'dark'
  /** Binary flip (light↔dark) — pins an explicit mode. Kept for the existing toggle UI. */
  toggleTheme: () => void
  /** Set the preference explicitly. Pass 'system' to hand control back to the OS. */
  setThemeMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_MODE_KEY = 'eva_theme_mode'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const [branding, setBranding] = useState<CoachBranding | null>(null)
  // Default follows the OS (parity with web next-themes). Migration: a user who
  // previously pinned an appearance has 'light'/'dark' stored → respected below;
  // absence (never toggled, or 'system') falls through to this OS-following default.
  const [mode, setMode] = useState<ThemeMode>('system')

  useEffect(() => {
    loadStoredBranding().then(setBranding)
    AsyncStorage.getItem(THEME_MODE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setMode(stored)
      }
    })
  }, [])

  // `useColorScheme()` is reactive, so 'system' tracks OS changes live.
  const resolvedScheme: 'light' | 'dark' = (mode === 'system' ? colorScheme : mode) === 'dark' ? 'dark' : 'light'
  const base = resolvedScheme === 'dark' ? darkTheme : lightTheme
  const theme = applyCoachBranding(base, branding?.primaryColor)

  // Keep NativeWind's class-based dark mode in sync with our resolved scheme.
  useEffect(() => {
    nwColorScheme.set(resolvedScheme)
  }, [resolvedScheme])

  // Live brand accent for Tailwind classes (bg-primary, text-accent…).
  const themeVars = { ...vars(brandVars(branding?.primaryColor, resolvedScheme)) }

  function setThemeMode(next: ThemeMode) {
    setMode(next)
    void AsyncStorage.setItem(THEME_MODE_KEY, next)
  }

  function toggleTheme() {
    setThemeMode(resolvedScheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, branding, setBranding, mode, resolvedScheme, toggleTheme, setThemeMode }}>
      <View style={[{ flex: 1 }, themeVars]}>{children}</View>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
