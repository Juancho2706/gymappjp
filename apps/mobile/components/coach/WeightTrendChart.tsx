import { View, StyleSheet } from 'react-native'
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native'
import { useFont, Circle, Text as SkiaText } from '@shopify/react-native-skia'
import { useDerivedValue, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../context/ThemeContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/hanken-grotesk/HankenGrotesk_400Regular.ttf')

export interface WeightPoint { label: string; kg: number; [k: string]: string | number }

function Tooltip({ x, y, value, color, font }: {
  x: SharedValue<number>; y: SharedValue<number>; value: SharedValue<number>
  color: string; font: ReturnType<typeof useFont>
}) {
  const label = useDerivedValue(() => `${value.value.toFixed(1)} kg`)
  const tx = useDerivedValue(() => x.value + 8)
  const ty = useDerivedValue(() => y.value - 10)
  return (
    <>
      <Circle cx={x} cy={y} r={5} color={color} />
      {font ? <SkiaText x={tx} y={ty} text={label} font={font} color={color} /> : null}
    </>
  )
}

/** Interactive weight trend over check-ins (press to read the value). */
export function WeightTrendChart({ points }: { points: WeightPoint[] }) {
  const { theme } = useTheme()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: '', y: { kg: 0 } })

  if (points.length < 2) return null

  return (
    <View style={styles.wrap}>
      <CartesianChart
        data={points}
        xKey="label"
        yKeys={['kg']}
        domainPadding={{ left: 10, right: 10, top: 18, bottom: 6 }}
        axisOptions={{ font, labelColor: theme.mutedForeground, tickCount: 4, formatXLabel: () => '' }}
        chartPressState={state}
      >
        {({ points: pts, chartBounds }) => (
          <>
            <Area points={pts.kg} y0={chartBounds.bottom} color={theme.primary} opacity={0.18} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            <Line points={pts.kg} color={theme.primary} strokeWidth={2.5} curveType="natural" animate={{ type: 'timing', duration: 350 }} />
            {isActive ? <Tooltip x={state.x.position} y={state.y.kg.position} value={state.y.kg.value} color={theme.primary} font={font} /> : null}
          </>
        )}
      </CartesianChart>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { height: 180, marginTop: 4 },
})
