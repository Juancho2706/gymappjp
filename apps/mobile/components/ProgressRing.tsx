import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { ViewProps, ViewStyle } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'
import { useEvaMotion } from '../lib/motion'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

// Track (var(--track)) — ink-100 in light, translucent white in dark.
const TRACK_LIGHT = '#E6E9ED'
const TRACK_DARK = 'rgba(255,255,255,0.10)'

/** True when the supplied hex reads as a dark surface (perceived luminance). */
function isDarkHex(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export interface ProgressRingProps extends Omit<ViewProps, 'style'> {
  /** Progress, 0..100 (clamped). */
  value?: number
  /** Outer diameter in px. */
  size?: number
  /** Ring stroke width in px. */
  stroke?: number
  /** Progress arc color. Defaults to the white-label brand (sport-500). */
  color?: string
  /** Track (unfilled) color. Defaults to var(--track) per theme. */
  track?: string
  /** Custom center content (e.g. "3/5 comidas"). Overrides the % readout. */
  label?: React.ReactNode
  /** Show the "<value>%" readout when no `label` is given. */
  showValue?: boolean
  style?: ViewStyle
}

/**
 * EVA ProgressRing — circular activity-ring progress for adherence, weekly
 * goals or macro completion. RN port of the web/DS ProgressRing (1:1 API).
 * Animates the arc with a spring on value change; respects reduce-motion.
 */
export function ProgressRing({
  value = 0,
  size = 72,
  stroke = 8,
  color,
  track,
  label,
  showValue = true,
  style,
  ...rest
}: ProgressRingProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const isDark = isDarkHex(theme.background)

  const ringColor = color ?? theme.primary // sport-500 → white-label brand
  const trackColor = track ?? (isDark ? TRACK_DARK : TRACK_LIGHT)

  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dashOffset = c * (1 - clamped / 100)

  // Deleite: animar el llenado del anillo con un spring al revelarse / cambiar.
  const reduced = motion.reduced
  const spring = motion.spring('ui')
  const offset = useSharedValue(c)
  useEffect(() => {
    offset.value = reduced ? dashOffset : withSpring(dashOffset, spring as Parameters<typeof withSpring>[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashOffset, c, reduced, offset])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  const valueFontSize = size * 0.26
  const pctFontSize = size * 0.13

  return (
    <View {...rest} style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {label != null ? (
          typeof label === 'string' || typeof label === 'number' ? (
            <Text style={[styles.labelText, { color: theme.foreground }]}>{label}</Text>
          ) : (
            label
          )
        ) : (
          showValue && (
            <Text
              style={[
                styles.value,
                {
                  color: theme.foreground,
                  fontSize: valueFontSize,
                  lineHeight: valueFontSize,
                  letterSpacing: valueFontSize * -0.03,
                },
              ]}
              numberOfLines={1}
            >
              {Math.round(clamped)}
              <Text style={{ fontSize: pctFontSize, fontFamily: 'Archivo_900Black' }}>%</Text>
            </Text>
          )
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: 'Archivo_900Black',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  labelText: {
    fontFamily: 'HankenGrotesk_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
})
