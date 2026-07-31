import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import {
  DATE_SEGMENT_MAX,
  isoToDateParts,
  localTodayIso,
  normalizeDateSegment,
  resolveDateParts,
  shouldAdvanceSegment,
  type DateParts,
  type DateSegment,
} from '../lib/date-field'

/**
 * EVA DateField — campo de fecha segmentado Día / Mes / Año, 100% JS.
 *
 * QA2-B5: reemplaza el TextInput crudo que exigia tipear "AAAA-MM-DD" a mano. Tres
 * casillas numericas con auto-avance al completar, retroceso con backspace y validacion
 * de calendario real (incluye años bisiestos y tope "no futura"). Emite el ISO
 * `AAAA-MM-DD` que ya espera el backend, o `null` mientras la fecha no este completa.
 *
 * PROHIBIDO agregar dependencias nativas aca (nada de @react-native-community/
 * datetimepicker): el campo tiene que viajar por OTA.
 *
 * La logica de composicion/validacion vive en `lib/date-field.ts` (pura, testeada en
 * `tests/mobile-date-field.test.ts`); este archivo solo aporta teclado y foco.
 *
 * ⚠️ P0 focus-hop (mismo criterio que `Input.tsx`): enfocar una casilla NO cambia la
 * FORMA ni las CLASES del arbol — el borde se pinta por `style` y el arbol es estable.
 */

const FONT_LABEL = 'HankenGrotesk_600SemiBold'
const FONT_INPUT = 'HankenGrotesk_500Medium'
const FONT_HELP = 'HankenGrotesk_400Regular'

const SEGMENT_ORDER: readonly DateSegment[] = ['day', 'month', 'year']

const SEGMENT_LABEL: Record<DateSegment, string> = { day: 'Día', month: 'Mes', year: 'Año' }
const SEGMENT_PLACEHOLDER: Record<DateSegment, string> = { day: 'DD', month: 'MM', year: 'AAAA' }
const SEGMENT_A11Y: Record<DateSegment, string> = {
  day: 'Día (2 dígitos)',
  month: 'Mes (2 dígitos)',
  year: 'Año (4 dígitos)',
}

export interface DateFieldProps {
  label?: string
  /** ISO `AAAA-MM-DD` o null/'' cuando no hay fecha. */
  value: string | null
  /** ISO completo y valido, o null mientras el campo esta vacio/incompleto/invalido. */
  onChange: (iso: string | null) => void
  /** Texto de ayuda bajo el campo (se oculta si hay error). */
  hint?: string
  /** Error del servidor/schema; se muestra en vez del error local. */
  error?: string | null
  /** Tope superior inclusive (ISO). Default: hoy local — util para fechas de nacimiento. */
  maxIso?: string | null
  /** Sin tope superior (p. ej. fechas futuras de vigencia). */
  allowFuture?: boolean
  editable?: boolean
  testID?: string
}

export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  maxIso,
  allowFuture = false,
  editable = true,
  testID,
}: DateFieldProps) {
  const { theme } = useTheme()
  const [parts, setParts] = useState<DateParts>(() => isoToDateParts(value))
  const [focused, setFocused] = useState<DateSegment | null>(null)
  // Sin tocar el campo no hay error local: el coach no ve rojo antes de escribir.
  const [touched, setTouched] = useState(false)

  const refs = {
    day: useRef<TextInput>(null),
    month: useRef<TextInput>(null),
    year: useRef<TextInput>(null),
  }

  // Re-hidratacion desde afuera (prefill asincrono): solo si el ISO entrante difiere del
  // que ya representan los segmentos, para no pisar lo que el coach esta tipeando.
  const effectiveMaxIso = allowFuture ? null : (maxIso ?? localTodayIso())
  const currentStatus = resolveDateParts(parts, { maxIso: effectiveMaxIso })
  const currentIso = currentStatus.kind === 'valid' ? currentStatus.iso : null
  const incomingIso = (value ?? '').trim() === '' ? null : (value ?? '').trim()
  useEffect(() => {
    if (incomingIso !== currentIso) setParts(isoToDateParts(incomingIso))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingIso])

  function emit(next: DateParts) {
    setParts(next)
    const status = resolveDateParts(next, { maxIso: effectiveMaxIso })
    onChange(status.kind === 'valid' ? status.iso : null)
  }

  function handleChange(segment: DateSegment, raw: string) {
    setTouched(true)
    const normalized = normalizeDateSegment(raw, segment)
    emit({ ...parts, [segment]: normalized })
    if (shouldAdvanceSegment(segment, normalized)) {
      const next = SEGMENT_ORDER[SEGMENT_ORDER.indexOf(segment) + 1]
      if (next) refs[next].current?.focus()
    }
  }

  /** Backspace en una casilla vacia = volver a la anterior (y borrar su ultimo digito). */
  function handleKeyPress(segment: DateSegment, key: string) {
    if (key !== 'Backspace' || parts[segment] !== '') return
    const previous = SEGMENT_ORDER[SEGMENT_ORDER.indexOf(segment) - 1]
    if (!previous) return
    refs[previous].current?.focus()
    emit({ ...parts, [previous]: parts[previous].slice(0, -1) })
  }

  const localError =
    touched && (currentStatus.kind === 'invalid' || currentStatus.kind === 'incomplete')
      ? currentStatus.message
      : null
  const shownError = error ?? localError
  const help = shownError ?? hint

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text className="text-strong" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={styles.row}>
        {SEGMENT_ORDER.map((segment) => {
          const isYear = segment === 'year'
          // Borde por `style` (jamas por className condicional): error > foco > default.
          const borderColor = shownError
            ? theme.destructive
            : focused === segment
              ? theme.primary
              : theme.border
          return (
            <View key={segment} style={isYear ? styles.yearCell : styles.cell}>
              <Text className="text-muted" style={styles.segmentLabel}>
                {SEGMENT_LABEL[segment]}
              </Text>
              <View
                className={editable ? 'rounded-control bg-surface-card' : 'rounded-control bg-surface-sunken'}
                style={[styles.box, { borderColor }]}
              >
                <TextInput
                  ref={refs[segment]}
                  testID={testID ? `${testID}-${segment}` : undefined}
                  accessibilityLabel={SEGMENT_A11Y[segment]}
                  className="flex-1 text-strong"
                  style={styles.input}
                  value={parts[segment]}
                  onChangeText={(raw) => handleChange(segment, raw)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(segment, nativeEvent.key)}
                  onFocus={() => setFocused(segment)}
                  onBlur={() => {
                    setFocused((current) => (current === segment ? null : current))
                    setTouched(true)
                  }}
                  editable={editable}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={DATE_SEGMENT_MAX[segment]}
                  placeholder={SEGMENT_PLACEHOLDER[segment]}
                  placeholderTextColor={theme.mutedForeground}
                  selectTextOnFocus
                  textAlign="center"
                  // iOS no emite Backspace en campo vacio salvo con este flag.
                  {...(Platform.OS === 'ios' ? { clearButtonMode: 'never' as const } : null)}
                />
              </View>
            </View>
          )
        })}
      </View>

      {help ? (
        <Text className={shownError ? 'text-danger-600' : 'text-muted'} style={styles.help}>
          {help}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontFamily: FONT_LABEL },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  cell: { flex: 1, gap: 4 },
  yearCell: { flex: 1.5, gap: 4 },
  segmentLabel: { fontSize: 11, fontFamily: FONT_HELP },
  box: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1.5,
  },
  input: { fontSize: 16, fontFamily: FONT_INPUT, paddingVertical: 0, letterSpacing: 1 },
  help: { fontSize: 12, lineHeight: 16, fontFamily: FONT_HELP },
})
