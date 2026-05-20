import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

interface ComplianceRingProps {
  /** 0..1 */
  value: number
  label: string
  size?: number
  strokeWidth?: number
  color?: string
}

export function ComplianceRing({
  value,
  label,
  size = 72,
  strokeWidth = 6,
  color,
}: ComplianceRingProps) {
  const { theme } = useTheme()
  const ringColor = color ?? theme.primary
  const trackColor = theme.muted

  const clamped = Math.max(0, Math.min(1, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped)
  const pct = Math.round(clamped * 100)

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            style={[
              styles.pct,
              { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' },
            ]}
          >
            {pct}%
          </Text>
        </View>
      </View>
      <Text
        style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
        numberOfLines={1}
      >
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
