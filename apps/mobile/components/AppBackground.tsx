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
 * Gaussian real** (Skia) — marca (arr-izq) + celeste (abj-der) — + grilla 40×40
 * + GRANO (decisión owner 2026-07-30): el crosshatch sello de la familia de entrada
 * (`EntryBackground.tsx` §1.3 — celda 3, líneas 1px con alphas asimétricos, capa 0.5)
 * extendido a TODA la app, en ambos temas. En dark ditherea el banding OLED de los
 * blobs; en light usa tinta oscura a alpha aún menor (calibrado para no leerse como
 * suciedad en pantallas de baja densidad). Estático por contrato: jamás anima.
 * Montado app-wide (todos los menús) → un solo cambio acá texturiza la app entera.
 */
export function AppBackground({ accent }: { accent?: string }) {
  // `resolvedScheme` (no `mode`): con la preferencia por defecto 'system', `mode`
  // vale 'system' y el fondo caía siempre en los alphas de dark (auditoría a1 §2.3.2).
  const { theme, resolvedScheme } = useTheme()
  const { width, height } = useWindowDimensions()
  const isDark = resolvedScheme === 'dark'
  const tint = accent ?? theme.primary
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)'
  const brandColor = hexToRgba(tint, isDark ? 0.14 : 0.08)
  const skyColor = hexToRgba(SKY, isDark ? 0.13 : 0.07)
  // Grano por tema: dark = tokens exactos de la entrada (blanco 0.012/0.010, capa 0.5);
  // light = tinta ink-900 con alphas ~20% menores y capa 0.4 (el fondo claro amplifica).
  const grainH = isDark ? 'rgba(255,255,255,0.012)' : 'rgba(15,23,42,0.010)'
  const grainV = isDark ? 'rgba(255,255,255,0.010)' : 'rgba(15,23,42,0.008)'
  const grainOpacity = isDark ? 0.5 : 0.4

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Blobs con blur Gaussian (= blur-3xl web). Un layer con Blur difumina el grupo. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint><Blur blur={80} /></Paint>}>
          <Circle cx={width * 0.25} cy={height * 0.10} r={width * 0.72} color={brandColor} />
          <Circle cx={width * 0.95} cy={height * 0.92} r={width * 0.62} color={skyColor} />
        </Group>
      </Canvas>
      {/* Grilla (celdas cuadradas 40px, como la web) + grano (celda 3, encima de todo:
          debajo de los lavados el sello desaparece — misma regla §1.3 de la entrada). */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="appgrid" width={40} height={40} patternUnits="userSpaceOnUse">
            <Path d="M40 0 L0 0 0 40" fill="none" stroke={gridColor} strokeWidth={1} />
          </Pattern>
          <Pattern id="appgrain" width={3} height={3} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={3} height={1} fill={grainH} />
            <Rect x={0} y={0} width={1} height={3} fill={grainV} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrid)" />
        <Rect width="100%" height="100%" fill="url(#appgrain)" opacity={grainOpacity} />
      </Svg>
    </View>
  )
}
