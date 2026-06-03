import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Pattern, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Backdrop MUY sutil (estética sobria 2026: bordes/luminancia > saturación). Grid
 * tenue + UN wash radial de marca apenas perceptible arriba. Color = `accent` (o el
 * acento de marca live `theme.primary`). Sin cyan fijo. Pensado para no competir con
 * el contenido en light NI dark.
 */
export function AppBackground({ accent }: { accent?: string }) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const tint = accent ?? theme.primary
  const gridColor = isDark ? 'rgba(255,255,255,0.022)' : 'rgba(15,23,42,0.02)'
  const washIn = hexToRgba(tint, isDark ? 0.06 : 0.04)
  const washMid = hexToRgba(tint, isDark ? 0.02 : 0.015)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <Pattern id="appgrid" width={30} height={30} patternUnits="userSpaceOnUse">
            <Path d="M30 0 L0 0 0 30" fill="none" stroke={gridColor} strokeWidth={0.5} />
          </Pattern>
          <RadialGradient id="appWash" cx="22%" cy="0%" r="85%">
            <Stop offset="0" stopColor={washIn} />
            <Stop offset="0.45" stopColor={washMid} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
        <Rect width="100%" height="100%" fill="url(#appWash)" />
      </Svg>
    </View>
  )
}
