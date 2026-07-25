'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { playTimerSound } from '@/lib/audioUtils'
import { triggerHaptic } from '@/lib/client/haptics'
import { readRestTimerSound, readRestTimerVolume } from '../rest-timer-preferences'

/**
 * Ejecutor V3 (E3.2/E3.4) — cuenta regresiva EN LA PANTALLA con la MISMA disciplina que los timers
 * existentes (`HoldTimer`/`IntervalTimer`): conteo endTime-based (resistente a throttling del tab),
 * tick de 250 ms, beep Web Audio + vibración de refuerzo al llegar a 0 (mismo canal/pref que el
 * descanso). NO es un timer nuevo con reglas propias: es la presentación V3 del hold/duración
 * (anillo sereno de movilidad, countdown de cardio), con el conteo intacto.
 *
 * `seconds` = duración objetivo; `autoStart` arranca corriendo; cambiar `resetKey` reinicia el conteo
 * (secuencia de lados / nueva fase). `onDone` se dispara UNA vez al cruzar 0 (side-effects del llamador:
 * avanzar de lado, marcar fase). El sonido/haptic los emite el hook (paridad con HoldTimer web).
 */
export interface ExecCountdown {
    /** Segundos restantes (entero, 0..seconds). */
    timeLeft: number
    /** El conteo corre (no pausado, no terminado). */
    isActive: boolean
    /** true tras cruzar 0. */
    done: boolean
    /** Fracción restante [0,1] para el anillo. */
    frac: number
    /** Pausa/reanuda. */
    toggle: () => void
    /** Reinicia a `seconds` y arranca. */
    restart: () => void
}

export function useExecCountdown(
    seconds: number,
    opts: { autoStart?: boolean; resetKey?: string | number; onDone?: () => void } = {},
): ExecCountdown {
    const { autoStart = false, resetKey, onDone } = opts
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
    const [timeLeft, setTimeLeft] = useState(safeSeconds)
    const [isActive, setIsActive] = useState(autoStart && safeSeconds > 0)
    const [done, setDone] = useState(false)
    const endTimeRef = useRef<number | null>(null)
    const firedRef = useRef(false)
    // `onDone` por ref para no re-armar el intervalo cuando el llamador pasa un closure nuevo.
    const onDoneRef = useRef(onDone)
    onDoneRef.current = onDone

    const triggerDone = useCallback(() => {
        if (firedRef.current) return
        firedRef.current = true
        playTimerSound(readRestTimerSound(), readRestTimerVolume())
        triggerHaptic([200, 100, 400])
        setIsActive(false)
        setDone(true)
        endTimeRef.current = null
        onDoneRef.current?.()
    }, [])

    // Reinicio al cambiar la clave (lado/fase) o la duración objetivo.
    useEffect(() => {
        firedRef.current = false
        endTimeRef.current = null
        setTimeLeft(safeSeconds)
        setDone(false)
        setIsActive(autoStart && safeSeconds > 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey, safeSeconds])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive && timeLeft > 0) {
            if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
            interval = setInterval(() => {
                if (!endTimeRef.current) return
                const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
                setTimeLeft(next)
                if (next === 0) triggerDone()
            }, 250)
        } else if (!isActive) {
            endTimeRef.current = null
        }
        return () => clearInterval(interval)
    }, [isActive, timeLeft, triggerDone])

    const toggle = useCallback(() => {
        if (done) return
        setIsActive((v) => !v)
    }, [done])

    const restart = useCallback(() => {
        firedRef.current = false
        endTimeRef.current = null
        setTimeLeft(safeSeconds)
        setDone(false)
        setIsActive(safeSeconds > 0)
    }, [safeSeconds])

    const frac = safeSeconds > 0 ? Math.max(0, Math.min(1, timeLeft / safeSeconds)) : 0

    return { timeLeft, isActive, done, frac, toggle, restart }
}

/** mm:ss desde segundos (formato compartido por los anillos V3). */
export function formatCountdown(totalSec: number): string {
    const s = Math.max(0, Math.round(totalSec))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
