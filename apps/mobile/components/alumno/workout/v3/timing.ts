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
import type { IntervalPhase } from '@eva/workout-engine'

// ─── Cuenta regresiva (hold de movilidad · countdown de cardio) ──────────────────────────────────
export interface CountdownApi {
  /** Segundos restantes (entero, clampeado a 0). */
  remaining: number
  /** ¿Corriendo? (pausable). */
  running: boolean
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

  const toggle = useCallback(() => setRunning((v) => !v), [])
  const restart = useCallback((next?: number) => {
    if (next != null) targetRef.current = next
    firedRef.current = false
    endRef.current = null
    setTarget(targetRef.current)
    setRemaining(targetRef.current)
    setRunning(true)
  }, [])

  const done = remaining <= 0
  const progress = target > 0 ? Math.min(1, Math.max(0, (target - remaining) / target)) : 0
  return { remaining, running, done, progress, toggle, restart }
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
}

/** Cronómetro count-up background-safe. Mirror de `StopwatchTimer` (startRef + accumulated + 250 ms). */
export function useStopwatch(autoStart = false): StopwatchApi {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(autoStart)
  const [started, setStarted] = useState(autoStart)
  const startRef = useRef(0)
  const accumulatedRef = useRef(0)

  const recompute = useCallback(() => {
    setElapsed(accumulatedRef.current + Math.floor((Date.now() - startRef.current) / 1000))
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (running) {
      startRef.current = Date.now()
      interval = setInterval(recompute, 250)
    } else {
      accumulatedRef.current = elapsed
    }
    return () => clearInterval(interval)
  }, [running, recompute, elapsed])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && running) recompute()
    })
    return () => sub.remove()
  }, [running, recompute])

  const toggle = useCallback(() => {
    setStarted(true)
    setRunning((v) => !v)
  }, [])
  const reset = useCallback(() => {
    accumulatedRef.current = 0
    startRef.current = Date.now()
    setElapsed(0)
    setRunning(false)
    setStarted(false)
  }, [])

  return { elapsed, running, started, toggle, reset }
}

// ─── Runner de fases de intervalo (cardio con interval_config) ────────────────────────────────────
export interface IntervalRunnerApi {
  phaseIndex: number
  phase: IntervalPhase | null
  remaining: number
  running: boolean
  finished: boolean
  /** Fracción transcurrida de la fase actual [0,1]. */
  phaseProgress: number
  toggle: () => void
  /** Salta a la fase siguiente (o termina si es la última). */
  skip: () => void
  /** Reinicia la secuencia desde la primera fase y vuelve a correr (QA5 h3). */
  restart: () => void
}

/**
 * Corre una secuencia de `IntervalPhase[]` (del engine `buildIntervalPhases`). Mirror EXACTO de
 * `IntervalTimer`: avanza fase a fase por `endTime`, dispara `onPhaseChange` en cada cambio y
 * `onFinish` al terminar (para que la pantalla emita el cue háptico/flash). Background-safe.
 */
export function useIntervalRunner(
  phases: IntervalPhase[],
  opts?: { onPhaseChange?: () => void; onFinish?: () => void },
): IntervalRunnerApi {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remaining, setRemaining] = useState(phases[0]?.durationSec ?? 0)
  const [running, setRunning] = useState(true)
  const [finished, setFinished] = useState(phases.length === 0)
  const endRef = useRef<number | null>(null)
  const phaseIndexRef = useRef(0)
  const onPhaseChangeRef = useRef(opts?.onPhaseChange)
  const onFinishRef = useRef(opts?.onFinish)
  useEffect(() => {
    onPhaseChangeRef.current = opts?.onPhaseChange
    onFinishRef.current = opts?.onFinish
  })

  const advance = useCallback(() => {
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
    endRef.current = Date.now() + phases[next].durationSec * 1000
    onPhaseChangeRef.current?.()
  }, [phases])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (running && !finished) {
      if (!endRef.current) endRef.current = Date.now() + remaining * 1000
      interval = setInterval(() => {
        if (!endRef.current) return
        const next = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
        setRemaining(next)
        if (next === 0) advance()
      }, 250)
    } else if (!running) {
      endRef.current = null
    }
    return () => clearInterval(interval)
  }, [running, finished, phaseIndex, remaining, advance])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !endRef.current || finished) return
      const rem = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
      setRemaining(rem)
      if (rem === 0) advance()
    })
    return () => sub.remove()
  }, [advance, finished])

  const toggle = useCallback(() => setRunning((v) => !v), [])
  const skip = useCallback(() => advance(), [advance])
  const restart = useCallback(() => {
    phaseIndexRef.current = 0
    endRef.current = null
    setPhaseIndex(0)
    setRemaining(phases[0]?.durationSec ?? 0)
    setFinished(phases.length === 0)
    setRunning(true)
  }, [phases])

  const phase = phases[phaseIndex] ?? null
  const phaseProgress = phase && phase.durationSec > 0 ? (phase.durationSec - remaining) / phase.durationSec : 0
  return { phaseIndex, phase, remaining, running, finished, phaseProgress, toggle, skip, restart }
}
