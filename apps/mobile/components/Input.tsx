import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps, ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  trailingLabel?: React.ReactNode
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  onRightIconPress?: () => void
  error?: string | null
  size?: 'md' | 'lg'
  containerStyle?: ViewStyle
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, trailingLabel, leftIcon: LeftIcon, rightIcon: RightIcon, onRightIconPress, error, size = 'md', containerStyle, ...rest },
  ref
) {
  const { theme } = useTheme()
  const height = size === 'lg' ? 52 : 48
  const iconPad = LeftIcon ? 44 : 16
  const rightPad = RightIcon ? 44 : 16

  return (
    <View style={[styles.wrap, containerStyle]}>
      {(label || trailingLabel) && (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {label}
            </Text>
          ) : <View />}
          {trailingLabel ? <View>{trailingLabel}</View> : null}
        </View>
      )}
      <View style={styles.inputWrap}>
        {LeftIcon ? (
          <View pointerEvents="none" style={styles.iconWrap}>
            <LeftIcon size={16} color={theme.mutedForeground} />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.mutedForeground}
          {...rest}
          style={[
            styles.input,
            {
              height,
              paddingLeft: iconPad,
              paddingRight: rightPad,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.secondary,
              borderColor: error ? theme.destructive : theme.border,
              color: theme.foreground,
              fontFamily: theme.fontSans,
            },
          ]}
        />
        {RightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={10} style={styles.rightIconWrap}>
            <RightIcon size={18} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.destructive, fontFamily: theme.fontSans }]}>
          {error}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 14, fontWeight: '500' },
  inputWrap: { position: 'relative' },
  iconWrap: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  rightIconWrap: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    fontSize: 15,
  },
  error: { fontSize: 12, lineHeight: 16 },
})
