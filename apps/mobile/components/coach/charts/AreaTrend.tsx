import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { CartesianChart, Line, Area, useChartPressState, type CurveType } from 'victory-native'
import {
  useFont,
  Circle,
  Text as SkiaText,
  DashPathEffect,
  Line as SkiaLine,
  vec,
} from '@shopify/react-native-skia'
import { useDerivedValue, useAnimatedReaction, runOnJS, useReducedMotion, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/hanken-grotesk/HankenGrotesk_400Regular.ttf')

export interface AreaPoint { i: number; y: number; label: string; [k: string]: string | number }

function Tooltip({ x, y, value, xValue, labels, showPointLabel, color, font, suffix, decimals }: {
  x: SharedValue<number>; y: SharedValue<number>; value: SharedValue<number>
  xValue: SharedValue<number>; labels: string[]; showPointLabel: boolean
  color: string; font: ReturnType<typeof useFont>; suffix: string; decimals: number
}) {
  const label = useDerivedValue(() => `${value.value.toFixed(decimals)}${suffix}`)
  const pointLabel = useDerivedValue(() => labels[Math.max(0, Math.min(labels.length - 1, Math.round(xValue.value)))] ?? '')
  const tx = useDerivedValue(() => x.value + 8)
  const valueY = useDerivedValue(() => y.value - 10)
  const pointY = useDerivedValue(() => y.value - 23)
  return (
    <>
      <Circle cx={x} cy={y} r={6} color={color} />
      <Circle cx={x} cy={y} r={10} color={color} opacity={0.18} />
      {font && showPointLabel ? <SkiaText x={tx} y={pointY} text={pointLabel} font={font} color={color} /> : null}
      {font ? <SkiaText x={tx} y={valueY} text={label} font={font} color={color} /> : null}
    </>
  )
}

/**
 * Área con dots, línea de referencia (objetivo) y scrub. 1:1 con el AreaChart+ReferenceLine web.
 * `onActiveIndex` reporta el índice tocado (o null) para mostrar un tooltip rico en RN.
 */
export function AreaTrend({
  points,
  color,
  suffix = '',
  decimals = 1,
  referenceY = null,
  referenceLabel,
  referenceColor,
  showArea = true,
  curveType = 'natural',
  height = 200,
  allowSinglePoint = false,
  showXAxisLabels = false,
  showTooltipLabel = false,
  accessiblePoints = false,
  accessibilityLabel = 'Gráfico de tendencia',
  onActiveIndex,
  onActivateIndex,
}: {
  points: AreaPoint[]
  color?: string
  suffix?: string
  decimals?: number
  referenceY?: number | null
  referenceLabel?: string
  referenceColor?: string
  showArea?: boolean
  curveType?: CurveType
  height?: number
  /** Opt-in para series donde una sola medición sigue siendo un dato visible. */
  allowSinglePoint?: boolean
  /** Usa `AreaPoint.label` como ticks del eje X (bodycomp); por defecto conserva charts compactos. */
  showXAxisLabels?: boolean
  /** Muestra la fecha/label del punto junto al valor durante el scrub. */
  showTooltipLabel?: boolean
  /** Permite recorrer puntos con acciones de accesibilidad aunque no haya callback externo. */
  accessiblePoints?: boolean
  accessibilityLabel?: string
  onActiveIndex?: (idx: number | null) => void
  /** Acción explícita del lector de pantalla sobre el punto seleccionado. */
  onActivateIndex?: (idx: number) => void
}) {
  const { theme } = useTheme()
  const reduceMotion = useReducedMotion()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: 0, y: { y: 0 } })
  const stroke = color ?? theme.primary
  const [a11yIndex, setA11yIndex] = useState(0)
  const animation = reduceMotion ? undefined : { type: 'timing' as const, duration: 350 }
  const hasAccessiblePoints = accessiblePoints || Boolean(onActiveIndex)

  useAnimatedReaction(
    () => (isActive ? Math.round(state.x.value.value) : -1),
    (cur, prev) => {
      if (cur !== prev && onActiveIndex) runOnJS(onActiveIndex)(cur < 0 ? null : cur)
    }
  )

  if (points.length === 0 || (!allowSinglePoint && points.length < 2)) return null

  function selectAccessiblePoint(direction: -1 | 0 | 1) {
    const next = direction === 0
      ? Math.max(0, Math.min(points.length - 1, a11yIndex))
      : Math.max(0, Math.min(points.length - 1, a11yIndex + direction))
    setA11yIndex(next)
    onActiveIndex?.(next)
  }

  const selected = points[Math.max(0, Math.min(points.length - 1, a11yIndex))]!
  const accessibilityText = `${selected.label ? `${selected.label}, ` : ''}${selected.y.toFixed(decimals)}${suffix}. Punto ${a11yIndex + 1} de ${points.length}`

  return (
    <View
      accessible
      accessibilityRole={hasAccessiblePoints ? 'adjustable' : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={hasAccessiblePoints ? `Desliza arriba o abajo para recorrer los puntos${onActivateIndex ? '; activa para abrir el detalle' : ''}.` : undefined}
      accessibilityValue={{ text: accessibilityText }}
      accessibilityActions={hasAccessiblePoints ? [
        { name: 'increment', label: 'Punto siguiente' },
        { name: 'decrement', label: 'Punto anterior' },
        { name: 'activate', label: 'Abrir punto seleccionado' },
      ] : undefined}
      onAccessibilityAction={hasAccessiblePoints ? (event) => {
        if (event.nativeEvent.actionName === 'increment') selectAccessiblePoint(1)
        if (event.nativeEvent.actionName === 'decrement') selectAccessiblePoint(-1)
        if (event.nativeEvent.actionName === 'activate') {
          const index = Math.max(0, Math.min(points.length - 1, a11yIndex))
          if (onActivateIndex) onActivateIndex(index)
          else selectAccessiblePoint(0)
        }
      } : undefined}
      style={[styles.wrap, { height }]}
    >
      <CartesianChart
        data={points}
        xKey="i"
        yKeys={['y']}
        domainPadding={{ left: 12, right: 12, top: 20, bottom: 8 }}
        axisOptions={{
          font,
          labelColor: theme.mutedForeground,
          tickCount: 4,
          formatXLabel: (value) => showXAxisLabels ? points[Math.max(0, Math.min(points.length - 1, Math.round(Number(value))))]?.label ?? '' : '',
        }}
        chartPressState={state}
      >
        {({ points: pts, chartBounds, yScale }) => {
          const referencePosition = referenceY == null
            ? null
            : Math.max(chartBounds.top, Math.min(chartBounds.bottom, yScale(referenceY)))
          return (
          <>
            {referenceY != null ? (
              <SkiaLine
                p1={vec(chartBounds.left, referencePosition!)}
                p2={vec(chartBounds.right, referencePosition!)}
                color={referenceColor ?? theme.success}
                strokeWidth={1.5}
              >
                <DashPathEffect intervals={[5, 5]} />
              </SkiaLine>
            ) : null}
            {showArea ? <Area points={pts.y} y0={chartBounds.bottom} color={stroke} opacity={0.16} curveType={curveType} animate={animation} /> : null}
            <Line points={pts.y} color={stroke} strokeWidth={2.5} curveType={curveType} animate={animation} />
            {pts.y.map((p, idx) =>
              p.y == null ? null : <Circle key={idx} cx={p.x} cy={p.y} r={3} color={stroke} />
            )}
            {isActive ? <Tooltip x={state.x.position} y={state.y.y.position} value={state.y.y.value} xValue={state.x.value} labels={points.map((point) => point.label)} showPointLabel={showTooltipLabel} color={stroke} font={font} suffix={suffix} decimals={decimals} /> : null}
          </>
          )
        }}
      </CartesianChart>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
})
