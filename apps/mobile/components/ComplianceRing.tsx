import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'
import { EASE, useEvaMotion } from '../lib/motion'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface ComplianceRingProps {
  /** 0..1 */
  value: number
  label: string
  size?: number
  strokeWidth?: number
  color?: string
  /** Sin datos: pinta gris + "—" en vez de 0% (no confundir "sin uso" con "mal cumplimiento"). */
  empty?: boolean
}

export function ComplianceRing({
  value,
  label,
  size = 72,
  strokeWidth = 6,
  color,
  empty = false,
}: ComplianceRingProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const ringColor = empty ? theme.mutedForeground : (color ?? theme.primary)
  const trackColor = theme.muted

  const clamped = empty ? 0 : Math.max(0, Math.min(1, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped)
  const pct = Math.round(clamped * 100)

  // Deleite v1: animar el llenado del anillo al revelarse / cambiar el valor.
  const offset = useSharedValue(circumference)
  useEffect(() => {
    offset.value = withTiming(dashOffset, { duration: motion.reduced ? 0 : 800, easing: EASE.standard })
  }, [dashOffset, circumference, motion.reduced, offset])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
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
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.pct, { color: empty ? theme.mutedForeground : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {empty ? '—' : `${pct}%`}
          </Text>
        </View>
      </View>
      <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: 14, letterSpacing: -0.3 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
})
