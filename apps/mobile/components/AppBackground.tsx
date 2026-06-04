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
 * Fondo global — 1:1 con la web/responsive: grilla sutil 40×40 + UN glow muy suave
 * que sube desde abajo (su centro queda FUERA de pantalla → nunca se ve un círculo).
 * Sin washes fuertes. `accent` ?? `theme.primary` (brand-aware leve). En todos los menús.
 */
export function AppBackground({ accent }: { accent?: string }) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const tint = accent ?? theme.primary
  const gridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.025)'

  const glowIn = hexToRgba(tint, isDark ? 0.06 : 0.035)
  const glowMid = hexToRgba(tint, isDark ? 0.024 : 0.014)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <Pattern id="appgrid" width={40} height={40} patternUnits="userSpaceOnUse">
            <Path d="M40 0 L0 0 0 40" fill="none" stroke={gridColor} strokeWidth={1} />
          </Pattern>
          {/* Glow tenue desde abajo. Centro debajo del viewport (cy 112%) → solo se ve
              el arco superior subiendo; no hay borde de círculo visible. */}
          <RadialGradient id="bottomGlow" cx="50%" cy="112%" r="75%">
            <Stop offset="0" stopColor={glowIn} />
            <Stop offset="0.5" stopColor={glowMid} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
        <Rect width="100%" height="100%" fill="url(#bottomGlow)" />
      </Svg>
    </View>
  )
}
