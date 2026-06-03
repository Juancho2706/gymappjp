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
 * Shared layered backdrop (faint grid + two brand washes) used behind the coach
 * dashboard and the student app — the "líneas bonitas + difuminados" of the web.
 * Place as an absolute-fill child behind content. Uses the live brand accent.
 */
export function AppBackground() {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const gridColor = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.03)'
  const topWash = hexToRgba(theme.primary, isDark ? 0.10 : 0.07)
  const topWashMid = hexToRgba(theme.primary, isDark ? 0.035 : 0.025)
  const sideWash = hexToRgba('#22D3EE', isDark ? 0.05 : 0.03)
  const sideWashMid = hexToRgba('#22D3EE', isDark ? 0.018 : 0.012)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <Pattern id="appgrid" width={28} height={28} patternUnits="userSpaceOnUse">
            <Path d="M28 0 L0 0 0 28" fill="none" stroke={gridColor} strokeWidth={0.5} />
          </Pattern>
          <RadialGradient id="appTopWash" cx="18%" cy="2%" r="78%">
            <Stop offset="0" stopColor={topWash} />
            <Stop offset="0.48" stopColor={topWashMid} />
            <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="appSideWash" cx="88%" cy="64%" r="76%">
            <Stop offset="0" stopColor={sideWash} />
            <Stop offset="0.46" stopColor={sideWashMid} />
            <Stop offset="1" stopColor="#22D3EE" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
        <Rect width="100%" height="100%" fill="url(#appTopWash)" />
        <Rect width="100%" height="100%" fill="url(#appSideWash)" />
      </Svg>
    </View>
  )
}
