import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, TextInput, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ArrowRight, Check, StickyNote, X } from 'lucide-react-native'
import {
  appendKeypadDecimal,
  appendKeypadDigit,
  applyKeypadIncrement,
  formatWeightEsCl,
  keypadBackspace,
  type OptimisticLogPayload,
  // Routing PURO tipo->campos (fix QA R4·#5): fuente única de la secuencia de pasos del teclado.
  keypadStepsForTarget,
  type KeypadStep,
  type KeypadTarget,
  // Mapeo PURO valores->payload, compartido con la `ActiveSetRow` (sin drift entre superficies).
  buildStrengthPayload,
  buildTypedPayload,
  int,
} from '@eva/workout-engine'
import { useTheme } from '@/context/ThemeContext'
import { FONT, textStyle } from '../../../lib/typography'
import { useEvaMotion } from '../../../lib/motion'
import { shadow } from '../../../lib/shadows'
import { haptics } from '../../../lib/haptics'
// Primitivas presentacionales + paso de esfuerzo, compartidas con la `ActiveSetRow` (sin duplicar).
import {
  EffortField,
  KEYPAD_ACTION_STYLE,
  KEYPAD_EYEBROW_STYLE,
  KeypadDisplayRow,
  KeypadGrid,
  KeypadObjectiveHeader,
  RIR_HELP,
  RPE_HELP,
  WeightChips,
} from './TypedKeypad'

const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const WHITE = '#FFFFFF'
const WARNING_500 = '#F5A524' // --color-warning-500 (ámbar de la nota, mirror amber-300/400 web)

// El tipo `KeypadTarget` vive en `@eva/workout-engine` (keypad-flow, puro/testeable); se re-exporta
// para los consumidores que ya lo importaban desde acá (ExecutorV2) sin tocar sus imports.
export type { KeypadTarget } from '@eva/workout-engine'

/** Paso de campo (excluye el paso de esfuerzo) — cada uno es una pestaña del display. */
type KeypadFieldStep = Extract<KeypadStep, { kind: 'keypad' }>

/**
 * Host del teclado numérico custom (mobile) — espejo del `NumericKeypadSheet` + `WorkoutKeypadProvider`
 * de web (`apps/web/.../workout/[planId]`). UNA sola hoja inferior con:
 *  - Header de objetivo SIEMPRE visible (DB-5): ejercicio, "Objetivo {sets}×{reps} · {peso} kg" y
 *    "Última vez {peso}kg × {reps}", todo en es-CL (coma decimal) via `formatWeightEsCl`.
 *  - Fase de captura: display con PESTAÑAS de campo (peso↔reps / min↔metros↔FC …) — el alumno salta
 *    entre campos sin wizard —, chips de incremento (sólo peso) + paso configurable, grid 3×4 y un
 *    ÚNICO botón primario (Siguiente / Listo).
 *  - Fase de esfuerzo (sólo fuerza, opcional): AMBAS escalas RPE y RIR (ScaleDots) con ayuda 1-tap,
 *    y botones Omitir / Listo (ambos guardan; el esfuerzo es saltable).
 *
 * El valor lo posee este host (`values`, string es-CL); el commit arma el `OptimisticLogPayload` con
 * los builders puros (`buildStrengthPayload`/`buildTypedPayload`, compartidos con `ActiveSetRow`) y lo
 * entrega al padre. El draft se reporta en cada cambio para la resiliencia (E2-03).
 */
export function KeypadHost({
  target,
  onClose,
  onCommit,
  onDraftChange,
}: {
  target: KeypadTarget | null
  onClose: () => void
  onCommit: (payload: OptimisticLogPayload) => void
  onDraftChange: (values: Record<string, string>, fieldIndex: number) => void
}) {
  const insets = useSafeAreaInsets()
  const { resolvedScheme } = useTheme()
  const motion = useEvaMotion()
  const [values, setValues] = useState<Record<string, string>>({})
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [activeKey, setActiveKey] = useState('')
  const [phase, setPhase] = useState<'input' | 'effort'>('input')
  // Nota rápida por serie (mirror web A.4.d): desplegable en el paso de esfuerzo. El texto vive en
  // `values.note` (mismo carril que rpe/rir → viaja al draft y a `buildStrengthPayload`).
  const [noteOpen, setNoteOpen] = useState(false)

  // Secuencia de pasos según el tipo del bloque (routing puro compartido con `openSet`).
  const steps = useMemo(() => keypadStepsForTarget(target), [target])
  // Los campos son las pestañas del display; el esfuerzo es una FASE aparte (no una pestaña).
  const fields = useMemo(() => steps.filter((s): s is KeypadFieldStep => s.kind === 'keypad'), [steps])
  const hasEffort = steps.some((s) => s.kind === 'effort')

  // (Re)inicializa al abrir un target: valores iniciales (draft/autofill) o prefill de peso sugerido
  // (en es-CL, mismo formato que la `ActiveSetRow`). Arranca en el campo tocado (draft) o el primero.
  useEffect(() => {
    if (!target) return
    const seed: Record<string, string> =
      target.initialValues ??
      (target.typed
        ? {}
        : { weight: target.suggestedWeight != null ? formatWeightEsCl(target.suggestedWeight) : '' })
    valuesRef.current = seed
    setValues(seed)
    setActiveKey(fields[target.initialFieldIndex ?? 0]?.key ?? fields[0]?.key ?? '')
    setPhase('input')
    setNoteOpen(false)
  }, [target, fields])

  if (!target || fields.length === 0) return null

  const activeIndex = Math.max(0, fields.findIndex((f) => f.key === activeKey))
  const activeField = fields[activeIndex]
  const isLastField = activeIndex === fields.length - 1
  const primaryIsNext = !isLastField || hasEffort
  const allowDecimal = activeField.mode === 'weight' || activeField.mode === 'decimal'
  const showChips = activeField.mode === 'weight'

  // ── Mutación del valor (write-through al draft), mirror del provider web ──────
  const patch = (p: Record<string, string>, idx: number) => {
    const next = { ...valuesRef.current, ...p }
    valuesRef.current = next
    setValues(next)
    onDraftChange(next, idx)
  }
  const activeVal = () => valuesRef.current[activeField.key] ?? ''
  const writeActive = (nextValue: string) => patch({ [activeField.key]: nextValue }, activeIndex)

  const onDigit = (d: string) => {
    haptics.select()
    writeActive(appendKeypadDigit(activeVal(), d, { allowDecimal }))
  }
  const onDecimal = () => {
    if (!allowDecimal) return
    haptics.select()
    writeActive(appendKeypadDecimal(activeVal()))
  }
  const onBackspace = () => {
    haptics.tap()
    writeActive(keypadBackspace(activeVal()))
  }
  const onClear = () => {
    // Borrado TOTAL (long-press ⌫): cue háptico MÁS fuerte que el backspace de un char, espejando la
    // gradación web `triggerHaptic(12)` vs `(6)` (`WorkoutKeypadProvider.tsx:213-221`). RN mapea esa mayor
    // intensidad a impact Medium (`haptics.setDone`) frente al Light tap del backspace (`onBackspace`).
    haptics.setDone()
    writeActive('')
  }
  const onIncrement = (delta: number) => {
    haptics.select()
    writeActive(applyKeypadIncrement(activeVal(), delta))
  }
  const onSwitchField = (key: string) => {
    haptics.select()
    setActiveKey(key)
    setPhase('input')
  }
  const onEffortBack = () => {
    haptics.tap()
    setPhase('input')
  }

  const commit = () => {
    // Háptica de "serie guardada" — la más fuerte del keypad (mirror web `onDone` → `triggerHaptic(20)`
    // antes de `closeKeypad()`+`requestSubmit()`, `WorkoutKeypadProvider.tsx:245-251`, spec §7/§11.3).
    // Cubre las 3 rutas de confirmación de EDICIÓN (Omitir/Guardar/Listo-vía-goNext) que antes no daban
    // feedback háptico, a diferencia de la ruta PRIMARIA (`TypedKeypad` handleDone / `ActiveSetRow`).
    haptics.setDone()
    const v = valuesRef.current
    const payload = target.typed
      ? buildTypedPayload(target.typed.mode, v, target.blockId, target.setNumber)
      : buildStrengthPayload(v, target.blockId, target.setNumber)
    onCommit(payload)
  }

  // "Siguiente": avanza de campo → entra a esfuerzo → guarda (mirror `WorkoutKeypadProvider:253-271`).
  const goNext = () => {
    if (phase === 'effort') {
      commit()
      return
    }
    if (!isLastField) {
      onSwitchField(fields[activeIndex + 1].key)
      return
    }
    if (hasEffort) {
      haptics.tap()
      setPhase('effort')
      return
    }
    commit()
  }

  // ── Header de objetivo (es-CL) ───────────────────────────────────────────────
  const objectiveLine = (() => {
    if (target.typed) return target.typed.objective
    const parts: string[] = []
    if (target.targetSets != null && target.targetReps) parts.push(`${target.targetSets}×${target.targetReps}`)
    else if (target.targetReps) parts.push(`${target.targetReps} reps`)
    if (target.suggestedWeight != null) parts.push(`${formatWeightEsCl(target.suggestedWeight)} kg`)
    return parts.join(' · ')
  })()
  const lastPrev = !target.typed ? target.lastPrev ?? null : null

  // Label del botón primario. DECISIÓN DE FUENTE DE VERDAD (adaptación intencional, no defecto):
  // el KEYPAD web muestra SIEMPRE 'Listo' (`NumericKeypadSheet.tsx:279,418`), pero en web la EDICIÓN de
  // una serie logueada ocurre inline en la fila (`LogSetForm`), cuyo botón de submit dice 'Guardar'
  // (`LogSetForm.tsx:696` `label={isLogged ? 'Guardar' : 'Listo'}`). En mobile el `KeypadHost` es un Modal
  // full-screen que TAPA la fila → fusiona ambos roles (keypad + botón de commit de la fila). Mantener
  // 'Guardar' al editar PRESERVA la affordance que el usuario web ve en su fila de edición; forzar 'Listo'
  // la perdería (la fila queda oculta tras el modal). Se conserva a propósito.
  const doneLabel = target.isEdit ? 'Guardar' : 'Listo'
  const noteTrimmed = (values.note ?? '').trim()

  const panelShadow = { ...shadow('xl', resolvedScheme), shadowOffset: { width: 0, height: -16 } }

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* Scrim: tap-fuera cierra (no guarda). Fade 0→1 (mirror `NumericKeypadSheet:169-178`).
            Reduce-motion ⇒ sin fade (mirror web `:174-177`: `initial=false`). */}
        <MotiView
          from={{ opacity: motion.reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: motion.reduced ? 0 : 150 }}
          className="flex-1"
        >
          <Pressable className="flex-1 bg-black/25" onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar teclado" />
        </MotiView>

        {/* Panel: dark siempre (ink-950), aparece con spring (springsSheet.enter web). */}
        <MotiView
          from={{ translateY: motion.reduced ? 0 : 360 }}
          animate={{ translateY: 0 }}
          transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
        >
          <View
            accessibilityLabel="Teclado numérico"
            className="mx-auto w-full max-w-md rounded-t-sheet border-t border-inverse/10 bg-ink-950 px-3 pt-2"
            style={[{ paddingBottom: insets.bottom + 8 }, panelShadow]}
          >
            {/* Grabber + cerrar */}
            <View className="items-center justify-center pb-1">
              <View className="h-1 w-10 rounded-pill bg-white/20" />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar teclado"
                className="absolute right-0 top-0 h-8 w-8 items-center justify-center rounded-pill"
              >
                <X size={16} color={ON_DARK_MUTED} />
              </Pressable>
            </View>

            {/* Objetivo prescrito — SIEMPRE visible (DB-5). Primitiva compartida con la ruta PRIMARIA
                (`ActiveSetRow` → `TypedKeypad`) para no divergir el markup del header. */}
            <KeypadObjectiveHeader
              exerciseName={target.exerciseName}
              objectiveLine={objectiveLine}
              last={lastPrev}
            />

            {phase === 'effort' ? (
              /* ── Paso OPCIONAL de esfuerzo (RPE/RIR) — sólo fuerza, siempre saltable (DB-5) ── */
              <View className="mt-2">
                <View className="mb-2 flex-row items-center justify-between px-1">
                  <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
                    Esfuerzo <Text className="text-on-dark-muted/60">(opcional)</Text>
                  </Text>
                  <Pressable
                    onPress={onEffortBack}
                    accessibilityRole="button"
                    accessibilityLabel="Volver a los números"
                    className="flex-row items-center gap-1 rounded-control px-2 py-1"
                  >
                    <ArrowLeft size={14} color={ON_DARK_MUTED} />
                    <Text style={textStyle('3xs', FONT.uiSemibold)} className="text-on-dark-muted">
                      Volver
                    </Text>
                  </Pressable>
                </View>

                <View className="gap-3 rounded-control border border-inverse/10 bg-white/[0.03] p-3">
                  <EffortField
                    kind="rpe"
                    label="Esfuerzo · RPE"
                    help={RPE_HELP}
                    value={int(values.rpe)}
                    onSelect={(v) => patch({ rpe: String(v) }, activeIndex)}
                  />
                  <EffortField
                    kind="rir"
                    label="Reps en reserva · RIR"
                    help={RIR_HELP}
                    value={int(values.rir)}
                    onSelect={(v) => patch({ rir: String(v) }, activeIndex)}
                  />
                </View>

                {/* Nota rápida por serie (mirror web A.4.d, LogSetForm.tsx:699-736): toggle + input, máx
                    300 chars. Expone la nota en el flujo de EDICIÓN (P1): sin esto, reabrir y confirmar una
                    serie con nota la borraba (`buildStrengthPayload` leía values.note=undefined→null). */}
                <View className="mt-2">
                  <Pressable
                    testID="keypad-note-toggle"
                    onPress={() => setNoteOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: noteOpen }}
                    accessibilityLabel={noteTrimmed ? 'Editar la nota de la serie' : 'Agregar una nota a la serie'}
                    className="min-h-[36px] flex-row items-center gap-1.5 self-start rounded-control px-2 active:opacity-70"
                  >
                    <StickyNote size={14} color={noteTrimmed ? WARNING_500 : ON_DARK_MUTED} />
                    <Text
                      style={textStyle('3xs', FONT.uiSemibold)}
                      className={noteTrimmed ? 'text-warning-500' : 'text-on-dark-muted'}
                    >
                      {noteTrimmed ? 'Nota añadida' : 'Agregar nota'}
                    </Text>
                  </Pressable>
                  {/* El input se despliega animado (mirror web AnimatePresence height 0→auto + opacity 0.2s,
                      `LogSetForm.tsx:714-734`). Idioma RN opacity/translateY (igual que los disclosures de la
                      card, `SingleExerciseCard.tsx:453-461`); instantáneo con reduce-motion. */}
                  <AnimatePresence>
                    {noteOpen && (
                      <MotiView
                        from={motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: -4 }}
                        animate={{ opacity: 1, translateY: 0 }}
                        exit={motion.reduced ? { opacity: 0, translateY: 0 } : { opacity: 0, translateY: -4 }}
                        transition={{ type: 'timing', duration: motion.reduced ? 0 : 200 }}
                      >
                        <TextInput
                          testID="keypad-note-input"
                          value={values.note ?? ''}
                          onChangeText={(t) => patch({ note: t }, activeIndex)}
                          maxLength={300}
                          placeholder="Ej: sentí molestia en el hombro"
                          placeholderTextColor={ON_DARK_MUTED}
                          accessibilityLabel="Nota de la serie para tu coach"
                          style={textStyle('xs', FONT.ui)}
                          className="mt-1.5 rounded-control border border-inverse/10 bg-white/[0.06] px-3 py-2 text-on-dark"
                        />
                      </MotiView>
                    )}
                  </AnimatePresence>
                </View>

                {/* Acciones — ambas guardan la serie (el esfuerzo es opcional) */}
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    testID="keypad-skip-effort"
                    onPress={commit}
                    accessibilityRole="button"
                    accessibilityLabel="Omitir el esfuerzo y guardar la serie"
                    className="h-14 flex-1 items-center justify-center rounded-control border border-inverse/10 bg-white/[0.06] active:scale-[0.98] active:bg-white/[0.10]"
                  >
                    <Text style={KEYPAD_ACTION_STYLE} className="text-on-dark">
                      Omitir
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="keypad-save-set"
                    onPress={commit}
                    accessibilityRole="button"
                    accessibilityLabel={`${doneLabel}, guardar serie`}
                    className="h-14 flex-row items-center justify-center gap-2 rounded-control bg-sport-500 active:scale-[0.98]"
                    style={{ flex: 1.4 }}
                  >
                    <Check size={20} color={WHITE} />
                    <Text style={KEYPAD_ACTION_STYLE} className="text-white">
                      {doneLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* ── Fase de captura numérica ── */
              <>
                <View className="mt-2">
                  <KeypadDisplayRow
                    display={activeVal()}
                    unit={activeField.unit}
                    tabs={
                      fields.length > 1
                        ? {
                            fields: fields.map((f) => ({ key: f.key, label: f.label })),
                            activeKey: activeField.key,
                            onSwitch: onSwitchField,
                          }
                        : undefined
                    }
                  />
                </View>

                {showChips ? <WeightChips onIncrement={onIncrement} /> : null}

                <KeypadGrid
                  allowDecimal={allowDecimal}
                  onDigit={onDigit}
                  onDecimal={onDecimal}
                  onBackspace={onBackspace}
                  onClear={onClear}
                />

                {/* Acción — un ÚNICO botón: "Siguiente" avanza; "Listo" guarda (mirror web §5.4) */}
                <View className="mt-2">
                  <Pressable
                    testID={primaryIsNext ? 'keypad-next' : 'keypad-done'}
                    onPress={goNext}
                    accessibilityRole="button"
                    accessibilityLabel={primaryIsNext ? 'Siguiente' : `${doneLabel}, guardar serie`}
                    className="h-14 w-full flex-row items-center justify-center gap-2 rounded-control bg-sport-500 active:scale-[0.98]"
                  >
                    {primaryIsNext ? (
                      <>
                        <Text style={KEYPAD_ACTION_STYLE} className="text-white">
                          Siguiente
                        </Text>
                        <ArrowRight size={20} color={WHITE} />
                      </>
                    ) : (
                      <>
                        <Check size={20} color={WHITE} />
                        <Text style={KEYPAD_ACTION_STYLE} className="text-white">
                          {doneLabel}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </MotiView>
      </View>
    </Modal>
  )
}
