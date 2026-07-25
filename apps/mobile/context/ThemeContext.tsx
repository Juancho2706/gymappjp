import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { colorScheme as nwColorScheme, vars } from 'nativewind'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  applyEffectiveCoachBranding,
  darkTheme,
  effectiveBrandVars,
  lightTheme,
  LIGHT_SCHEME_VARS,
  resolveEffectiveCoachBrandTheme,
  resolveEffectiveCoachBrandPresentation,
  type Theme,
} from '../lib/theme'
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
  const effectiveBranding = useMemo(() => resolveEffectiveCoachBrandPresentation(branding), [branding])
  const effectiveBrand = useMemo(() => resolveEffectiveCoachBrandTheme(effectiveBranding), [effectiveBranding])
  // Memoizados: sin esto, `theme`/`themeVars`/`value` se recreaban como objetos
  // nuevos en CADA render → el Provider propagaba una identidad nueva a TODOS los
  // consumidores (useTheme) en cada tecla/estado, amplificando el loop de re-render
  // del P0 focus-hop. El branding efectivo ya incorpora tier, preset y overrides
  // por modo; su identidad solo cambia cuando cambia el payload almacenado.
  const theme = useMemo(() => {
    const base = resolvedScheme === 'dark' ? darkTheme : lightTheme
    return applyEffectiveCoachBranding(base, effectiveBrand)
  }, [resolvedScheme, effectiveBrand])

  // Keep NativeWind's class-based dark mode in sync with our resolved scheme.
  useEffect(() => {
    nwColorScheme.set(resolvedScheme)
  }, [resolvedScheme])

  // Live brand accent for Tailwind classes (bg-primary, text-accent…).
  const themeVars = useMemo(
    () => ({ ...vars(effectiveBrandVars(effectiveBrand, resolvedScheme)) }),
    [effectiveBrand, resolvedScheme],
  )

  const setThemeMode = useCallback((next: ThemeMode) => {
    setMode(next)
    void AsyncStorage.setItem(THEME_MODE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeMode(resolvedScheme === 'dark' ? 'light' : 'dark')
  }, [resolvedScheme, setThemeMode])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, branding: effectiveBranding, setBranding, mode, resolvedScheme, toggleTheme, setThemeMode }),
    [theme, effectiveBranding, mode, resolvedScheme, toggleTheme, setThemeMode],
  )

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVars]}>{children}</View>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

/**
 * Fuerza TEMA CLARO en la familia de entrada (selector, walkthrough, login,
 * register, forgot/reset/verify, onboarding) — ruling CEO ronda 4 (#13). Estas
 * pantallas NUNCA reaccionan al dark del sistema; el resto de la app SIGUE
 * dark-aware.
 *
 * Por que este enfoque gana (simple + robusto): NO toca el colorScheme GLOBAL de
 * NativeWind. Ese lever es app-wide y forzarlo por-pantalla dependeria del orden
 * de focus/blur al navegar (flashes de un frame y fugas de "light" a pantallas
 * dark). En su lugar el claro se SCOPEA al subarbol por dos vias, ambas locales:
 *   1. useTheme(): ThemeContext ANIDADO con mode/resolvedScheme='light' y theme =
 *      lightTheme brandeado. Cubre theme.*, AppBackground(mode),
 *      AmbientBrandGlow(resolvedScheme), SHADOWS[resolvedScheme] y el calculo de
 *      marca del login.
 *   2. clases dark: de NativeWind: en la <View> contenedora se re-declaran los
 *      CSS-vars a sus valores LIGHT (LIGHT_SCHEME_VARS + brandVars light). El var
 *      mas cercano gana sobre el bloque `.dark` del root → los tokens semanticos
 *      resuelven claro SOLO aca y las clases dark: quedan inertes en el subarbol.
 * Nota: el login brandeado conserva los colores del coach porque el theme y las
 * vars se derivan del branding sobre base CLARA (applyCoachBranding/brandVars).
 */
export function ForceLightTheme({ children }: { children: React.ReactNode }) {
  const parent = useTheme()
  const effectiveBrand = useMemo(
    () => resolveEffectiveCoachBrandTheme(parent.branding),
    [parent.branding],
  )

  const theme = useMemo(() => applyEffectiveCoachBranding(lightTheme, effectiveBrand), [effectiveBrand])
  const themeVars = useMemo(
    () => ({ ...vars({ ...LIGHT_SCHEME_VARS, ...effectiveBrandVars(effectiveBrand, 'light') }) }),
    [effectiveBrand],
  )
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, theme, mode: 'light', resolvedScheme: 'light' }),
    [parent, theme],
  )

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVars]}>
        <StatusBar style="dark" />
        {children}
      </View>
    </ThemeContext.Provider>
  )
}
