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
  KEYPAD_MAX_INT_DIGITS,
  type OptimisticLogPayload,
  // Routing PURO tipo->campos (fix QA R4·#5): fuente única de la secuencia de pasos del teclado.
  keypadStepsForTarget,
  type KeypadStep,
  type KeypadTarget,
  // Mapeo PURO valores->payload, compartido con la `ActiveSetRow` (sin drift entre superficies).
  buildStrengthPayload,
  buildStrengthTimePayload,
  buildTypedPayload,
  type TypedPayloadContext,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../lib/typography'
import { useEvaMotion } from '../../../lib/motion'
// Chip vivo del descanso (W5.1b · R3b): el descanso corre MINIMIZADO detrás de esta hoja, así que el
// tiempo que queda tiene que verse ACÁ. El hook late solo mientras el chip está montado.
// Se importa el módulo HOJA (`timers/rest-clock`, sólo React) y no el barril `./timers`: el barril
// arrastraría el provider, el motor del descanso y sus notificaciones nativas al grafo del teclado —y
// a los tests que lo montan (`tests/mobile/executor-v3-keypad-strength-time.test.ts`).
import { formatRestRemaining, restRemainingA11yLabel, useRestRemainingSec } from './timers/rest-clock'
import { shadow } from '../../../lib/shadows'
import { haptics } from '../../../lib/haptics'
// Primitivas presentacionales compartidas con la `ActiveSetRow` (sin duplicar).
import {
  EMPTY_CAPTURE_HINT,
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

/**
 * `#rrggbb` + alpha → `rgba(...)`, local a este archivo (W5.1b). NO se importa `hexToRgba` de
 * `lib/theme`: ese módulo arrastra `@eva/brand-kit` y `lib/shadows` al grafo del teclado, y
 * `tests/mobile/executor-v3-keypad-strength-time.test.ts` —que monta este host de verdad— tiene
 * `lib/shadows` doblado sin `GLOWS`, así que el import lo rompería. Cuatro líneas puras a cambio de no
 * atar el teclado al tema imperativo.
 */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// El tipo `KeypadTarget` vive en `@eva/workout-engine` (keypad-flow, puro/testeable); se re-exporta
// para los consumidores que ya lo importaban desde acá sin tocar sus imports.
export type { KeypadTarget } from '@eva/workout-engine'

/** Paso de campo (excluye el paso de esfuerzo) — cada uno es una pestaña del display. */
type KeypadFieldStep = Extract<KeypadStep, { kind: 'keypad' }>

/**
 * Chip vivo «Descanso 1:27» del prompt de huecos (W5.1b · enmienda E1 del owner, 12-09).
 *
 * Con la preferencia «Pasar solo al descanso» encendida, cuando el reloj de fuerza por tiempo cierra
 * la serie sin reps el descanso arranca MINIMIZADO (R3b) y esta hoja le tapa la `RestTimerBar` al
 * alumno: el chip es la única forma de que VEA cuánto le queda mientras anota kg y reps.
 *
 * Es un componente APARTE a propósito: el valor cambia una vez por segundo y, si el hook viviera en
 * `KeypadHost`, cada tick re-renderizaría el teclado entero (display, grid y chips) mientras el alumno
 * tipea. Acá el latido sólo toca estas dos vistas.
 *
 * `null` cuando no hay descanso vivo (pref apagada, descanso saltado o ya cerrado) ⇒ no se pinta nada.
 * En el 0 dice «¡A entrenar!» hasta que el host del descanso se cierra solo (~1,5 s después).
 */
function RestClockChip({ accent }: { accent?: string }) {
  const remaining = useRestRemainingSec()
  if (remaining == null) return null
  const tint = accent ?? ON_DARK
  const done = remaining <= 0
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={restRemainingA11yLabel(remaining)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1.5,
        paddingHorizontal: 11,
        paddingVertical: 5,
        backgroundColor: withAlpha(tint, done ? 0.2 : 0.12),
        borderColor: withAlpha(tint, done ? 0.45 : 0.3),
      }}
    >
      <Text
        style={{ fontFamily: FONT.uiBold, fontSize: 12, color: withAlpha(tint, 0.95), fontVariant: ['tabular-nums'] }}
      >
        {done ? formatRestRemaining(0) : `Descanso ${formatRestRemaining(remaining)}`}
      </Text>
    </View>
  )
}

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
   *
   * Desde el tren «Cuenta atrás en pantalla» (W3.4) el tipo es el CONTEXTO DE PAYLOAD, no sólo el de
   * campos: además de `sideMode` transporta `holdSource`, y toda edición por teclado es humana ⇒
   * `'manual'`. Va en el MISMO objeto que los lados porque el UPDATE reemplaza el jsonb entero.
   */
  typedContext?: TypedPayloadContext
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
  // Valor del campo activo PRE-CARGADO (draft/autofill/prefill de peso sugerido) y sin tocar ⇒ el
  // primer dígito/coma lo REEMPLAZA entero (semántica calculadora; incidente 4060 kg 2026-08-27:
  // "40" pre-cargado + tipear "60"). Se arma al sembrar el target y al cambiar de pestaña; lo baja
  // cualquier gesto de edición — los chips ±kg SÍ operan sobre la base (40 +2,5 = 42,5).
  const pristineRef = useRef(false)

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
    const initialKey = fields[target.initialFieldIndex ?? 0]?.key ?? fields[0]?.key ?? ''
    setActiveKey(initialKey)
    // El campo con el que abre trae valor sembrado ⇒ el primer dígito lo reemplaza (ver pristineRef).
    pristineRef.current = (seed[initialKey] ?? '') !== ''
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
  // Serie VACÍA = ningún eje capturado (mismo criterio que la `ActiveSetRow`, copy en `EMPTY_CAPTURE_HINT`):
  // el guardado queda inerte y dice qué falta. Este host no sólo EDITA: también registra desde cero (chip
  // "Toca para registrar" de la fila V2), así que sin la guarda seguía siendo una vía para escribir una fila
  // con todos los ejes en NULL — que cuenta como serie hecha. "Siguiente" nunca se bloquea: navegar entre
  // campos es justo lo que lleva a llenar el eje que falta.
  // Fuerza POR TIEMPO (R6, «Reps tras el reloj»): el peso NO cuenta como captura — MISMA regla que la
  // fila (`SetRow.tsx:952-962`). El peso sugerido ya viene puesto en el target, así que contarlo
  // dejaría «Guardar» habilitado sobre una serie sin segundos ni reps: trabajo que nadie hizo.
  const isEmptyCapture = (target.strengthTimeMode ? fields.filter((f) => f.key !== 'weight') : fields).every(
    (f) => (values[f.key] ?? '').trim() === '',
  )
  const emptyHint = EMPTY_CAPTURE_HINT[target.typed?.mode ?? 'strength']
  const doneBlocked = !primaryIsNext && isEmptyCapture

  // ── Mutación del valor (write-through al draft), mirror del provider web ──────
  const patch = (p: Record<string, string>, idx: number) => {
    const next = { ...valuesRef.current, ...p }
    valuesRef.current = next
    setValues(next)
    onDraftChange(next, idx)
  }
  const activeVal = () => valuesRef.current[activeField.key] ?? ''
  const writeActive = (nextValue: string) => patch({ [activeField.key]: nextValue }, activeIndex)

  // Tope 999 sólo en peso/reps de fuerza; los tipados (metros, segundos) conservan el general de 6.
  const maxIntDigits =
    activeField.mode === 'weight' || activeField.mode === 'reps' ? KEYPAD_MAX_INT_DIGITS : undefined

  const onDigit = (d: string) => {
    haptics.select()
    writeActive(appendKeypadDigit(activeVal(), d, { allowDecimal, maxIntDigits, replace: pristineRef.current }))
    pristineRef.current = false
  }
  const onDecimal = () => {
    if (!allowDecimal) return
    haptics.select()
    writeActive(appendKeypadDecimal(activeVal(), { replace: pristineRef.current }))
    pristineRef.current = false
  }
  const onBackspace = () => {
    haptics.tap()
    writeActive(keypadBackspace(activeVal()))
    pristineRef.current = false
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
    pristineRef.current = false
  }
  const onSwitchField = (key: string) => {
    haptics.select()
    setActiveKey(key)
    setPhase('input')
    // Entrar a un campo que ya trae valor lo deja "sin tocar": el primer dígito reemplaza.
    pristineRef.current = (valuesRef.current[key] ?? '') !== ''
  }
  const onNoteBack = () => {
    haptics.tap()
    setPhase('input')
  }

  const commit = () => {
    // Serie vacía no cuenta: las acciones que guardan ya están inertes; la guarda cubre cualquier otro
    // disparo (p. ej. "Siguiente" del último campo tipado).
    if (isEmptyCapture) return
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
      : target.strengthTimeMode
        // Fuerza POR TIEMPO (R6, «Reps tras el reloj»): tercera rama. El contexto viaja como OBJETO
        // porque el UPDATE reemplaza el jsonb ENTERO — el `holdSource` del target (R5: leído del seed
        // o del log) tiene que ir junto a `{left_sec, right_sec}` o el re-guardado degrada
        // `metadata.hold_source` a `'manual'` y rompe el E2E W6.10. Sin marca que conservar cae a
        // `'manual'`, que es la verdad: esa serie la está escribiendo una persona.
        ? buildStrengthTimePayload(v, target.blockId, target.setNumber, {
            sideMode: target.sideMode ?? null,
            holdSource: target.holdSource ?? 'manual',
          })
        // Fuerza POR LADO (W3.10): el teclado de EDICIÓN admite lados sólo en esta rama (`target.sideMode`
        // lo pone `openSet` únicamente en strength); el motor escribe `reps_done = min` + `metadata`.
        : buildStrengthPayload(v, target.blockId, target.setNumber, target.sideMode ?? null)
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

  // ── Prompt de huecos del hold (R9 · copy de SPEC §6) ─────────────────────────
  // El teclado lo abrió el RELOJ porque la serie se guardó sola sin reps (o sin peso), no el alumno
  // con «Editar». Cambia el encabezado y las acciones: una pregunta concreta, un secundario que
  // CIERRA sin guardar (la serie ya está guardada, V2 intacto) y un primario que guarda de una — sin
  // «Siguiente» ni paso de nota, que acá serían dos toques de peaje para escribir un número.
  const gapPrompt = target.prompt === 'hold-gap'
  // El campo con el que ABRIÓ (`initialFieldIndex`, congelado por `openSet`), no el activo: mirar los
  // segundos en otra pestaña no puede reescribir la pregunta que se le hizo al alumno.
  const gapAsksWeight = gapPrompt && (fields[target.initialFieldIndex ?? 0]?.key ?? 'reps') === 'weight'
  // «guardada con X s»: los segundos que el reloj YA dejó en la fila — se leen de `initialValues`
  // (lo guardado) y no de `values` (lo que el alumno esté tipeando ahora). En `per_side` es la suma,
  // el MISMO total que `buildStrengthTimePayload` escribe en `actual_hold_sec`.
  const gapHoldSec = (() => {
    if (!gapPrompt) return null
    const iv = target.initialValues ?? {}
    const int = (v: string | undefined) => {
      const n = parseInt((v ?? '').trim(), 10)
      return Number.isFinite(n) ? n : null
    }
    const single = int(iv.actual_hold_sec)
    if (single != null) return single
    const left = int(iv.hold_left_sec)
    const right = int(iv.hold_right_sec)
    return left != null || right != null ? (left ?? 0) + (right ?? 0) : null
  })()

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

            {/* Prompt de huecos (R9 · SPEC §6): eyebrow con lo que el reloj YA guardó + la pregunta
                concreta. Va DEBAJO del header de objetivo (que sigue diciendo «4×30s · 60 kg», R6) y
                no lo reemplaza: el alumno tiene que poder ver contra qué objetivo está anotando. */}
            {gapPrompt ? (
              <View className="mt-2 px-1">
                {/* Eyebrow + chip vivo del descanso (W5.1b): el descanso corre minimizado DETRÁS de
                    esta hoja, así que el tiempo que queda se muestra acá. Sin descanso vivo (pref
                    apagada, o ya cerrado) el chip devuelve null y la fila queda como antes. */}
                <View className="flex-row items-center justify-between gap-2">
                  <Text style={KEYPAD_EYEBROW_STYLE} className="flex-1 text-on-dark-muted" numberOfLines={1}>
                    {`Serie ${target.setNumber}${gapHoldSec != null ? ` · guardada con ${gapHoldSec} s` : ''}`}
                  </Text>
                  <RestClockChip accent={accent} />
                </View>
                <Text style={textStyle('lg', FONT.displayBold)} className="text-on-dark" numberOfLines={2}>
                  {gapAsksWeight ? '¿Con cuánto peso?' : '¿Cuántas reps hiciste?'}
                </Text>
              </View>
            ) : null}

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

                {/* Acciones — ambas guardan la serie (la nota es opcional); inertes si no hay ningún eje. */}
                {isEmptyCapture ? (
                  <Text style={textStyle('3xs', FONT.uiMedium)} className="mt-2 text-center text-on-dark-muted">
                    {emptyHint}
                  </Text>
                ) : null}
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    testID="keypad-skip-note"
                    onPress={commit}
                    disabled={isEmptyCapture}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isEmptyCapture }}
                    accessibilityLabel={
                      isEmptyCapture ? `Omitir la nota y guardar la serie. ${emptyHint}` : 'Omitir la nota y guardar la serie'
                    }
                    className={`h-14 flex-1 items-center justify-center rounded-control border border-inverse/10 bg-white/[0.06] ${
                      isEmptyCapture ? 'opacity-50' : 'active:scale-[0.98] active:bg-white/[0.10]'
                    }`}
                  >
                    <Text style={KEYPAD_ACTION_STYLE} className="text-on-dark">
                      Omitir
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="keypad-save-set"
                    onPress={commit}
                    disabled={isEmptyCapture}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isEmptyCapture }}
                    accessibilityLabel={isEmptyCapture ? `${doneLabel}. ${emptyHint}` : `${doneLabel}, guardar serie`}
                    className={`h-14 flex-row items-center justify-center gap-2 rounded-control ${
                      isEmptyCapture ? 'opacity-50' : 'active:scale-[0.98]'
                    } ${accent ? '' : 'bg-sport-500'}`}
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

                {/* Prompt de huecos (R9): DOS acciones en vez de la única de siempre. El secundario
                    CIERRA sin guardar —equivale al scrim y a la X— y la serie sigue guardada tal cual
                    la dejó el reloj (V2 intacto); el primario guarda de una, sin «Siguiente» ni paso
                    de nota, porque acá el alumno vino a escribir UN número. */}
                {gapPrompt ? (
                  <View className="mt-2">
                    {isEmptyCapture ? (
                      <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-center text-on-dark-muted">
                        {emptyHint}
                      </Text>
                    ) : null}
                    <View className="flex-row gap-2">
                      <Pressable
                        testID="keypad-gap-dismiss"
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={gapAsksWeight ? 'Dejar la serie sin peso' : 'Dejar la serie sin reps'}
                        className="h-14 flex-1 items-center justify-center rounded-control border border-inverse/10 bg-white/[0.06] active:scale-[0.98] active:bg-white/[0.10]"
                      >
                        <Text style={KEYPAD_ACTION_STYLE} className="text-on-dark">
                          {gapAsksWeight ? 'Sin peso' : 'Sin reps'}
                        </Text>
                      </Pressable>
                      <Pressable
                        testID="keypad-gap-save"
                        onPress={commit}
                        disabled={isEmptyCapture}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isEmptyCapture }}
                        accessibilityLabel={isEmptyCapture ? `Guardar. ${emptyHint}` : 'Guardar, guardar serie'}
                        className={`h-14 flex-row items-center justify-center gap-2 rounded-control ${
                          isEmptyCapture ? 'opacity-50' : 'active:scale-[0.98]'
                        } ${accent ? '' : 'bg-sport-500'}`}
                        style={[{ flex: 1.4 }, accent ? { backgroundColor: accent } : null]}
                      >
                        <Check size={20} color={accent ? accentText ?? WHITE : WHITE} />
                        <Text style={[KEYPAD_ACTION_STYLE, accent ? { color: accentText ?? WHITE } : null]} className={accent ? undefined : 'text-white'}>
                          Guardar
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                <>
                {/* Acción — un ÚNICO botón: "Siguiente" avanza; "Listo" guarda (mirror web §5.4). Sólo el que
                    GUARDA se bloquea con la serie vacía; "Siguiente" sigue navegando entre campos. */}
                <View className="mt-2">
                  {doneBlocked ? (
                    <Text style={textStyle('3xs', FONT.uiMedium)} className="mb-1.5 text-center text-on-dark-muted">
                      {emptyHint}
                    </Text>
                  ) : null}
                  <Pressable
                    testID={primaryIsNext ? 'keypad-next' : 'keypad-done'}
                    onPress={goNext}
                    disabled={doneBlocked}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: doneBlocked }}
                    accessibilityLabel={
                      primaryIsNext
                        ? 'Siguiente'
                        : doneBlocked
                          ? `${doneLabel}. ${emptyHint}`
                          : `${doneLabel}, guardar serie`
                    }
                    className={`h-14 w-full flex-row items-center justify-center gap-2 rounded-control ${
                      doneBlocked ? 'opacity-50' : 'active:scale-[0.98]'
                    } ${accent ? '' : 'bg-sport-500'}`}
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
              </>
            )}
          </View>
        </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
