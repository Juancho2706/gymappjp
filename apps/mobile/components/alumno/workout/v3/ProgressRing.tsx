import { type ReactNode, useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated'
import Svg, { Circle, G } from 'react-native-svg'

/**
 * Anillo de progreso GRANDE del ejecutor V3 — hero de movilidad (hold) y cardio (countdown/fase).
 * Traducción del `conic-gradient` de los mockups (concepto-a-v3-tipos hold · concepto-a-v31 cardio ·
 * concepto-a-v32 fase) al idioma RN: un `<circle>` de track + un arco coloreado que drena por
 * `strokeDashoffset`. El drenado interpola lineal 300 ms (mismo tratamiento que `HoldTimer`), instantáneo
 * bajo reduce-motion. El contenido central (número + label) va como `children` centrado.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export function ProgressRing({
  size = 214,
  strokeWidth = 14,
  /** Fracción llena [0,1]. En countdown pasar `1 - progresoTranscurrido` para que DRENE. */
  fill,
  color,
  trackColor,
  reducedMotion = false,
  children,
}: {
  size?: number
  strokeWidth?: number
  fill: number
  color: string
  trackColor: string
  reducedMotion?: boolean
  children?: ReactNode
}) {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(1, Math.max(0, fill))
  const offset = circumference * (1 - clamped)

  const dash = useSharedValue(offset)
  useEffect(() => {
    dash.value = withTiming(offset, { duration: reducedMotion ? 0 : 300, easing: Easing.linear })
  }, [offset, reducedMotion, dash])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }))

  const c = size / 2
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${c}, ${c}`}>
          <Circle cx={c} cy={c} r={r} strokeWidth={strokeWidth} stroke={trackColor} fill="none" />
          <AnimatedCircle
            cx={c}
            cy={c}
            r={r}
            strokeWidth={strokeWidth}
            stroke={color}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      {children}
    </View>
  )
}
