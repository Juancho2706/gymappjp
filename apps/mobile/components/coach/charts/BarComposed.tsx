import { View, StyleSheet } from 'react-native'
import { CartesianChart, Bar, Line, useChartPressState } from 'victory-native'
import { useFont, Circle, Text as SkiaText } from '@shopify/react-native-skia'
import { useDerivedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/hanken-grotesk/HankenGrotesk_400Regular.ttf')

export interface BarComposedPoint { i: number; bar: number; avg: number; label: string; [k: string]: string | number }

function Tip({ x, y, value, color, font, suffix }: {
  x: SharedValue<number>; y: SharedValue<number>; value: SharedValue<number>
  color: string; font: ReturnType<typeof useFont>; suffix: string
}) {
  const label = useDerivedValue(() => `${Math.round(value.value)}${suffix}`)
  const tx = useDerivedValue(() => x.value + 8)
  const ty = useDerivedValue(() => y.value - 10)
  return (
    <>
      <Circle cx={x} cy={y} r={5} color={color} />
      {font ? <SkiaText x={tx} y={ty} text={label} font={font} color={color} /> : null}
    </>
  )
}

/**
 * Composed: barras (volumen/tonelaje) + línea de media móvil. 1:1 con el ComposedChart web.
 */
export function BarComposed({
  points,
  barColor,
  lineColor,
  suffix = '',
  height = 200,
  onActiveIndex,
}: {
  points: BarComposedPoint[]
  barColor?: string
  lineColor?: string
  suffix?: string
  height?: number
  onActiveIndex?: (idx: number | null) => void
}) {
  const { theme } = useTheme()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: 0, y: { bar: 0, avg: 0 } })
  const bColor = barColor ?? theme.primary
  const lColor = lineColor ?? theme.warning

  useAnimatedReaction(
    () => (isActive ? Math.round(state.x.value.value) : -1),
    (cur, prev) => {
      if (cur !== prev && onActiveIndex) runOnJS(onActiveIndex)(cur < 0 ? null : cur)
    }
  )

  if (points.length < 1) return null

  return (
    <View style={[styles.wrap, { height }]}>
      <CartesianChart
        data={points}
        xKey="i"
        yKeys={['bar', 'avg']}
        domainPadding={{ left: 16, right: 16, top: 20, bottom: 8 }}
        axisOptions={{ font, labelColor: theme.mutedForeground, tickCount: 4, formatXLabel: () => '' }}
        chartPressState={state}
      >
        {({ points: pts, chartBounds }) => (
          <>
            <Bar
              points={pts.bar}
              chartBounds={chartBounds}
              color={bColor}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
              animate={{ type: 'timing', duration: 350 }}
              barCount={points.length}
            />
            <Line points={pts.avg} color={lColor} strokeWidth={2.5} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            {isActive ? <Tip x={state.x.position} y={state.y.bar.position} value={state.y.bar.value} color={bColor} font={font} suffix={suffix} /> : null}
          </>
        )}
      </CartesianChart>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
})
