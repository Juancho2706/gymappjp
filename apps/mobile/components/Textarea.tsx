import { forwardRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps, ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'

/**
 * EVA Textarea — multiline text field (RN port of the DS `ui/textarea`).
 *
 * Mirrors web `apps/web/src/components/ui/textarea.tsx` + the sibling mobile
 * `Input.tsx` so the two fields read as one system:
 *  - surface-card box, 1.5px border, radius-control (14)
 *  - default border = border-default; focus = sport-600 (brand ramp) + soft
 *    focus ring; error = danger-500 border + danger-600 message
 *  - disabled → surface-sunken fill
 *  - label 13/600 text-strong · input 15/500 text-strong · hint/error 12 muted
 *
 * Extras over Input: min-height that grows with content (multiline), and an
 * optional character counter (`showCount` + `maxLength`) rendered bottom-right,
 * turning danger when the limit is hit — visually equal to the web
 * `field-sizing-content` growth behaviour.
 *
 * Colors/borders/radius come from DS token utilities (className) so dark mode
 * and the white-label brand ramp resolve at runtime — never hardcode brand hex.
 *
 * @example
 *   <Textarea
 *     label="Notas de la sesion"
 *     placeholder="Como te sentiste hoy?"
 *     value={notes}
 *     onChangeText={setNotes}
 *     maxLength={280}
 *     showCount
 *     minRows={4}
 *   />
 *   // Inside a form: wrap in <FormField> and spread field props (see Form.tsx).
 */
interface TextareaProps extends Omit<TextInputProps, 'style' | 'multiline'> {
  label?: string
  trailingLabel?: React.ReactNode
  /** Supportive helper text shown below the field when there is no error. */
  hint?: string
  error?: string | null
  /** Show the `value.length / maxLength` counter (requires maxLength). */
  showCount?: boolean
  /** Minimum visible rows (drives min-height ~= rows * lineHeight). Default 3. */
  minRows?: number
  containerStyle?: ViewStyle
}

// Weight-specific DS font families (Hanken Grotesk = --font-ui). Mirrors Input.tsx.
const FONT_LABEL = 'HankenGrotesk_600SemiBold'
const FONT_INPUT = 'HankenGrotesk_500Medium'
const FONT_HELP = 'HankenGrotesk_400Regular'

const LINE_HEIGHT = 21 // 15px input * ~1.4

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  {
    label,
    trailingLabel,
    hint,
    error,
    showCount,
    minRows = 3,
    maxLength,
    containerStyle,
    value,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const { theme } = useTheme()
  const [focused, setFocused] = useState(false)

  const isDisabled = rest.editable === false
  const minHeight = minRows * LINE_HEIGHT + 20 // + vertical padding

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

  const count = typeof value === 'string' ? value.length : 0
  const atLimit = typeof maxLength === 'number' && count >= maxLength

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
        className={`rounded-control ${bgClass} ${borderClass}`}
        style={[{ minHeight }, styles.box, focusRing]}
      >
        <TextInput
          ref={ref}
          multiline
          textAlignVertical="top"
          className="flex-1 text-strong"
          placeholderTextColor={theme.mutedForeground}
          value={value}
          maxLength={maxLength}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
          style={styles.input}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerHelp}>
          {error || hint ? (
            <Text className={error ? 'text-danger-600' : 'text-muted'} style={styles.help}>
              {error || hint}
            </Text>
          ) : null}
        </View>
        {showCount && typeof maxLength === 'number' ? (
          <Text className={atLimit ? 'text-danger-600' : 'text-muted'} style={styles.help}>
            {count}/{maxLength}
          </Text>
        ) : null}
      </View>
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
  box: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5 },
  input: {
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    fontFamily: FONT_INPUT,
    paddingVertical: 0,
    minHeight: LINE_HEIGHT,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  footerHelp: { flex: 1 },
  help: { fontSize: 12, lineHeight: 16, fontFamily: FONT_HELP },
})
