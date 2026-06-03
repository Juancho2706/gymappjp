import { View, StyleSheet } from 'react-native'
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native'
import { useFont, Circle, Text as SkiaText } from '@shopify/react-native-skia'
import { useDerivedValue, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../context/ThemeContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/inter/Inter_400Regular.ttf')

export interface TrendPoint { label: string; v: number; [k: string]: string | number }

function Tooltip({ x, y, value, color, font, suffix, decimals }: {
  x: SharedValue<number>; y: SharedValue<number>; value: SharedValue<number>
  color: string; font: ReturnType<typeof useFont>; suffix: string; decimals: number
}) {
  const label = useDerivedValue(() => `${value.value.toFixed(decimals)}${suffix}`)
  const tx = useDerivedValue(() => x.value + 8)
  const ty = useDerivedValue(() => y.value - 10)
  return (
    <>
      <Circle cx={x} cy={y} r={5} color={color} />
      {font ? <SkiaText x={tx} y={ty} text={label} font={font} color={color} /> : null}
    </>
  )
}

/** Generic interactive line/area trend (press to read value). Used for weight, energy, etc. */
export function TrendChart({ points, color, suffix = '', decimals = 1 }: { points: TrendPoint[]; color?: string; suffix?: string; decimals?: number }) {
  const { theme } = useTheme()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: '', y: { v: 0 } })
  const stroke = color ?? theme.primary

  if (points.length < 2) return null

  return (
    <View style={styles.wrap}>
      <CartesianChart
        data={points}
        xKey="label"
        yKeys={['v']}
        domainPadding={{ left: 10, right: 10, top: 18, bottom: 6 }}
        axisOptions={{ font, labelColor: theme.mutedForeground, tickCount: 4, formatXLabel: () => '' }}
        chartPressState={state}
      >
        {({ points: pts, chartBounds }) => (
          <>
            <Area points={pts.v} y0={chartBounds.bottom} color={stroke} opacity={0.18} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            <Line points={pts.v} color={stroke} strokeWidth={2.5} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            {isActive ? <Tooltip x={state.x.position} y={state.y.v.position} value={state.y.v.value} color={stroke} font={font} suffix={suffix} decimals={decimals} /> : null}
          </>
        )}
      </CartesianChart>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { height: 180, marginTop: 4 },
})
