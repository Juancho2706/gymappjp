import { useState } from 'react'
import type { ReactNode } from 'react'
import { View, StyleSheet, type ViewStyle, type LayoutChangeEvent } from 'react-native'
import { Canvas, RoundedRect, SweepGradient, vec, useClock } from '@shopify/react-native-skia'
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'

/**
 * GlowBorderCard — marco animado sobrio: un borde con un destello del color de
 * MARCA del coach recorriendo el perimetro (mirror del `GlowBorderCard` de la web,
 * `apps/web/src/components/coach/GlowBorderCard.tsx`).
 *
 * Tecnica: la web usa un anillo con conic-gradient que rota via `--gbc-angle`
 * (@property) enmascarado al borde. En RN el equivalente barato y a 60fps es
 * Skia: un `RoundedRect` en modo STROKE (solo pinta el borde, sin necesidad de
 * mask/xor) pintado con un `SweepGradient` (= conic) cuyo angulo rota. La rotacion
 * la maneja el reloj de Skia (`useClock`) + un `useDerivedValue` de Reanimated en
 * el hilo UI — sin re-render de JS por frame.
 *
 * Paridad visual con la web:
 *  - Color de MARCA (theme.primary, resuelto por branding white-label). Nada de
 *    arcoiris. Mismos stops que la web: dos destellos (0.5 y 0.3 en light; 0.8 y
 *    0.5 en dark) separados por tramos transparentes.
 *  - Glow exterior sutil (mirror de `.gbc-wrap box-shadow`): sombra de marca,
 *    mas marcada en dark.
 *  - `prefers-reduced-motion` (useReducedMotion): el sweep queda ESTATICO (sin
 *    rotacion) — el borde gradiente se sigue viendo, como el fallback de la web.
 *  - Periodo 8s lineal, igual que `gbc-spin 8s linear infinite`.
 *
 * Es un MARCO: envuelve un hijo (tipicamente una Card con su propio fondo/radio).
 * El anillo se pinta ENCIMA del borde del hijo (como el ring z-10 de la web).
 */

const PERIOD_MS = 8000
const TAU = Math.PI * 2
const STROKE = 1.5 // px del anillo (≈ padding 1.5px de la web)

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(38,128,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface GlowBorderCardProps {
  children: ReactNode
  /** Radio del marco (default theme.radius['2xl'] ≈ rounded-card de la web). */
  radius?: number
  style?: ViewStyle | ViewStyle[]
}

export function GlowBorderCard({ children, radius, style }: GlowBorderCardProps) {
  const { theme, resolvedScheme } = useTheme()
  const isDark = resolvedScheme === 'dark'
  const tint = theme.primary
  const r = radius ?? theme.radius['2xl']
  const [size, setSize] = useState({ w: 0, h: 0 })
  const reduced = useReducedMotion()
  const clock = useClock()

  // Transform de rotacion del sweep (hilo UI). Si reduce-motion, no leemos el
  // reloj → queda constante y Skia no repinta (sweep estatico, como el fallback web).
  const transform = useDerivedValue(() => {
    const angle = reduced ? 0 : ((clock.value % PERIOD_MS) / PERIOD_MS) * TAU
    return [{ rotate: angle }]
  }, [reduced])

  // Stops del sweep (mirror de los % de la web): dos destellos de marca separados
  // por transparente. El ultimo stop cierra el circulo en transparente.
  const flash = isDark ? 0.8 : 0.5
  const flash2 = isDark ? 0.5 : 0.3
  const t0 = hexToRgba(tint, 0)
  const colors = [t0, hexToRgba(tint, flash), t0, t0, hexToRgba(tint, flash2), t0, t0]
  const positions = [0, 0.12, 0.3, 0.55, 0.7, 0.85, 1]

  // Glow exterior de marca (mirror .gbc-wrap box-shadow: 0 0 18/24px, α .08/.15).
  const glow: ViewStyle = {
    shadowColor: tint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isDark ? 0.15 : 0.08,
    shadowRadius: isDark ? 12 : 9,
    elevation: isDark ? 6 : 3,
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
  }

  const center = vec(size.w / 2, size.h / 2)

  return (
    <View onLayout={onLayout} style={[{ borderRadius: r }, glow, style]}>
      {children}
      {size.w > 0 && size.h > 0 ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* Inset por medio stroke para que el anillo caiga DENTRO de los bordes. */}
          <RoundedRect
            x={STROKE / 2}
            y={STROKE / 2}
            width={size.w - STROKE}
            height={size.h - STROKE}
            r={r}
            style="stroke"
            strokeWidth={STROKE}
          >
            <SweepGradient c={center} transform={transform} origin={center} colors={colors} positions={positions} />
          </RoundedRect>
        </Canvas>
      ) : null}
    </View>
  )
}
