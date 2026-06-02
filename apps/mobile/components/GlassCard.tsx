import { View, type ViewProps, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'

interface GlassCardProps extends ViewProps {
  /** 'blur' = frosted (use sparingly: headers, hero). 'solid' = gradient+glow (default, perf). */
  variant?: 'blur' | 'solid'
  intensity?: number
  className?: string
  glow?: boolean
  style?: ViewStyle | ViewStyle[]
}

/**
 * Liquid-glass-lite surface. Default 'solid' = gradient + subtle border + optional
 * glow (cheap, 60fps on mid Android). 'blur' = expo-blur frosted, reserve for key
 * surfaces (header/tab bar/hero) per the perf-first decision.
 */
export function GlassCard({ children, variant = 'solid', intensity = 24, glow = false, className, style, ...rest }: GlassCardProps) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const radiusStyle: ViewStyle = { borderRadius: theme.radius['2xl'], overflow: 'hidden' }
  const glowStyle = glow ? theme.shadowGlowBlue : null

  if (variant === 'blur') {
    return (
      <View style={[radiusStyle, glowStyle, style]} {...rest}>
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
          <View className={className} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius['2xl'] }}>
            {children}
          </View>
        </BlurView>
      </View>
    )
  }

  // 'solid': brand-tinted gradient surface (no blur cost).
  const gradient: [string, string] = isDark
    ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.015)']
    : ['rgba(255,255,255,0.9)', 'rgba(248,250,252,0.7)']

  return (
    <View style={[radiusStyle, glowStyle, style]} {...rest}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }}>
        <View className={className} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius['2xl'] }}>
          {children}
        </View>
      </LinearGradient>
    </View>
  )
}
