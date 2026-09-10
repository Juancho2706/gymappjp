/**
 * Módulo de HOLD del ejecutor V3 (specs/cuenta-atras-en-pantalla, W3.2) — la CAPA DE ESTADO del
 * reloj de movilidad y de fuerza por tiempo. `HoldModuleV3` (UI) consume este hook tal cual: acá no
 * se pinta nada.
 *
 * ── QUÉ HACE Y QUÉ NO ─────────────────────────────────────────────────────────
 * COMPONE tres piezas que ya existen y no re-implementa ninguna:
 *   · `useCountdown` (`timing.ts`) — la cuenta background-safe, con `prime`/`endAtMs` de R27;
 *   · `holdSidesFor(sideMode)` del motor (R34) — la ÚNICA regla de lados del eje tiempo;
 *   · `decideHoldAutolog` del motor (W1.1) — la decisión de qué se rellena, qué se envía, qué marca
 *     de fuente lleva y si el ejecutor avanza.
 * El payload lo arma SIEMPRE el motor (`buildTypedPayload` / `buildStrengthTimePayload`), nunca este
 * hook a mano, y el contexto viaja como OBJETO `{ sideMode, holdSource }`: con el `sideMode` suelto
 * del 3.er argumento histórico `hold_source` NO llega al jsonb (W1.3b) y los holds de movilidad
 * saldrían sin marca.
 *
 * **Este hook NUNCA arranca descansos** ni llama `startRest`: entrega la decisión por `onCommit` y
 * es el orquestador (`ExecutorV3`) el que aplica la preferencia D5 (ON ⇒ `startRest`, OFF ⇒ CTA).
 *
 * ── INVARIANTES ──────────────────────────────────────────────────────────────
 *  · A1/R21: `autoStart` es SIEMPRE `false`. Nada corre solo al abrir una pantalla; el primer lado
 *    lo arranca el alumno (`MobilityScreenV3.tsx:141` es el precedente).
 *  · R6/R27: el lado 2 se ARMA con `prime(seconds)` y arranca solo **solo si `!expiredWhileAway`**.
 *    Con el hold vencido en background queda en «Iniciar lado derecho», no corriendo con datos
 *    falsos.
 *  · Un envío por serie: `sentSetsRef` por `block:set:side`, calco de `CardioScreenV3.tsx:364`.
 *  · La siembra de la fila va por `onSeed(values, nonce)` → `typedSeedPatch` (`SetRow.tsx:894-901`),
 *    **nunca** por `seedValues`: eso remonta la fila y cierra el keypad abierto a mitad de escritura
 *    (comentario explícito en `CardioScreenV3.tsx:610`).
 *  · La mezcla de captura es UNA sola (`mergeHoldCaptureValues`): la semilla de la fila y el payload
 *    del auto-envío salen del mismo objeto. En `per_side` el envío ocurre al cerrar el DERECHO y
 *    tiene que llevar el izquierdo sembrado un minuto antes.
 *  · R29: el hook asume `prescribedSec > 0` (el predicado de montaje lo garantiza la pantalla). El
 *    aviso del SO además exige `prescribedSec >= HOLD_NOTIF_MIN_SEC` — el piso vive en
 *    `hold-notification.ts`, no acá.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  buildStrengthTimePayload,
  buildTypedPayload,
  createHoldElapsed,
  decideHoldAutolog,
  holdSidesFor,
  mergeHoldCaptureValues,
  pauseHoldElapsed,
  readHoldElapsed,
  startHoldElapsed,
  type HoldAdvance,
  type HoldContext,
  type HoldElapsedState,
  type HoldEndReason,
  type HoldSide,
  type HoldSource,
  type OptimisticLogPayload,
} from '@eva/workout-engine'
import { captureAppEvent } from '../../../../lib/analytics'
import { timerHaptics } from '../../../../lib/haptics'
import {
  cancelHoldEndNotification,
  dismissHoldEndNotification,
  scheduleHoldEndNotification,
  sweepHoldNotifications,
} from '../timers/hold-notification'
import { useCountdown } from './timing'

/** Los DOS ejes con reloj de este tren. El roller queda FUERA (R12). */
export type HoldModuleKind = 'mobility' | 'strength_time'

/**
 * `exercise_type` de los eventos de PostHog (DATA-TESTING §8.1): el eje del tren tiene DOS `kind`
 * pero la serie se lee en dos categorías — `mobility` y `strength`. Mismo mapeo que la web
 * (`v3/HoldModuleV3.tsx`): si cambia acá, cambia allá o el insight queda partido.
 */
function eventExerciseType(kind: HoldModuleKind): 'mobility' | 'strength' {
  return kind === 'mobility' ? 'mobility' : 'strength'
}

/**
 * Estado visible del módulo. `done` = la serie ya se envió — el anillo pasa a «¡Listo!». `paused`
 * cubre tanto la pausa del alumno como la SUSPENSIÓN por descanso de grupo.
 */
export type HoldModuleStatus = 'idle' | 'running' | 'paused' | 'done'

/** Info que acompaña al commit: la UI la usa para el CueBar (R23) y el orquestador para D2/V4. */
export interface HoldCommitInfo {
  side: HoldSide
  closesRound: boolean
  expiredWhileAway: boolean
  advance: HoldAdvance
}

export interface UseHoldModuleArgs {
  kind: HoldModuleKind
  blockId: string
  setNumber: number
  /** `duration_sec` prescrito. **Siempre > 0**: el predicado de montaje R29 lo garantiza. */
  prescribedSec: number
  sideMode: string | null
  /** Pantalla sola (V3) o miembro de una superserie (V4). */
  context: HoldContext
  /** Esta serie CIERRA la ronda de la superserie (D2). */
  closesRound: boolean
  /**
   * `${blockId}:${setNumber}:${round}`. Al cambiar, el módulo vuelve a `idle` y la secuencia de
   * lados arranca de cero (cambio de serie, de miembro activo o de ronda).
   */
  resetKey: string
  /** Descanso de grupo corriendo ⇒ pausa FORZADA, sin decisión del motor (no rellena ni envía). */
  suspended?: boolean
  /** Lo tipeado HOY en la fila del alumno: base de `mergeHoldCaptureValues`. */
  getCaptureValues: () => Record<string, string>
  /** Siembra de la fila por `typedSeedPatch` (nonce), NUNCA por `seedValues`. */
  onSeed: (values: Record<string, string>, nonce: number) => void
  /** Auto-envío (V2). El payload ya viene armado por el motor. */
  onCommit: (payload: OptimisticLogPayload, source: HoldSource, info: HoldCommitInfo) => void
  /** Cambio de lado: `autoStarted` = el lado 2 arrancó solo (foreground) o quedó armado (R6). */
  onSideChange?: (side: HoldSide, autoStarted: boolean) => void
}

export interface UseHoldModuleApi {
  status: HoldModuleStatus
  side: HoldSide
  sides: HoldSide[]
  remaining: number
  total: number
  endAtMs: number | null
  started: boolean
  running: boolean
  /** El último fin natural ocurrió con la app FUERA (R6/R27). */
  expiredWhileAway: boolean
  start(): void
  pause(): void
  resume(): void
  doneEarly(): void
  remeasure(): void
  /**
   * CA-90: «Listo» desde `idle` — siembra el OBJETIVO en la caja del lado en curso y NO envía (el
   * alumno confirma con su botón, como hoy en movilidad). En `per_side` deja armado el derecho.
   */
  seedObjective(): void
}

export function useHoldModule(args: UseHoldModuleArgs): UseHoldModuleApi {
  const { prescribedSec, sideMode, resetKey, suspended = false } = args

  const sides = useMemo(() => holdSidesFor(sideMode), [sideMode])
  const [sideIdx, setSideIdx] = useState(0)
  const [finished, setFinished] = useState(false)
  const [expiredWhileAway, setExpiredWhileAway] = useState(false)
  const side: HoldSide = sides[sideIdx] ?? 'single'

  // ── Refs de lectura imperativa (los callbacks del reloj se congelan en el primer render) ────────
  const argsRef = useRef(args)
  const sidesRef = useRef(sides)
  const sideIdxRef = useRef(0)
  useEffect(() => {
    argsRef.current = args
    sidesRef.current = sides
  })
  // Acumulador de reloj de PARED del lado en curso (el mismo de cardio, re-exportado por el motor):
  // sobrevive a la app en background porque no depende de que hayan corrido ticks.
  const elapsedRef = useRef<HoldElapsedState>(createHoldElapsed())
  // Anti-doble-envío por `block:set:side` (calco de `CardioScreenV3.tsx:364`): una fila se
  // auto-registra UNA vez; el alumno siempre puede corregirla después.
  const sentSetsRef = useRef<Set<string>>(new Set())
  // Última mezcla sembrada: es la BASE del merge del lado siguiente. Sin esto, en `per_side` el envío
  // del derecho perdería el izquierdo si la fila todavía no propagó el patch.
  const seededRef = useRef<Record<string, string>>({})
  // `finish` fresco para el `onDone` del reloj, que se congela en el primer render del hook.
  const finishRef = useRef<(reason: HoldEndReason, away?: boolean) => void>(() => {})
  // `hold_timer_started` es UNO por serie (W6.1): lo emite el arranque del PRIMER lado. Ni el lado 2
  // —que arranca solo o queda armado— ni un «Reanudar» tras la pausa vuelven a emitirlo. Se limpia
  // con `resetKey`, que es exactamente «otra serie / otro miembro / otra ronda».
  const startedEventRef = useRef(false)

  const countdown = useCountdown(
    prescribedSec,
    (e) => finishRef.current('expired', e.expiredWhileAway),
    false,
  )
  const countdownRef = useRef(countdown)
  useEffect(() => {
    countdownRef.current = countdown
  })

  /** Cancela + retira el aviso del SO. Se llama en TODA salida del estado `running` (tabla W3.6). */
  const killNotif = useCallback(() => {
    void cancelHoldEndNotification()
    void dismissHoldEndNotification()
  }, [])

  // ── Fin del hold (cualquier razón) — el motor decide, el hook aplica ────────────────────────────
  const finish = useCallback(
    (reason: HoldEndReason, awayFromCountdown?: boolean) => {
      const a = argsRef.current
      const now = Date.now()
      // `expired` es el único fin que puede llegar con la app fuera, y la señal la deriva
      // `triggerDone` de `timing.ts` con la EVIDENCIA (`expiredWhileAwayFrom`), no con el emisor. El
      // resto de las razones son gestos del alumno EN pantalla.
      const away = reason === 'expired' ? awayFromCountdown === true : false
      // Sólo la PAUSA congela el acumulador; el vencimiento se lee en vivo (reloj de pared ⇒ correcto
      // aunque el teléfono haya estado bloqueado).
      const stopped = reason === 'paused' ? pauseHoldElapsed(elapsedRef.current, now) : elapsedRef.current
      elapsedRef.current = stopped
      const elapsedSec = readHoldElapsed(stopped, now)
      const currentSide: HoldSide = sidesRef.current[sideIdxRef.current] ?? 'single'
      const decision = decideHoldAutolog({
        reason,
        elapsedSec,
        prescribedSec: a.prescribedSec,
        side: currentSide,
        context: a.context,
        closesRound: a.closesRound,
        expiredWhileAway: away,
      })
      setExpiredWhileAway(away)
      killNotif()

      // Háptica de 0 en FOREGROUND (W3.8/R31): «vibra y avisa», nunca «suena». Con la app fuera el
      // canal es la notificación local, no la vibración (el JS puede estar congelado).
      if (reason === 'expired' && !away && AppState.currentState === 'active') timerHaptics.holdDone()

      // (1) Rellenar la caja del lado que se cerró — MISMA mezcla que el payload.
      let values = seededRef.current
      if (decision.fillSeconds != null) {
        values = mergeHoldCaptureValues({
          restored: seededRef.current,
          typed: a.getCaptureValues(),
          holdSec: decision.fillSeconds,
          side: currentSide,
        })
        seededRef.current = values
        a.onSeed(values, now)
      }

      // (2) Auto-envío (V2) — una vez por `block:set:side`.
      const sentKey = `${a.blockId}:${a.setNumber}:${currentSide}`
      if (decision.submit && !sentSetsRef.current.has(sentKey)) {
        sentSetsRef.current.add(sentKey)
        const source: HoldSource = decision.holdSource ?? 'manual'
        const ctx = { sideMode: a.sideMode, holdSource: source }
        const payload =
          a.kind === 'strength_time'
            ? buildStrengthTimePayload(values, a.blockId, a.setNumber, ctx)
            : buildTypedPayload('mobility', values, a.blockId, a.setNumber, ctx)
        setFinished(true)
        // Analítica del cierre (W6.1 / DATA-TESTING §8.1) — UNO por SERIE, no por lado: en `per_side`
        // este bloque sólo corre al cerrar el derecho. `via_app_state` conserva el nombre canónico de
        // R19 pero su valor es el `expiredWhileAway` de R27 (SPEC CA-08d). Sin PII: sólo ids y enums.
        if (source === 'timer') {
          captureAppEvent('hold_timer_completed', {
            block_id: a.blockId,
            exercise_type: eventExerciseType(a.kind),
            context: a.context,
            hold_source: source,
            closes_round: a.closesRound,
            via_app_state: away,
          })
        } else {
          captureAppEvent('hold_early_finished', {
            block_id: a.blockId,
            exercise_type: eventExerciseType(a.kind),
            context: a.context,
            // Lo que efectivamente se guarda (`min(elapsed, prescribed)`), no el reloj de pared crudo.
            elapsed_sec: decision.fillSeconds ?? Math.round(elapsedSec),
            prescribed_sec: a.prescribedSec,
          })
        }
        a.onCommit(payload, source, {
          side: currentSide,
          closesRound: a.closesRound,
          expiredWhileAway: away,
          advance: decision.advance,
        })
      }

      // (3) Lado siguiente: se ARMA siempre y sólo arranca solo en foreground (R6/R27).
      if (decision.advanceSide) {
        const nextIdx = sideIdxRef.current + 1
        const nextSide: HoldSide = sidesRef.current[nextIdx] ?? currentSide
        sideIdxRef.current = nextIdx
        setSideIdx(nextIdx)
        elapsedRef.current = createHoldElapsed()
        if (decision.autoStartNextSide) {
          elapsedRef.current = startHoldElapsed(elapsedRef.current, Date.now())
          countdownRef.current.restart(a.prescribedSec)
          void scheduleHoldEndNotification(a.prescribedSec)
        } else {
          countdownRef.current.prime(a.prescribedSec)
        }
        a.onSideChange?.(nextSide, decision.autoStartNextSide)
      }
    },
    [killNotif],
  )
  useEffect(() => {
    finishRef.current = finish
  })

  // ── Reset por serie / miembro / ronda (`resetKey`) ──────────────────────────────────────────────
  useEffect(() => {
    sideIdxRef.current = 0
    setSideIdx(0)
    setFinished(false)
    setExpiredWhileAway(false)
    elapsedRef.current = createHoldElapsed()
    seededRef.current = {}
    startedEventRef.current = false
    countdownRef.current.prime(argsRef.current.prescribedSec)
    killNotif()
  }, [resetKey, killNotif])

  // Barrido de programadas huérfanas al montar + limpieza al desmontar (reglas (d) y de desmontaje).
  useEffect(() => {
    void sweepHoldNotifications()
    return () => {
      void cancelHoldEndNotification()
      void dismissHoldEndNotification()
    }
  }, [])

  // ── Suspensión por descanso de grupo: pausa FORZADA, sin decisión del motor ─────────────────────
  const wasSuspendedRef = useRef(false)
  useEffect(() => {
    if (suspended && !wasSuspendedRef.current) {
      wasSuspendedRef.current = true
      if (countdownRef.current.running) {
        elapsedRef.current = pauseHoldElapsed(elapsedRef.current, Date.now())
        countdownRef.current.toggle()
      }
      killNotif()
      return
    }
    if (!suspended) wasSuspendedRef.current = false
  }, [suspended, killNotif])

  // ── Últimos ~2 s y vuelta a foreground ⇒ cancelar el aviso ──────────────────────────────────────
  // Sin esto el handler global (`push.ts:86-95`) pinta —y suena— la notificación con la app abierta.
  useEffect(() => {
    if (countdown.running && countdown.remaining > 0 && countdown.remaining <= 2) {
      void cancelHoldEndNotification()
    }
  }, [countdown.running, countdown.remaining])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      void cancelHoldEndNotification()
      void dismissHoldEndNotification()
    })
    return () => sub.remove()
  }, [])

  // ── Controles ──────────────────────────────────────────────────────────────────────────────────
  /** Arranca (o reanuda) el lado en curso. `resume` es el MISMO camino: no hay dos reglas. */
  const start = useCallback(() => {
    if (countdownRef.current.running) return
    if (!startedEventRef.current) {
      startedEventRef.current = true
      const a = argsRef.current
      captureAppEvent('hold_timer_started', {
        block_id: a.blockId,
        exercise_type: eventExerciseType(a.kind),
        context: a.context,
        side_mode: a.sideMode,
      })
    }
    elapsedRef.current = startHoldElapsed(elapsedRef.current, Date.now())
    countdownRef.current.toggle()
    void scheduleHoldEndNotification(countdownRef.current.remaining)
  }, [])

  const pause = useCallback(() => {
    if (!countdownRef.current.running) return
    countdownRef.current.toggle()
    // `paused` rellena la caja con lo transcurrido y NADA más (no envía, no avanza de lado).
    finish('paused')
  }, [finish])

  const doneEarly = useCallback(() => {
    if (countdownRef.current.running) countdownRef.current.toggle()
    finish('done-early')
  }, [finish])

  /**
   * «Re-medir» (el ESTADO homónimo del diagrama de SPEC §7; el miembro del enum del motor sigue
   * llamándose `'restart'`): el reloj vuelve al objetivo y la caja NO se reescribe. Lo ya GUARDADO
   * no se borra — `sentSetsRef` conserva el candado del envío.
   */
  const remeasure = useCallback(() => {
    elapsedRef.current = createHoldElapsed()
    countdownRef.current.prime(argsRef.current.prescribedSec)
    setFinished(false)
    setExpiredWhileAway(false)
    killNotif()
    finish('restart')
  }, [finish, killNotif])

  const seedObjective = useCallback(() => {
    if (countdownRef.current.running) return
    const a = argsRef.current
    const now = Date.now()
    const currentSide: HoldSide = sidesRef.current[sideIdxRef.current] ?? 'single'
    const values = mergeHoldCaptureValues({
      restored: seededRef.current,
      typed: a.getCaptureValues(),
      holdSec: a.prescribedSec,
      side: currentSide,
    })
    seededRef.current = values
    a.onSeed(values, now)
    if (currentSide === 'left') {
      const nextIdx = sideIdxRef.current + 1
      const nextSide: HoldSide = sidesRef.current[nextIdx] ?? currentSide
      sideIdxRef.current = nextIdx
      setSideIdx(nextIdx)
      elapsedRef.current = createHoldElapsed()
      countdownRef.current.prime(a.prescribedSec)
      a.onSideChange?.(nextSide, false)
    }
  }, [])

  const status: HoldModuleStatus = finished
    ? 'done'
    : suspended
      ? 'paused'
      : countdown.running
        ? 'running'
        : countdown.started
          ? 'paused'
          : 'idle'

  return {
    status,
    side,
    sides,
    remaining: countdown.remaining,
    total: prescribedSec,
    endAtMs: countdown.endAtMs,
    started: countdown.started,
    running: countdown.running,
    expiredWhileAway,
    start,
    pause,
    resume: start,
    doneEarly,
    remeasure,
    seedObjective,
  }
}
