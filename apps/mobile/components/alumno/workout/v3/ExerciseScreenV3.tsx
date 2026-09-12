import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { LinearTransition } from 'react-native-reanimated'
import { ArrowUp, Hand, Keyboard, Pencil, RotateCcw, TrendingUp, X } from 'lucide-react-native'
import {
  compactDuration,
  isStrengthTimeBlock,
  formatStrengthTimeSetLine,
  formatWeightEsCl,
  resolveEffectiveRest,
  sessionLogKey,
  type HoldSource,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
  type RepeatSeedEntry,
  SIDE_LABEL,
} from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { captureAppEvent } from '../../../../lib/analytics'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import type { EffectiveTarget } from '../../../../lib/workout/progression'
import type { PrevSet, SessionBlock, SessionDraft, SessionExercise, SessionHold } from '../../../../lib/workout-session'
import { Sheet } from '../../../Sheet'
import { SetRow, ActiveSetRow } from '../SetRow'
import { bestPrevOf, overloadChipLabel } from '../workout-ui'
import { DualWheelPicker } from './DualWheelPicker'
import { dismissWheelHint, useWheelHintDismissed } from './wheel-hint'
import { ExecMediaV3 } from './ExecMediaV3'
import { HoldModuleV3 } from './HoldModuleV3'
import { holdCapturePromptFor, type OpenSetOpts } from './hold-capture-prompt'
import type { HoldCommitInfo } from './use-hold-module'
import { RestOfferV3 } from './RestOfferV3'
import { parseRestTime, useWorkoutTimers } from '../timers'
import { EXEC_SKIP_AMBER, ExerciseActionChips } from './exercise-actions'
import type { ExecTheme } from './exec-theme'

// Reflow del layout (paridad SingleExerciseCard CARD_LAYOUT): anima el cambio de tamaño al
// completar series. Sólo sin reduced-motion.
const CARD_LAYOUT = LinearTransition.springify().damping(25).stiffness(200)

/**
 * Semilla de "repetir un día" traducida a los valores tipeables de una serie de FUERZA (mismas claves
 * que consume `buildStrengthPayload`: weight/reps/rpe/rir). La NOTA no se siembra (decisión CEO).
 * Devuelve `null` si el día original no dejó ningún valor útil: así la fila cae a su comportamiento
 * normal (peso sugerido por progresión) en vez de arrancar con las cajas vacías. La exporta también
 * `ExecutorV3` para sembrar la ruta de EDICIÓN por teclado (`openSet`) con la misma traducción.
 */
export function strengthSeedValues(entry: RepeatSeedEntry | null | undefined): Record<string, string> | null {
  if (!entry) return null
  const values: Record<string, string> = {}
  if (entry.weightKg != null) values.weight = formatWeightEsCl(entry.weightKg)
  if (entry.repsDone != null) values.reps = String(entry.repsDone)
  if (entry.rpe != null) values.rpe = String(entry.rpe)
  if (entry.rir != null) values.rir = String(entry.rir)
  return Object.keys(values).length > 0 ? values : null
}

/**
 * Pantalla "Fuerza" del ejecutor V3 (E2.3) — traducción RN del `.a3a-body` (Fuerza) del mockup
 * concepto-a-v3-core. REEMPLAZA el cuerpo del paso strength dentro del `ExecutorV3` (los demás tipos
 * siguen con `SingleExerciseCard` hasta la Ola 3). Layout del mockup:
 *  · nombre grande + chip tipo·músculo;
 *  · MEDIA siempre visible al centro (misma resolución que TechniqueSheet/SingleExerciseCard, regla de
 *    media del CTX: gif/imagen → imagen; mp4/webm → video autoplay-mute-loop; YouTube → placeholder +
 *    chip que abre el modal de técnica) con chips glass "Instrucciones"/"Nota del coach" que entran
 *    extendidos y colapsan a solo-icono ~1,2s (reduced-motion ⇒ quedan extendidos; badge dot si hay nota);
 *  · prescripción compacta + chip de sobrecarga;
 *  · fila "Anterior: X kg × Y — toca para usar" (1-tap → prellena la serie activa con el mecanismo de
 *    autofill EXISTENTE de `ActiveSetRow`);
 *  · las series como `SetRow`/`ActiveSetRow` REUSADAS (contenedor V3, su lógica de guardado/draft/cola
 *    intacta). El CTA de completar y las pills RPE/RIR son los de `ActiveSetRow` — NO se duplican.
 *
 * MOTOR INTOCABLE: este componente sólo RECOMPONE visualmente. El mapeo activa/logueada es el mismo que
 * `SingleExerciseCard` (misma fuente de verdad de qué fila es protagonista).
 */
export function ExerciseScreenV3({
  block,
  exercise,
  eff,
  currentWeek,
  blockLogs,
  prevList,
  restoredDraft,
  restoredHold = null,
  saveHold,
  repeatSeed = null,
  reducedMotion = false,
  exec,
  showEffort = true,
  autoRestEnabled = true,
  onRestOfferChange,
  substitution,
  canSubstitute,
  skipped = false,
  skipReason = null,
  canSkip = false,
  onOpenSkip,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
  onDraftChange,
  onOpenSubstitute,
  onUndoSubstitution,
  recentSet,
  syncErrors,
  onRetrySet,
  repeatRequest = null,
}: {
  block: SessionBlock
  exercise: SessionExercise
  eff: EffectiveTarget | null
  currentWeek: number | null
  blockLogs: ReconciledSessionLog[]
  prevList: PrevSet[]
  restoredDraft: SessionDraft | null
  /** Reloj de hold rescatado del snapshot (ítem 12 · R6) — lo consume el módulo al montar. */
  restoredHold?: SessionHold | null
  /** Persiste el reloj de hold ARMADO en el snapshot de la sesión (ítem 12 · R6). */
  saveHold?: (hold: SessionHold | null) => void
  /**
   * Semilla de "repetir un día" indexada por `sessionLogKey(block_id, set_number)`: precarga la serie
   * activa con lo que el alumno registró ese día, EDITABLE. Entra por la misma cadena de valores
   * iniciales que el peso sugerido (`seedValues` de `ActiveSetRow`), nunca como log registrado. El
   * draft restaurado GANA sobre la semilla (es lo último que el alumno tipeó de verdad).
   */
  repeatSeed?: Map<string, RepeatSeedEntry> | null
  reducedMotion?: boolean
  exec: ExecTheme
  /** Mostrar las pills/escala de esfuerzo RPE/RIR (E3.7 — la tuerca). Default true. */
  showEffort?: boolean
  /**
   * Preferencia «Pasar solo al descanso» (D5). ON ⇒ el orquestador arranca el descanso al guardar;
   * OFF ⇒ tras guardar se ofrece «Descansar N s» / «Siguiente serie» (R24).
   */
  autoRestEnabled?: boolean
  /**
   * Avisa al orquestador que hay (o dejó de haber) un par «Descansar N s» / «Siguiente serie» vivo
   * (reporte 11-09): mientras esté abierto el auto-avance de paso NO puede desmontarlo.
   */
  onRestOfferChange?: (open: boolean) => void
  substitution: { name: string; prescribedName: string } | null
  canSubstitute: boolean
  /** El alumno declaró OMITIDO este bloque (mockup 3): la captura se retira y queda el badge. */
  skipped?: boolean
  /** Motivo declarado al omitir (`SKIP_REASONS`), o null si no eligió ninguno. */
  skipReason?: string | null
  /** ¿Se puede omitir? (bloque no resuelto). */
  canSkip?: boolean
  onOpenSkip?: () => void
  onOpenTechnique: () => void
  /**
   * Abre el teclado de una serie. El `opts` (R4, «Reps tras el reloj») va AL FINAL y es opcional: lo
   * usa el prompt de huecos (semilla + foco + copy) y el «Editar» de la línea «Serie N».
   */
  onOpenSet: (setNumber: number, opts?: OpenSetOpts) => void
  /**
   * `opts.repeat` (R8): este commit REEMPLAZA una serie ya guardada porque el alumno tocó «Repetir».
   * El orquestador tiene que tratarlo como serie NUEVA (descanso + celebración) pese a `wasLogged`.
   */
  onCommitSet: (payload: OptimisticLogPayload, opts?: { repeat?: boolean }) => void
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  onOpenSubstitute: () => void
  onUndoSubstitution: () => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
  /**
   * «Repetir» pedido desde FUERA de esta pantalla (R7/R8): la línea «Serie N» que vive dentro del
   * interstitial de descanso la pinta `ExecutorV3`, que no puede tocar el estado local de acá. Llega
   * como pedido con `nonce` y se aplica una sola vez por nonce; el estado de repetición sigue siendo
   * de esta pantalla (es la dueña de la serie activa y del `resetKey` del reloj).
   */
  repeatRequest?: { setNumber: number; nonce: number } | null
}) {
  const s = exec.surface
  const [autofill, setAutofill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
  // Rueda dual (E2.5) — se abre por long-press sobre kg/reps de la serie activa; entrega ambos valores
  // por el MISMO autofill de la fila "Anterior". El hint "una vez" se apaga al usarla o cerrarlo.
  const [wheelOpen, setWheelOpen] = useState(false)
  const hintDismissed = useWheelHintDismissed()

  const typeColor = exerciseTypeColor('strength', exec.accent)
  const typeLabel = EXERCISE_TYPE_META.strength.label

  const loggedSetNumbers = useMemo(
    () => new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)),
    [blockLogs, block.sets],
  )
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }
  /**
   * «Repetir» (R8): el alumno quiere REHACER una serie ya guardada, así que la serie N vuelve a ser la
   * activa aunque esté logueada. Lleva su propia semilla —tomada del log EN EL MOMENTO del toque, no
   * derivada de `blockLogs` en cada render— para que el hero abra con el KG/REPS de esa serie
   * (riesgo 7 del PLAN) sin que un cambio posterior de `blockLogs` reescriba la captura a medio tipear.
   * El `nonce` es lo que hace que el reloj vuelva a `idle` (`resetKey`) al repetir la MISMA serie.
   */
  const [repeat, setRepeat] = useState<{ setNumber: number; nonce: number; values: Record<string, string> | null } | null>(null)
  // Bloque OMITIDO ⇒ no hay serie activa: se retiran hero de captura, fila "Anterior", hint de la
  // rueda y el botón de teclado. El historial de series YA registradas antes de omitir se conserva
  // (siguen siendo entrenamiento real).
  const activeSet = skipped ? null : repeat?.setNumber ?? firstUnlogged

  const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
  const overloadLabel = overloadChipLabel(block, eff, currentWeek)
  const bestPrev = bestPrevOf(prevList)

  // PR en vivo (E4.2): cuando la serie recién cerrada de ESTE bloque fue récord, la fila "Anterior" tacha
  // la marca previa y muestra una flecha arriba dorada con el peso que la superó (mockup "PR en vivo").
  const prRecent = recentSet?.blockId === block.id && !!recentSet?.pr
  const prNewWeightKg = prRecent
    ? blockLogs.find((l) => l.set_number === recentSet?.setNumber)?.weight_kg ?? null
    : null

  // Anclas de la rueda: centro en el valor ANTERIOR de la serie (mejor set previo) o, si no hay,
  // en el OBJETIVO (peso sugerido / reps prescritas). `block.reps` puede ser "8-10" ⇒ toma el primer
  // entero. La rueda redondea internamente al grid del paso.
  const wheelAnchors = useMemo(() => {
    const repsParsed = parseInt(String(block.reps), 10)
    return {
      kg: bestPrev?.weight_kg ?? suggestedWeightKg ?? 0,
      reps: bestPrev?.reps_done ?? (Number.isFinite(repsParsed) ? repsParsed : 0),
    }
  }, [bestPrev, suggestedWeightKg, block.reps])

  const openWheel = () => {
    if (activeSet == null) return
    // Medium (no el Light de `tap`): el pulso tiene que leerse COMO confirmación del gesto sostenido.
    haptics.longPress()
    setWheelOpen(true)
  }
  const handleWheelDone = (weightKg: number, reps: number) => {
    if (activeSet != null) setAutofill({ weight: weightKg, reps, nonce: Date.now() })
    if (!hintDismissed) dismissWheelHint()
    setWheelOpen(false)
  }
  const showWheelHint = !hintDismissed && activeSet != null

  const coachNote = block.notes?.trim() ? block.notes.trim() : null

  // ── Fuerza POR TIEMPO (specs/cuenta-atras-en-pantalla, D3 / W3.15) ────────────────────────────
  // Predicado único del motor (R29): `reps_unit === 'sec'` Y `duration_sec > 0`. Con él el hero
  // conmuta el tile REPS a SEG, el anillo (130 px) se monta bajo el video y a 0 la serie se guarda
  // sola con el KG del tile (V2). Descansar o seguir lo toca el alumno (V3 / R24) salvo que la
  // preferencia «Pasar solo al descanso» esté encendida.
  const strengthTime = isStrengthTimeBlock(block, exercise)
  const holdSec = strengthTime ? (block.duration_sec ?? 0) : 0
  const timers = useWorkoutTimers()
  const [seedPatch, setSeedPatch] = useState<{ values: Record<string, string>; nonce: number } | null>(null)
  // `line` (R7): resumen de la serie recién cerrada por el reloj — vive DENTRO del par «Descansar /
  // Siguiente» a propósito, así aparece y desaparece exactamente con él y no hay un segundo ciclo de
  // vida que limpiar. Con la preferencia ON esta línea no existe acá: la pinta el interstitial.
  const [restOffer, setRestOffer] = useState<{ setNumber: number; seconds: number; warmup: boolean; line: string | null } | null>(null)
  /** Traducción log → valores tipeables de fuerza, la MISMA del día repetido (sin drift). */
  const repeatValuesFromLog = (log: ReconciledSessionLog | undefined): Record<string, string> | null =>
    strengthSeedValues(
      log
        ? {
            weightKg: log.weight_kg ?? null,
            repsDone: log.reps_done ?? null,
            rpe: log.rpe ?? null,
            rir: log.rir ?? null,
            // Los ejes tipados no entran al hero de fuerza; los segundos los vuelve a poner el reloj.
            actualDurationSec: null,
            actualDistanceM: null,
            actualHoldSec: null,
            actualAvgHr: null,
            metadata: null,
          }
        : null,
    )
  // Lo tipeado AHORA en el hero (base de la mezcla del auto-envío): arranca con el peso sugerido, que
  // es lo que la fila muestra antes de que el alumno toque nada. Al REPETIR (R8) arranca con lo que la
  // serie ya tenía guardado: si no, el auto-envío del reloj borraría las reps que el alumno ya anotó.
  const captureRef = useRef<Record<string, string>>({})
  useEffect(() => {
    captureRef.current = repeat?.values ?? (suggestedWeightKg != null ? { weight: formatWeightEsCl(suggestedWeightKg) } : {})
    setSeedPatch(null)
  }, [activeSet, suggestedWeightKg, repeat])

  /**
   * «Repetir» (R8): el reloj de la serie N vuelve a 0:30 con «Iniciar serie». Corta el descanso en
   * curso (el alumno va a entrenar AHORA) y retira el par «Descansar / Siguiente», que ya no aplica.
   * El nuevo commit REEMPLAZA la fila (upsert por bloque+serie+día, SPEC §8): no hay serie extra.
   */
  const startRepeat = (setNumber: number) => {
    haptics.tap()
    timers.cancelRest()
    setRestOffer(null)
    setRepeat({ setNumber, nonce: Date.now(), values: repeatValuesFromLog(blockLogs.find((l) => l.set_number === setNumber)) })
    captureAppEvent('hold_set_repeated', { block_id: block.id, set_number: setNumber })
  }
  // Pedido de «Repetir» que llega desde el interstitial de descanso (R7): se aplica UNA vez por nonce.
  const repeatRequestNonce = repeatRequest?.nonce ?? null
  const appliedRepeatNonce = useRef<number | null>(null)
  useEffect(() => {
    if (repeatRequest == null || appliedRepeatNonce.current === repeatRequest.nonce) return
    appliedRepeatNonce.current = repeatRequest.nonce
    startRepeat(repeatRequest.setNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatRequestNonce])

  const commitSet = (payload: OptimisticLogPayload, hold?: { source: HoldSource; info: HoldCommitInfo }) => {
    // R8: el re-commit de una serie repetida viaja MARCADO para que el orquestador lo trate como serie
    // nueva (descanso + celebración) aunque la fila ya exista en `sessionLogs`.
    const isRepeat = repeat != null && repeat.setNumber === payload.setNumber
    onCommitSet(payload, isRepeat ? { repeat: true } : undefined)
    if (isRepeat) setRepeat(null)
    // Segundos EFECTIVOS por SERIE (reporte 11-09): MISMA regla que el orquestador — warmup válido en
    // la serie 1 de un bloque de ≥3 → `rest_time` → fallback de 60 s. Antes era una constante por
    // bloque (`parseRestTime(block.rest_time)`), así que un `rest_time` vacío dejaba el CTA en «0 s» y
    // `RestOfferV3` ni pintaba el botón de descansar: el alumno sólo podía seguir de largo.
    if (!autoRestEnabled) {
      const eff = resolveEffectiveRest({
        restSec: parseRestTime(block.rest_time),
        warmupRestSec: parseRestTime(block.warmup_rest_time),
        useWarmup: payload.setNumber === 1 && block.sets >= 3,
      })
      // R7: el texto sale de `formatStrengthTimeSetLine` TAL CUAL (sin guion inventado) y se arma con
      // el PAYLOAD, no con `blockLogs` — el optimista todavía no propagó a este render.
      const line = strengthTime
        ? formatStrengthTimeSetLine({
            weight_kg: payload.weightKg ?? null,
            reps_done: payload.repsDone ?? null,
            actual_hold_sec: payload.actualHoldSec ?? null,
            metadata: payload.metadata ?? null,
          })
        : null
      setRestOffer({ setNumber: payload.setNumber, seconds: eff.seconds, warmup: eff.warmup, line })
    }
    // R3/R4: la pantalla DECIDE y abre, siempre DESPUÉS de `onCommitSet` — `handleCommit` limpia el
    // teclado con un `setKeypadTarget(null)` síncrono en su primera línea (riesgo 2 del PLAN), así que
    // abrir antes se borraría solo. La regla vive en el helper puro `holdCapturePromptFor`.
    if (hold) {
      const gap = holdCapturePromptFor({
        kind: 'strength_time',
        captureGaps: hold.info.captureGaps,
        expiredWhileAway: hold.info.expiredWhileAway,
      })
      if (gap) {
        captureAppEvent('hold_capture_prompted', {
          block_id: block.id,
          exercise_type: 'strength',
          context: 'solo',
          // SPEC §7 pide `missing: string[]`, pero `AppEventProps` de RN sólo admite escalares
          // (`analytics.ts:87`, y ese archivo no es de este worker): viaja como lista separada por
          // comas — «reps», «weight» o «reps,weight» —, que en PostHog se filtra igual de bien.
          missing: hold.info.captureGaps.join(','),
          trigger: hold.source === 'timer' ? 'timer' : 'manual',
          platform: 'mobile',
        })
        onOpenSet(payload.setNumber, { seed: payload, focus: gap.focus, prompt: 'hold-gap' })
      }
    }
  }
  const startOfferedRest = () => {
    if (!restOffer) return
    timers.startRest(restOffer.seconds, {
      autoStart: true,
      label: exercise.name,
      warmup: restOffer.warmup,
      setIndex: restOffer.setNumber,
      setTotal: block.sets,
      countKind: 'serie',
    })
    setRestOffer(null)
  }
  // El orquestador congela el auto-avance de paso mientras el par siga vivo (reporte 11-09). Se
  // publica también en el desmontaje: si el alumno se va por el rail, el paso no puede quedar trabado.
  const restOfferOpen = restOffer != null && !autoRestEnabled
  useEffect(() => {
    onRestOfferChange?.(restOfferOpen)
    return () => onRestOfferChange?.(false)
  }, [restOfferOpen, onRestOfferChange])

  // Reps objetivo (prescripción) → placeholder tenue del tile REPS del hero cuando aún no se capturó.
  // En modo tiempo el tile es SEG y el placeholder son los segundos prescritos.
  const repsHint = useMemo(() => {
    if (strengthTime) return holdSec > 0 ? String(holdSec) : null
    const n = parseInt(String(block.reps), 10)
    return Number.isFinite(n) ? String(n) : null
  }, [block.reps, strengthTime, holdSec])

  // Pie del hero (mockup `.a3a-foot`): botón teclado (nonce → abre el teclado en el tile activo) y botón
  // lápiz (abre el sheet oscuro con las filas clásicas del motor para corregir series ya guardadas).
  const [kbNonce, setKbNonce] = useState(0)
  const [editPrevOpen, setEditPrevOpen] = useState(false)
  // Panel de esfuerzo (QA2 hallazgo 3): colapsado por default; el estado vive AQUÍ (por-ejercicio) para
  // persistir entre series. `ExecutorV3` monta este componente con `key={block.id}` → al cambiar de
  // ejercicio se remonta y vuelve a colapsado, como pide el contrato.
  const [effortExpanded, setEffortExpanded] = useState(false)
  const doneCount = loggedSetNumbers.size

  // HERO de la serie activa (primera sin registrar). Reusa `ActiveSetRow` con `heroMode` — su lógica de
  // guardado/draft/cola/keypad es intocable; sólo cambia la piel a los tiles + esfuerzo + CTA del mockup.
  const activeHero = activeSet != null ? (() => {
    const setNumber = activeSet
    // Precedencia de la captura: serie REPETIDA (R8: lo que esa serie ya tenía guardado) > draft
    // restaurado (lo último tipeado, resiliencia E2-03) > semilla del día repetido > peso sugerido por
    // progresión (lo resuelve la propia fila con `suggestedWeight`).
    const seed =
      repeat != null && repeat.setNumber === setNumber
        ? repeat.values
        : restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === setNumber
          ? restoredDraft.values
          : strengthSeedValues(repeatSeed?.get(sessionLogKey(block.id, setNumber)))
    return (
      <ActiveSetRow
        key={`hero-${setNumber}`}
        blockId={block.id}
        setNumber={setNumber}
        typedMode={null}
        // Fuerza POR LADO (W3.9): `per_side`/`alternating` ⇒ cajas «Izq»/«Der» + un peso.
        sideMode={block.side_mode}
        strengthTimeMode={strengthTime}
        isActive
        heroMode
        exec={exec}
        repsHint={repsHint}
        openKeypadNonce={kbNonce}
        suggestedWeight={suggestedWeightKg ?? null}
        seedValues={seed}
        typedSeedPatch={seedPatch}
        autofill={autofill}
        header={{
          exerciseName: exercise.name,
          objectiveLine: `${block.sets}×${strengthTime ? compactDuration(holdSec) : block.reps}${suggestedWeightKg != null ? ` · ${formatWeightEsCl(suggestedWeightKg)} kg` : ''}`,
          last: bestPrev ? { weightKg: bestPrev.weight_kg ?? null, reps: bestPrev.reps_done ?? null } : null,
        }}
        onDraftChange={(values, fieldIndex) => {
          captureRef.current = values
          onDraftChange(block.id, setNumber, values, fieldIndex)
        }}
        onCommit={commitSet}
        // La rueda kg | reps no aplica al eje tiempo (los segundos los pone el reloj o el keypad).
        onLongPressValue={strengthTime ? undefined : openWheel}
        allowZeroRir
        showEffort={showEffort}
        effortExpanded={effortExpanded}
        onEffortExpandedChange={setEffortExpanded}
      />
    )
  })() : null

  // Filas LOGUEADAS (motor clásico) — sólo dentro del sheet "editar series anteriores" (botón lápiz).
  const loggedRows = Array.from({ length: block.sets }).map((_, i) => {
    const setNumber = i + 1
    const log = blockLogs.find((l) => l.set_number === setNumber)
    if (!log) return null
    const isRecent = recentSet?.blockId === block.id && recentSet?.setNumber === setNumber
    return (
      <SetRow
        key={setNumber}
        setNumber={setNumber}
        log={log}
        isActive={false}
        typedMode={null}
        onPress={() => onOpenSet(setNumber)}
        onRpeUpdate={onRpeUpdate}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        prColor={exec.pr}
        prIntense
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
        showEffort={showEffort}
        // El panel de esfuerzo de la serie ya cerrada es la ÚNICA superficie que queda para corregir un
        // RPE/RIR: debe usar el acento de marca del coach (`exec`) y admitir el RIR 0 ("al fallo"), igual
        // que el hero activo. Sin estas dos props pintaba el azul EVA y la escala arrancaba en 1.
        exec={exec}
        allowZeroRir
      />
    )
  }).filter(Boolean)

  // Peso de la prescripción (resaltado en blanco/bold, mockup `<b>60 kg</b>`). El resto de la línea va en
  // gris. Se muestra sólo si el bloque prescribe peso.
  const rxWeight = block.target_weight_kg != null ? (suggestedWeightKg ?? block.target_weight_kg) : null

  return (
    <MotiView layout={reducedMotion ? undefined : CARD_LAYOUT} style={{ gap: 12 }}>
      {/* Nombre + chip tipo·músculo (+ sustitución) */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 28, color: s.text }}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(typeColor, 0.16), borderColor: hexToRgba(typeColor, 0.34) }}>
            {/* Sin ícono: el mockup y la web pintan el chip tipo·músculo sólo con texto (QA1 §03). */}
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(typeColor, 0.95) }} numberOfLines={1}>
              {typeLabel}
              {exercise.muscle_group ? ` · ${exercise.muscle_group}` : ''}
            </Text>
          </View>
          {/* Chip «Por lado»/«Alternado» en la fila de objetivo (R39): la fuerza nunca entra a
              `TypedTargetGrid`; el rótulo sale del motor (`SIDE_LABEL`), paridad web ExerciseStepV3. */}
          {block.side_mode && SIDE_LABEL[block.side_mode] ? (
            <View style={{ borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(typeColor, 0.16), borderColor: hexToRgba(typeColor, 0.34) }}>
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(typeColor, 0.95) }} numberOfLines={1}>
                {SIDE_LABEL[block.side_mode]}
              </Text>
            </View>
          ) : null}
          {/* Cambiar / Omitir + badges de estado — fila COMPARTIDA con las pantallas tipadas. */}
          <ExerciseActionChips
            exec={exec}
            exerciseName={exercise.name}
            substituted={!!substitution}
            canSubstitute={canSubstitute}
            onOpenSubstitute={onOpenSubstitute}
            onUndoSubstitution={onUndoSubstitution}
            skipped={skipped}
            skipReason={skipReason}
            canSkip={canSkip}
            onOpenSkip={onOpenSkip}
          />
        </View>
      </View>

      {/* MEDIA + chips glass — componente compartido con la superserie (extracción pura, sin motor). */}
      <ExecMediaV3
        exercise={exercise}
        coachNote={coachNote}
        exec={exec}
        reducedMotion={reducedMotion}
        onOpenTechnique={onOpenTechnique}
      />

      {/* Fuerza POR TIEMPO: anillo 130 px DEBAJO del video (V1), en color de marca. A 0 guarda con el
          KG del tile (V2). El predicado R29 lo da `isStrengthTimeBlock`; sin él no se monta nada. */}
      {strengthTime && activeSet != null && holdSec > 0 && (
        <HoldModuleV3
          kind="strength_time"
          size="solo130"
          blockId={block.id}
          setNumber={activeSet}
          prescribedSec={holdSec}
          sideMode={block.side_mode ?? null}
          context="solo"
          closesRound={false}
          // El NONCE de «Repetir» (R8) es lo que devuelve el módulo a `idle` cuando la serie activa no
          // cambia de número: sin él, repetir la serie N dejaría el anillo en «¡Listo!».
          resetKey={`${block.id}:${activeSet}:${repeat != null && repeat.setNumber === activeSet ? `repeat:${repeat.nonce}` : 1}`}
          exec={exec}
          accent={exec.accent}
          accentText={exec.accentText}
          reducedMotion={reducedMotion}
          getCaptureValues={() => captureRef.current}
          onSeed={(values, nonce) => setSeedPatch({ values, nonce })}
          // R2/R4: el `info` del hook YA NO se descarta — trae los `captureGaps` con los que la
          // pantalla decide si abre el teclado, y el `source` distingue reloj de «Listo» para R12.
          onCommit={(payload, source, info) => commitSet(payload, { source, info })}
          saveHold={saveHold}
          restoredHold={restoredHold}
          testIDPrefix="hold-strength"
        />
      )}

      {/* Prescripción compacta + chip de sobrecarga */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, letterSpacing: 0.1, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {block.sets} × {strengthTime ? compactDuration(holdSec) : block.reps}
          {rxWeight != null && (
            <>
              {' · '}
              <Text style={{ fontFamily: FONT.monoBold, color: s.text }}>{rxWeight} kg</Text>
            </>
          )}
          {block.rir ? ` · RIR ${block.rir}` : ''}
          {block.tempo ? ` · tempo ${block.tempo}` : ''}
          {block.rest_time ? ` · desc ${block.rest_time}` : ''}
        </Text>
        {overloadLabel && (
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: hexToRgba(exec.accent, 0.1), borderColor: hexToRgba(exec.accent, 0.3) }}>
            <TrendingUp size={12} color={exec.accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, color: exec.accent }}>{overloadLabel}</Text>
          </View>
        )}
      </View>

      {/* Fila "Anterior — toca para usar" (1-tap prefill de la serie activa). QA5 h4: sólo si la sesión
          previa registró AL MENOS un dato real (peso o reps); si no, no hay fila fantasma de guiones. */}
      {bestPrev && (bestPrev.weight_kg != null || bestPrev.reps_done != null) && (
        <Pressable
          testID="btn-prev-autofill-v3"
          disabled={activeSet == null}
          onPress={() => { if (activeSet != null) setAutofill({ weight: bestPrev.weight_kg, reps: bestPrev.reps_done, nonce: Date.now() }) }}
          accessibilityRole="button"
          accessibilityLabel={activeSet != null && bestPrev.weight_kg ? `Usar la última vez: ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
        >
          {/* css-interop descarta `style` cuando es función (auditoría a1 §2.1): el chrome punteado de
              la fila vive en esta View interna con `style` estático. */}
          {({ pressed }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingHorizontal: 15,
                paddingVertical: 11,
                borderRadius: 14,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: s.borderStrong,
                backgroundColor: pressed && activeSet != null ? hexToRgba(exec.accent, 0.08) : s.surfaceRaised,
                opacity: activeSet == null ? 0.55 : 1,
              }}
            >
              {/* Mockup `.a3a-prev .l`: sólo el rótulo "Anterior" (sin ícono extra). */}
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: prRecent ? exec.pr : s.textMuted }}>Anterior</Text>
              {/* Marca previa: tachada cuando la serie recién cerrada la superó (PR en vivo). */}
              <Text
                style={{
                  fontFamily: FONT.monoBold,
                  fontSize: 14,
                  color: prRecent ? s.textMuted : s.text,
                  fontVariant: ['tabular-nums'],
                  textDecorationLine: prRecent ? 'line-through' : 'none',
                }}
              >
                {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
              </Text>
              {prRecent ? (
                // Flecha arriba dorada + peso que superó la marca (mockup "PR en vivo").
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <ArrowUp size={14} color={exec.pr} strokeWidth={3} />
                  {prNewWeightKg != null && (
                    <Text style={{ fontFamily: FONT.monoBold, fontSize: 14, color: exec.pr, fontVariant: ['tabular-nums'] }}>
                      {prNewWeightKg} kg
                    </Text>
                  )}
                </View>
              ) : activeSet != null ? (
                <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: exec.accent }}>1 tap ↻</Text>
              ) : null}
            </View>
          )}
        </Pressable>
      )}

      {/* Hint "una sola vez" de la captura dual (E2.5): pill sobre la fila de captura. Se apaga al usar
          la rueda (handleWheelDone) o al cerrar la pill. Persistido en AsyncStorage (eva:wheel-hint-v1). */}
      {showWheelHint && (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingLeft: 12, paddingRight: 6, paddingVertical: 8, backgroundColor: hexToRgba(exec.accent, 0.1), borderColor: hexToRgba(exec.accent, 0.3) }}
        >
          <Hand size={14} color={exec.accent} />
          <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 12, color: s.text }} numberOfLines={2}>
            Tap = teclado · Mantén presionado = rueda
          </Text>
          <Pressable
            testID="btn-dismiss-wheel-hint-v3"
            onPress={() => dismissWheelHint()}
            hitSlop={8}
            style={{ height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}
            accessibilityRole="button"
            accessibilityLabel="Entendido, ocultar la ayuda"
          >
            <X size={15} color={s.textMuted} />
          </Pressable>
        </View>
      )}

      {/* HERO de la serie activa (tiles + esfuerzo + CTA "Aplastar serie"). Una serie a la vez (mockup). */}
      {activeHero}

      {/* R7 · línea «Serie N · 60 kg × 8 · 30 s · Editar · Repetir» con la preferencia APAGADA. Con la
          preferencia ON la misma línea vive dentro del interstitial de descanso (`RestInterstitialV3`),
          que es lo que el alumno tiene delante. El texto lo arma `formatStrengthTimeSetLine` tal cual:
          sin reps la línea es «60 kg × 30 s», sin guion inventado (decisión W0.4). */}
      {restOffer?.line && !autoRestEnabled ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: hexToRgba(exec.accent, 0.34),
            backgroundColor: hexToRgba(exec.accent, 0.08),
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: exec.accent }}>
              Serie {restOffer.setNumber}
            </Text>
            <Text
              style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: s.text, marginTop: 2, fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
            >
              {restOffer.line}
            </Text>
          </View>
          <Pressable
            testID="hold-last-set-edit"
            onPress={() => onOpenSet(restOffer.setNumber, { focus: 'reps' })}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Editar la serie ${restOffer.setNumber}`}
          >
            <Pencil size={13} color={exec.accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: exec.accent }}>Editar</Text>
          </Pressable>
          <Pressable
            testID="hold-last-set-repeat"
            onPress={() => startRepeat(restOffer.setNumber)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Repetir la serie ${restOffer.setNumber} desde el reloj`}
          >
            <RotateCcw size={13} color={exec.accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: exec.accent }}>Repetir</Text>
          </Pressable>
        </View>
      ) : null}

      {/* R24: con la preferencia «Pasar solo al descanso» APAGADA, tras cerrar cualquier serie (tocada o
          por reloj) el alumno elige «Descansar N s» o «Siguiente serie». Con la preferencia ON el
          orquestador ya arrancó el descanso y este par no se pinta. */}
      {restOffer && !autoRestEnabled ? (
        <RestOfferV3
          seconds={restOffer.seconds}
          exec={exec}
          reducedMotion={reducedMotion}
          onRest={startOfferedRest}
          onNext={() => setRestOffer(null)}
          testIDPrefix="rest-offer-strength"
        />
      ) : null}

      {/* Pie (mockup `.a3a-foot`): cuadraditos de progreso + "N de M series" · herramientas teclado/lápiz. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {Array.from({ length: block.sets }).map((_, i) => {
            const on = loggedSetNumbers.has(i + 1)
            return (
              <View
                key={i}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  borderWidth: 2,
                  backgroundColor: on ? exec.accent : '#26262f',
                  borderColor: on ? hexToRgba(exec.accent, 0.55) : '#34343f',
                }}
              />
            )
          })}
          {/* Omitido: el pie dice la VERDAD (no "3 de 3 series"). El bloque resuelve el día, pero las
              series que no se entrenaron no se cuentan como hechas. */}
          <Text
            style={{ fontFamily: FONT.uiExtra, fontSize: 12, color: skipped ? EXEC_SKIP_AMBER : s.textMuted, marginLeft: 4, fontVariant: ['tabular-nums'] }}
          >
            {skipped ? 'Omitido' : `${doneCount} de ${block.sets} series`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            testID="btn-foot-keyboard-v3"
            onPress={() => { if (activeSet != null) { haptics.tap(); setKbNonce((n) => n + 1) } }}
            disabled={activeSet == null}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.surfaceRaised, borderWidth: 2, borderColor: s.borderStrong, opacity: activeSet == null ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityLabel="Abrir el teclado para la serie activa"
          >
            <Keyboard size={18} color="#b7b7c2" />
          </Pressable>
          <Pressable
            testID="btn-foot-edit-previous-v3"
            onPress={() => { if (doneCount > 0) { haptics.tap(); setEditPrevOpen(true) } }}
            disabled={doneCount === 0}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.surfaceRaised, borderWidth: 2, borderColor: s.borderStrong, opacity: doneCount === 0 ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityLabel="Editar las series ya registradas"
          >
            <Pencil size={16} color="#b7b7c2" />
          </Pressable>
        </View>
      </View>

      {/* Sheet oscuro "Editar series anteriores" (botón lápiz): monta las filas CLÁSICAS del motor (SetRow)
          para corregir series ya guardadas — motor de edición existente, sólo envuelto en el sheet V3. */}
      <Sheet open={editPrevOpen} onClose={() => setEditPrevOpen(false)} title="Editar series anteriores" nativeModal forceDark snapPoints={['60%']}>
        <View style={{ gap: 6, paddingVertical: 4 }}>
          {loggedRows.length > 0 ? (
            loggedRows
          ) : (
            <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: s.textMuted, textAlign: 'center', paddingVertical: 12 }}>
              Todavía no registras ninguna serie de este ejercicio.
            </Text>
          )}
        </View>
      </Sheet>

      {/* Rueda dual kg | reps (E2.5) — produce (peso, reps) y los entrega por el autofill de la serie
          activa. El guardado sigue siendo el CTA normal de la fila (motor intocable). */}
      <DualWheelPicker
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        setNumber={activeSet ?? 1}
        exerciseName={exercise.name}
        totalSets={block.sets}
        kgAnchor={wheelAnchors.kg}
        repsAnchor={wheelAnchors.reps}
        exec={exec}
        reducedMotion={reducedMotion}
        onDone={handleWheelDone}
      />
    </MotiView>
  )
}
