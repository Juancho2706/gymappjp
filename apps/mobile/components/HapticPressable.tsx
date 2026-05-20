import { Pressable, StyleSheet } from 'react-native'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'

type HapticKind = 'light' | 'medium' | 'success' | 'none'

interface HapticPressableProps extends PressableProps {
  haptic?: HapticKind
  scaleTo?: number
  style?: StyleProp<ViewStyle>
}

export function HapticPressable({
  haptic = 'light',
  scaleTo = 0.97,
  onPressIn,
  children,
  style,
  disabled,
  ...rest
}: HapticPressableProps) {
  async function triggerHaptic() {
    if (disabled || haptic === 'none') return
    if (haptic === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      return
    }
    await Haptics.impactAsync(
      haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    )
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        triggerHaptic()
        onPressIn?.(event)
      }}
      {...rest}
    >
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !disabled ? scaleTo : 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 220 }}
          style={[styles.content, style]}
        >
          {typeof children === 'function' ? children({ pressed }) : children}
        </MotiView>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: {},
})
