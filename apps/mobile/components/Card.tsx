import { Pressable, View } from 'react-native'
import type { PressableProps, ViewProps, ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'

/**
 * EVA Card — base surface container (RN port of the DS `Card`).
 *
 * Design variants (token-contract / Card.prompt.md):
 *  - `default`  white surface + soft shadow
 *  - `inverse`  ink hero / stat surface
 *  - `sport`    energy panel (brand sport-500 fill)
 *  - `outline`  transparent + bordered
 *  - `sunken`   recessed surface (no shadow)
 *
 * Legacy variants kept for API compatibility (the app already imports them):
 *  - `highlighted` brand-bordered + blue glow (active hero/plan)
 *  - `success` / `destructive` status-bordered emphasis
 *
 * Colors/borders/radius come from DS token utilities (className) so dark mode
 * and the white-label brand ramp resolve at runtime — never hardcode brand hex.
 */
type CardVariant =
  | 'default'
  | 'highlighted'
  | 'success'
  | 'destructive'
  | 'inverse'
  | 'sport'
  | 'outline'
  | 'sunken'

type CardPadding = number | 'none' | 'sm' | 'md' | 'lg'
type CardRadius = 'lg' | 'xl' | '2xl' | 'card' | 'control'

interface CardProps extends ViewProps {
  variant?: CardVariant
  /** Spacing token (`none|sm|md|lg`) or an explicit numeric inset. */
  padding?: CardPadding
  radius?: CardRadius
  /** Tappable card — adds press feedback (scale 0.97). */
  interactive?: boolean
  onPress?: PressableProps['onPress']
  style?: ViewStyle
}

// bg + border (width + color) per variant — literal DS utility strings so
// NativeWind can statically compile them.
const VARIANT_CLASS: Record<CardVariant, string> = {
  default: 'bg-surface-card border border-subtle',
  inverse: 'bg-surface-inverse border border-inverse',
  sport: 'bg-sport-500',
  outline: 'border border-default',
  sunken: 'bg-surface-sunken',
  highlighted: 'bg-surface-card border-2 border-primary',
  success: 'bg-surface-card border-2 border-success',
  destructive: 'bg-surface-card border border-destructive',
}

const RADIUS_CLASS: Record<CardRadius, string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  card: 'rounded-card',
  control: 'rounded-control',
}

const PAD_TOKEN: Record<'none' | 'sm' | 'md' | 'lg', number> = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 20,
}

export function Card({
  variant = 'default',
  padding = 16,
  radius = 'card',
  interactive = false,
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme()

  const pad = typeof padding === 'number' ? padding : PAD_TOKEN[padding]
  const containerClass = `${VARIANT_CLASS[variant]} ${RADIUS_CLASS[radius]}`

  // Centralized DS elevation, retuned per scheme (see lib/shadows).
  const S = SHADOWS[theme.scheme]
  const shadow: ViewStyle | null =
    variant === 'highlighted'
      ? theme.shadowGlowBlue
      : variant === 'inverse'
      ? S.md
      : variant === 'default' || variant === 'sport'
      ? S.sm
      : null

  const baseStyle: ViewStyle = { padding: pad }

  if (interactive || onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className={containerClass}
        style={({ pressed }) => [
          baseStyle,
          shadow,
          pressed ? { transform: [{ scale: 0.97 }] } : null,
          style,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View className={containerClass} style={[baseStyle, shadow, style]} {...rest}>
      {children}
    </View>
  )
}
