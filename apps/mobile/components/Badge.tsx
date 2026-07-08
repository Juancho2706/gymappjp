import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { FONT, TYPE_SCALE } from '../lib/typography'

// Legacy tones already consumed across the app (keep — public API).
type LegacyTone = 'primary' | 'success' | 'destructive' | 'muted' | 'cyan'
// EVA DS tones (Badge.prompt.md / Badge.jsx).
type DesignTone = 'neutral' | 'sport' | 'ember' | 'success' | 'warning' | 'danger' | 'info' | 'aqua'
export type BadgeTone = LegacyTone | DesignTone
export type BadgeVariant = 'soft' | 'solid' | 'outline'
type Size = 'sm' | 'md'

interface BadgeProps {
  /** Preferred (DS) content slot. */
  children?: ReactNode
  /** Legacy content prop — kept for existing callers. `children` wins if both set. */
  label?: string
  tone?: BadgeTone
  variant?: BadgeVariant
  size?: Size
  /** Leading status dot. */
  dot?: boolean
  /** Leading icon node (e.g. lucide-react-native element). */
  icon?: ReactNode
  /** Escape hatch: arbitrary brand/runtime color (overrides tone palette). */
  toneColor?: string
  style?: ViewStyle
}

// Legacy tones fold onto a canonical DS palette key.
const CANON: Record<BadgeTone, DesignTone> = {
  primary: 'sport',
  muted: 'neutral',
  destructive: 'danger',
  cyan: 'aqua',
  neutral: 'neutral',
  sport: 'sport',
  ember: 'ember',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  aqua: 'aqua',
}

// Literal class strings (NativeWind needs them statically present in source).
// softBg: light tint at full opacity + translucent base in dark (the -100 token
// flips to the saturated base in dark, applied at ~.18/.20 alpha).
// fg/border: the -600/-700 soft foregrounds (already dark-aware in global.css).
// solid: theme-constant saturated -500 (sport uses cta-fill = white-text-safe brand).
const PALETTE: Record<
  DesignTone,
  { softBg: string; fg: string; border: string; solid: string; dot: string }
> = {
  neutral: { softBg: 'bg-ink-100', fg: 'text-ink-700', border: 'border-ink-700', solid: 'bg-ink-600', dot: 'bg-ink-600' },
  sport: { softBg: 'bg-sport-100 dark:bg-sport-100/20', fg: 'text-sport-700', border: 'border-sport-700', solid: 'bg-cta-fill', dot: 'bg-sport-500' },
  ember: { softBg: 'bg-ember-100 dark:bg-ember-100/20', fg: 'text-ember-700', border: 'border-ember-700', solid: 'bg-ember-500', dot: 'bg-ember-500' },
  success: { softBg: 'bg-success-100 dark:bg-success-100/[0.18]', fg: 'text-success-600', border: 'border-success-600', solid: 'bg-success-500', dot: 'bg-success-500' },
  warning: { softBg: 'bg-warning-100 dark:bg-warning-100/[0.18]', fg: 'text-warning-700', border: 'border-warning-700', solid: 'bg-warning-500', dot: 'bg-warning-500' },
  danger: { softBg: 'bg-danger-100 dark:bg-danger-100/[0.18]', fg: 'text-danger-600', border: 'border-danger-600', solid: 'bg-danger-500', dot: 'bg-danger-500' },
  info: { softBg: 'bg-info-100 dark:bg-info-100/[0.18]', fg: 'text-info-600', border: 'border-info-600', solid: 'bg-info-500', dot: 'bg-info-500' },
  aqua: { softBg: 'bg-aqua-100 dark:bg-aqua-100/[0.18]', fg: 'text-aqua-700', border: 'border-aqua-700', solid: 'bg-aqua-500', dot: 'bg-aqua-500' },
}

const SIZE: Record<Size, { height: number; paddingHorizontal: number; gap: number; fontSize: number; dot: number; icon: number }> = {
  sm: { height: 20, paddingHorizontal: 8, gap: 4, fontSize: TYPE_SCALE['3xs'], dot: 6, icon: 12 },
  md: { height: 24, paddingHorizontal: 10, gap: 6, fontSize: TYPE_SCALE['2xs'], dot: 6, icon: 14 },
}

export function Badge({
  children,
  label,
  tone = 'primary',
  variant = 'soft',
  size = 'sm',
  dot = false,
  icon,
  toneColor,
  style,
}: BadgeProps) {
  const p = PALETTE[CANON[tone] ?? 'neutral']
  const s = SIZE[size]
  const usesToneColor = !!toneColor

  // ── Class-driven palette (default path) ──
  let containerColor = ''
  let textColor = ''
  let dotColor = ''
  if (variant === 'solid') {
    containerColor = `${p.solid} border-transparent`
    textColor = 'text-white'
    dotColor = 'bg-white'
  } else if (variant === 'outline') {
    containerColor = `bg-transparent ${p.border}`
    textColor = p.fg
    dotColor = p.dot
  } else {
    containerColor = `${p.softBg} border-transparent`
    textColor = p.fg
    dotColor = p.dot
  }

  // ── Inline override (legacy toneColor escape hatch) ──
  let toneContainerStyle: ViewStyle | undefined
  let toneTextColor: string | undefined
  let toneDotColor: string | undefined
  if (usesToneColor) {
    if (variant === 'solid') {
      toneContainerStyle = { backgroundColor: toneColor, borderColor: 'transparent' }
      toneTextColor = '#fff'
      toneDotColor = '#fff'
    } else if (variant === 'outline') {
      toneContainerStyle = { backgroundColor: 'transparent', borderColor: toneColor }
      toneTextColor = toneColor
      toneDotColor = toneColor
    } else {
      toneContainerStyle = { backgroundColor: toneColor + '22', borderColor: 'transparent' }
      toneTextColor = toneColor
      toneDotColor = toneColor
    }
  }

  return (
    <View
      className={`flex-row items-center self-start rounded-pill border ${usesToneColor ? '' : containerColor}`}
      style={[{ height: s.height, paddingHorizontal: s.paddingHorizontal, gap: s.gap }, toneContainerStyle, style]}
    >
      {dot ? (
        <View
          className={usesToneColor ? undefined : dotColor}
          style={[{ width: s.dot, height: s.dot, borderRadius: s.dot / 2 }, toneDotColor ? { backgroundColor: toneDotColor } : null]}
        />
      ) : null}
      {icon ? (
        <View style={{ width: s.icon, height: s.icon, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      ) : null}
      <Text
        numberOfLines={1}
        className={usesToneColor ? undefined : textColor}
        style={[{ fontSize: s.fontSize, letterSpacing: 0.2, fontFamily: FONT.uiBold }, toneTextColor ? { color: toneTextColor } : null]}
      >
        {children ?? label}
      </Text>
    </View>
  )
}
