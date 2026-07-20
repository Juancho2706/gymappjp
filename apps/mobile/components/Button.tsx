import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { PressableProps, ViewStyle, TextStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'

/**
 * EVA Button — primary action control (RN port of the DS `Button`).
 *
 * Design variants (docs/design-source/components/core/Button.{prompt.md,jsx}
 * + TOKENS.md):
 *  - `primary`   solid ink action (ink-950 light / cta-fill dark) — the default
 *  - `sport`     high-energy CTA: brand `--cta-fill` fill + blue glow (one per screen)
 *  - `secondary` outlined surface card (border-default)
 *  - `ghost`     text-only
 *  - `danger`    solid destructive fill (`--cta-danger`)
 *
 * Legacy variants kept for API compatibility (the app already imports them):
 *  - `electric`    brand energy CTA + glow (alias of the design `sport` look)
 *  - `outline`     transparent + 1.5px border
 *  - `destructive` soft danger tint + danger border + danger text
 *  - `glass`       translucent surface card
 *
 * Sizes `sm | md | lg`. `full` stretches to the container width. Press scales
 * to 0.97. Colors/borders/radius come from DS token utilities (className) so
 * dark mode and the white-label brand ramp resolve at runtime — never hardcode
 * brand hex. Only fixed (non-brand) DS neutrals are used as literals for the
 * lucide icon / spinner color (mirrors the literal shadow tints in `Card`).
 */
type Variant = 'primary' | 'electric' | 'outline' | 'ghost' | 'destructive' | 'glass' | 'secondary' | 'sport' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  full?: boolean
  style?: ViewStyle
}

// Heights / paddings / type scale / icon sizes verbatim from Button.jsx.
const SIZE_MAP: Record<Size, { height: number; paddingHorizontal: number; fontSize: number; gap: number; iconSize: number }> = {
  sm: { height: 36, paddingHorizontal: 14, fontSize: 14, gap: 6, iconSize: 16 },
  md: { height: 48, paddingHorizontal: 18, fontSize: 15, gap: 8, iconSize: 18 },
  lg: { height: 56, paddingHorizontal: 22, fontSize: 17, gap: 10, iconSize: 20 },
}

// bg + border per variant — literal DS utility strings so NativeWind can
// statically compile them (auto light/dark + white-label via the runtime vars).
const CONTAINER_CLASS: Record<Variant, string> = {
  primary: 'bg-action-primary',
  sport: 'bg-cta-fill',
  electric: 'bg-cta-fill',
  secondary: 'bg-surface-card border-[1.5px] border-default',
  outline: 'border-[1.5px] border-default',
  ghost: '',
  danger: 'bg-cta-danger',
  destructive: 'bg-destructive/10 border border-destructive',
  glass: 'bg-surface-card/70 border border-subtle',
}

// Label color per variant (kept in sync with `resolveForeground` below).
const TEXT_CLASS: Record<Variant, string> = {
  primary: 'text-on-dark',
  sport: 'text-on-sport',
  electric: 'text-on-sport',
  secondary: 'text-strong',
  outline: 'text-strong',
  ghost: 'text-strong',
  danger: 'text-white',
  destructive: 'text-destructive',
  glass: 'text-strong',
}

// Fixed DS neutrals (not brand / not white-labeled) — used only for the lucide
// icon + ActivityIndicator `color` prop, which need a literal color string.
const ON_DARK = '#F4F6F8' // --text-on-dark (ink-50)
const ON_SPORT = '#FFFFFF' // --text-on-sport

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  full,
  disabled,
  style,
  onPressIn,
  ...rest
}: ButtonProps) {
  const { theme } = useTheme()
  const sz = SIZE_MAP[size]
  const isDisabled = !!disabled || !!loading

  const fg = resolveForeground(variant, theme)
  const dimAlpha = disabled ? 0.45 : loading ? 0.6 : 1
  const shadow: ViewStyle | null = isDisabled
    ? null
    : variant === 'sport' || variant === 'electric'
      ? theme.shadowGlowBlue
      : variant === 'primary'
        ? SHADOWS[theme.scheme].sm
        : null

  function triggerHaptic() {
    if (isDisabled) return
    const heavy = variant === 'destructive' || variant === 'danger'
    void Haptics.impactAsync(heavy ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
  }

  const boxStyle: ViewStyle = {
    height: sz.height,
    paddingHorizontal: sz.paddingHorizontal,
    gap: sz.gap,
    opacity: dimAlpha,
    ...(shadow ?? {}),
  }

  const labelStyle: TextStyle = {
    fontSize: sz.fontSize,
    lineHeight: sz.fontSize,
    letterSpacing: sz.fontSize * -0.01,
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPressIn={(event) => {
        triggerHaptic()
        onPressIn?.(event)
      }}
      style={[full ? { width: '100%' } : null, style]}
      {...rest}
    >
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !isDisabled ? 0.97 : 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 220 }}
        >
          <View
            className={`flex-row items-center justify-center rounded-control ${CONTAINER_CLASS[variant]}`}
            style={boxStyle}
          >
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : (
              <>
                {LeftIcon ? <LeftIcon size={sz.iconSize} color={fg} /> : null}
                <Text className={`font-sans-bold ${TEXT_CLASS[variant]}`} style={labelStyle} numberOfLines={1}>
                  {label}
                </Text>
                {RightIcon ? <RightIcon size={sz.iconSize} color={fg} /> : null}
              </>
            )}
          </View>
        </MotiView>
      )}
    </Pressable>
  )
}

/** Concrete fg color for the lucide icon + spinner (Text uses TEXT_CLASS). */
function resolveForeground(variant: Variant, theme: ReturnType<typeof useTheme>['theme']): string {
  switch (variant) {
    case 'primary':
      return ON_DARK
    case 'sport':
    case 'electric':
    case 'danger':
      return ON_SPORT
    case 'destructive':
      return theme.destructive
    case 'secondary':
    case 'outline':
    case 'ghost':
    case 'glass':
      return theme.text // text-strong
  }
}
