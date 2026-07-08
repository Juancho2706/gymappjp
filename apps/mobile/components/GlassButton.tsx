import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { PressableProps, TextStyle, ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

/**
 * EVA GlassButton — RN port of the web `GlassButton`
 * (apps/web/src/components/ui/glass-button.tsx).
 *
 * The "glass" family is the high-emphasis / marketing control (landing, hero,
 * pricing) — visually louder than the app `Button`: fully UPPERCASE label,
 * wide tracking, bold weight, `rounded-xl` (17px) corners, and an accent glow
 * on the filled variants. Anatomy mirrors the web `cva`:
 *
 *  Variants:
 *   - `default`  brand fill (`bg-primary`) + brand glow — the primary CTA
 *   - `brand`    same look, explicit brand-accent fill (web `--theme-primary`)
 *   - `outline`  translucent surface card + subtle border (backdrop-glass feel)
 *   - `ghost`    text-only, muted → strong on press
 *   - `danger`   destructive fill + ember glow
 *
 *  Sizes (verbatim from web): default h-11/px-6 · sm h-9/px-4/text-[10px] ·
 *  lg h-14/px-8/text-base · icon 40×40.
 *
 * Colors/borders come from DS token utilities (className) + the brand-aware
 * theme shim (fill/foreground/glow) so dark mode and the white-label accent
 * resolve at runtime — never hardcode brand hex. Only fixed on-accent neutrals
 * are literals (icon/spinner `color` needs a concrete string), mirroring `Button`.
 */
type GlassVariant = 'default' | 'brand' | 'outline' | 'ghost' | 'danger'
type GlassSize = 'default' | 'sm' | 'lg' | 'icon'

interface GlassButtonProps extends Omit<PressableProps, 'style'> {
  /** Text label. Omit for an `icon`-size button (pass only `leftIcon`). */
  label?: string
  variant?: GlassVariant
  size?: GlassSize
  loading?: boolean
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  full?: boolean
  style?: ViewStyle
}

// height / horizontal padding / label size / icon size — verbatim from the web
// cva size table (h-11=44, px-6=24, text-sm=14; sm text-[10px]; lg text-base=16).
const SIZE_MAP: Record<GlassSize, { height: number; paddingHorizontal: number; fontSize: number; iconSize: number; width?: number }> = {
  default: { height: 44, paddingHorizontal: 24, fontSize: 14, iconSize: 18 },
  sm: { height: 36, paddingHorizontal: 16, fontSize: 10, iconSize: 15 },
  lg: { height: 56, paddingHorizontal: 32, fontSize: 16, iconSize: 20 },
  icon: { height: 40, width: 40, paddingHorizontal: 0, fontSize: 14, iconSize: 20 },
}

// bg + border per variant — literal DS utility strings (NativeWind compiles them
// statically; light/dark + white-label resolve via the runtime vars). `brand`
// fills via inline style (live accent), mirroring web's inline `--theme-primary`.
const CONTAINER_CLASS: Record<GlassVariant, string> = {
  default: 'bg-primary',
  brand: '',
  outline: 'bg-surface-card/50 border border-subtle',
  ghost: '',
  danger: 'bg-destructive',
}

const TEXT_CLASS: Record<GlassVariant, string> = {
  default: 'text-primary-foreground',
  brand: 'text-white',
  outline: 'text-strong',
  ghost: 'text-muted',
  danger: 'text-white',
}

const ON_ACCENT = '#FFFFFF' // brand/danger on-accent foreground (icon/spinner color)

export function GlassButton({
  label,
  variant = 'default',
  size = 'default',
  loading,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  full,
  disabled,
  style,
  onPressIn,
  ...rest
}: GlassButtonProps) {
  const { theme } = useTheme()
  const sz = SIZE_MAP[size]
  const isDisabled = !!disabled || !!loading

  const fg = resolveForeground(variant, theme)
  const dimAlpha = disabled ? 0.45 : loading ? 0.6 : 1

  // Filled variants carry an accent glow (web `glow-primary` / brand shadow /
  // `glow-destructive`); outline/ghost stay flat. shadowGlowBlue is brand-aware.
  const shadow: ViewStyle | null = isDisabled
    ? null
    : variant === 'default' || variant === 'brand'
      ? theme.shadowGlowBlue
      : variant === 'danger'
        ? theme.shadowGlowEmber
        : null

  function triggerHaptic() {
    if (isDisabled) return
    void Haptics.impactAsync(variant === 'danger' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
  }

  const boxStyle: ViewStyle = {
    height: sz.height,
    ...(sz.width ? { width: sz.width } : null),
    paddingHorizontal: sz.paddingHorizontal,
    gap: 8,
    opacity: dimAlpha,
    ...(variant === 'brand' ? { backgroundColor: theme.primary } : null),
    ...(shadow ?? {}),
  }

  const labelStyle: TextStyle = {
    fontSize: sz.fontSize,
    // web: uppercase + tracking-widest (0.1em); RN needs absolute points.
    letterSpacing: sz.fontSize * 0.1,
    textTransform: 'uppercase',
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
        <MotiView animate={{ scale: pressed && !isDisabled ? 0.97 : 1 }} transition={{ type: 'spring', damping: 16, stiffness: 220 }}>
          <View className={`flex-row items-center justify-center rounded-xl ${CONTAINER_CLASS[variant]}`} style={boxStyle}>
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : (
              <>
                {LeftIcon ? <LeftIcon size={sz.iconSize} color={fg} /> : null}
                {label && size !== 'icon' ? (
                  <Text className={`font-sans-bold ${TEXT_CLASS[variant]}`} style={labelStyle} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
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
function resolveForeground(variant: GlassVariant, theme: ReturnType<typeof useTheme>['theme']): string {
  switch (variant) {
    case 'default':
      return theme.primaryForeground
    case 'brand':
    case 'danger':
      return ON_ACCENT
    case 'outline':
      return theme.text
    case 'ghost':
      return theme.mutedForeground
  }
}
