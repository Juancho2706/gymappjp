import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, Check, Delete, HelpCircle, SlidersHorizontal } from 'lucide-react-native'
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
 *
 * Las piezas presentacionales (display+pestañas, chips+paso, grid 3×4, KeyButton) están
 * extraídas como primitivas exportadas para que el `KeypadHost` (que espeja el
 * `NumericKeypadSheet` web con pestañas + paso de esfuerzo doble) las reuse sin duplicar.
 */

// Deja que NativeWind pinte el color de los íconos lucide vía className (text-*).
cssInterop(Delete, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Check, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(ArrowRight, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(SlidersHorizontal, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(HelpCircle, { className: { target: 'style', nativeStyleToProp: { color: true } } })

// ─── Config por modo ────────────────────────────────────────────────────────

// weight/reps = strength; decimal/integer = campos tipados (cardio/movilidad/roller). La regla
// decimal de cada campo tipado la decide `typedKeypadFields` (min/distancia = decimal;
// FC/segundos/pasadas/hold = enteros) → el host mapea a 'decimal' | 'integer'.
export type KeypadMode = 'weight' | 'reps' | 'decimal' | 'integer'

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
// Teclas del grid: web `font-display text-2xl font-bold` = Archivo 700 (`NumericKeypadSheet.tsx:474`).
// Antes usaba FONT.displayBold (Archivo 800), un peso más pesado que el 700 de la web.
const KEY_STYLE = textStyle('2xl', FONT.display, { lh: 'tight', ls: 'tight' })
// Unidad del display (kg/reps/min…): web `text-[13px] font-bold text-on-dark-muted` (`NumericKeypadSheet.tsx:319`).
// El DS mapea 13px → 'xs' y bold → uiBold (antes TYPE.label = 14px semibold, más grande y menos peso).
const UNIT_STYLE = textStyle('xs', FONT.uiBold)
// Acciones primarias del keypad (Siguiente/Listo/Omitir): web `text-[15px] font-bold`
// (`NumericKeypadSheet.tsx:277,410`). El DS no tiene 15px; se ancla a 'sm' (14px) con peso bold
// (antes TYPE.label = 14px semibold). Compartido con `KeypadHost` para no divergir.
export const KEYPAD_ACTION_STYLE = textStyle('sm', FONT.uiBold)

// ─── Primitivas presentacionales compartidas (TypedKeypad + KeypadHost) ───────

/** Pestaña de campo para el display (peso/reps/tipados). Espeja el `role="tablist"` web. */
export interface KeypadFieldTab {
  key: string
  label: string
}

/**
 * Display del valor en curso + (opcional) las pestañas de campo. Mirror del bloque de display web
 * (`NumericKeypadSheet.tsx:286-321`): caja con borde, pestañas `shrink-0` a la izquierda si hay >1
 * campo, y el número `ml-auto` con su unidad. Vacío ⇒ muestra "0" atenuado.
 */
export function KeypadDisplayRow({
  display,
  unit,
  tabs,
}: {
  display: string
  unit?: string
  tabs?: { fields: KeypadFieldTab[]; activeKey: string; onSwitch: (key: string) => void }
}) {
  const showTabs = tabs != null && tabs.fields.length > 1
  return (
    <View className="flex-row items-center gap-2 rounded-control border border-inverse/10 bg-white/[0.04] p-2 pl-3">
      {showTabs ? (
        <View className="flex-row shrink-0 rounded-control bg-white/[0.05] p-0.5" accessibilityRole="tablist">
          {tabs!.fields.map((f) => {
            const selected = f.key === tabs!.activeKey
            return (
              <Pressable
                key={f.key}
                testID={`keypad-tab-${f.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => tabs!.onSwitch(f.key)}
                className={selected ? 'rounded-[10px] bg-sport-500 px-3 py-1.5' : 'rounded-[10px] px-3 py-1.5'}
              >
                <Text style={textStyle('2xs', FONT.uiBold)} className={selected ? 'text-white' : 'text-on-dark-muted'}>
                  {f.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      <View className="ml-auto flex-row items-baseline gap-1.5">
        <Text
          accessibilityLiveRegion="polite"
          style={DISPLAY_STYLE}
          className={display === '' ? 'text-on-dark-muted/40' : 'text-on-dark'}
        >
          {display === '' ? '0' : display}
        </Text>
        {unit ? (
          <Text style={UNIT_STYLE} className="text-on-dark-muted">
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Chips de incremento de peso + engranaje del paso configurable. Mirror de `NumericKeypadSheet.tsx:324-379`.
 * Auto-contenido: el paso vive en `useKeypadStep` (cache global AsyncStorage, mismo carril que web) y el
 * menú de presets en estado local. El caller sólo aplica el delta al valor via `onIncrement`.
 */
export function WeightChips({ onIncrement }: { onIncrement: (delta: number) => void }) {
  const [step, setStep] = useKeypadStep()
  const [stepMenuOpen, setStepMenuOpen] = useState(false)
  const chips = incrementChipsForStep(step)

  const onToggleStepMenu = () => {
    haptics.tap()
    setStepMenuOpen((o) => !o)
  }
  const onStepChange = (preset: number) => {
    haptics.select()
    setStep(preset)
    setStepMenuOpen(false)
  }

  return (
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
  )
}

/**
 * Grid 3×4 de teclas (dígitos 1-9 · coma/vacío · 0 · borrar). Mirror de `NumericKeypadSheet.tsx:382-402`.
 * Puramente presentacional: la mutación del valor la hace el caller en los handlers (igual que el
 * provider web). La celda decimal se reemplaza por un hueco cuando el campo no admite decimales.
 */
export function KeypadGrid({
  allowDecimal,
  onDigit,
  onDecimal,
  onBackspace,
  onClear,
}: {
  allowDecimal: boolean
  onDigit: (d: string) => void
  onDecimal: () => void
  onBackspace: () => void
  onClear: () => void
}) {
  return (
    <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
      {DIGITS.map((d) => (
        <KeyButton key={d} testID={`keypad-digit-${d}`} label={DIGIT_LABEL[d]} onPress={() => onDigit(d)}>
          <Text style={KEY_STYLE} className="text-on-dark">
            {d}
          </Text>
        </KeyButton>
      ))}
      {/* Fila 4: coma (si decimal) · 0 · borrar */}
      {allowDecimal ? (
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
      <KeyButton testID="keypad-backspace" label="borrar" onPress={onBackspace} onLongPress={onClear}>
        <Delete size={24} className="text-on-dark-muted" />
      </KeyButton>
    </View>
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

// ─── TypedKeypad ─────────────────────────────────────────────────────────────

/**
 * Pad numérico de UN campo (usado por la fila expandida `ActiveSetRow`): tap en una caja lo abre y las
 * cajas de la fila hacen de "pestañas". Ofrece Siguiente (avanza de caja) + Listo (commit). El keypad
 * multi-campo con pestañas + esfuerzo doble vive en `KeypadHost` (que reusa las primitivas de arriba).
 */
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
      transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <View
        className="rounded-t-sheet border-t border-inverse/10 bg-ink-950 px-3 pt-3"
        style={[{ paddingBottom: insets.bottom + 10 }, panelShadow]}
      >
        {/* Grabber */}
        <View className="items-center pb-2">
          <View className="h-1 w-10 rounded-pill bg-white/20" />
        </View>

        <KeypadDisplayRow display={value} unit={unit} />

        {cfg.showChips ? <WeightChips onIncrement={onIncrement} /> : null}

        <KeypadGrid
          allowDecimal={cfg.allowDecimal}
          onDigit={onDigit}
          onDecimal={onDecimal}
          onBackspace={onBackspace}
          onClear={onClear}
        />

        {/* Acción primaria: Siguiente / Listo */}
        <View className="mt-2 flex-row gap-2">
          <Pressable
            testID="keypad-next"
            accessibilityRole="button"
            accessibilityLabel="Siguiente"
            onPress={handleNext}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-control border border-inverse/10 bg-white/[0.06] active:bg-white/[0.12]"
          >
            <Text style={KEYPAD_ACTION_STYLE} className="text-on-dark">
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
            <Text style={KEYPAD_ACTION_STYLE} className="text-white">
              Listo
            </Text>
          </Pressable>
        </View>
      </View>
    </MotiView>
  )
}

// ─── Esfuerzo (RPE/RIR) ───────────────────────────────────────────────────────

/** Ayuda 1-tap para el alumno — texto corto, sin jerga (mirror EXACTO de la web `EffortScale.tsx:17-20`). */
export const RPE_HELP =
  'RPE = qué tan duro se sintió la serie. 1 = muy fácil · 10 = no podías hacer ni una repetición más.'
export const RIR_HELP =
  'RIR = cuántas reps te quedaban en el tanque. Si te quedaba 1, es 1. Así de simple.'

/**
 * Escala segmentada 1-10 (dots) de esfuerzo por serie (mirror EXACTO de `ScaleDots` web): RPE y
 * RIR usan la MISMA escala entera 1-10 (decisión CEO), sin pasos .5 ni tope 0-5. Dots que se
 * llenan hasta el valor + readout numérico; selección con spring `snappy`. Dark siempre (se monta en el
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

/**
 * Botoncito (?) accesible junto al label de RPE/RIR (mirror del `EffortHelp` web `EffortScale.tsx:29-44`).
 * El icono es chico pero el hit-area es ≥44px (hitSlop). Adaptación idiomática RN: en vez del Popover
 * flotante web, el caller revela el texto inline (misma info, mismo 1-tap).
 */
export function EffortHelp({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={`¿Qué es el ${label}?`}
      accessibilityState={{ expanded: open }}
    >
      <HelpCircle size={14} className="text-on-dark-muted" />
    </Pressable>
  )
}

/**
 * Campo de esfuerzo completo (label + ayuda 1-tap + dots) — mirror de cada bloque RPE/RIR del paso de
 * esfuerzo web (`NumericKeypadSheet.tsx:247-260`). Reusable por el `KeypadHost`.
 */
export function EffortField({
  kind,
  label,
  help,
  value,
  onSelect,
}: {
  kind: 'rpe' | 'rir'
  label: string
  help: string
  value: number | null
  onSelect: (v: number) => void
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <View>
      <View className="mb-1 flex-row items-center gap-1">
        <Text style={TYPE.eyebrow} className="text-on-dark-muted">
          {label}
        </Text>
        <EffortHelp label={kind.toUpperCase()} open={helpOpen} onToggle={() => setHelpOpen((o) => !o)} />
      </View>
      {helpOpen ? (
        <Text style={TYPE.caption} className="mb-1.5 text-[11px] text-on-dark-muted">
          {help}
        </Text>
      ) : null}
      <EffortScale kind={kind} value={value} onSelect={onSelect} />
    </View>
  )
}
