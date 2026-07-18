import { useMemo, useState } from 'react'
import { Pressable, Text, View, type TextStyle } from 'react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, Check, Delete, HelpCircle, SlidersHorizontal, X } from 'lucide-react-native'
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
import { useEvaMotion } from '@/lib/motion'
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
cssInterop(X, { className: { target: 'style', nativeStyleToProp: { color: true } } })

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

// Cifras tabulares: estabilizan el ancho de los dígitos (Archivo 900 es proporcional → el número
// "salta" al tipear si no se fija). Mirror del `tabular-nums` web del display (`NumericKeypadSheet.tsx:313`)
// y del header objetivo/"Última vez" (:212,219). Se comparte con `KeypadHost` para no divergir.
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums', 'lining-nums'] }
// Número grande del display: web `font-display text-3xl font-black tabular-nums leading-none`
// (`NumericKeypadSheet.tsx:313`). `textStyle` no aplica tabular (sólo el rol 'mono'), así que lo spreadeamos.
const DISPLAY_STYLE: TextStyle = { ...textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tight' }), ...TABULAR }
// Header del keypad — línea objetivo: web `font-mono text-[13px] font-semibold tabular-nums`
// (`NumericKeypadSheet.tsx:212`, peso 600). Usa `monoSemibold` (JetBrainsMono_600SemiBold, cargado en
// `_layout.tsx`) para igualar el semibold web exacto — antes `monoMedium` (500) quedaba un escalón abajo.
export const OBJECTIVE_STYLE: TextStyle = { ...textStyle('xs', FONT.monoSemibold), ...TABULAR }
export const LASTVEZ_STYLE: TextStyle = { ...textStyle('3xs', FONT.mono), ...TABULAR }
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
// Eyebrows del keypad (nombre ejercicio, 'Esfuerzo', labels RPE/RIR, título del menú de paso): la web
// los pone en 9.5-11px con tracking 0.05-0.08em (`NumericKeypadSheet.tsx:207,234,248,255,355`). El rol
// `TYPE.eyebrow` (piso 12px, tracking 0.12em) sobrepasa ese rango (el RPE/RIR salta 9.5→12px, +26%), así
// que anclamos al piso del scale ('3xs'=11px) con el tracking positivo más chico del DS ('wide'=0.04em)
// — mucho más fiel que 0.12em. Se comparte con `KeypadHost` para no divergir.
export const KEYPAD_EYEBROW_STYLE: TextStyle = {
  ...textStyle('3xs', FONT.uiBold, { ls: 'wide' }),
  textTransform: 'uppercase',
}

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
        <View
          className="flex-row shrink-0 rounded-control bg-white/[0.05] p-0.5"
          accessibilityRole="tablist"
          accessibilityLabel="Campo"
        >
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
 * Header de objetivo del keypad — SIEMPRE visible (DB-5). Mirror de `NumericKeypadSheet.tsx:204-228`:
 * nombre del ejercicio (eyebrow), "Objetivo {línea}" (mono tabular) y "Última vez {kg}kg × {reps}"
 * (mono tabular, es-CL via `formatWeightEsCl`). Extraído como primitiva compartida para que la ruta
 * PRIMARIA de registro (`ActiveSetRow` → `TypedKeypad`) repita el objetivo tal como lo hace el `KeypadHost`
 * de EDICIÓN — sin esto, el scrim atenúa el objetivo/"Última vez" de la card mientras el alumno tipea.
 */
export function KeypadObjectiveHeader({
  exerciseName,
  objectiveLine,
  last,
}: {
  exerciseName?: string
  objectiveLine?: string
  last?: { weightKg: number | null; reps: number | null } | null
}) {
  const hasLast = last != null && (last.weightKg != null || last.reps != null)
  if (!exerciseName && !objectiveLine && !hasLast) return null
  return (
    <View className="flex-row items-baseline justify-between gap-2 px-1">
      <View className="min-w-0 flex-1">
        {exerciseName ? (
          <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted" numberOfLines={1}>
            {exerciseName}
          </Text>
        ) : null}
        {objectiveLine ? (
          <Text style={OBJECTIVE_STYLE} className="text-on-dark" numberOfLines={1}>
            <Text className="text-on-dark-muted">Objetivo </Text>
            {objectiveLine}
          </Text>
        ) : null}
      </View>
      {hasLast ? (
        <Text style={LASTVEZ_STYLE} className="shrink-0 text-on-dark-muted" numberOfLines={1}>
          Última vez{' '}
          <Text style={{ fontFamily: FONT.monoBold }} className="text-on-dark">
            {last!.weightKg != null ? `${formatWeightEsCl(last!.weightKg)}kg` : '–'}
            {' × '}
            {last!.reps ?? '–'}
          </Text>
        </Text>
      ) : null}
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
            className="h-10 flex-1 items-center justify-center rounded-pill border border-inverse/10 bg-white/[0.06] active:scale-95 active:bg-white/[0.12]"
          >
            <Text style={{ ...textStyle('xs', FONT.monoBold), ...TABULAR }} className="text-on-dark">
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
          <Text style={KEYPAD_EYEBROW_STYLE} className="mb-1.5 px-1 text-on-dark-muted">
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
                  <Text style={{ ...textStyle('xs', FONT.monoBold), ...TABULAR }} className={active ? 'text-white' : 'text-on-dark'}>
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
      className="h-14 items-center justify-center rounded-control bg-white/[0.06] active:scale-95 active:bg-white/[0.14]"
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
  /**
   * Cierre explícito SIN guardar — alimenta el botón X del panel (mirror web `NumericKeypadSheet.tsx:193-200`,
   * que SIEMPRE renderiza la X junto al grabber). Sin `onClose` el panel omite la X (el scrim del Modal padre
   * sigue cerrando por tap-fuera).
   */
  onClose?(): void
  unit?: string
  /**
   * Pestañas de campo (peso↔reps / campos tipados) — mirror del `role="tablist"` web
   * (`NumericKeypadSheet.tsx:287-308`): dejan SALTAR de campo sin cerrar+reabrir. Las "pestañas" son las
   * cajas de la propia `ActiveSetRow`; tocar una re-abre el keypad en ese campo (`onSwitch`).
   */
  tabs?: { fields: KeypadFieldTab[]; activeKey: string; onSwitch: (key: string) => void }
  /**
   * Header de objetivo — SIEMPRE visible (DB-5, `NumericKeypadSheet.tsx:204-228`). El scrim atenúa el
   * objetivo/"Última vez" de la card mientras se tipea; el teclado lo repite como en web.
   */
  header?: { exerciseName?: string; objectiveLine?: string; last?: { weightKg: number | null; reps: number | null } | null }
}) {
  const { mode, value, onChange, onNext, onDone, onClose, unit, tabs, header } = props
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
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
    // Borrado TOTAL (long-press ⌫): cue háptico MÁS fuerte que el backspace de un char, espejando la
    // gradación web `triggerHaptic(12)` vs `(6)` (`WorkoutKeypadProvider.tsx:213-221`). RN mapea esa mayor
    // intensidad a impact Medium (`haptics.setDone`) frente al Light tap del backspace (`onBackspace`).
    haptics.setDone()
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

  // Botón de acción PRIMARIO único (mirror web `NumericKeypadSheet.tsx:154,405-421`): la web renderiza UN
  // solo botón full-width sport-500 que alterna Siguiente/Listo, nunca los dos. `primaryIsNext` es
  // `!isLastField || hasEffort`; aquí el paso de esfuerzo vive en la fila (`ActiveSetRow`), no en el keypad,
  // así que `hasEffort` es siempre false → `primaryIsNext = !isLastField`. En el ÚLTIMO/único campo (p.ej.
  // movilidad) se muestra "Listo" (Check) que GUARDA — antes se mostraba un "Siguiente" secundario que
  // cerraba el teclado sin registrar la serie (P1). Las cajas de la fila siguen sirviendo de "pestañas"
  // para saltar de campo; el scrim cierra sin guardar (paridad web `:169-178`).
  const fieldList = tabs?.fields ?? []
  const isLastField =
    fieldList.length <= 1 || fieldList[fieldList.length - 1]?.key === (tabs?.activeKey ?? '')
  const primaryIsNext = !isLastField

  return (
    <MotiView
      testID="typed-keypad"
      // Reduce-motion ⇒ el panel aparece sin deslizarse (mirror web `NumericKeypadSheet.tsx:185-188`,
      // que con reduced pone `initial=false` + `{duration:0}`).
      from={{ translateY: motion.reduced ? 0 : 340 }}
      animate={{ translateY: 0 }}
      transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <View
        // `mx-auto w-full max-w-md`: cap 448px centrado, mirror del panel web (`NumericKeypadSheet.tsx:184`
        // `mx-auto max-w-md`) y del `KeypadHost` (`KeypadHost.tsx:223`). Sin esto ocupaba el 100% del ancho
        // → se estiraba en tablet/landscape sin el cap centrado.
        // `pt-2` + grabber `pb-1`: mirror EXACTO del panel único web (`NumericKeypadSheet.tsx:184` panel
        // `pt-2`, `:191` grabber `pb-1`) y del `KeypadHost.tsx:228,232` — antes `pt-3`/`pb-2` dejaban esta
        // ruta primaria más alta que la web y que el propio KeypadHost.
        className="mx-auto w-full max-w-md rounded-t-sheet border-t border-inverse/10 bg-ink-950 px-3 pt-2"
        style={[{ paddingBottom: insets.bottom + 10 }, panelShadow]}
      >
        {/* Grabber + cerrar (mirror web `NumericKeypadSheet.tsx:191-201` / `KeypadHost.tsx:232-242`) */}
        <View className="items-center justify-center pb-1">
          <View className="h-1 w-10 rounded-pill bg-white/20" />
          {onClose ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar teclado"
              className="absolute right-0 top-0 h-8 w-8 items-center justify-center rounded-pill"
            >
              <X size={16} className="text-on-dark-muted" />
            </Pressable>
          ) : null}
        </View>

        {header ? (
          <View className="mb-2">
            <KeypadObjectiveHeader
              exerciseName={header.exerciseName}
              objectiveLine={header.objectiveLine}
              last={header.last}
            />
          </View>
        ) : null}

        <KeypadDisplayRow display={value} unit={unit} tabs={tabs} />

        {cfg.showChips ? <WeightChips onIncrement={onIncrement} /> : null}

        <KeypadGrid
          allowDecimal={cfg.allowDecimal}
          onDigit={onDigit}
          onDecimal={onDecimal}
          onBackspace={onBackspace}
          onClear={onClear}
        />

        {/* Acción — un ÚNICO botón full-width: "Siguiente" avanza de campo; "Listo" cierra + guarda la
            serie (mirror web §5.4 `NumericKeypadSheet.tsx:405-421`, idéntico al `KeypadHost.tsx:377-401`). */}
        <View className="mt-2">
          <Pressable
            testID={primaryIsNext ? 'keypad-next' : 'keypad-done'}
            accessibilityRole="button"
            accessibilityLabel={primaryIsNext ? 'Siguiente' : 'Listo, guardar serie'}
            onPress={primaryIsNext ? handleNext : handleDone}
            className="h-14 w-full flex-row items-center justify-center gap-2 rounded-control bg-sport-500 active:scale-[0.98]"
          >
            {primaryIsNext ? (
              <>
                <Text style={KEYPAD_ACTION_STYLE} className="text-white">
                  Siguiente
                </Text>
                <ArrowRight size={20} className="text-white" />
              </>
            ) : (
              <>
                <Check size={20} className="text-white" />
                <Text style={KEYPAD_ACTION_STYLE} className="text-white">
                  Listo
                </Text>
              </>
            )}
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
  const motion = useEvaMotion()
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
              // Reduce-motion ⇒ salto instantáneo, igual que la web (`EffortScale.tsx:83` con `{duration:0}`).
              transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
              className={filled ? 'rounded-pill bg-sport-500' : 'rounded-pill bg-white/15'}
              style={{ width: dotSize, height: dotSize }}
            />
          </Pressable>
        )
      })}
      <Text
        // `...TABULAR` estabiliza el ancho del dígito del readout (mirror web `tabular-nums`,
        // `EffortScale.tsx:91`). `textStyle` sólo pone tabular en el rol 'mono', así que aquí se spreadea
        // igual que CHIP_MARK_STYLE/DISPLAY_STYLE; antes el readout salía proporcional (saltaba al cambiar 9↔10).
        style={{ ...textStyle(compact ? '3xs' : 'xs', FONT.monoBold), ...TABULAR }}
        className="ml-1 w-5 shrink-0 text-center text-sport-300"
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
        <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
          {label}
        </Text>
        <EffortHelp label={kind.toUpperCase()} open={helpOpen} onToggle={() => setHelpOpen((o) => !o)} />
      </View>
      {helpOpen ? (
        // Ayuda inline a 11px (`textStyle('3xs', FONT.uiMedium)`): antes `TYPE.caption` fijaba fontSize=13 inline
        // y —por la convención NativeWind v4 (el style inline gana)— mataba el `text-[11px]` del className,
        // saliendo a 13px. Mismo arreglo que el toggle de nota (`SetRow.tsx`) y los EffortLabel del propio SetRow.
        <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-on-dark-muted">
          {help}
        </Text>
      ) : null}
      <EffortScale kind={kind} value={value} onSelect={onSelect} />
    </View>
  )
}
