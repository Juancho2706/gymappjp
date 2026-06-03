import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Pattern, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

// Complemento fijo (igual que la web: sky-400 abajo-derecha).
const SKY = '#38BDF8'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Fondo global de la app — espeja el `AmbientBackground` de la web (dashboard):
 * grilla sutil 40×40 + DOS difuminados radiales: marca (arr-izq) + celeste (abj-der).
 * Cambia con tema claro/oscuro y con el color de marca live (`accent` ?? `theme.primary`).
 * Montado app-wide (CoachMainWrapper + cada screen) → se ve en TODOS los menús.
 */
export function AppBackground({ accent }: { accent?: string }) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const tint = accent ?? theme.primary
  const gridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.025)'

  const brandIn = hexToRgba(tint, isDark ? 0.08 : 0.06)
  const brandMid = hexToRgba(tint, isDark ? 0.025 : 0.018)
  const skyIn = hexToRgba(SKY, isDark ? 0.1 : 0.06)
  const skyMid = hexToRgba(SKY, isDark ? 0.03 : 0.02)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <Pattern id="appgrid" width={40} height={40} patternUnits="userSpaceOnUse">
            <Path d="M40 0 L0 0 0 40" fill="none" stroke={gridColor} strokeWidth={1} />
          </Pattern>
          {/* Glow de marca — esquina superior izquierda */}
          <RadialGradient id="brandWash" cx="22%" cy="2%" r="80%">
            <Stop offset="0" stopColor={brandIn} />
            <Stop offset="0.55" stopColor={brandMid} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
          {/* Glow secundario celeste — esquina inferior derecha */}
          <RadialGradient id="skyWash" cx="90%" cy="100%" r="70%">
            <Stop offset="0" stopColor={skyIn} />
            <Stop offset="0.6" stopColor={skyMid} />
            <Stop offset="1" stopColor={SKY} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
        <Rect width="100%" height="100%" fill="url(#brandWash)" />
        <Rect width="100%" height="100%" fill="url(#skyWash)" />
      </Svg>
    </View>
  )
}
