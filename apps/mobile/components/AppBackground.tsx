import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg'
import { Canvas, Circle, Group, Paint, Blur } from '@shopify/react-native-skia'
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
 * Fondo global — 1:1 con el `AmbientBackground` de la web: dos blobs con **blur
 * Gaussian real** (Skia) — marca (arr-izq) + celeste (abj-der) — + grilla 40×40.
 * Skia replica el `blur-3xl` de la web (SVG no podía). Brand-aware + light/dark.
 * Estático → sin costo perceptible. Montado app-wide (todos los menús).
 */
export function AppBackground({ accent }: { accent?: string }) {
  const { theme, mode } = useTheme()
  const { width, height } = useWindowDimensions()
  const isDark = mode !== 'light'
  const tint = accent ?? theme.primary
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)'
  const brandColor = hexToRgba(tint, isDark ? 0.14 : 0.08)
  const skyColor = hexToRgba(SKY, isDark ? 0.13 : 0.07)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Blobs con blur Gaussian (= blur-3xl web). Un layer con Blur difumina el grupo. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint><Blur blur={80} /></Paint>}>
          <Circle cx={width * 0.25} cy={height * 0.10} r={width * 0.72} color={brandColor} />
          <Circle cx={width * 0.95} cy={height * 0.92} r={width * 0.62} color={skyColor} />
        </Group>
      </Canvas>
      {/* Grilla (celdas cuadradas 40px, como la web). */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="appgrid" width={40} height={40} patternUnits="userSpaceOnUse">
            <Path d="M40 0 L0 0 0 40" fill="none" stroke={gridColor} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
      </Svg>
    </View>
  )
}
