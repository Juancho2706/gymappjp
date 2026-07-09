import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { buildIntervalPhases, type IntervalConfig, type IntervalPhase } from '@eva/workout-engine'
import { toast } from '../../../Toast'
import { RestTimerBar } from './RestTimerBar'
import { HoldTimer } from './HoldTimer'
import { IntervalTimer } from './IntervalTimer'
import { StopwatchTimer } from './StopwatchTimer'
import { hydrateRestTimerPrefs } from './rest-timer-preferences'
import { primeTimerAudio } from './sound'

/**
 * WorkoutTimerProvider (E2-09) — orquesta UN solo timer activo a la vez (rest /
 * hold / interval / stopwatch), montándolo como overlay sobre el ejecutor. Port
 * RN del `WorkoutTimerProvider` web: reemplazo suave (toast al cambiar de tipo),
 * remount forzado (mismo tipo reinicia la cuenta vía `nonce`), y auto-skip del
 * descanso (`cancelRest`, p.ej. al registrar la siguiente serie).
 *
 * Contrato de la ola: `useWorkoutTimers()` expone `startRest(seconds, opts?)` +
 * `state`. Superset añadido para el ejecutor: `startHold`, `startInterval`,
 * `startStopwatch`, `cancelRest`, `close`. Los componentes de timer se montan
 * SOLOS vía este provider (el consumidor solo llama a los `start*`).
 */

type RestOpts = { autoStart?: boolean; label?: string; warmup?: boolean }

type ActiveTimer =
  | { kind: 'rest'; nonce: number; seconds: number; autoStart: boolean; label?: string; warmup?: boolean }
  | { kind: 'hold'; nonce: number; seconds: number; label?: string }
  | { kind: 'interval'; nonce: number; phases: IntervalPhase[] }
  | { kind: 'stopwatch'; nonce: number }

export interface WorkoutTimersApi {
  /** Inicia el descanso protagonista. `autoStart` (default true) = arranca corriendo. */
  startRest: (seconds: number, opts?: RestOpts) => void
  startHold: (seconds: number, opts?: { label?: string }) => void
  startInterval: (config: IntervalConfig, sets?: number) => void
  startStopwatch: () => void
  /** Corta SOLO el descanso en curso (no pisa hold/interval/cronómetro). */
  cancelRest: () => void
  /** Cierra cualquier timer activo. */
  close: () => void
  /** Timer activo (o null). Tipado laxo en el contrato (`unknown`). */
  state: ActiveTimer | null
}

const Ctx = createContext<WorkoutTimersApi | null>(null)

/**
 * Convierte "01:30" | "90" | "90s" | "1 min" a segundos. El `startRest` del hook
 * recibe SEGUNDOS (number, por contrato); usa esto para parsear un valor string
 * del plan antes de llamar. Port de `parseRestTime` web.
 */
export function parseRestTime(restStr: string | null | undefined): number {
  if (!restStr) return 0
  const str = String(restStr).toLowerCase().trim()
  if (str.includes(':')) {
    const [mm, ss] = str.split(':')
    return (parseInt(mm, 10) || 0) * 60 + (parseInt(ss, 10) || 0)
  }
  if (str.includes('s')) {
    const v = parseInt(str, 10)
    return Number.isNaN(v) ? 0 : v
  }
  if (str.includes('m')) {
    const v = parseInt(str, 10)
    return Number.isNaN(v) ? 0 : v * 60
  }
  const v = parseInt(str, 10)
  return Number.isNaN(v) ? 0 : v
}

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveTimer | null>(null)
  const activeKindRef = useRef<ActiveTimer['kind'] | null>(null)
  const nonceRef = useRef(0)

  useEffect(() => {
    activeKindRef.current = active?.kind ?? null
  }, [active])

  // Hidrata preferencias de sonido y prepara el modo de audio una vez.
  useEffect(() => {
    void hydrateRestTimerPrefs()
    primeTimerAudio()
  }, [])

  /** Reemplazo suave: avisa si se pisa un timer de OTRO tipo (paridad web AC5). */
  const replaceWith = useCallback((next: ActiveTimer) => {
    if (activeKindRef.current && activeKindRef.current !== next.kind) {
      toast.info('Temporizador anterior reemplazado')
    }
    setActive(next)
  }, [])

  const startRest = useCallback(
    (seconds: number, opts?: RestOpts) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return
      nonceRef.current += 1
      replaceWith({
        kind: 'rest',
        nonce: nonceRef.current,
        seconds: Math.round(seconds),
        autoStart: opts?.autoStart ?? true,
        label: opts?.label,
        warmup: opts?.warmup,
      })
    },
    [replaceWith],
  )

  const startHold = useCallback(
    (seconds: number, opts?: { label?: string }) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return
      nonceRef.current += 1
      replaceWith({ kind: 'hold', nonce: nonceRef.current, seconds: Math.round(seconds), label: opts?.label })
    },
    [replaceWith],
  )

  const startInterval = useCallback(
    (config: IntervalConfig, sets = 1) => {
      const phases = buildIntervalPhases(config, sets)
      if (phases.length === 0) {
        toast.info('Este bloque se prescribe por distancia — usa el cronómetro')
        return
      }
      nonceRef.current += 1
      replaceWith({ kind: 'interval', nonce: nonceRef.current, phases })
    },
    [replaceWith],
  )

  const startStopwatch = useCallback(() => {
    nonceRef.current += 1
    replaceWith({ kind: 'stopwatch', nonce: nonceRef.current })
  }, [replaceWith])

  const close = useCallback(() => setActive(null), [])

  const cancelRest = useCallback(() => {
    setActive((cur) => (cur?.kind === 'rest' ? null : cur))
  }, [])

  const api = useMemo<WorkoutTimersApi>(
    () => ({ startRest, startHold, startInterval, startStopwatch, cancelRest, close, state: active }),
    [startRest, startHold, startInterval, startStopwatch, cancelRest, close, active],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {active ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {active.kind === 'rest' ? (
            <RestTimerBar
              key={active.nonce}
              initialSeconds={active.seconds}
              autoStart={active.autoStart}
              nextLabel={active.label}
              warmup={active.warmup}
              onClose={close}
            />
          ) : null}
          {active.kind === 'hold' ? (
            <HoldTimer key={active.nonce} initialSeconds={active.seconds} label={active.label} onClose={close} />
          ) : null}
          {active.kind === 'interval' ? (
            <IntervalTimer key={active.nonce} phases={active.phases} onClose={close} />
          ) : null}
          {active.kind === 'stopwatch' ? <StopwatchTimer key={active.nonce} onClose={close} /> : null}
        </View>
      ) : null}
    </Ctx.Provider>
  )
}

/** Hook de acceso a los timers. Debe usarse dentro de `WorkoutTimerProvider`. */
export function useWorkoutTimers(): WorkoutTimersApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkoutTimers must be used within a WorkoutTimerProvider')
  return ctx
}
