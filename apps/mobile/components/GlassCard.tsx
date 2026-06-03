import { View, StyleSheet, type ViewProps, type ViewStyle } from 'react-native'
import { useId } from 'react'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface GlassCardProps extends ViewProps {
  /** 'blur' = frosted (use sparingly: headers, hero). 'solid' = gradient+glow (default, perf). */
  variant?: 'blur' | 'solid'
  intensity?: number
  className?: string
  glow?: boolean
  /** Difuminado de color de marca en la esquina sup-der (como GlassCard web). Default true. */
  cornerGlow?: boolean
  /** Color del cornerGlow (default theme.primary). */
  glowColor?: string
  style?: ViewStyle | ViewStyle[]
}

/**
 * Liquid-glass-lite surface. Border + radius + clip live on ONE view (so rounded
 * corners never mismatch a square fill behind them), with the gradient as an absolute
 * fill underneath the content. 'solid' = brand-tinted gradient (cheap, 60fps);
 * 'blur' = expo-blur frosted (reserve for key surfaces). `cornerGlow` añade un radial
 * SVG con el color de marca en la esquina sup-der (espeja la GlassCard de la web).
 */
export function GlassCard({ children, variant = 'solid', intensity = 22, glow = false, cornerGlow = true, glowColor, className, style, ...rest }: GlassCardProps) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const radius = theme.radius['2xl']
  // id único por instancia → evita colisión de gradientes SVG entre cards.
  const glowId = `cardglow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const gColor = glowColor ?? theme.primary
  const gA = isDark ? 0.16 : 0.1

  const base: ViewStyle = {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  }

  const corner = cornerGlow ? (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={glowId} cx="100%" cy="0%" r="75%">
          <Stop offset="0" stopColor={hexToRgba(gColor, gA)} />
          <Stop offset="0.6" stopColor={hexToRgba(gColor, gA * 0.28)} />
          <Stop offset="1" stopColor={gColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${glowId})`} />
    </Svg>
  ) : null

  if (variant === 'blur') {
    return (
      <View style={[base, glow ? theme.shadowGlowBlue : null, style]} {...rest}>
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {/* legibility veil over the blur (glass best-practice: 10–40% tint) */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(20,22,28,0.35)' : 'rgba(255,255,255,0.35)' }]} />
        {corner}
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
      {corner}
      <View className={className} style={{ flex: 1 }}>{children}</View>
    </View>
  )
}
