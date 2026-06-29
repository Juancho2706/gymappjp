import { forwardRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps, ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

/**
 * EVA Input — labelled text field (RN port of the DS `Input`).
 *
 * Design (Input.prompt.md / Input.jsx / forms.card.html):
 *  - surface-card box, 1.5px border, radius-control (14)
 *  - default border = border-default; focus = sport-600 (brand ramp) + soft
 *    focus ring; error = danger-500 border + danger-600 message
 *  - disabled → surface-sunken fill
 *  - label 13/600 text-strong · input 15/500 text-strong · hint/error 12 muted
 *
 * Colors/borders/radius come from DS token utilities (className) so dark mode and
 * the white-label brand ramp resolve at runtime — never hardcode brand hex.
 */
interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  trailingLabel?: React.ReactNode
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  onRightIconPress?: () => void
  /** Supportive helper text shown below the field when there is no error. */
  hint?: string
  error?: string | null
  size?: 'md' | 'lg'
  containerStyle?: ViewStyle
}

// Weight-specific DS font families (Hanken Grotesk = --font-ui).
const FONT_LABEL = 'HankenGrotesk_600SemiBold'
const FONT_INPUT = 'HankenGrotesk_500Medium'
const FONT_HELP = 'HankenGrotesk_400Regular'

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    trailingLabel,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    onRightIconPress,
    hint,
    error,
    size = 'md',
    containerStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const { theme } = useTheme()
  const [focused, setFocused] = useState(false)

  const isDisabled = rest.editable === false
  const height = size === 'lg' ? 52 : 48

  // Border token: error wins, then focus (brand sport ramp), else default.
  const borderClass = error ? 'border-danger-500' : focused ? 'border-sport-600' : 'border-default'
  const bgClass = isDisabled ? 'bg-surface-sunken' : 'bg-surface-card'

  // Soft brand focus ring (best-effort: iOS shadow; brand-aware via theme.primary).
  const focusRing: ViewStyle | null =
    focused && !error
      ? {
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 5,
          elevation: 0,
        }
      : null

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    setFocused(true)
    onFocus?.(e)
  }
  const handleBlur: TextInputProps['onBlur'] = (e) => {
    setFocused(false)
    onBlur?.(e)
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      {(label || trailingLabel) && (
        <View style={styles.labelRow}>
          {label ? (
            <Text className="text-strong" style={styles.label}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {trailingLabel ? <View>{trailingLabel}</View> : null}
        </View>
      )}

      <View
        className={`flex-row items-center rounded-control ${bgClass} ${borderClass}`}
        style={[{ height }, styles.box, focusRing]}
      >
        {LeftIcon ? <LeftIcon size={18} color={theme.mutedForeground} /> : null}
        <TextInput
          ref={ref}
          className="flex-1 text-strong"
          placeholderTextColor={theme.mutedForeground}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
          style={styles.input}
        />
        {RightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={10}>
            <RightIcon size={18} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {error || hint ? (
        <Text className={error ? 'text-danger-600' : 'text-muted'} style={styles.help}>
          {error || hint}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 13, fontFamily: FONT_LABEL },
  box: { paddingHorizontal: 14, gap: 8, borderWidth: 1.5 },
  input: { fontSize: 15, fontFamily: FONT_INPUT, paddingVertical: 0 },
  help: { fontSize: 12, lineHeight: 16, fontFamily: FONT_HELP },
})
