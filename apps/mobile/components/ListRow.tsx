import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ChevronRight } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

/**
 * EVA ListRow — tappable list item (rosters, plan items, settings lists).
 *
 * 1:1 port of the web/DS `ListRow`
 * (docs/design-source/components/navigation/ListRow.{prompt.md,jsx}):
 *  - flex row, gap 12, padding 12×14, rounded-control (14)
 *  - title  Hanken 15/700 text-strong, single line + ellipsis
 *  - subtitle Hanken 13 text-muted, single line + ellipsis
 *  - leading / trailing accept any node (Avatar, Badge, ProgressRing, value…)
 *  - optional chevron (ink-300, 18px, stroke 2.25)
 *
 * Web tints to `surface-sunken` on hover when `onClick` is set; the mobile
 * analogue is a press tint (+ light haptic). Stack rows inside a
 * `Card padding="none"` with 1px `border-subtle` dividers, like the web.
 * Colors/radius/fonts come from DS token utilities so dark mode and the
 * white-label brand ramp resolve at runtime — never hardcode brand hex.
 */
export interface ListRowProps {
  /** Avatar or icon node at the start of the row. */
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Node at the far right (badge, value, ring). */
  trailing?: ReactNode
  showChevron?: boolean
  /** Web-parity handler name (from the design .prompt.md). */
  onClick?: () => void
  /** RN-idiomatic alias; takes precedence over `onClick` when both are set. */
  onPress?: () => void
  disabled?: boolean
  className?: string
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

// ink-300 is a constant ramp value, but its alias flips in dark mode
// (token-contract §3). lucide-react-native needs a literal color string.
const INK_300_LIGHT = '#A8B1BD'
const INK_300_DARK = '#414C5A'

/** True when the resolved surface reads as dark (perceived luminance). */
function isDarkHex(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showChevron = false,
  onClick,
  onPress,
  disabled = false,
  className,
  style,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const { theme } = useTheme()
  const handlePress = onPress ?? onClick
  const interactive = !!handlePress && !disabled
  const [pressed, setPressed] = useState(false)

  const chevronColor = isDarkHex(theme.background) ? INK_300_DARK : INK_300_LIGHT

  const bgClass = pressed && interactive ? 'bg-surface-sunken' : 'bg-surface-card'

  const content = (
    <>
      {leading != null ? <View className="shrink-0">{leading}</View> : null}

      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="font-sans-bold text-[15px] text-strong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle != null ? (
          <Text className="mt-px font-sans text-[13px] text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing != null ? (
        <View className="shrink-0 items-center justify-center">{trailing}</View>
      ) : null}

      {showChevron ? (
        <ChevronRight size={18} strokeWidth={2.25} color={chevronColor} />
      ) : null}
    </>
  )

  const containerClass = `flex-row items-center gap-3 rounded-control px-[14px] py-[12px] ${bgClass} ${className ?? ''}`

  if (interactive) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        onPress={handlePress}
        onPressIn={() => {
          setPressed(true)
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }}
        onPressOut={() => setPressed(false)}
        className={containerClass}
        style={style}
      >
        {content}
      </Pressable>
    )
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      className={containerClass}
      style={style}
    >
      {content}
    </View>
  )
}
