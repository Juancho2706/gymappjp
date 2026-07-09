import { Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { Utensils } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { shadow } from '../../../lib/shadows'

/**
 * PlatePanel (E4-10, gap 2.3) — "Tu plato": guía PROPORCIONAL del método del
 * plato (verduras/proteína/carbohidrato) derivada del split de macros del plan.
 * Espejo del web `PlatePanel` + `ProportionPlate`. Es una guía de cómo dividir el
 * plato, NUNCA un indicador de meta cumplida (no usa el verde de adherencia).
 * Base tier. Presentacional puro. El monolito no lo tenía.
 *
 * Colores de segmento = triada de macros DS: verduras → grasas (aqua), proteína
 * → ember, carbohidrato → sport (mismo criterio que la web).
 */

export interface PlateShares {
  veg: number
  protein: number
  carb: number
}

/**
 * Deriva la proporción del plato desde los gramos de macros del plan. Convención
 * MINSAL: verduras ~50% del plato; el resto se reparte proteína/carbohidrato por
 * su peso relativo en gramos. Sin macros → plato balanceado 50/25/25. PURA
 * (replica `platePropFromMacros` de la web — es la fórmula del método del plato).
 */
export function platePropFromMacros(proteinG: number, carbsG: number): PlateShares {
  const p = Math.max(0, Number(proteinG) || 0)
  const c = Math.max(0, Number(carbsG) || 0)
  const VEG = 0.5
  const rest = 1 - VEG
  const denom = p + c
  if (denom <= 0) return { veg: VEG, protein: rest / 2, carb: rest / 2 }
  return { veg: VEG, protein: rest * (p / denom), carb: rest * (c / denom) }
}

const SIZE = 96
const CX = SIZE / 2
const CY = SIZE / 2
const R = SIZE / 2 - 2
const HOLE_R = R * 0.44

const SEGMENTS = [
  { key: 'veg' as const, label: 'Verduras', color: MACRO_COLORS.fats },
  { key: 'protein' as const, label: 'Proteína', color: MACRO_COLORS.protein },
  { key: 'carb' as const, label: 'Carbohidrato', color: MACRO_COLORS.carbs },
]

/** Punto en el círculo unitario a `turns` (0..1, horario desde arriba). */
function pointAt(turns: number, r: number): [number, number] {
  const angle = turns * 2 * Math.PI - Math.PI / 2
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function wedgePath(start: number, end: number): string {
  const [sx, sy] = pointAt(start, R)
  const [ex, ey] = pointAt(end, R)
  const largeArc = end - start > 0.5 ? 1 : 0
  return `M ${CX} ${CY} L ${sx} ${sy} A ${R} ${R} 0 ${largeArc} 1 ${ex} ${ey} Z`
}

export function PlatePanel({ proteinG, carbsG }: { proteinG: number; carbsG: number }) {
  const { theme } = useTheme()
  const raw = platePropFromMacros(proteinG, carbsG)
  const sum = raw.veg + raw.protein + raw.carb || 1
  const shares = { veg: raw.veg / sum, protein: raw.protein / sum, carb: raw.carb / sum }

  const wedges = SEGMENTS.map((seg, i) => {
    const start = SEGMENTS.slice(0, i).reduce((acc, s) => acc + shares[s.key], 0)
    const share = shares[seg.key]
    return { ...seg, start, end: start + share, share }
  }).filter((w) => w.share > 0)

  return (
    <View
      testID="nutrition-plate-panel"
      style={[
        { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius['2xl'], padding: 16, gap: 12 },
        shadow('sm', theme.scheme),
      ]}
    >
      <Text className="text-strong" style={{ fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: -0.3 }}>
        Tu plato
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            {wedges.map((w) => (
              <Path key={w.key} d={wedgePath(w.start, w.end)} fill={w.color} />
            ))}
            <Circle cx={CX} cy={CY} r={HOLE_R} fill={theme.card} />
            <Circle cx={CX} cy={CY} r={R} fill="none" stroke={theme.background} strokeWidth={2} />
          </Svg>
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Utensils size={19} color={theme.mutedForeground} strokeWidth={2} />
          </View>
        </View>

        <View style={{ flex: 1, gap: 8 }}>
          {SEGMENTS.map((seg) => (
            <View key={seg.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
              <Text className="text-strong" style={{ flex: 1, fontFamily: FONT.uiMedium, fontSize: 12.5 }}>
                {seg.label}
              </Text>
              <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                {Math.round(shares[seg.key] * 100)}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text className="text-subtle" style={{ fontFamily: FONT.ui, fontSize: 11, lineHeight: 15 }}>
        Guía de cómo dividir el plato, no cantidades ni una meta cumplida.
      </Text>
    </View>
  )
}
