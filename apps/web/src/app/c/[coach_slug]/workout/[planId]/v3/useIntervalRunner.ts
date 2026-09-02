'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { playTimerSound } from '@/lib/audioUtils'
import { triggerHaptic } from '@/lib/client/haptics'
import { readRestTimerSound, readRestTimerVolume } from '../rest-timer-preferences'
import { isManualPhase, type CardioSegmentReason, type IntervalPhase } from '@eva/workout-engine'

/**
 * Ejecutor V3 (E3.4) — corredor de FASES de intervalo EN LA PANTALLA, con la MISMA disciplina que el
 * `IntervalTimer` existente: conteo endTime-based, tick de 250 ms, beep Web Audio + haptic FUERTE en
 * cada cambio de fase (doble al terminar). NO reordena ni reinventa la secuencia: consume las fases
 * puras del engine (`buildIntervalSequence`) — la secuencia es del coach, el motor sólo la corre. Es la
 * presentación V3 (anillo por fase, colores fijos esfuerzo/recuperación); el conteo queda intacto.
 *
 * Fase D (G2/RF7): una fase `manual` (paso prescrito por DISTANCIA, p. ej. 400 m) NO se cronometra —
 * el reloj se detiene en esa fase y avanza sólo cuando el alumno confirma con "Fase siguiente". Las
 * fases por tiempo de la MISMA secuencia (warmup, recuperaciones, cooldown) se cuentan como siempre.
 */
export interface IntervalRunner {
    phase: IntervalPhase | null
    phaseIndex: number
    timeLeft: number
    isActive: boolean
    /**
     * ¿El alumno YA lo puso en marcha alguna vez? (paridad con `timing.ts` de RN). Distingue "sin
     * iniciar" de "pausado": es lo que deja arrancar el reloj de pared del tramo con el PRIMER GESTO
     * en una fase por DISTANCIA, en vez de al montar la pantalla ("nada corre solo", QA4 h8a).
     */
    started: boolean
    finished: boolean
    /** ¿La fase actual espera avance manual (prescrita por distancia)? */
    isManual: boolean
    /** Fracción restante de la fase actual [0,1] (para el anillo). */
    frac: number
    toggle: () => void
    skip: () => void
    /** Avance explícito del alumno (CTA "Fase siguiente"); arranca el conteo si la siguiente es por tiempo. */
    next: () => void
    restart: () => void
}

/** Razones de fin de TRAMO que puede emitir el runner (el resto las decide el consumidor). */
export type IntervalSegmentReason = Extract<CardioSegmentReason, 'expired' | 'manual-next' | 'skipped'>

export function useIntervalRunner(
    phases: IntervalPhase[],
    opts: { onSegmentEnd?: (e: { reason: IntervalSegmentReason; phaseIndex: number }) => void } = {},
): IntervalRunner {
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [timeLeft, setTimeLeft] = useState(phases[0]?.durationSec ?? 0)
    const [isActive, setIsActive] = useState(false)
    const [started, setStarted] = useState(false)
    const [finished, setFinished] = useState(false)
    const endTimeRef = useRef<number | null>(null)
    const phaseIndexRef = useRef(0)
    // Por ref (patrón `onDoneRef` de `useExecCountdown`) para no re-armar el intervalo cuando el
    // consumidor pasa un closure nuevo en cada render.
    const onSegmentEndRef = useRef(opts.onSegmentEnd)
    onSegmentEndRef.current = opts.onSegmentEnd

    const phase = phases[phaseIndex] ?? null

    const beep = useCallback((double = false) => {
        playTimerSound(readRestTimerSound(), readRestTimerVolume())
        triggerHaptic(double ? [200, 100, 200, 100, 400] : [200, 100, 200])
    }, [])

    const isManual = isManualPhase(phase)

    /**
     * Cierra la fase en curso y pasa a la siguiente. `reason` viaja hacia afuera ANTES de mover el
     * índice (hallazgo E · auto-registro de cardio): el consumidor necesita saber QUÉ fase terminó y
     * por qué para decidir si ese tramo cierra la ronda de captura. Se emite UNA sola vez por avance,
     * también en la rama de fin de secuencia.
     */
    const advance = useCallback((reason: IntervalSegmentReason) => {
        onSegmentEndRef.current?.({ reason, phaseIndex: phaseIndexRef.current })
        const next = phaseIndexRef.current + 1
        if (next >= phases.length) {
            beep(true)
            setFinished(true)
            setIsActive(false)
            endTimeRef.current = null
            return
        }
        beep(false)
        phaseIndexRef.current = next
        setPhaseIndex(next)
        setTimeLeft(phases[next].durationSec)
        // Una fase manual (por distancia) no tiene fin programado: espera el toque del alumno.
        endTimeRef.current = isManualPhase(phases[next]) ? null : Date.now() + phases[next].durationSec * 1000
    }, [phases, beep])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive && !finished && !isManual) {
            if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
            interval = setInterval(() => {
                if (!endTimeRef.current) return
                const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
                setTimeLeft(next)
                if (next === 0) advance('expired')
            }, 250)
        } else if (!isActive) {
            endTimeRef.current = null
        }
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, finished, phaseIndex, advance])

    const toggle = useCallback(() => {
        if (finished) return
        setStarted(true)
        setIsActive((v) => !v)
    }, [finished])

    const skip = useCallback(() => {
        if (finished) return
        setStarted(true)
        endTimeRef.current = null
        advance('skipped')
    }, [finished, advance])

    /**
     * CTA "Fase siguiente" de las fases por distancia: además de avanzar, deja el conteo CORRIENDO si
     * la fase siguiente es por tiempo (terminaste los 400 m ⇒ la recuperación arranca sola).
     */
    const next = useCallback(() => {
        if (finished) return
        const isLast = phaseIndexRef.current + 1 >= phases.length
        endTimeRef.current = null
        // `started`/`isActive` ANTES de emitir el fin del tramo: el consumidor arranca su reloj de
        // pared con este primer gesto, y si el aviso llegara antes cerraría la ronda con 0 s.
        setStarted(true)
        if (!isLast) setIsActive(true)
        advance('manual-next')
    }, [finished, advance, phases.length])

    const restart = useCallback(() => {
        phaseIndexRef.current = 0
        endTimeRef.current = null
        setPhaseIndex(0)
        setTimeLeft(phases[0]?.durationSec ?? 0)
        setFinished(false)
        setStarted(true)
        setIsActive(true)
    }, [phases])

    // Fase manual ⇒ anillo LLENO y estático (no hay cuenta que drenar); por tiempo ⇒ restante.
    const frac = isManual ? 1 : phase && phase.durationSec > 0 ? Math.max(0, Math.min(1, timeLeft / phase.durationSec)) : 0

    return { phase, phaseIndex, timeLeft, isActive, started, finished, isManual, frac, toggle, skip, next, restart }
}
