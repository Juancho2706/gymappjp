'use client'

import React, { useState, createContext, useContext, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { RestTimer } from './RestTimer'
import { HoldTimer } from './HoldTimer'
import { IntervalTimer } from './IntervalTimer'
import { Stopwatch } from './Stopwatch'
import { buildIntervalPhases, type IntervalPhase } from '@eva/workout-engine'
import type { IntervalConfig } from '@/domain/workout/types'

/**
 * Contrato extendido (specs/movida-entrenamiento, F6): startRest (histórico) +
 * startHold + startInterval + startStopwatch. UN SOLO timer activo: el nuevo
 * reemplaza al anterior con confirmación suave (toast — AC5).
 */
/** Opciones del descanso (M2): `label` = "qué sigue" mostrado en la barra; `warmup` = descanso de aproximación. */
interface RestOptions {
    label?: string
    warmup?: boolean
}

interface WorkoutContextType {
    startRest: (timeStr: string | null, opts?: RestOptions) => void
    startHold: (seconds: number, label?: string) => void
    startInterval: (config: IntervalConfig, sets?: number) => void
    startStopwatch: () => void
    /** Auto-skip (M2): cortar el descanso en curso (p.ej. al registrar la siguiente serie). */
    cancelRest: () => void
}

type ActiveTimer =
    | { kind: 'rest'; seconds: number; label?: string; warmup?: boolean }
    | { kind: 'hold'; seconds: number; label?: string }
    | { kind: 'interval'; phases: IntervalPhase[] }
    | { kind: 'stopwatch' }

const WorkoutContext = createContext<WorkoutContextType | null>(null)

export function useWorkoutTimer() {
    const context = useContext(WorkoutContext)
    if (!context) {
        throw new Error('useWorkoutTimer must be used within a WorkoutTimerProvider')
    }
    return context
}

// Convert "01:30" or "90" or "1 min" to seconds safely
export function parseRestTime(restStr: string | null): number {
    if (!restStr) return 0
    const str = restStr.toLowerCase().trim()

    // "01:30" or "1:30"
    if (str.includes(':')) {
        const parts = str.split(':')
        const m = parseInt(parts[0]) || 0
        const s = parseInt(parts[1]) || 0
        return m * 60 + s
    }

    // "90s", "90 sec"
    if (str.includes('s')) {
        const val = parseInt(str)
        return isNaN(val) ? 0 : val
    }

    // "1 min", "1m"
    if (str.includes('m')) {
        const val = parseInt(str)
        return isNaN(val) ? 0 : val * 60
    }

    // "90"
    const val = parseInt(str)
    return isNaN(val) ? 0 : val
}

export function WorkoutTimerProvider({
    children,
    v3 = false,
}: {
    children: React.ReactNode
    /**
     * Ejecutor V3 (E3.1): en modo V3 el descanso se presenta como interstitial a pantalla completa
     * (misma instancia/estado del RestTimer). Los descansos intra-ronda de superserie NO llegan aquí:
     * `LogSetForm` corta el descanso (`cancelRest`) entre ejercicios de la misma ronda y sólo dispara
     * `startRest` al cerrar la ronda, así que todo descanso montado es un descanso real → interstitial OK.
     */
    v3?: boolean
}) {
    const [active, setActive] = useState<ActiveTimer | null>(null)
    const activeRef = useRef<ActiveTimer | null>(null)
    // Patrón "latest ref": activeRef solo se lee en replaceWith (callback de evento), nunca en render.
    // El compiler tolera este caso; el write en render hace que el callback vea el valor actual sin lag.
    // eslint-disable-next-line react-hooks/refs
    activeRef.current = active

    /** Reemplazo suave: si ya hay un timer corriendo, avisa que fue reemplazado (AC5). */
    const replaceWith = useCallback((next: ActiveTimer | null) => {
        if (activeRef.current && next && activeRef.current.kind !== next.kind) {
            toast.info('Temporizador anterior reemplazado')
        }
        // Forzar remount aunque sea el mismo tipo (reinicia el conteo)
        setActive(null)
        if (next) setTimeout(() => setActive(next), 10)
    }, [])

    const startRest = useCallback((timeStr: string | null, opts?: RestOptions) => {
        const seconds = parseRestTime(timeStr)
        if (seconds > 0) replaceWith({ kind: 'rest', seconds, label: opts?.label, warmup: opts?.warmup })
    }, [replaceWith])

    const startHold = useCallback((seconds: number, label?: string) => {
        if (Number.isFinite(seconds) && seconds > 0) {
            replaceWith({ kind: 'hold', seconds: Math.round(seconds), label })
        }
    }, [replaceWith])

    const startInterval = useCallback((config: IntervalConfig, sets: number = 1) => {
        const phases = buildIntervalPhases(config, sets)
        if (phases.length === 0) {
            toast.info('Este bloque se prescribe por distancia — usa el cronómetro')
            return
        }
        replaceWith({ kind: 'interval', phases })
    }, [replaceWith])

    const startStopwatch = useCallback(() => {
        replaceWith({ kind: 'stopwatch' })
    }, [replaceWith])

    const close = useCallback(() => setActive(null), [])
    // Auto-skip (M2): sólo corta si HAY un descanso corriendo (no pisa hold/interval/cronómetro).
    const cancelRest = useCallback(() => {
        setActive((cur) => (cur?.kind === 'rest' ? null : cur))
    }, [])

    return (
        <WorkoutContext.Provider value={{ startRest, startHold, startInterval, startStopwatch, cancelRest }}>
            {children}
            {active?.kind === 'rest' && (
                <RestTimer
                    initialSeconds={active.seconds}
                    nextLabel={active.label}
                    warmup={active.warmup}
                    variant={v3 ? 'v3' : 'compact'}
                    onClose={close}
                />
            )}
            {active?.kind === 'hold' && (
                <HoldTimer initialSeconds={active.seconds} label={active.label} onClose={close} />
            )}
            {active?.kind === 'interval' && (
                <IntervalTimer phases={active.phases} onClose={close} />
            )}
            {active?.kind === 'stopwatch' && <Stopwatch onClose={close} />}
        </WorkoutContext.Provider>
    )
}
