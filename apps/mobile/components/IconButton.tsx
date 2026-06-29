import { useState } from 'react'
import { Pressable, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { darkTheme } from '../lib/theme'

/**
 * EVA IconButton — square, icon-only tappable control for toolbars, headers
 * and list rows. 1:1 port of the web `IconButton`
 * (docs/design-source/components/core/IconButton.{prompt.md,jsx}).
 *
 * Sizes: sm 36 / md 44 (iOS touch target) / lg 52.
 * Variants:
 *  - soft  (default): sunken fill + strong glyph
 *  - ghost: transparent + strong glyph
 *  - solid: ink action surface (flips to cta-fill on dark) + light glyph
 *  - sport: runtime white-label brand fill (bg-sport-500) + on-sport glyph
 *
 * Backgrounds are wired to semantic DS tokens, so dark mode (and the live
 * `sport` brand ramp) are automatic. `icon` is a lucide-react-native component
 * so the button can size + recolor the glyph per variant (the RN analogue of
 * the web node coloring via `currentColor`).
 */
export type IconButtonVariant = 'soft' | 'ghost' | 'solid' | 'sport'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps {
  /** lucide-react-native icon component (sized + colored by the button). */
  icon: LucideIcon
  variant?: IconButtonVariant
  size?: IconButtonSize
  disabled?: boolean
  /** RN-idiomatic accessibility label (always provide one). */
  accessibilityLabel?: string
  /** Web-parity alias (from the design .prompt.md `aria-label`). */
  'aria-label'?: string
  /** RN-idiomatic handler. */
  onPress?: () => void
  /** Web-parity alias; `onPress` takes precedence when both are set. */
  onClick?: () => void
  className?: string
  style?: StyleProp<ViewStyle>
}

const SIZE: Record<IconButtonSize, { box: number; icon: number }> = {
  sm: { box: 36, icon: 18 },
  md: { box: 44, icon: 20 },
  lg: { box: 52, icon: 24 },
}

const BG_CLASS: Record<IconButtonVariant, string> = {
  soft: 'bg-surface-sunken',
  ghost: 'bg-transparent',
  solid: 'bg-action-primary',
  sport: 'bg-sport-500',
}

export function IconButton({
  icon: Icon,
  variant = 'soft',
  size = 'md',
  disabled = false,
  accessibilityLabel,
  'aria-label': ariaLabel,
  onPress,
  onClick,
  className,
  style,
}: IconButtonProps) {
  const { theme } = useTheme()
  const handlePress = onPress ?? onClick
  const interactive = !!handlePress && !disabled
  const [pressed, setPressed] = useState(false)

  const sz = SIZE[size] ?? SIZE.md
  const bgClass = BG_CLASS[variant] ?? BG_CLASS.soft

  // Glyph color per variant (resolved string for the lucide `color` prop).
  // soft/ghost -> strong neutral; solid -> fixed light glyph (text-on-dark /
  // ink-50, constant in light + dark); sport -> on-sport (brand-aware,
  // contrast-clamped white from @eva/brand-kit).
  const fg =
    variant === 'sport'
      ? theme.primaryForeground
      : variant === 'solid'
        ? darkTheme.foreground // == --text-on-dark (#F4F6F8): constant light glyph
        : theme.foreground

  // Keep the tap target >= 44 even for the 36px `sm` control.
  const slop = Math.max(0, Math.round((44 - sz.box) / 2))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? ariaLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={slop}
      onPress={handlePress}
      onPressIn={() => {
        setPressed(true)
        if (interactive) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }}
      onPressOut={() => setPressed(false)}
      className="self-start"
    >
      <MotiView
        animate={{ scale: pressed && !disabled ? 0.92 : 1 }}
        transition={{ type: 'timing', duration: 120 }}
      >
        <View
          style={[{ width: sz.box, height: sz.box, opacity: disabled ? 0.45 : 1 }, style]}
          className={`items-center justify-center rounded-control ${bgClass} ${className ?? ''}`}
        >
          <Icon size={sz.icon} color={fg} strokeWidth={2} />
        </View>
      </MotiView>
    </Pressable>
  )
}
