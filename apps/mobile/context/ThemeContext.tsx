import { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyCoachBranding, darkTheme, lightTheme, type Theme } from '../lib/theme'
import { type CoachBranding, loadStoredBranding } from '../lib/branding'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  branding: CoachBranding | null
  setBranding: (b: CoachBranding | null) => void
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_MODE_KEY = 'eva_theme_mode'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const [branding, setBranding] = useState<CoachBranding | null>(null)
  const [mode, setMode] = useState<ThemeMode>('system')

  useEffect(() => {
    loadStoredBranding().then(setBranding)
    AsyncStorage.getItem(THEME_MODE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setMode(stored)
      }
    })
  }, [])

  const resolvedScheme = mode === 'system' ? colorScheme : mode
  const base = resolvedScheme === 'dark' ? darkTheme : lightTheme
  const theme = applyCoachBranding(base, branding?.primaryColor)

  function toggleTheme() {
    const next: ThemeMode = resolvedScheme === 'dark' ? 'light' : 'dark'
    setMode(next)
    AsyncStorage.setItem(THEME_MODE_KEY, next)
  }

  return (
    <ThemeContext.Provider value={{ theme, branding, setBranding, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
