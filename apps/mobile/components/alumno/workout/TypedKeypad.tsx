import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, Check, Delete, SlidersHorizontal } from 'lucide-react-native'
import {
  appendKeypadDigit,
  appendKeypadDecimal,
  keypadBackspace,
  applyKeypadIncrement,
  formatWeightEsCl,
  incrementChipsForStep,
  KEYPAD_MAX_DECIMALS,
  KEYPAD_STEP_PRESETS,
} from '@eva/workout-engine'
import { useTheme } from '@/context/ThemeContext'
import { FONT, TYPE, textStyle } from '@/lib/typography'
import { shadow } from '@/lib/shadows'
import { haptics } from '@/lib/haptics'
import { useKeypadStep } from './keypad-step-preference'

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
 * Sin drift web/mobile: la lógica pura de texto (append/backspace/incremento/format es-CL)
 * y los presets del paso se importan de `@eva/workout-engine` (misma fuente que la web).
 * El paso de los chips es configurable (presets 0.25/0.5/1/1.25/2.5/5 kg) y se persiste
 * por-dispositivo vía `useKeypadStep` (AsyncStorage, carril `omni_keypad_step`).
 */

// Deja que NativeWind pinte el color de los íconos lucide vía className (text-*).
cssInterop(Delete, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Check, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(ArrowRight, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(SlidersHorizontal, { className: { target: 'style', nativeStyleToProp: { color: true } } })

// ─── Config por modo ────────────────────────────────────────────────────────

// weight/reps = strength; decimal/integer = campos tipados (cardio/movilidad/roller). La regla
// decimal de cada campo tipado la decide `typedKeypadFields` (min/distancia = decimal;
// FC/segundos/pasadas/hold = enteros) → el host mapea a 'decimal' | 'integer'.
type KeypadMode = 'weight' | 'reps' | 'decimal' | 'integer'

interface ModeCfg {
  allowDecimal: boolean
  maxDecimals: number
  showChips: boolean
}

const MODE_CFG: Record<KeypadMode, ModeCfg> = {
  weight: { allowDecimal: true, maxDecimals: KEYPAD_MAX_DECIMALS, showChips: true },
  reps: { allowDecimal: false, maxDecimals: 0, showChips: false },
  decimal: { allowDecimal: true, maxDecimals: KEYPAD_MAX_DECIMALS, showChips: false },
  integer: { allowDecimal: false, maxDecimals: 0, showChips: false },
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const DIGIT_LABEL: Record<string, string> = {
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
  '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
}

function chipLabel(delta: number): string {
  const sign = delta > 0 ? '+' : '−' // − (minus)
  return `${sign}${formatWeightEsCl(Math.abs(delta))}`
}

/** testID kebab del chip: +1.25 → plus-1-25 · -2.5 → minus-2-5. */
function chipTestSlug(delta: number): string {
  const sign = delta > 0 ? 'plus' : 'minus'
  const mag = formatWeightEsCl(Math.abs(delta)).replace(',', '-')
  return `${sign}-${mag}`
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
  const [step, setStep] = useKeypadStep()
  const [stepMenuOpen, setStepMenuOpen] = useState(false)
  const chips = incrementChipsForStep(step)

  const panelShadow = useMemo(() => {
    const base = shadow('xl', resolvedScheme)
    return { ...base, shadowOffset: { width: 0, height: -16 } }
  }, [resolvedScheme])

  const onDigit = (d: string) => {
    haptics.select()
    onChange(appendKeypadDigit(value, d, { allowDecimal: cfg.allowDecimal, maxDecimals: cfg.maxDecimals }))
  }
  const onDecimal = () => {
    haptics.select()
    onChange(appendKeypadDecimal(value))
  }
  const onBackspace = () => {
    haptics.tap()
    onChange(keypadBackspace(value))
  }
  const onClear = () => {
    haptics.tap()
    onChange('')
  }
  const onIncrement = (delta: number) => {
    haptics.select()
    onChange(applyKeypadIncrement(value, delta))
  }
  const onToggleStepMenu = () => {
    haptics.tap()
    setStepMenuOpen((o) => !o)
  }
  const onStepChange = (preset: number) => {
    haptics.select()
    setStep(preset)
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

        {/* Chips de incremento + engranaje del paso (solo peso) */}
        {cfg.showChips ? (
          <View className="mt-2">
            <View className="flex-row items-center gap-1.5">
              {chips.map((delta) => (
                <Pressable
                  key={delta}
                  testID={`keypad-chip-${chipTestSlug(delta)}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${delta > 0 ? 'más' : 'menos'} ${formatWeightEsCl(Math.abs(delta))} kilos`}
                  onPress={() => onIncrement(delta)}
                  className="h-10 flex-1 items-center justify-center rounded-pill border border-inverse/10 bg-white/[0.06] active:bg-white/[0.12]"
                >
                  <Text style={textStyle('xs', FONT.monoBold)} className="text-on-dark">
                    {chipLabel(delta)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                testID="keypad-step-toggle"
                accessibilityRole="button"
                accessibilityLabel="Ajustar el paso de los incrementos"
                accessibilityState={{ expanded: stepMenuOpen }}
                onPress={onToggleStepMenu}
                className={
                  stepMenuOpen
                    ? 'h-10 w-10 items-center justify-center rounded-pill border border-sport-500/60 bg-sport-500/15'
                    : 'h-10 w-10 items-center justify-center rounded-pill border border-inverse/10 bg-white/[0.06] active:bg-white/[0.12]'
                }
              >
                <SlidersHorizontal size={16} className={stepMenuOpen ? 'text-sport-300' : 'text-on-dark-muted'} />
              </Pressable>
            </View>

            {stepMenuOpen ? (
              <View className="mt-2 rounded-control border border-inverse/10 bg-white/[0.03] p-2">
                <Text style={TYPE.eyebrow} className="mb-1.5 px-1 text-on-dark-muted">
                  Paso del incremento (kg)
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {KEYPAD_STEP_PRESETS.map((preset) => {
                    const active = step === preset
                    return (
                      <Pressable
                        key={preset}
                        testID={`keypad-step-${formatWeightEsCl(preset).replace(',', '-')}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Paso ${formatWeightEsCl(preset)} kilos`}
                        onPress={() => onStepChange(preset)}
                        className={
                          active
                            ? 'h-9 min-w-[52px] flex-1 items-center justify-center rounded-control bg-sport-500'
                            : 'h-9 min-w-[52px] flex-1 items-center justify-center rounded-control bg-white/[0.06] active:bg-white/[0.12]'
                        }
                      >
                        <Text style={textStyle('xs', FONT.monoBold)} className={active ? 'text-white' : 'text-on-dark'}>
                          {formatWeightEsCl(preset)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}
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

/**
 * Escala segmentada 1-10 (dots) de esfuerzo por serie (mirror EXACTO de `ScaleDots` web): RPE y
 * RIR usan la MISMA escala entera 1-10 (decisión CEO), sin pasos .5 ni tope 0-5. Dots que se
 * llenan hasta el valor + readout numérico; selección con spring. Dark siempre (se monta en el
 * paso de esfuerzo del keypad): filled = sport-500, vacío = white/15, readout = sport-300.
 */
const EFFORT_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export function EffortScale(props: {
  kind: 'rpe' | 'rir'
  value: number | null
  onSelect(v: number): void
  /**
   * Densidad compacta para filas NO protagonistas (chip recap / RPE post-log tipado): dots 8px y
   * readout 11px, mirror de `ScaleDots` web con `compact={!isActive}` (`EffortScale.tsx:84,92`).
   * Sin prop ⇒ 10px + text-xs (fila activa protagonista), paridad con `compact=false` web.
   */
  compact?: boolean
}) {
  const { kind, value, onSelect, compact = false } = props
  const label = kind.toUpperCase()
  const dotSize = compact ? 8 : 10

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={`${label} (escala 1 a 10)`}
      className="flex-row items-center"
      style={{ gap: 2 }}
    >
      {EFFORT_SCALE.map((n) => {
        const filled = value != null && n <= value
        const selected = value === n
        return (
          <Pressable
            key={n}
            testID={`effort-${kind}-${n}`}
            accessibilityRole="radio"
            // Rol radio ⇒ estado `checked` (mirror `aria-checked` web `EffortScale.tsx:75`), no `selected`.
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${label} ${n}`}
            onPress={() => {
              haptics.select()
              onSelect(n)
            }}
            className="h-11 flex-1 items-center justify-center"
          >
            <MotiView
              animate={{ scale: selected ? 1.3 : filled ? 1 : 0.7 }}
              // springs.snappy web (`animation-presets.ts:4`): stiffness 400 · damping 30 (menos rebote).
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={filled ? 'rounded-pill bg-sport-500' : 'rounded-pill bg-white/15'}
              style={{ width: dotSize, height: dotSize }}
            />
          </Pressable>
        )
      })}
      <Text
        style={textStyle(compact ? '3xs' : 'xs', FONT.monoBold)}
        className="ml-1 w-5 text-center text-sport-300"
      >
        {value != null ? String(value) : '–'}
      </Text>
    </View>
  )
}
