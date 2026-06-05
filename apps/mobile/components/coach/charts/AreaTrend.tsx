import { View, StyleSheet } from 'react-native'
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native'
import {
  useFont,
  Circle,
  Text as SkiaText,
  DashPathEffect,
  Line as SkiaLine,
  vec,
} from '@shopify/react-native-skia'
import { useDerivedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/inter/Inter_400Regular.ttf')

export interface AreaPoint { i: number; y: number; label: string; [k: string]: string | number }

function Tooltip({ x, y, value, color, font, suffix, decimals }: {
  x: SharedValue<number>; y: SharedValue<number>; value: SharedValue<number>
  color: string; font: ReturnType<typeof useFont>; suffix: string; decimals: number
}) {
  const label = useDerivedValue(() => `${value.value.toFixed(decimals)}${suffix}`)
  const tx = useDerivedValue(() => x.value + 8)
  const ty = useDerivedValue(() => y.value - 10)
  return (
    <>
      <Circle cx={x} cy={y} r={6} color={color} />
      <Circle cx={x} cy={y} r={10} color={color} opacity={0.18} />
      {font ? <SkiaText x={tx} y={ty} text={label} font={font} color={color} /> : null}
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
  height = 200,
  onActiveIndex,
}: {
  points: AreaPoint[]
  color?: string
  suffix?: string
  decimals?: number
  referenceY?: number | null
  referenceLabel?: string
  height?: number
  onActiveIndex?: (idx: number | null) => void
}) {
  const { theme } = useTheme()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: 0, y: { y: 0 } })
  const stroke = color ?? theme.primary

  useAnimatedReaction(
    () => (isActive ? Math.round(state.x.value.value) : -1),
    (cur, prev) => {
      if (cur !== prev && onActiveIndex) runOnJS(onActiveIndex)(cur < 0 ? null : cur)
    }
  )

  if (points.length < 2) return null

  return (
    <View style={[styles.wrap, { height }]}>
      <CartesianChart
        data={points}
        xKey="i"
        yKeys={['y']}
        domainPadding={{ left: 12, right: 12, top: 20, bottom: 8 }}
        axisOptions={{ font, labelColor: theme.mutedForeground, tickCount: 4, formatXLabel: () => '' }}
        chartPressState={state}
      >
        {({ points: pts, chartBounds, yScale }) => (
          <>
            {referenceY != null ? (
              <SkiaLine
                p1={vec(chartBounds.left, yScale(referenceY))}
                p2={vec(chartBounds.right, yScale(referenceY))}
                color={theme.mutedForeground}
                strokeWidth={1.5}
              >
                <DashPathEffect intervals={[5, 5]} />
              </SkiaLine>
            ) : null}
            <Area points={pts.y} y0={chartBounds.bottom} color={stroke} opacity={0.16} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            <Line points={pts.y} color={stroke} strokeWidth={2.5} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            {pts.y.map((p, idx) =>
              p.y == null ? null : <Circle key={idx} cx={p.x} cy={p.y} r={3} color={stroke} />
            )}
            {isActive ? <Tooltip x={state.x.position} y={state.y.y.position} value={state.y.y.value} color={stroke} font={font} suffix={suffix} decimals={decimals} /> : null}
          </>
        )}
      </CartesianChart>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
})
