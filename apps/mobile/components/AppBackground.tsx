import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg'
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
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="appgrid" width={28} height={28} patternUnits="userSpaceOnUse">
            <Path d="M28 0 L0 0 0 28" fill="none" stroke={gridColor} strokeWidth={0.5} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
      </Svg>
      <LinearGradient
        pointerEvents="none"
        colors={[hexToRgba(theme.primary, 0.16), hexToRgba(theme.primary, 0.04), 'transparent']}
        locations={[0, 0.4, 0.8]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.7, y: 0.55 }}
        style={styles.top}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', hexToRgba('#22D3EE', isDark ? 0.07 : 0.05)]}
        start={{ x: 1, y: 0.2 }}
        end={{ x: 0.3, y: 1 }}
        style={styles.corner}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  corner: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '70%' },
})
