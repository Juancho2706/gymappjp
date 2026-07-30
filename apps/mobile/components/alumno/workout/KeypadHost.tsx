import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native'
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
  type TypedKeypadContext,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../lib/typography'
import { useEvaMotion } from '../../../lib/motion'
import { shadow } from '../../../lib/shadows'
import { haptics } from '../../../lib/haptics'
// Primitivas presentacionales compartidas con la `ActiveSetRow` (sin duplicar).
import {
  KEYPAD_ACTION_STYLE,
  KEYPAD_EYEBROW_STYLE,
  KeypadDisplayRow,
  KeypadGrid,
  KeypadObjectiveHeader,
  WeightChips,
} from './TypedKeypad'

const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const WHITE = '#FFFFFF'
const WARNING_500 = '#F5A524' // --color-warning-500 (ámbar de la nota, mirror amber-300/400 web)

// El tipo `KeypadTarget` vive en `@eva/workout-engine` (keypad-flow, puro/testeable); se re-exporta
// para los consumidores que ya lo importaban desde acá sin tocar sus imports.
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
 *  - Fase de NOTA (sólo fuerza, opcional): la nota rápida de la serie para el coach, con botones
 *    Omitir / Listo (ambos guardan; la nota es saltable).
 *
 * El ESFUERZO (RPE/RIR) ya NO se captura acá (decisión CEO, espejo del cambio web): su única superficie
 * es el panel de esfuerzo de la FILA (`EffortTicksV3`), tanto en la serie activa como en la ya logueada.
 * El teclado igual PRESERVA el esfuerzo existente al editar: `openSet` siembra `values.rpe/rir` desde el
 * log y `buildStrengthPayload` los vuelve a escribir, así corregir el peso no borra lo ya registrado.
 *
 * El valor lo posee este host (`values`, string es-CL); el commit arma el `OptimisticLogPayload` con
 * los builders puros (`buildStrengthPayload`/`buildTypedPayload`, compartidos con `ActiveSetRow`) y lo
 * entrega al padre. El draft se reporta en cada cambio para la resiliencia (E2-03).
 */
export function KeypadHost({
  target,
  typedContext,
  onClose,
  onCommit,
  onDraftChange,
  accent,
  accentText,
}: {
  target: KeypadTarget | null
  /**
   * Contexto de CAMPOS del bloque en edición (`distanceUnit` / `cardioModality`; Fase A+C de
   * specs/cardio-ejes-y-fixes). Sólo alimenta a `buildTypedPayload`, que así aplica las MISMAS
   * conversiones que la fila de registro: la caja "Km" guarda metros (×1000) y el conteo rep-based
   * (saltos/pisos/reps) viaja en `reps_done`. Sin la prop el payload es byte-idéntico al previo.
   *
   * NO altera el flujo del teclado: los pasos vienen de `target.typed.fields` (que `openSet` ya armó
   * con este mismo contexto) y el botón primario conserva su comportamiento — en RN "Listo"/"Guardar"
   * commitea (divergencia intencional con web, decisión CEO PR #168).
   */
  typedContext?: TypedKeypadContext
  onClose: () => void
  onCommit: (payload: OptimisticLogPayload) => void
  onDraftChange: (values: Record<string, string>, fieldIndex: number) => void
  /** Acento de MARCA del ejecutor V3 (informe 15, MAYOR): confirmar/seleccionados adoptan la marca en
   *  vez del azul Sport fijo. Ausente (ejecutor V2) ⇒ conserva `bg-sport-500` + texto blanco. */
  accent?: string
  accentText?: string
}) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const [values, setValues] = useState<Record<string, string>>({})
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [activeKey, setActiveKey] = useState('')
  const [phase, setPhase] = useState<'input' | 'note'>('input')
  // Nota rápida por serie (mirror web A.4.d): desplegable en el paso de nota. El texto vive en
  // `values.note` (mismo carril que rpe/rir → viaja al draft y a `buildStrengthPayload`).
  const [noteOpen, setNoteOpen] = useState(false)

  // Secuencia de pasos según el tipo del bloque (routing puro compartido con `openSet`).
  const steps = useMemo(() => keypadStepsForTarget(target), [target])
  // Los campos son las pestañas del display; la nota es una FASE aparte (no una pestaña).
  const fields = useMemo(() => steps.filter((s): s is KeypadFieldStep => s.kind === 'keypad'), [steps])
  // La nota por serie sólo existe en FUERZA: es lo único que `buildStrengthPayload` lee de `values.note`
  // (el builder tipado no la escribe). Antes esta segunda fase era el esfuerzo y se derivaba del paso
  // `effort` del engine; ahora que el esfuerzo salió del teclado, la condición honesta es "no es tipado".
  const hasNote = !target?.typed

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
    // Editar una serie que YA lleva nota abre el input desplegado: ahora la nota es lo único de la fase,
    // así que dejarlo colapsado obligaría a un tap extra sólo para ver lo que se está corrigiendo.
    setNoteOpen(!!(seed.note ?? '').trim())
  }, [target, fields])

  if (!target || fields.length === 0) return null

  const activeIndex = Math.max(0, fields.findIndex((f) => f.key === activeKey))
  const activeField = fields[activeIndex]
  const isLastField = activeIndex === fields.length - 1
  const primaryIsNext = !isLastField || hasNote
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
  const onNoteBack = () => {
    haptics.tap()
    setPhase('input')
  }

  const commit = () => {
    // Háptica de "serie guardada" — la más fuerte del keypad. DIVERGENCIA INTENCIONAL con web
    // (decisión CEO 2026-07-25): allá "Listo" solo CIERRA el teclado y la serie se guarda con el CTA
    // de la fila (visible junto al sheet); acá el keypad es un Modal full-screen que TAPA la fila,
    // así que "Listo"/"Guardar" sigue siendo el commit (no hay otro botón alcanzable).
    // Cubre las 3 rutas de confirmación de EDICIÓN (Omitir/Guardar/Listo-vía-goNext) que antes no daban
    // feedback háptico, a diferencia de la ruta PRIMARIA (`TypedKeypad` handleDone / `ActiveSetRow`).
    haptics.setDone()
    // `v` conserva el rpe/rir SEMBRADO por `openSet` al editar (el teclado ya no los muestra, pero
    // `buildStrengthPayload` los relee) ⇒ corregir peso/reps/nota nunca borra el esfuerzo registrado.
    const v = valuesRef.current
    const payload = target.typed
      ? buildTypedPayload(target.typed.mode, v, target.blockId, target.setNumber, typedContext)
      : buildStrengthPayload(v, target.blockId, target.setNumber)
    onCommit(payload)
  }

  // "Siguiente": avanza de campo → entra a la nota → guarda (mirror `WorkoutKeypadProvider:253-271`).
  const goNext = () => {
    if (phase === 'note') {
      commit()
      return
    }
    if (!isLastField) {
      onSwitchField(fields[activeIndex + 1].key)
      return
    }
    if (hasNote) {
      haptics.tap()
      setPhase('note')
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

  // Sombra SIEMPRE dark: el panel es `bg-ink-950` fijo (no depende del esquema de la cuenta); con la
  // cuenta en claro salía la elevación clara y el panel quedaba "flotando" sin profundidad.
  const panelShadow = { ...shadow('xl', 'dark'), shadowOffset: { width: 0, height: -16 } }

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

        {/* Teclado del sistema: este Modal se pinta en su PROPIA ventana del SO, así que el
            KeyboardAvoidingView de la pantalla (StepperExecution) NO lo alcanza — sin este wrapper el
            input de nota (fase 'note') queda enterrado bajo el teclado en iOS. Mismo criterio que
            `Sheet.tsx:333-336`: `padding` sólo en iOS (en Android el Modal ya pide ADJUST_RESIZE a su
            Dialog y compensar de nuevo desplazaría dos veces) y `flexShrink: 1` para que el panel ceda
            altura en vez de empujarse fuera de pantalla. Inerte sin teclado. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flexShrink: 1 }}
        >
        {/* Panel: dark siempre (ink-950), aparece con spring (springsSheet.enter web). */}
        <MotiView
          from={{ translateY: motion.reduced ? 0 : 360 }}
          animate={{ translateY: 0 }}
          transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
          style={{ flexShrink: 1 }}
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

            {phase === 'note' ? (
              /* ── Paso OPCIONAL de NOTA — sólo fuerza, siempre saltable (DB-5). El esfuerzo (RPE/RIR)
                   salió de acá: se registra y se corrige en el panel de esfuerzo de la FILA. ── */
              <View className="mt-2">
                <View className="mb-2 flex-row items-center justify-between px-1">
                  <Text style={KEYPAD_EYEBROW_STYLE} className="text-on-dark-muted">
                    Nota <Text className="text-on-dark-muted/60">(opcional)</Text>
                  </Text>
                  <Pressable
                    onPress={onNoteBack}
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

                {/* Nota rápida por serie (mirror web A.4.d, LogSetForm.tsx:699-736): toggle + input, máx
                    300 chars. Expone la nota en el flujo de EDICIÓN (P1): sin esto, reabrir y confirmar una
                    serie con nota la borraba (`buildStrengthPayload` leía values.note=undefined→null).
                    NO se mueve de esta fase: moverla ya provocó esa regresión una vez. */}
                <View>
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
                          // Teclado del sistema OSCURO (iOS; no-op en Android): el panel es ink-950 fijo
                          // y con la cuenta en claro subía el teclado BLANCO pegado al borde inferior.
                          keyboardAppearance="dark"
                          accessibilityLabel="Nota de la serie para tu coach"
                          style={textStyle('xs', FONT.ui)}
                          className="mt-1.5 rounded-control border border-inverse/10 bg-white/[0.06] px-3 py-2 text-on-dark"
                        />
                      </MotiView>
                    )}
                  </AnimatePresence>
                </View>

                {/* Acciones — ambas guardan la serie (la nota es opcional) */}
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    testID="keypad-skip-note"
                    onPress={commit}
                    accessibilityRole="button"
                    accessibilityLabel="Omitir la nota y guardar la serie"
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
                    className={`h-14 flex-row items-center justify-center gap-2 rounded-control active:scale-[0.98] ${accent ? '' : 'bg-sport-500'}`}
                    style={[{ flex: 1.4 }, accent ? { backgroundColor: accent } : null]}
                  >
                    <Check size={20} color={accent ? accentText ?? WHITE : WHITE} />
                    <Text style={[KEYPAD_ACTION_STYLE, accent ? { color: accentText ?? WHITE } : null]} className={accent ? undefined : 'text-white'}>
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
                    className={`h-14 w-full flex-row items-center justify-center gap-2 rounded-control active:scale-[0.98] ${accent ? '' : 'bg-sport-500'}`}
                    style={accent ? { backgroundColor: accent } : undefined}
                  >
                    {primaryIsNext ? (
                      <>
                        <Text style={[KEYPAD_ACTION_STYLE, accent ? { color: accentText ?? WHITE } : null]} className={accent ? undefined : 'text-white'}>
                          Siguiente
                        </Text>
                        <ArrowRight size={20} color={accent ? accentText ?? WHITE : WHITE} />
                      </>
                    ) : (
                      <>
                        <Check size={20} color={accent ? accentText ?? WHITE : WHITE} />
                        <Text style={[KEYPAD_ACTION_STYLE, accent ? { color: accentText ?? WHITE } : null]} className={accent ? undefined : 'text-white'}>
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
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
