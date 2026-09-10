'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { expiredWhileAwayFrom } from '@eva/workout-engine'
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
/**
 * Lo que el hook le cuenta al llamador al cruzar 0 (W4.1 / **R27**). Único argumento de `onDone`:
 * los llamadores históricos declaran `() => {…}` y siguen compilando byte-idénticos.
 */
export interface ExecCountdownDoneInfo {
    /**
     * El conteo venció con el alumno FUERA (pestaña oculta, pantalla bloqueada) — la señal que
     * `decideHoldAutolog` necesita para NO arrancar solo el lado 2 (R6). Se **deriva de evidencia**
     * con `expiredWhileAwayFrom` del motor, nunca de quién disparó el fin: el `setInterval` de la
     * pestaña oculta **no se congela, se throttlea**, así que el tick puede ganarle al re-sync por
     * `visibilitychange` y los dos caminos tienen que dar el MISMO valor.
     */
    expiredWhileAway: boolean
}

export interface ExecCountdown {
    /** Segundos restantes (entero, 0..seconds). */
    timeLeft: number
    /** El conteo corre (no pausado, no terminado). */
    isActive: boolean
    /** true tras cruzar 0. */
    done: boolean
    /** Fracción restante [0,1] para el anillo. */
    frac: number
    /**
     * El conteo ARRANCÓ alguna vez desde el último reinicio (W4.1). Sin esto la web no distingue
     * «nunca arrancó» de «pausado» y el botón juicy no puede alternar «Iniciar hold» / «Pausar».
     */
    started: boolean
    /**
     * Fin ABSOLUTO del conteo en ms epoch (`null` sin conteo armado). Aditivo: lo consume el aviso
     * del SO y cualquier lector que necesite el fin real, no el restante ya throttleado.
     */
    endAtMs: number | null
    /** Pausa/reanuda. */
    toggle: () => void
    /** Reinicia a `seconds` y arranca. */
    restart: () => void
    /**
     * **R27** — arma el reloj en `idle` con el objetivo y **sin arrancarlo** (`started:false`,
     * `isActive:false`, `timeLeft = seconds ?? objetivo`, disparo re-armado). Es lo que hace posible
     * «el lado derecho espera tu toque» cuando el hold venció con la app fuera (R6): `restart`
     * SIEMPRE arranca y dejaría el lado 2 en `0:00 done` en vez de `0:30 idle`.
     */
    prime: (seconds?: number) => void
}

export function useExecCountdown(
    seconds: number,
    opts: { autoStart?: boolean; resetKey?: string | number; onDone?: (info: ExecCountdownDoneInfo) => void } = {},
): ExecCountdown {
    const { autoStart = false, resetKey, onDone } = opts
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
    const [timeLeft, setTimeLeft] = useState(safeSeconds)
    const [isActive, setIsActive] = useState(autoStart && safeSeconds > 0)
    const [done, setDone] = useState(false)
    const [started, setStarted] = useState(autoStart && safeSeconds > 0)
    const endTimeRef = useRef<number | null>(null)
    // Espejo en estado del fin absoluto: `endTimeRef` es la verdad dentro de los callbacks (se lee sin
    // esperar un commit), y este estado la publica para el render sin re-armar el intervalo.
    const [endAtMs, setEndAtMs] = useState<number | null>(null)
    const firedRef = useRef(false)
    // `onDone` por ref para no re-armar el intervalo cuando el llamador pasa un closure nuevo.
    const onDoneRef = useRef(onDone)
    onDoneRef.current = onDone

    /** Única escritura del fin absoluto: ref (verdad síncrona) + estado (lectura del render). */
    const setEnd = useCallback((value: number | null) => {
        endTimeRef.current = value
        setEndAtMs(value)
    }, [])

    const triggerDone = useCallback(() => {
        if (firedRef.current) return
        firedRef.current = true
        // ⚠ ANTES de limpiar `endTimeRef`: la regla R27 necesita el fin absoluto. Mismo cálculo para
        // los dos caminos de disparo (tick throttleado y `visibilitychange`) ⇒ mismo resultado gane
        // quien gane la carrera.
        const info: ExecCountdownDoneInfo = {
            expiredWhileAway: expiredWhileAwayFrom({
                nowMs: Date.now(),
                endAtMs: endTimeRef.current,
                visible: typeof document === 'undefined' || document.visibilityState === 'visible',
            }),
        }
        playTimerSound(readRestTimerSound(), readRestTimerVolume())
        triggerHaptic([200, 100, 400])
        setIsActive(false)
        setDone(true)
        setEnd(null)
        onDoneRef.current?.(info)
    }, [setEnd])

    // Reinicio al cambiar la clave (lado/fase) o la duración objetivo.
    useEffect(() => {
        firedRef.current = false
        setEnd(null)
        setTimeLeft(safeSeconds)
        setDone(false)
        setIsActive(autoStart && safeSeconds > 0)
        setStarted(autoStart && safeSeconds > 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey, safeSeconds])

    // `started` se levanta desde el ÚNICO lugar donde el conteo pasa a correr, sea cual sea el camino
    // (autoStart, `toggle`, `restart`): así ninguna vía nueva puede olvidarse de marcarlo.
    useEffect(() => {
        if (isActive) setStarted(true)
    }, [isActive])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined
        if (isActive && timeLeft > 0) {
            if (!endTimeRef.current) setEnd(Date.now() + timeLeft * 1000)
            interval = setInterval(() => {
                if (!endTimeRef.current) return
                const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
                setTimeLeft(next)
                if (next === 0) triggerDone()
            }, 250)
        } else if (!isActive) {
            setEnd(null)
        }
        return () => clearInterval(interval)
    }, [isActive, timeLeft, triggerDone, setEnd])

    // Pestaña OCULTA: Chrome congela el `setInterval` del tick, así que al volver hay que releer el fin
    // absoluto (que sí es real) en vez de esperar el próximo tick. Espejo exacto del re-sync por
    // `AppState 'active'` de RN (`timing.ts`): si ya venció, `triggerDone` dispara acá — de disparo
    // único, así que el sonido/haptic siguen sonando una sola vez.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible' || !endTimeRef.current) return
            const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
            setTimeLeft(next)
            if (next === 0) triggerDone()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [triggerDone])

    const toggle = useCallback(() => {
        if (done) return
        setIsActive((v) => !v)
    }, [done])

    const restart = useCallback(() => {
        firedRef.current = false
        setEnd(null)
        setTimeLeft(safeSeconds)
        setDone(false)
        setIsActive(safeSeconds > 0)
    }, [safeSeconds, setEnd])

    // Hermano QUIETO de `restart` (R27): mismo reinicio, sin `setIsActive(true)`. Un `seconds` propio
    // permite armar el lado 2 con SU objetivo sin re-montar el hook.
    const prime = useCallback(
        (nextSeconds?: number) => {
            const target =
                nextSeconds != null && Number.isFinite(nextSeconds) && nextSeconds > 0
                    ? Math.round(nextSeconds)
                    : safeSeconds
            firedRef.current = false
            setEnd(null)
            setTimeLeft(target)
            setDone(false)
            setIsActive(false)
            setStarted(false)
        },
        [safeSeconds, setEnd],
    )

    const frac = safeSeconds > 0 ? Math.max(0, Math.min(1, timeLeft / safeSeconds)) : 0

    return { timeLeft, isActive, done, frac, started, endAtMs, toggle, restart, prime }
}

/** mm:ss desde segundos (formato compartido por los anillos V3). */
export function formatCountdown(totalSec: number): string {
    const s = Math.max(0, Math.round(totalSec))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
