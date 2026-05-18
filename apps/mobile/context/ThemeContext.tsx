import { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { applyCoachBranding, darkTheme, lightTheme, type Theme } from '../lib/theme'
import { type CoachBranding, loadStoredBranding } from '../lib/branding'

interface ThemeContextValue {
  theme: Theme
  branding: CoachBranding | null
  setBranding: (b: CoachBranding | null) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const [branding, setBranding] = useState<CoachBranding | null>(null)

  useEffect(() => {
    loadStoredBranding().then(setBranding)
  }, [])

  const base = colorScheme === 'dark' ? darkTheme : lightTheme
  const theme = applyCoachBranding(base, branding?.primaryColor)

  return (
    <ThemeContext.Provider value={{ theme, branding, setBranding }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
