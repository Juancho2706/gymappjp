'use client'

import React, { useState, createContext, useContext, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { RestTimer } from './RestTimer'
import { HoldTimer } from './HoldTimer'
import { IntervalTimer } from './IntervalTimer'
import { Stopwatch } from './Stopwatch'
import { buildIntervalPhases, type IntervalPhase } from '@/lib/workout-interval'
import type { IntervalConfig } from '@/domain/workout/types'

/**
 * Contrato extendido (specs/movida-entrenamiento, F6): startRest (histórico) +
 * startHold + startInterval + startStopwatch. UN SOLO timer activo: el nuevo
 * reemplaza al anterior con confirmación suave (toast — AC5).
 */
interface WorkoutContextType {
    startRest: (timeStr: string | null) => void
    startHold: (seconds: number, label?: string) => void
    startInterval: (config: IntervalConfig, sets?: number) => void
    startStopwatch: () => void
}

type ActiveTimer =
    | { kind: 'rest'; seconds: number }
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

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
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

    const startRest = useCallback((timeStr: string | null) => {
        const seconds = parseRestTime(timeStr)
        if (seconds > 0) replaceWith({ kind: 'rest', seconds })
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

    return (
        <WorkoutContext.Provider value={{ startRest, startHold, startInterval, startStopwatch }}>
            {children}
            {active?.kind === 'rest' && (
                <RestTimer initialSeconds={active.seconds} onClose={close} />
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
