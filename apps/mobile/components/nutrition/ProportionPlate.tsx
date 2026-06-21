import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTheme } from '../../context/ThemeContext'

/**
 * Visual del metodo del plato (MINSAL) — lado ALUMNO (mobile). Espejo de
 * apps/web/src/components/nutrition/ProportionPlate.tsx. Circulo dividido en 3 cuñas
 * (verduras/proteina/carbohidrato) desde {veg,protein,carb} (0..1). Guia PROPORCIONAL, nunca
 * "meta cumplida": no usa el verde de adherencia y el copy habla de proporcion.
 */

export interface PlateProportion {
  veg: number
  protein: number
  carb: number
}

type PlateSegmentKey = 'veg' | 'protein' | 'carb'
const SEGMENT_ORDER: PlateSegmentKey[] = ['veg', 'protein', 'carb']
const SEGMENT_LABEL: Record<PlateSegmentKey, string> = {
  veg: 'Verduras',
  protein: 'Proteína',
  carb: 'Carbohidrato',
}

function normalize(p: PlateProportion): Record<PlateSegmentKey, number> {
  const veg = Math.max(0, p.veg)
  const protein = Math.max(0, p.protein)
  const carb = Math.max(0, p.carb)
  const sum = veg + protein + carb
  if (sum <= 0) return { veg: 0, protein: 0, carb: 0 }
  return { veg: veg / sum, protein: protein / sum, carb: carb / sum }
}

const pct = (v: number) => Math.round(v * 100)

function pointAt(turns: number, cx: number, cy: number, r: number): [number, number] {
  const angle = turns * 2 * Math.PI - Math.PI / 2
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

function wedgePath(start: number, end: number, cx: number, cy: number, r: number): string {
  if (end - start >= 1) {
    const [mx, my] = pointAt(0.5, cx, cy, r)
    const [sx, sy] = pointAt(0, cx, cy, r)
    return [`M ${cx} ${cy}`, `L ${sx} ${sy}`, `A ${r} ${r} 0 1 1 ${mx} ${my}`, `A ${r} ${r} 0 1 1 ${sx} ${sy}`, 'Z'].join(' ')
  }
  const [sx, sy] = pointAt(start, cx, cy, r)
  const [ex, ey] = pointAt(end, cx, cy, r)
  const largeArc = end - start > 0.5 ? 1 : 0
  return [`M ${cx} ${cy}`, `L ${sx} ${sy}`, `A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`, 'Z'].join(' ')
}

export function ProportionPlate({ proportion, size = 160 }: { proportion: PlateProportion; size?: number }) {
  const { theme } = useTheme()
  const shares = normalize(proportion)

  // veg => fats (verde vegetal, no success-green); protein => protein; carb => carbs.
  const SEGMENT_COLOR: Record<PlateSegmentKey, string> = {
    veg: theme.macro.fats,
    protein: theme.macro.protein,
    carb: theme.macro.carbs,
  }

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 2

  let cursor = 0
  const wedges = SEGMENT_ORDER.map((key) => {
    const share = shares[key]
    const start = cursor
    const end = cursor + share
    cursor = end
    return { key, share, start, end }
  }).filter((w) => w.share > 0)

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        {wedges.map((w) => (
          <Path key={w.key} d={wedgePath(w.start, w.end, cx, cy, r)} fill={SEGMENT_COLOR[w.key]} />
        ))}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.background} strokeWidth={2} />
      </Svg>

      <View style={styles.legend}>
        {SEGMENT_ORDER.map((key) => {
          const share = shares[key]
          if (share <= 0) return null
          return (
            <View key={key} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: SEGMENT_COLOR[key] }]} />
              <Text style={[styles.legendLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {SEGMENT_LABEL[key]}
              </Text>
              <Text style={[styles.legendPct, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {pct(share)}%
              </Text>
            </View>
          )
        })}
      </View>

      <Text style={[styles.caption, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Proporción sugerida del plato, no una meta cumplida.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  legend: { gap: 4, alignSelf: 'stretch', paddingHorizontal: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 12 },
  legendPct: { fontSize: 12 },
  caption: { fontSize: 10, lineHeight: 14, textAlign: 'center', maxWidth: 220, opacity: 0.8 },
})
