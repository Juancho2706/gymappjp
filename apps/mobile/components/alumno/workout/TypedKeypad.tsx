import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, Check, Delete } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { FONT, TYPE, textStyle } from '@/lib/typography'
import { shadow } from '@/lib/shadows'
import { haptics } from '@/lib/haptics'

/**
 * TypedKeypad — teclado numérico custom del ejecutor de rutina (E2-01/E2-02).
 *
 * Piel RN del keypad web (`NumericKeypadSheet` en `apps/web/.../workout/[planId]`),
 * 1:1 en tap targets (≥56px), dígitos en la display face y chips de incremento de
 * peso como pills. Superficie MÁS tocada de la app del alumno → dark siempre
 * (surface-inverse + on-dark), sheet anclado abajo con aparición por spring.
 *
 * Contrato de la wave: `mode` decide reglas decimales + chips; el valor lo posee el
 * padre (string es-CL con coma decimal, igual que web — el submit normaliza ,→.).
 * El paso de esfuerzo (RPE/RIR) vive en `EffortScale`, export separado.
 *
 * Nota de frontera (deuda técnica): la lógica pura de texto (append/backspace/
 * incremento/format es-CL) es un port del `apps/web/src/lib/client/keypad-logic.ts`.
 * Vive inline acá porque `@eva/workout-engine` aún no la expone (su `typed-keypad.ts`
 * sólo define los campos por modo tipado). Debería promoverse al engine para matar
 * el drift web/mobile — costura para el orquestador.
 */

// Deja que NativeWind pinte el color de los íconos lucide vía className (text-*).
cssInterop(Delete, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Check, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(ArrowRight, { className: { target: 'style', nativeStyleToProp: { color: true } } })

// ─── Lógica pura (port de keypad-logic.ts) ──────────────────────────────────

const KEYPAD_MAX_DIGITS = 6

/** Parsea texto es-CL (coma decimal) a número, o null si no es válido. */
function parseEsCl(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = String(raw).trim().replace(',', '.')
  if (s === '' || s === '.' || s === '-' || s === '-.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Formatea número → texto es-CL (coma decimal), sin ceros de cola ni ruido FP. */
function formatEsCl(n: number): string {
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 1000) / 1000
  return String(rounded).replace('.', ',')
}

/** Agrega un dígito respetando ceros a la izquierda, tope de decimales y de dígitos. */
function appendDigit(current: string, digit: string, allowDecimal: boolean, maxDecimals: number): string {
  if (!/^[0-9]$/.test(digit)) return current
  const cur = current ?? ''
  const decCap = allowDecimal ? maxDecimals : 0
  if (cur.includes(',')) {
    const dec = cur.split(',')[1] ?? ''
    if (dec.length >= decCap) return cur
  }
  if (cur === '0') return digit
  if (cur.replace(',', '').length >= KEYPAD_MAX_DIGITS) return cur
  return cur + digit
}

/** Agrega la coma decimal es-CL (una sola; arranca "0," si estaba vacío). */
function appendDecimal(current: string): string {
  const cur = current ?? ''
  if (cur.includes(',')) return cur
  if (cur === '') return '0,'
  return cur + ','
}

/** Borra el último caracter. */
function backspace(current: string): string {
  return (current ?? '').slice(0, -1)
}

/** Aplica un incremento (kg), clampa a 0 y limpia ruido FP. Base 0 si estaba vacío. */
function applyIncrement(current: string, delta: number): string {
  const base = parseEsCl(current) ?? 0
  let next = base + delta
  if (next < 0) next = 0
  next = Math.round(next * 1000) / 1000
  return formatEsCl(next)
}

// ─── Config por modo ────────────────────────────────────────────────────────

type KeypadMode = 'weight' | 'reps' | 'rpe' | 'rir'

interface ModeCfg {
  allowDecimal: boolean
  maxDecimals: number
  showChips: boolean
}

const MODE_CFG: Record<KeypadMode, ModeCfg> = {
  weight: { allowDecimal: true, maxDecimals: 2, showChips: true },
  reps: { allowDecimal: false, maxDecimals: 0, showChips: false },
  rpe: { allowDecimal: true, maxDecimals: 1, showChips: false },
  rir: { allowDecimal: false, maxDecimals: 0, showChips: false },
}

/** Chips de incremento de peso (kg) — cubre discos de 1,25 además del 2,5 default. */
const WEIGHT_CHIPS = [-2.5, 1.25, 2.5, 5] as const

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const DIGIT_LABEL: Record<string, string> = {
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
  '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
}

function chipLabel(delta: number): string {
  const sign = delta > 0 ? '+' : '−' // − (minus)
  return `${sign}${formatEsCl(Math.abs(delta))}`
}

const DISPLAY_STYLE = textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tight' })
const KEY_STYLE = textStyle('2xl', FONT.displayBold, { lh: 'tight', ls: 'tight' })

// ─── TypedKeypad ─────────────────────────────────────────────────────────────

export function TypedKeypad(props: {
  mode: KeypadMode
  value: string
  onChange(v: string): void
  onNext(): void
  onDone(): void
  unit?: string
}) {
  const { mode, value, onChange, onNext, onDone, unit } = props
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const cfg = MODE_CFG[mode]

  const panelShadow = useMemo(() => {
    const base = shadow('xl', resolvedScheme)
    return { ...base, shadowOffset: { width: 0, height: -16 } }
  }, [resolvedScheme])

  const onDigit = (d: string) => {
    haptics.select()
    onChange(appendDigit(value, d, cfg.allowDecimal, cfg.maxDecimals))
  }
  const onDecimal = () => {
    haptics.select()
    onChange(appendDecimal(value))
  }
  const onBackspace = () => {
    haptics.tap()
    onChange(backspace(value))
  }
  const onClear = () => {
    haptics.tap()
    onChange('')
  }
  const onIncrement = (delta: number) => {
    haptics.select()
    onChange(applyIncrement(value, delta))
  }
  const handleNext = () => {
    haptics.tap()
    onNext()
  }
  const handleDone = () => {
    haptics.setDone()
    onDone()
  }

  return (
    <MotiView
      testID="typed-keypad"
      from={{ translateY: 340 }}
      animate={{ translateY: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 240, mass: 0.9 }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <View
        className="rounded-t-sheet border-t border-inverse/10 bg-surface-inverse px-3 pt-3"
        style={[{ paddingBottom: insets.bottom + 10 }, panelShadow]}
      >
        {/* Grabber */}
        <View className="items-center pb-2">
          <View className="h-1 w-10 rounded-pill bg-white/20" />
        </View>

        {/* Display + unidad */}
        <View className="flex-row items-center rounded-control border border-inverse/10 bg-white/[0.04] px-3 py-2">
          <View className="ml-auto flex-row items-baseline gap-1.5">
            <Text
              accessibilityLiveRegion="polite"
              style={DISPLAY_STYLE}
              className={value === '' ? 'text-on-dark-muted/40' : 'text-on-dark'}
            >
              {value === '' ? '0' : value}
            </Text>
            {unit ? (
              <Text style={TYPE.label} className="text-on-dark-muted">
                {unit}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Chips de incremento (solo peso) */}
        {cfg.showChips ? (
          <View className="mt-2 flex-row gap-1.5">
            {WEIGHT_CHIPS.map((delta) => (
              <Pressable
                key={delta}
                testID={`keypad-chip-${chipTestSlug(delta)}`}
                accessibilityRole="button"
                accessibilityLabel={`${delta > 0 ? 'más' : 'menos'} ${formatEsCl(Math.abs(delta))} kilos`}
                onPress={() => onIncrement(delta)}
                className="h-10 flex-1 items-center justify-center rounded-pill border border-inverse/10 bg-white/[0.06] active:bg-white/[0.12]"
              >
                <Text style={textStyle('xs', FONT.monoBold)} className="text-on-dark">
                  {chipLabel(delta)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Grid 3×4 */}
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
          {DIGITS.map((d) => (
            <KeyButton key={d} testID={`keypad-digit-${d}`} label={DIGIT_LABEL[d]} onPress={() => onDigit(d)}>
              <Text style={KEY_STYLE} className="text-on-dark">
                {d}
              </Text>
            </KeyButton>
          ))}
          {/* Fila 4: coma (si decimal) · 0 · borrar */}
          {cfg.allowDecimal ? (
            <KeyButton testID="keypad-decimal" label="coma decimal" onPress={onDecimal}>
              <Text style={KEY_STYLE} className="text-on-dark">
                ,
              </Text>
            </KeyButton>
          ) : (
            <View style={{ flexBasis: '31.5%', flexGrow: 1 }} />
          )}
          <KeyButton testID="keypad-digit-0" label={DIGIT_LABEL['0']} onPress={() => onDigit('0')}>
            <Text style={KEY_STYLE} className="text-on-dark">
              0
            </Text>
          </KeyButton>
          <KeyButton
            testID="keypad-backspace"
            label="borrar"
            onPress={onBackspace}
            onLongPress={onClear}
          >
            <Delete size={24} className="text-on-dark-muted" />
          </KeyButton>
        </View>

        {/* Acción primaria: Siguiente / Listo */}
        <View className="mt-2 flex-row gap-2">
          <Pressable
            testID="keypad-next"
            accessibilityRole="button"
            accessibilityLabel="Siguiente"
            onPress={handleNext}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-control border border-inverse/10 bg-white/[0.06] active:bg-white/[0.12]"
          >
            <Text style={TYPE.label} className="text-on-dark">
              Siguiente
            </Text>
            <ArrowRight size={20} className="text-on-dark" />
          </Pressable>
          <Pressable
            testID="keypad-done"
            accessibilityRole="button"
            accessibilityLabel="Listo, guardar serie"
            onPress={handleDone}
            className="h-14 flex-row items-center justify-center gap-2 rounded-control bg-sport-500 px-6 active:opacity-90"
            style={{ flex: 1.4 }}
          >
            <Check size={20} className="text-white" />
            <Text style={TYPE.label} className="text-white">
              Listo
            </Text>
          </Pressable>
        </View>
      </View>
    </MotiView>
  )
}

/** testID kebab del chip: +1.25 → plus-1-25 · -2.5 → minus-2-5. */
function chipTestSlug(delta: number): string {
  const sign = delta > 0 ? 'plus' : 'minus'
  const mag = formatEsCl(Math.abs(delta)).replace(',', '-')
  return `${sign}-${mag}`
}

/** Tecla del grid — tap target ≥56px (h-14), feedback active, long-press opcional. */
function KeyButton({
  children,
  testID,
  label,
  onPress,
  onLongPress,
}: {
  children: React.ReactNode
  testID: string
  label: string
  onPress: () => void
  onLongPress?: () => void
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      className="h-14 items-center justify-center rounded-control bg-white/[0.06] active:bg-white/[0.14]"
      style={{ flexBasis: '31.5%', flexGrow: 1 }}
    >
      {children}
    </Pressable>
  )
}

// ─── EffortScale ──────────────────────────────────────────────────────────────

/** Opciones por tipo de esfuerzo. RPE = 6–10 en pasos de .5; RIR = 0–5 enteros. */
const EFFORT_OPTS: Record<'rpe' | 'rir', number[]> = {
  rpe: [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
  rir: [0, 1, 2, 3, 4, 5],
}

/** testID kebab del dot: 8 → 8 · 8.5 → 8-5. */
function effortSlug(v: number): string {
  return String(v).replace('.', '-')
}

/**
 * EffortScale — escala segmentada de esfuerzo por serie (mirror de `ScaleDots` web).
 * Dots que se llenan hasta el valor + readout numérico; selección con spring. Dark
 * siempre (se monta en el paso de esfuerzo del keypad): filled = sport-500,
 * vacío = white/15, texto = on-dark / sport-300.
 */
export function EffortScale(props: { kind: 'rpe' | 'rir'; value: number | null; onSelect(v: number): void }) {
  const { kind, value, onSelect } = props
  const opts = EFFORT_OPTS[kind]
  const label = kind.toUpperCase()

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={`${label} escala ${opts[0]} a ${opts[opts.length - 1]}`}
      className="flex-row items-center"
      style={{ gap: 2 }}
    >
      {opts.map((n) => {
        const filled = value != null && n <= value
        const selected = value === n
        return (
          <Pressable
            key={n}
            testID={`effort-${kind}-${effortSlug(n)}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label} ${n}`}
            onPress={() => {
              haptics.select()
              onSelect(n)
            }}
            className="h-11 flex-1 items-center justify-center"
          >
            <MotiView
              animate={{ scale: selected ? 1.3 : filled ? 1 : 0.7 }}
              transition={{ type: 'spring', damping: 15, stiffness: 320 }}
              className={filled ? 'rounded-pill bg-sport-500' : 'rounded-pill bg-white/15'}
              style={{ width: 10, height: 10 }}
            />
          </Pressable>
        )
      })}
      <Text
        style={textStyle('xs', FONT.monoBold)}
        className="ml-1 w-6 text-center text-sport-300"
      >
        {value != null ? formatEsCl(value) : '–'}
      </Text>
    </View>
  )
}
