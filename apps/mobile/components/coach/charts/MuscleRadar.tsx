import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../../context/ThemeContext'

export interface MuscleRadarRow { muscleGroup: string; volume: number }

const SIZE = 240
const C = SIZE / 2
const R = 84

function axisPoint(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

/** Radar muscular 30d (svg) — 1:1 con el RadarChart web de volumen por grupo. */
export function MuscleRadar({ rows, color }: { rows: MuscleRadarRow[]; color?: string }) {
  const { theme } = useTheme()
  const data = useMemo(() => rows.slice(0, 8), [rows])
  const n = data.length
  const max = data.reduce((mx, x) => Math.max(mx, x.volume), 0) || 1
  const stroke = color ?? theme.primary
  const ringColor = theme.mutedForeground

  if (n < 3) return null
  const dataPts = data.map((x, i) => axisPoint(i, n, R * (x.volume / max)))

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {[0.25, 0.5, 0.75, 1].map((ring, ri) => (
          <Polygon
            key={ri}
            points={data.map((_, i) => { const p = axisPoint(i, n, R * ring); return `${p.x},${p.y}` }).join(' ')}
            fill="none"
            stroke={ringColor}
            strokeOpacity={0.15}
            strokeWidth={1}
          />
        ))}
        {data.map((_, i) => { const p = axisPoint(i, n, R); return <Line key={i} x1={C} y1={C} x2={p.x} y2={p.y} stroke={ringColor} strokeOpacity={0.15} strokeWidth={1} /> })}
        <Polygon points={dataPts.map((p) => `${p.x},${p.y}`).join(' ')} fill={stroke} fillOpacity={0.22} stroke={stroke} strokeWidth={2} />
        {data.map((x, i) => { const p = axisPoint(i, n, R + 13); return <SvgText key={i} x={p.x} y={p.y} fill={theme.mutedForeground} fontSize={8} fontWeight="700" textAnchor="middle" alignmentBaseline="middle">{x.muscleGroup.slice(0, 9)}</SvgText> })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 4 },
})
