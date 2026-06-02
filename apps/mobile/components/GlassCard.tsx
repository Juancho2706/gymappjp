import { View, StyleSheet, type ViewProps, type ViewStyle } from 'react-native'
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
 * Liquid-glass-lite surface. Border + radius + clip live on ONE view (so rounded
 * corners never mismatch a square blur/gradient fill behind them), with the
 * gradient/blur as an absolute fill underneath the content. 'solid' = brand-tinted
 * gradient (cheap, 60fps); 'blur' = expo-blur frosted (reserve for key surfaces).
 */
export function GlassCard({ children, variant = 'solid', intensity = 22, glow = false, className, style, ...rest }: GlassCardProps) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const radius = theme.radius['2xl']

  const base: ViewStyle = {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  }

  if (variant === 'blur') {
    return (
      <View style={[base, glow ? theme.shadowGlowBlue : null, style]} {...rest}>
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {/* legibility veil over the blur (glass best-practice: 10–40% tint) */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(20,22,28,0.35)' : 'rgba(255,255,255,0.35)' }]} />
        <View className={className} style={{ flex: 1 }}>{children}</View>
      </View>
    )
  }

  const gradient: [string, string] = isDark
    ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.015)']
    : ['rgba(255,255,255,0.92)', 'rgba(248,250,252,0.75)']

  return (
    <View style={[base, { backgroundColor: theme.card }, glow ? theme.shadowGlowBlue : null, style]} {...rest}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View className={className} style={{ flex: 1 }}>{children}</View>
    </View>
  )
}
