import { Pressable, Text, View } from 'react-native'
import type { PressableProps, TextProps, ViewProps, ViewStyle, TextStyle } from 'react-native'
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

/* -------------------------------------------------------------------------- *
 *  Compound slots — RN port of the web `Card{Header,Content,Footer,Title,     *
 *  Description,Action}` anatomy (apps/web/src/components/ui/card.tsx).        *
 *                                                                            *
 *  COMPOSITION MODEL. Web keeps horizontal padding (px-4) on the slots and    *
 *  the vertical rhythm (gap-4 = 16 between slots, py-4 top/bottom) on the      *
 *  Card. RN Views have no implicit flex-gap between plain children, so each    *
 *  slot owns its own spacing here and the rhythm is baked in to render the     *
 *  SAME visual as web:                                                        *
 *    header  → px-4 pt-4, gap-1 title↔description  (web: px-4 + card pt-4)     *
 *    content → px-4 pt-4 pb-4    (pt-4 = the 16px gap after header/top pad)    *
 *    footer  → p-4, border-t, surface-sunken/50, flush to bottom (rounded-b)   *
 *  Because the slots supply padding, compose them inside a padding-less Card:  *
 *    <Card padding="none"> <CardHeader/> <CardContent/> <CardFooter/> </Card>  *
 *  (A numeric-`padding` Card still works but double-pads horizontally.)        *
 *  Spacing literals (px-4=16, pt-4=16, gap-1=4, p-4=16) use Tailwind's default *
 *  numeric scale, which the mobile tailwind.config preserves at 4px grid.      *
 * -------------------------------------------------------------------------- */

interface SlotProps extends ViewProps {
  className?: string
  style?: ViewStyle | ViewStyle[]
}

/**
 * Card header — vertical stack of Title/Description (gap-1). `bordered` mirrors
 * the web `.border-b` header divider (adds border + bottom pad). CardAction is
 * pinned to the top-right corner (see CardAction) so short titles/descriptions
 * flow under it exactly like the web grid `col-start-2` action.
 */
export function CardHeader({ bordered = false, className, style, children, ...rest }: SlotProps & { bordered?: boolean }) {
  const border = bordered ? 'pb-4 border-b border-subtle' : ''
  return (
    <View className={`px-4 pt-4 gap-1 ${border} ${className ?? ''}`} style={style} {...rest}>
      {children}
    </View>
  )
}

/** Card body — horizontal padding + the 16px vertical rhythm to neighbours. */
export function CardContent({ className, style, children, ...rest }: SlotProps) {
  return (
    <View className={`px-4 pt-4 pb-4 ${className ?? ''}`} style={style} {...rest}>
      {children}
    </View>
  )
}

/**
 * Card footer — divider + recessed tint, flush to the bottom edge (rounded-b).
 * Mirrors web `flex items-center rounded-b-card border-t bg-surface-sunken/50 p-4`.
 */
export function CardFooter({ className, style, children, ...rest }: SlotProps) {
  return (
    <View
      className={`flex-row items-center rounded-b-card border-t border-subtle bg-surface-sunken/50 p-4 ${className ?? ''}`}
      style={style}
      {...rest}
    >
      {children}
    </View>
  )
}

interface CardTextProps extends TextProps {
  className?: string
  style?: TextStyle | TextStyle[]
}

/**
 * Card title — web `text-base leading-snug font-semibold` at the "strong" text
 * color. Web toggles strong only on light-surface variants (default/outline/
 * sunken); RN defaults to `text-strong` (the common case) — on inverse/sport
 * cards pass `className="text-on-dark"` (mirrors the web on-dark inheritance).
 * `font-sans-semibold` = Hanken 600, matching web `font-semibold` (weight 600).
 */
export function CardTitle({ className, style, children, ...rest }: CardTextProps) {
  return (
    <Text className={`text-base leading-snug font-sans-semibold text-strong ${className ?? ''}`} style={style} {...rest}>
      {children}
    </Text>
  )
}

/** Card description — web `text-sm text-muted` (Hanken regular). */
export function CardDescription({ className, style, children, ...rest }: CardTextProps) {
  return (
    <Text className={`text-sm font-sans text-muted ${className ?? ''}`} style={style} {...rest}>
      {children}
    </Text>
  )
}

/**
 * Card action — pinned to the header's top-right corner (right-4/top-4 = the
 * header's px-4/pt-4 inset). RN has no CSS grid, so instead of the web
 * `col-start-2 row-span-2` cell this floats absolutely; keep it a compact
 * control (icon button / small pill) so title text does not run under it.
 * Must live inside a CardHeader (its positioning context).
 */
export function CardAction({ className, style, children, ...rest }: SlotProps) {
  return (
    <View className={`absolute right-4 top-4 ${className ?? ''}`} style={style} {...rest}>
      {children}
    </View>
  )
}
