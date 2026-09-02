/**
 * Hooks de conteo del ejecutor V3 (E3.2/E3.3/E3.4) — MISMA disciplina que los timers existentes
 * (`HoldTimer` / `IntervalTimer` / `StopwatchTimer`): tiempo objetivo por `endTime` (no acumulando
 * ticks), tick de 250 ms, re-sincronización al volver de background vía `AppState`, y disparo ÚNICO del
 * evento de fin (`firedRef`). Presentación NUEVA (anillo grande / contador / fases in-body), CUENTA
 * INTACTA: son los mismos algoritmos background-safe, extraídos como hooks para que las pantallas V3
 * los pinten a su manera. NO tocan guardado/cola (eso es el flujo tipado del engine) ni los timers
 * overlay del `WorkoutTimerProvider` (que ExecutorV2 sigue usando sin cambios).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { isManualPhase, type CardioSegmentReason, type IntervalPhase } from '@eva/workout-engine'

// ─── Cuenta regresiva (hold de movilidad · countdown de cardio) ──────────────────────────────────
export interface CountdownApi {
  /** Segundos restantes (entero, clampeado a 0). */
  remaining: number
  /** ¿Corriendo? (pausable). */
  running: boolean
  /** ¿Alguna vez arrancó? (distingue "sin iniciar" de "pausado" para el label del botón). */
  started: boolean
  /** true una vez que llegó a 0. */
  done: boolean
  /** Fracción transcurrida [0,1] contra el objetivo actual. */
  progress: number
  /** Pausa/reanuda. */
  toggle: () => void
  /** Reinicia (opcionalmente con un objetivo nuevo) y vuelve a correr. */
  restart: (seconds?: number) => void
}

/**
 * Cuenta regresiva background-safe. `onDone` se dispara UNA vez al llegar a 0 (identidad estable vía
 * ref → cambiarla no re-arma el timer). El objetivo vive en un ref para que `restart(s)` pueda cambiarlo
 * (secuencia de lados en movilidad). Mirror de `HoldTimer` (endTime + 250 ms + AppState + firedRef).
 */
export function useCountdown(seconds: number, onDone?: () => void, autoStart = true): CountdownApi {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(autoStart)
  const [started, setStarted] = useState(autoStart)
  // `target` en estado (no ref) para computar `progress` sin leer refs en render; `targetRef` refleja el
  // mismo valor para lecturas imperativas dentro de `restart` (callback, permitido).
  const [target, setTarget] = useState(seconds)
  const targetRef = useRef(seconds)
  const endRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  const triggerDone = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    endRef.current = null
    setRunning(false)
    onDoneRef.current?.()
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (running && remaining > 0) {
      if (!endRef.current) endRef.current = Date.now() + remaining * 1000
      interval = setInterval(() => {
        if (!endRef.current) return
        const next = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
        setRemaining(next)
        if (next === 0) triggerDone()
      }, 250)
    } else if (!running) {
      endRef.current = null
    }
    return () => clearInterval(interval)
  }, [running, remaining, triggerDone])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !endRef.current) return
      const rem = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
      setRemaining(rem)
      if (rem === 0) triggerDone()
    })
    return () => sub.remove()
  }, [triggerDone])

  const toggle = useCallback(() => {
    setStarted(true)
    setRunning((v) => !v)
  }, [])
  const restart = useCallback((next?: number) => {
    if (next != null) targetRef.current = next
    firedRef.current = false
    endRef.current = null
    setTarget(targetRef.current)
    setRemaining(targetRef.current)
    setStarted(true)
    setRunning(true)
  }, [])

  const done = remaining <= 0
  const progress = target > 0 ? Math.min(1, Math.max(0, (target - remaining) / target)) : 0
  return { remaining, running, started, done, progress, toggle, restart }
}

// ─── Cronómetro count-up (roller opcional · cardio por distancia) ─────────────────────────────────
export interface StopwatchApi {
  /** Segundos transcurridos (entero). */
  elapsed: number
  /** ¿Corriendo? */
  running: boolean
  /** ¿Alguna vez arrancó? (para saber si hubo duración que capturar). */
  started: boolean
  /** Pausa/reanuda (arranca si nunca partió). */
  toggle: () => void
  /** Reinicia a 0 y detiene. */
  reset: () => void
  /**
   * ADOPCIÓN EXACTA de lo transcurrido (pausa/reanudación hechas desde la notificación del
   * lockscreen): fija el acumulador al valor CONGELADO por el handler headless y deja el reloj
   * corriendo o detenido, sin contar el tiempo que el bloque estuvo pausado. Aditivo: `toggle`/`reset`
   * conservan su semántica. Único consumidor: el drenaje de `use-cardio-live-timer`.
   */
  adopt: (elapsedSec: number, running: boolean) => void
}

/**
 * Cronómetro count-up background-safe. Mirror de `StopwatchTimer` (startRef + accumulated + 250 ms).
 *
 * QA4 h5: el efecto NO puede depender de `elapsed` — si lo hace, cada tick re-arma el intervalo y pisa
 * `startRef` con `Date.now()`, dejando el reloj atrapado entre 0:00 y 0:01 (y guardando duraciones
 * basura en roller). La acumulación del tramo corrido vive en `toggle` (igual que `StopwatchTimer`),
 * nunca en el efecto.
 */
export function useStopwatch(autoStart = false): StopwatchApi {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(autoStart)
  const [started, setStarted] = useState(autoStart)
  const startRef = useRef(0)
  const accumulatedRef = useRef(0)
  // Espejo del transcurrido para lecturas imperativas (sin leer estado stale en callbacks).
  const elapsedRef = useRef(0)
  const runningRef = useRef(autoStart)

  const recompute = useCallback(() => {
    const next = accumulatedRef.current + Math.floor((Date.now() - startRef.current) / 1000)
    elapsedRef.current = next
    setElapsed(next)
  }, [])

  useEffect(() => {
    if (!running) return
    startRef.current = Date.now()
    const interval = setInterval(recompute, 250)
    return () => clearInterval(interval)
  }, [running, recompute])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && running) recompute()
    })
    return () => sub.remove()
  }, [running, recompute])

  const toggle = useCallback(() => {
    if (runningRef.current) {
      // Pausando: congela lo transcurrido del tramo en curso (se pierde la fracción de segundo, igual
      // que el timer overlay y que la web — deliberado).
      accumulatedRef.current += Math.floor((Date.now() - startRef.current) / 1000)
      elapsedRef.current = accumulatedRef.current
      setElapsed(accumulatedRef.current)
    }
    runningRef.current = !runningRef.current
    setStarted(true)
    setRunning(runningRef.current)
  }, [])
  const reset = useCallback(() => {
    accumulatedRef.current = 0
    elapsedRef.current = 0
    startRef.current = Date.now()
    runningRef.current = false
    setElapsed(0)
    setRunning(false)
    setStarted(false)
  }, [])
  /**
   * Adopta un transcurrido EXACTO. Toca los refs a mano (jamás el efecto — QA4 h5: el efecto no puede
   * depender de `elapsed`): el acumulador pasa a ser el valor adoptado y el tramo en curso arranca
   * AHORA, así el intervalo vivo sigue calculando `accumulated + (now - start)` desde ese punto.
   * Cuando ya venía corriendo, `setRunning(true)` no re-arma el efecto y este `startRef` es el que
   * queda vigente; cuando venía detenido, el efecto lo re-escribe en el mismo instante (delta nulo).
   */
  const adopt = useCallback((elapsedSec: number, nextRunning: boolean) => {
    const next = Math.max(0, Math.round(elapsedSec))
    accumulatedRef.current = next
    elapsedRef.current = next
    startRef.current = Date.now()
    runningRef.current = nextRunning
    setElapsed(next)
    setStarted(true)
    setRunning(nextRunning)
  }, [])

  return { elapsed, running, started, toggle, reset, adopt }
}

// ─── Runner de fases de intervalo (cardio con interval_config) ────────────────────────────────────
export interface IntervalRunnerApi {
  phaseIndex: number
  phase: IntervalPhase | null
  remaining: number
  running: boolean
  /** ¿Alguna vez arrancó? (distingue "sin iniciar" de "pausado" para el label del botón). */
  started: boolean
  finished: boolean
  /** ¿La fase actual espera avance MANUAL (prescrita por distancia)? */
  isManual: boolean
  /** Fracción transcurrida de la fase actual [0,1]. */
  phaseProgress: number
  toggle: () => void
  /** Salta a la fase siguiente (o termina si es la última). */
  skip: () => void
  /** Avance explícito del alumno ("Fase siguiente"); deja corriendo la fase siguiente si es por tiempo. */
  next: () => void
  /** Reinicia la secuencia desde la primera fase y vuelve a correr (QA5 h3). */
  restart: () => void
  /**
   * ADOPCIÓN EXACTA del restante de la fase EN CURSO (pausa/reanudación hechas desde la notificación
   * del lockscreen): fija `remaining` y re-ancla el fin absoluto de ESA fase, sin mover `phaseIndex`
   * ni disparar `onPhaseChange`/`onFinish`. Aditivo: `toggle`/`skip`/`next`/`restart` no cambian.
   * Único consumidor: el drenaje de `use-cardio-live-timer`.
   */
  adoptRemaining: (seconds: number, running: boolean) => void
}

/**
 * Corre una secuencia de `IntervalPhase[]` (del engine `buildIntervalSequence`). Mirror EXACTO de
 * `IntervalTimer`: avanza fase a fase por `endTime`, dispara `onPhaseChange` en cada cambio y
 * `onFinish` al terminar (para que la pantalla emita el cue háptico/flash). Background-safe.
 *
 * Fase D (G2/RF7): una fase `manual` (paso por DISTANCIA) NO se cronometra — el reloj se detiene ahí
 * hasta que el alumno confirma con "Fase siguiente". Las fases por tiempo de la misma secuencia
 * (warmup, recuperaciones, cooldown) cuentan como siempre.
 */
/** Razones de fin de TRAMO que puede emitir el corredor (el resto las decide el consumidor). */
export type IntervalSegmentReason = Extract<CardioSegmentReason, 'expired' | 'manual-next' | 'skipped'>

export function useIntervalRunner(
  phases: IntervalPhase[],
  opts?: {
    onPhaseChange?: () => void
    onFinish?: () => void
    autoStart?: boolean
    /**
     * Fin de TRAMO (hallazgo E · auto-registro de cardio): avisa QUÉ fase terminó y POR QUÉ, ANTES de
     * mover el índice, para que la pantalla decida si ese tramo cierra la ronda de captura. Se emite
     * una sola vez por avance, también en la rama de fin de secuencia. No reemplaza a
     * `onPhaseChange`/`onFinish` (que siguen alimentando flash y hápticos).
     */
    onSegmentEnd?: (e: { reason: IntervalSegmentReason; phaseIndex: number }) => void
  },
): IntervalRunnerApi {
  // QA4 h8a: default `false` = paridad con el web (`useIntervalRunner.ts`, `isActive` inicial false).
  // El alumno arranca la secuencia con un toque; nada corre solo al abrir la pantalla.
  const autoStart = opts?.autoStart ?? false
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remaining, setRemaining] = useState(phases[0]?.durationSec ?? 0)
  const [running, setRunning] = useState(autoStart)
  const [started, setStarted] = useState(autoStart)
  const [finished, setFinished] = useState(phases.length === 0)
  const endRef = useRef<number | null>(null)
  const phaseIndexRef = useRef(0)
  const onPhaseChangeRef = useRef(opts?.onPhaseChange)
  const onFinishRef = useRef(opts?.onFinish)
  const onSegmentEndRef = useRef(opts?.onSegmentEnd)
  useEffect(() => {
    onPhaseChangeRef.current = opts?.onPhaseChange
    onFinishRef.current = opts?.onFinish
    onSegmentEndRef.current = opts?.onSegmentEnd
  })

  const isManual = isManualPhase(phases[phaseIndex] ?? null)

  const advance = useCallback((reason: IntervalSegmentReason) => {
    onSegmentEndRef.current?.({ reason, phaseIndex: phaseIndexRef.current })
    const next = phaseIndexRef.current + 1
    if (next >= phases.length) {
      setFinished(true)
      setRunning(false)
      endRef.current = null
      onFinishRef.current?.()
      return
    }
    phaseIndexRef.current = next
    setPhaseIndex(next)
    setRemaining(phases[next].durationSec)
    // Una fase manual (por distancia) no tiene fin programado: espera el toque del alumno.
    endRef.current = isManualPhase(phases[next]) ? null : Date.now() + phases[next].durationSec * 1000
    onPhaseChangeRef.current?.()
  }, [phases])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (running && !finished && !isManual) {
      if (!endRef.current) endRef.current = Date.now() + remaining * 1000
      interval = setInterval(() => {
        if (!endRef.current) return
        const next = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
        setRemaining(next)
        if (next === 0) advance('expired')
      }, 250)
    } else if (!running) {
      endRef.current = null
    }
    return () => clearInterval(interval)
  }, [running, finished, phaseIndex, remaining, advance, isManual])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !endRef.current || finished) return
      const rem = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
      setRemaining(rem)
      if (rem === 0) advance('expired')
    })
    return () => sub.remove()
  }, [advance, finished])

  const toggle = useCallback(() => {
    setStarted(true)
    setRunning((v) => !v)
  }, [])
  const skip = useCallback(() => advance('skipped'), [advance])
  /** CTA "Fase siguiente" de las fases por distancia: avanza y deja corriendo la fase siguiente. */
  const next = useCallback(() => {
    if (finished) return
    const isLast = phaseIndexRef.current + 1 >= phases.length
    endRef.current = null
    // `started`/`running` ANTES de emitir el fin del tramo: el consumidor arranca su reloj de pared
    // con este primer gesto (paridad con el runner web), y si el aviso llegara antes la ronda se
    // cerraría con 0 s. La pantalla además avisa `onRunningChange(true)` imperativamente, porque
    // estos `setState` recién se ven en el render siguiente.
    setStarted(true)
    if (!isLast) setRunning(true)
    advance('manual-next')
  }, [finished, advance, phases.length])
  const restart = useCallback(() => {
    phaseIndexRef.current = 0
    endRef.current = null
    setPhaseIndex(0)
    setRemaining(phases[0]?.durationSec ?? 0)
    setFinished(phases.length === 0)
    setStarted(true)
    setRunning(true)
  }, [phases])
  /**
   * Adopta un restante EXACTO en la fase actual. El fin absoluto se re-ancla ACÁ y no en el efecto:
   * el efecto sólo lo crea cuando está vacío (`if (!endRef.current)`), así que dejarlo escrito es
   * justamente lo que impide que el tiempo pausado desde el lockscreen se cuente como corrido.
   * Terminado o en una fase por DISTANCIA no hay cuenta que adoptar (ese tramo lo cierra el alumno).
   */
  const adoptRemaining = useCallback(
    (seconds: number, nextRunning: boolean) => {
      if (finished || isManual) return
      const next = Math.max(0, Math.round(seconds))
      endRef.current = nextRunning && next > 0 ? Date.now() + next * 1000 : null
      setRemaining(next)
      setStarted(true)
      setRunning(nextRunning)
    },
    [finished, isManual],
  )

  const phase = phases[phaseIndex] ?? null
  // Fase manual ⇒ progreso 0 (anillo lleno y estático: no hay cuenta que drenar).
  const phaseProgress = !isManual && phase && phase.durationSec > 0 ? (phase.durationSec - remaining) / phase.durationSec : 0
  return { phaseIndex, phase, remaining, running, started, finished, isManual, phaseProgress, toggle, skip, next, restart, adoptRemaining }
}
