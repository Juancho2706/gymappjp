import type { ViewStyle } from 'react-native'

/**
 * EVA DS elevation — centralized RN shadow/glow tokens (mirror of the web
 * `--shadow-xs..xl` + `--glow-sport/-ember` scale).
 *
 * RN cannot use tokenized CSS `box-shadow`, so elevation lives as `ViewStyle`
 * objects. This is the SINGLE source for them — primitives (Card / Button /
 * SegmentedTabs / Sheet) consume these instead of re-declaring per component.
 *
 * Values mirror web `globals.css`:
 *  - cool-tinted ambient shadows use rgba(13, 18, 28, a) → shadowColor #0D121C.
 *  - glows use the energy hues (sport #2680FF, ember #FF6A3D, aqua #18ABD4).
 *
 * Dark retune: web adds border+lift in `.dark`; on RN ambient shadows nearly
 * vanish on dark surfaces, so the `dark` scale bumps opacity to keep the lift
 * readable (mirrors the intent of the web dark shadow retune).
 */

export type ShadowName = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type Scheme = 'light' | 'dark'

const TINT = '#0D121C' // cool neutral shadow tint (rgba 13 18 28), not a color token

const LIGHT: Record<ShadowName, ViewStyle> = {
  // --shadow-xs / -sm collapse to the same soft lift used by cards & controls today.
  xs: { shadowColor: TINT, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sm: { shadowColor: TINT, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: TINT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  lg: { shadowColor: TINT, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 10 },
  xl: { shadowColor: TINT, shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.18, shadowRadius: 56, elevation: 16 },
}

const DARK: Record<ShadowName, ViewStyle> = {
  xs: { shadowColor: TINT, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.28, shadowRadius: 3, elevation: 1 },
  sm: { shadowColor: TINT, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: TINT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.36, shadowRadius: 14, elevation: 6 },
  lg: { shadowColor: TINT, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.42, shadowRadius: 30, elevation: 12 },
  xl: { shadowColor: TINT, shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.5, shadowRadius: 58, elevation: 18 },
}

/** Ambient elevation scale, per scheme. `SHADOWS.light.md`, `SHADOWS.dark.sm`. */
export const SHADOWS: Record<Scheme, Record<ShadowName, ViewStyle>> = Object.freeze({
  light: LIGHT,
  dark: DARK,
})

/** Pick an elevation for the active scheme: `shadow('md', theme.scheme)`. */
export function shadow(name: ShadowName, scheme: Scheme): ViewStyle {
  return SHADOWS[scheme][name]
}

/**
 * Energy glows (mirror web `--glow-sport` / `--glow-ember` + the aqua/recovery
 * glow). `shadowColor` is a literal DS hue — brand-derived glow would need the
 * live accent, but the DS sport hue is the shared default.
 */
export const GLOWS = Object.freeze({
  sport: { shadowColor: '#2680FF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.42, shadowRadius: 20, elevation: 8 } as ViewStyle,
  ember: { shadowColor: '#FF6A3D', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8 } as ViewStyle,
  aqua: { shadowColor: '#18ABD4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 8 } as ViewStyle,
})
