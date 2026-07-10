import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { AlertTriangle } from 'lucide-react-native'
import { MotiView } from 'moti'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'
import { ProgressBar } from './ProgressBar'

// Paleta de macros canónica EVA DS (token-contract): energía=success · proteína=ember ·
// carbos=sport-ref · grasas=aqua. Colores de dominio FIJOS (no white-label).
export const MACRO_COLORS = { kcal: '#1FB877', protein: '#FF6A3D', carbs: '#126BE1', fats: '#18ABD4' } as const

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface MacroRingProps {
  consumed: number
  target: number
  label: string
  color: string
  size?: number
}

function MacroRing({ consumed, target, label, color, size = 80 }: MacroRingProps) {
  const { theme } = useTheme()
  const over = consumed > target && target > 0
  const pct = target > 0 ? Math.min(consumed / target, 1.1) : 0
  const strokeWidth = 7
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * Math.min(pct, 1)
  const ringColor = over ? theme.destructive : color

  // P5: animar el llenado del ring cada vez que cambian los macros automáticos.
  const offset = useSharedValue(circumference)
  useEffect(() => {
    offset.value = withTiming(circumference - strokeDash, { duration: 600, easing: Easing.out(Easing.cubic) })
  }, [strokeDash, circumference, offset])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <View style={styles.ringWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.muted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedProps}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
          {over ? (
            <AlertTriangle size={16} color={theme.destructive} strokeWidth={2.5} />
          ) : (
            <Text style={[styles.ringValue, { color: ringColor, fontFamily: 'Archivo_800ExtraBold' }]}>
              {Math.round(consumed)}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.ringLabelWrap}>
        <Text style={[styles.ringLabel, { color: ringColor, fontFamily: 'HankenGrotesk_700Bold' }]}>
          {label}
        </Text>
        <Text style={[styles.ringTarget, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          / {Math.round(target)}g
        </Text>
      </View>
    </View>
  )
}

interface Props {
  calories: { consumed: number; target: number }
  protein: { consumed: number; target: number }
  carbs: { consumed: number; target: number }
  fats: { consumed: number; target: number }
  isReadOnly?: boolean
}

export function MacroRingSummary({ calories, protein, carbs, fats, isReadOnly }: Props) {
  const { theme } = useTheme()
  const calPct = calories.target > 0 ? Math.min(calories.consumed / calories.target, 1) : 0
  const calOver = calories.consumed > calories.target && calories.target > 0
  const calPctDisplay = calories.target > 0
    ? Math.round((calories.consumed / calories.target) * 100)
    : 0

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderRadius: theme.radius['2xl'],
          opacity: isReadOnly ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.calRow}>
        <View>
          <Text style={[styles.calLabel, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>
            ENERGÍA {isReadOnly ? '· SOLO LECTURA' : 'DIARIA'}
          </Text>
          <View style={styles.calValueRow}>
            <Text style={[styles.calValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
              {Math.round(calories.consumed)}
            </Text>
            <Text style={[styles.calTarget, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              / {calories.target} kcal
            </Text>
          </View>
        </View>
        <Text style={[styles.calPct, { color: calOver ? theme.destructive : MACRO_COLORS.kcal, fontFamily: 'Archivo_800ExtraBold' }]}>
          {calPctDisplay}%
        </Text>
      </View>

      <ProgressBar
        value={calPct}
        color={calOver ? theme.destructive : MACRO_COLORS.kcal}
        height={10}
      />

      <View style={styles.ringsRow}>
        <MacroRing consumed={protein.consumed} target={protein.target} label="Proteína" color={MACRO_COLORS.protein} />
        <MacroRing consumed={carbs.consumed} target={carbs.target} label="Carbos" color={MACRO_COLORS.carbs} />
        <MacroRing consumed={fats.consumed} target={fats.target} label="Grasas" color={MACRO_COLORS.fats} />
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, gap: 14 },
  calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  calLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  calValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  calValue: { fontSize: 36, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  calTarget: { fontSize: 13 },
  calPct: { fontSize: 24, fontVariant: ['tabular-nums'] },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 },
  ringWrap: { alignItems: 'center', gap: 6 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 14, letterSpacing: -0.3 },
  ringLabelWrap: { alignItems: 'center', gap: 1 },
  ringLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2 },
  ringTarget: { fontSize: 9 },
})
