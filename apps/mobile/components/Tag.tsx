import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'

/**
 * EVA Tag — selectable filter chip (muscle groups, meal types, training focus).
 *
 * Outlined when unselected, fills with the `tone` color when selected.
 * 1:1 port of the web `Tag` (docs/design-source/components/core/Tag.{prompt.md,jsx}):
 * h=34, px=14, pill radius, 1.5px border, Hanken 13/600 label.
 * The `sport` fill follows the runtime white-label brand ramp (bg-sport-500);
 * ember/aqua/neutral are fixed. Dark mode is automatic via the semantic tokens.
 */
export type TagTone = 'sport' | 'ember' | 'aqua' | 'neutral'

export interface TagProps {
  children: ReactNode
  selected?: boolean
  tone?: TagTone
  icon?: ReactNode
  /** Web-parity handler name (from the design .prompt.md). */
  onClick?: () => void
  /** RN-idiomatic alias; takes precedence over `onClick` when both are set. */
  onPress?: () => void
  disabled?: boolean
  className?: string
  style?: StyleProp<ViewStyle>
}

const TONE_FILL: Record<TagTone, string> = {
  sport: 'bg-sport-500',
  ember: 'bg-ember-500',
  aqua: 'bg-aqua-500',
  neutral: 'bg-ink-900',
}

export function Tag({
  children,
  selected = false,
  tone = 'sport',
  icon,
  onClick,
  onPress,
  disabled = false,
  className,
  style,
}: TagProps) {
  const handlePress = onPress ?? onClick
  const interactive = !!handlePress && !disabled
  const [pressed, setPressed] = useState(false)

  const fill = TONE_FILL[tone] ?? TONE_FILL.sport
  const bgClass = selected ? fill : 'bg-surface-card'
  // selected -> transparent (keeps the 1.5px so layout doesn't shift);
  // unselected -> default, strengthening on press (mobile analogue of web hover).
  const borderClass = selected
    ? 'border-transparent'
    : pressed && interactive
      ? 'border-strong'
      : 'border-default'
  const textClass = selected ? 'text-white' : 'text-body'

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={{ selected, disabled }}
      disabled={!interactive}
      onPress={handlePress}
      onPressIn={() => {
        setPressed(true)
        if (interactive) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
      }}
      onPressOut={() => setPressed(false)}
      className={`self-start ${disabled ? 'opacity-60' : ''}`}
    >
      <MotiView
        animate={{ scale: pressed && interactive ? 0.97 : 1 }}
        transition={{ type: 'timing', duration: 140 }}
      >
        <View
          style={style}
          className={`h-[34px] flex-row items-center justify-center gap-1.5 rounded-pill border-[1.5px] px-[14px] ${bgClass} ${borderClass} ${className ?? ''}`}
        >
          {icon ? (
            <View className="h-[14px] w-[14px] items-center justify-center">{icon}</View>
          ) : null}
          <Text className={`font-sans-semibold text-[13px] ${textClass}`}>{children}</Text>
        </View>
      </MotiView>
    </Pressable>
  )
}
