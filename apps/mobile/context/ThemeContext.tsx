import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { colorScheme as nwColorScheme, vars } from 'nativewind'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  applyEffectiveCoachBranding,
  darkTheme,
  DARK_SCHEME_VARS,
  ENTRY_TOKENS,
  effectiveBrandVars,
  lightTheme,
  LIGHT_SCHEME_VARS,
  resolveEffectiveCoachBrandTheme,
  resolveEffectiveCoachBrandPresentation,
  type EffectiveCoachBrandTheme,
  type Theme,
} from '../lib/theme'
import { type CoachBranding, loadStoredBranding } from '../lib/branding'
import { isOwnBrandColor } from '../lib/loader-identity'

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

/**
 * ⚠️ BRAND_VARS_IDENTITY — el bug que dejó TODO el white-label de clases en azul EVA.
 *
 * `vars()` de NativeWind NO devuelve un objeto de estilo con los `--color-*` adentro: devuelve
 * un objeto **vacío** y guarda el juego de variables en un `WeakMap` global (`opaqueStyles`)
 * CLAVEADO POR LA IDENTIDAD de ese objeto (react-native-css-interop
 * `runtime/native/api.ts` → `vars()`, leído por `getOpaqueStyles` en `runtime/native/styles.ts`).
 *
 * Consecuencia: `{ ...vars({...}) }` —que es lo que había acá desde el primer commit del
 * ThemeContext— produce un objeto NUEVO, ausente del WeakMap, sin una sola propiedad. El
 * intérprete lo trata como un estilo plano vacío y **ninguna** variable de marca se aplicaba.
 * `bg-sport-*`, `text-sport-*`, `bg-cta-fill`, `bg-primary`… resolvían siempre al token
 * estático de `global.css` (azul EVA), que es exactamente el síntoma del QA del owner:
 * marca rosa y la app azul, mientras `theme.primary` (shim imperativo, otro camino) sí salía
 * rosa. Lo mismo dejaba INERTE a `ForceScheme`: sus LIGHT/DARK_SCHEME_VARS tampoco llegaban.
 *
 * Regla: pasar el objeto de `vars()` TAL CUAL (como elemento de un array de `style`, que el
 * intérprete recorre recursivamente). Nunca spreadearlo, clonarlo ni pasarlo por `StyleSheet`.
 */
const EMPTY_VARS = vars({})

/**
 * Vars de marca de un subárbol. `extra` son los vars de esquema de `ForceScheme` (van primero:
 * las keys de marca los pisan).
 *
 * Sin color PROPIO no se emite override: mandan los tokens de `global.css`. La rampa derivada
 * ancla el color del coach en el paso 500, así que emitirla para el azul de fábrica correría un
 * escalón la rampa EVA entera (sport-500 pasaría de `#2680FF` a `#1462DC`) y desalinearía la app
 * de la web sin que nadie lo haya pedido. `isOwnBrandColor` es la MISMA regla con la que
 * `lib/loader-identity.ts` decide EVA vs marca, así que el loader y la paleta no pueden discrepar.
 *
 * Se emite `vars()` siempre (aunque sea vacío) para que la <View> sea proveedora de variables
 * desde el PRIMER render: si empezara sin variables y las ganara al aterrizar la caché de marca,
 * css-interop remonta el subárbol (`printUpgradeWarning`, `UpgradeState.SHOULD_UPGRADE`).
 */
function brandThemeVars(
  effective: EffectiveCoachBrandTheme,
  scheme: 'light' | 'dark',
  extra?: Record<string, string>,
): Record<string, any> {
  const brand = isOwnBrandColor(effective.brandColor)
    ? effectiveBrandVars(effective, scheme)
    : null
  if (!extra && !brand) return EMPTY_VARS
  return vars({ ...extra, ...brand })
}

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
  // NUNCA spreadear el resultado de `vars()` — ver BRAND_VARS_IDENTITY.
  const themeVars = useMemo(
    () => brandThemeVars(effectiveBrand, resolvedScheme),
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
 * Fija un ESQUEMA (claro u oscuro) en un subarbol, ignorando el dark del sistema.
 * Hoy lo usan: la familia de entrada clara heredada (selector, walkthrough, login,
 * register, forgot/reset/verify, onboarding — ruling CEO ronda 4 #13) y, desde el
 * rediseño "entrada dark v1", las pantallas que van dark forzado. El resto de la
 * app SIGUE dark-aware.
 *
 * Por que este enfoque gana (simple + robusto): NO toca el colorScheme GLOBAL de
 * NativeWind. Ese lever es app-wide y forzarlo por-pantalla dependeria del orden
 * de focus/blur al navegar (flashes de un frame y fugas de esquema entre pantallas).
 * En su lugar el esquema se SCOPEA al subarbol por dos vias, ambas locales:
 *   1. useTheme(): ThemeContext ANIDADO con mode/resolvedScheme = `scheme` y theme =
 *      lightTheme/darkTheme brandeado. Cubre theme.*, AppBackground(mode),
 *      AmbientBrandGlow(resolvedScheme), SHADOWS[resolvedScheme] y el calculo de
 *      marca del login.
 *   2. CSS-vars de NativeWind: en la <View> contenedora se re-declaran los vars al
 *      juego del esquema pedido (LIGHT_SCHEME_VARS o DARK_SCHEME_VARS + brandVars
 *      del mismo esquema). El var mas cercano gana sobre el bloque `.dark` del root
 *      → los tokens semanticos resuelven SOLO aca al esquema forzado.
 * Y el StatusBar sigue al esquema: glifos oscuros sobre claro, claros sobre oscuro.
 *
 * ⚠️ Limite: esto re-declara VARS, no activa el colorScheme global. Las clases con
 * prefijo `dark:` quedan INERTES dentro del subarbol cuando el SO esta en claro (y
 * ACTIVAS cuando el SO esta en dark, aunque se fuerce claro). Dentro de un subarbol
 * forzado usar tokens semanticos (bg-surface-app, text-strong…), nunca `dark:`.
 *
 * Nota: el login brandeado conserva los colores del coach porque el theme y las
 * vars se derivan del branding sobre la base del esquema (applyEffectiveCoachBranding
 * / effectiveBrandVars).
 */
export function ForceScheme({
  children,
  scheme,
  branded = true,
}: {
  children: React.ReactNode
  /** Esquema aplicado al subarbol. */
  scheme: 'light' | 'dark'
  /**
   * Login white-label conserva la marca. Selector, walkthrough y captura de un coach nuevo pasan
   * `false` para no teñirse con una marca cacheada que el usuario está intentando reemplazar.
   */
  branded?: boolean
}) {
  const parent = useTheme()
  const visibleBranding = branded ? parent.branding : null
  const effectiveBrand = useMemo(
    () => resolveEffectiveCoachBrandTheme(visibleBranding),
    [visibleBranding],
  )

  const theme = useMemo(
    () => applyEffectiveCoachBranding(scheme === 'dark' ? darkTheme : lightTheme, effectiveBrand),
    [scheme, effectiveBrand],
  )
  // Sin spread: ver BRAND_VARS_IDENTITY arriba. Con el spread, estos vars de esquema jamas
  // llegaron a aplicarse y el subarbol forzado seguia el esquema GLOBAL del SO.
  const themeVars = useMemo(
    () => brandThemeVars(effectiveBrand, scheme, scheme === 'dark' ? DARK_SCHEME_VARS : LIGHT_SCHEME_VARS),
    [scheme, effectiveBrand],
  )
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, branding: visibleBranding, theme, mode: scheme, resolvedScheme: scheme }),
    [parent, visibleBranding, theme, scheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {/* F2.5b — mitad OTA del anti-flash (DESIGN-SPEC §5.2): un subarbol dark forzado
          pinta el canvas de la entrada (`#07080C`) en su propio contenedor. Sin esto se
          ve un frame del fondo claro heredado al montar la pantalla. */}
      <View
        style={[
          { flex: 1 },
          scheme === 'dark' ? { backgroundColor: ENTRY_TOKENS.canvasEntry } : null,
          themeVars,
        ]}
      >
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </View>
    </ThemeContext.Provider>
  )
}

/**
 * Alias de compatibilidad de `ForceScheme scheme="light"`. Se conserva porque hoy
 * lo consumen 4 call sites ((auth)/_layout, alumno/codigo, alumno/onboarding,
 * app/index) que NO cambian de comportamiento en esta fase; a medida que cada
 * pantalla migre a dark se reemplaza por `ForceScheme` explicito.
 */
export function ForceLightTheme({
  children,
  branded = true,
}: {
  children: React.ReactNode
  branded?: boolean
}) {
  return (
    <ForceScheme scheme="light" branded={branded}>
      {children}
    </ForceScheme>
  )
}
