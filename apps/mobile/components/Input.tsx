import { forwardRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps, ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Sentry from '@sentry/react-native'
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
 * ⚠️ P0 focus-hop (bug RN core #45798, New Architecture/Fabric): enfocar un Input
 * NO debe cambiar la FORMA ni las CLASES del árbol. Un wrapper que envuelve al
 * TextInput y muta className (border-*) o recibe shadowColor/elevation condicional
 * al enfocar provoca un onBlur inmediato → en login encadena next/done y cierra el
 * teclado; en register rota el foco. Por eso: el borde se pinta por `style`
 * (borderColor estable, className del contenedor SIEMPRE la misma) y el focus-ring
 * es un hermano absoluto SIEMPRE montado que solo varía `opacity` (0→1), sin
 * elevation en Android. El focus jamás remonta ni re-clasifica el subárbol.
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

// ── Sonda de telemetría del P0 focus-hop ─────────────────────────────────────
// Gate idéntico a _layout.tsx: sin EXPO_PUBLIC_SENTRY_DSN es no-op TOTAL. Cuenta
// los eventos de focus entre TODOS los Inputs; una ráfaga anómala (>4 en <1.5s) es
// la firma del loop de robo de foco. Reporta UNA sola vez por sesión. Cero impacto
// de UX (solo Date.now + un array acotado a ~1.5s).
const FOCUS_HOP_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
let focusHopTimes: number[] = []
let focusHopReported = false
function probeFocusHop(field?: string) {
  const now = Date.now()
  focusHopTimes.push(now)
  focusHopTimes = focusHopTimes.filter((t) => now - t < 1500)
  if (focusHopReported || focusHopTimes.length <= 4 || !FOCUS_HOP_DSN) return
  focusHopReported = true
  try {
    Sentry.addBreadcrumb({
      category: 'ui.focus',
      level: 'warning',
      message: 'focus-hop burst',
      data: { count: focusHopTimes.length, field },
    })
    Sentry.captureMessage('focus-hop-loop-detected', {
      level: 'warning',
      extra: { count: focusHopTimes.length, field },
    })
  } catch {
    // Sentry no inicializado / versión sin API → no-op silencioso.
  }
}

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

  // Border color por `style` (NUNCA por className condicional): error > focus > default.
  // La CLASE del contenedor no cambia al enfocar — solo este valor de color.
  const borderColor = error ? theme.destructive : focused ? theme.primary : theme.border
  const bgClass = isDisabled ? 'bg-surface-sunken' : 'bg-surface-card'
  // Ring de foco: hermano absoluto SIEMPRE montado; solo cambia opacity al enfocar.
  const showRing = focused && !error

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    setFocused(true)
    probeFocusHop(rest.testID ?? label)
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

      <View style={styles.field}>
        {/* Focus-ring: capa hermana SIEMPRE montada. El foco solo cambia su opacity
            (y su shadow, iOS). Sin elevation → invisible en Android (cero re-layout).
            Detrás del box opaco: solo su sombra "sangra" hacia afuera = glow suave. */}
        <View
          pointerEvents="none"
          style={[styles.ring, { opacity: showRing ? 1 : 0, shadowColor: theme.primary, backgroundColor: theme.card }]}
        />
        <View
          className={`flex-row items-center rounded-control ${bgClass}`}
          style={[{ height }, styles.box, { borderColor }]}
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
  field: { position: 'relative' },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  box: { paddingHorizontal: 14, gap: 8, borderWidth: 1.5 },
  input: { fontSize: 15, fontFamily: FONT_INPUT, paddingVertical: 0 },
  help: { fontSize: 12, lineHeight: 16, fontFamily: FONT_HELP },
})
