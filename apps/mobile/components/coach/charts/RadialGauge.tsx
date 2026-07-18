import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '../../../context/ThemeContext'

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

// Arco de gauge (270°): de 135° a 405°.
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, endDeg)
  const end = polar(cx, cy, r, startDeg)
  const largeArc = endDeg - startDeg <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

const START = 135
const END = 405

/** Gauge radial (svg) — 1:1 con el RadialBarChart web (energía 7d, etc.). */
export function RadialGauge({
  value,
  max,
  label,
  display,
  color,
  size = 150,
  strokeWidth = 14,
}: {
  value: number
  max: number
  label: string
  display?: string
  color?: string
  size?: number
  strokeWidth?: number
}) {
  const { theme } = useTheme()
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const valueEnd = START + (END - START) * ratio
  const fill = color ?? theme.primary

  return (
    <View style={[styles.wrap, { width: size }]}>
      <View style={{ width: size, height: size * 0.82 }}>
        <Svg width={size} height={size}>
          <Path d={arcPath(cx, cy, r, START, END)} stroke={theme.muted} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
          {ratio > 0 ? (
            <Path d={arcPath(cx, cy, r, START, valueEnd)} stroke={fill} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
            {display ?? String(Math.round(value * 10) / 10)}
          </Text>
          <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingBottom: 6 },
  value: { fontSize: 26, letterSpacing: -0.5 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
})
