'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { decideHoldAutolog, holdSidesFor, type HoldAdvance, type HoldContext, type HoldEndReason, type HoldSide, type HoldSource } from '@eva/workout-engine'
import { useExecCountdown, formatCountdown } from './useExecCountdown'

/**
 * Módulo de HOLD del ejecutor V3 web (specs/cuenta-atras-en-pantalla, W4.10) — la MISMA pieza visual y
 * los mismos estados que `HoldModuleV3` de RN: pastilla de lado, anillo + número, «luego: …» y CTAs.
 *
 * Contrato de no-regresión: **nunca** llama `logSetAction`, `enqueueWorkoutLog` ni `startRest`. Su
 * única salida es `onMeasured(...)`, que el consumidor enchufa a `LogSetForm.holdPrefill` — el
 * auto-envío de V2 es `formRef.current?.requestSubmit()` sobre el `<form>` de la fila, el mismo camino
 * ya probado por cardio, así que cola offline, optimismo, `onLogged` y CueBar siguen intactos.
 *
 * Decide el MOTOR (`decideHoldAutolog`): qué segundos se rellenan, si se envía, qué marca de fuente
 * lleva (`'timer'` a 0, `'manual'` con «Listo» antes) y si el ejecutor avanza (V4/D2). Los lados salen
 * de `holdSidesFor(sideMode)` (R34): `per_side` recorre izquierdo → derecho y se envía UNA fila al
 * cerrar el derecho; `alternating` y bilateral capturan un solo hold. Con el reloj vencido fuera de
 * la pestaña (`expiredWhileAway`, R27) se guarda el OBJETIVO y el lado 2 queda ARMADO con `prime()`,
 * sin correr con datos falsos (R6).
 *
 * Tres tamaños (V1: el video nunca se colapsa, el reloj va DEBAJO): `ss` 80 px (superserie),
 * `solo130` (fuerza por tiempo, con los tiles KG / SEG), `solo214` (movilidad sola). CSS propio
 * `.exec-v3-holdmod` con `--exec-hold-size` (R33): las clases de cardio no se tocan.
 *
 * Predicado de montaje (R29): lo evalúa el PASO — sólo hay módulo si hay reloj que montar
 * (`duration_sec > 0` en movilidad o `isStrengthTimeBlock` en fuerza). Acá `prescribedSec` es > 0.
 */
export type HoldModuleKind = 'mobility' | 'strength_time'
export type HoldModuleSize = 'ss' | 'solo130' | 'solo214'
export type HoldModuleStatus = 'idle' | 'running' | 'paused' | 'done'

/** Lo que el módulo mide: el consumidor lo vuelca en `holdPrefill` de la fila activa. */
export interface HoldMeasured {
    holdSec?: number | null
    leftSec?: number | null
    rightSec?: number | null
    /** El reloj llegó a 0 (o «Listo» antes de 0 en el último lado) ⇒ la fila se envía sola (V2/A2). */
    submit: boolean
    source: HoldSource
    nonce: number
    side: HoldSide
    closesRound: boolean
    expiredWhileAway: boolean
    advance: HoldAdvance
}

export interface HoldModuleV3Props {
    kind: HoldModuleKind
    size: HoldModuleSize
    /** `duration_sec` prescrito (> 0, garantizado por el predicado R29 del paso). */
    prescribedSec: number
    sideMode: string | null | undefined
    context: HoldContext
    closesRound: boolean
    /** `${blockId}:${setNumber}:${round}` — al cambiar, el módulo vuelve a `idle`. */
    resetKey: string
    /** Descanso de grupo corriendo ⇒ la cuenta se pausa (sin decisión del motor). */
    suspended?: boolean
    /** Color CSS del acento (p. ej. `var(--exec-recovery)` en movilidad). Default: `--exec-brand`. */
    accent?: string
    /** «luego: …» — el siguiente miembro de la ronda (superserie). El lado siguiente lo pone el módulo. */
    nextLabel?: string | null
    onMeasured: (m: HoldMeasured) => void
    /** El paso lo usa para ocultar (`hidden` + `inert`, R26) la fila mientras corre. */
    onStatusChange?: (status: HoldModuleStatus) => void
    className?: string
    testIdPrefix?: string
}

const DASH = 2 * Math.PI * 92

export function HoldModuleV3({
    kind,
    size,
    prescribedSec,
    sideMode,
    context,
    closesRound,
    resetKey,
    suspended = false,
    accent,
    nextLabel = null,
    onMeasured,
    onStatusChange,
    className,
    testIdPrefix = 'hold',
}: HoldModuleV3Props) {
    const sides = holdSidesFor(sideMode ?? null)
    const [sideIdx, setSideIdx] = useState(0)
    const [done, setDone] = useState(false)
    const [expiredAway, setExpiredAway] = useState(false)
    const [savedSec, setSavedSec] = useState<number | null>(null)
    const side: HoldSide = sides[sideIdx] ?? 'single'
    const perSide = sides.length > 1
    const isLeft = side === 'left'

    // Refs de lectura imperativa (los callbacks del reloj se congelan en el primer render).
    const sideRef = useRef<HoldSide>(side)
    sideRef.current = side
    const propsRef = useRef({ prescribedSec, context, closesRound, onMeasured })
    propsRef.current = { prescribedSec, context, closesRound, onMeasured }
    // Segundos del lado izquierdo ya cerrado (viajan con el derecho en la MISMA fila, R34).
    const leftRef = useRef<number | null>(null)
    // Un envío por `resetKey:side` (calco del guard `sentSetsRef` de RN).
    const sentRef = useRef<Set<string>>(new Set())
    // El lado 2 arranca solo SOLO en foreground (R6/R27): se decide al cerrar el izquierdo y se aplica
    // en el efecto del cambio de lado, cuando el reloj ya quedó re-armado.
    const autoStartNextRef = useRef(false)
    const finishRef = useRef<(reason: HoldEndReason, away?: boolean) => void>(() => {})

    const countdown = useExecCountdown(prescribedSec, {
        autoStart: false,
        resetKey: `${resetKey}:${sideIdx}`,
        onDone: (info) => finishRef.current('expired', info.expiredWhileAway),
    })
    const countdownRef = useRef(countdown)
    countdownRef.current = countdown

    const finish = useCallback((reason: HoldEndReason, away = false) => {
        const p = propsRef.current
        const cd = countdownRef.current
        const currentSide = sideRef.current
        const elapsedSec = Math.max(0, p.prescribedSec - cd.timeLeft)
        const decision = decideHoldAutolog({
            reason,
            elapsedSec: reason === 'expired' ? p.prescribedSec : elapsedSec,
            prescribedSec: p.prescribedSec,
            side: currentSide,
            context: p.context,
            closesRound: p.closesRound,
            expiredWhileAway: reason === 'expired' ? away : false,
        })
        if (reason === 'expired') setExpiredAway(away)
        if (decision.fillSeconds == null && !decision.submit) return
        const fill = decision.fillSeconds
        const nonce = Date.now()
        const sentKey = `${resetKey}:${currentSide}`
        const submit = decision.submit && !sentRef.current.has(sentKey)
        if (submit) sentRef.current.add(sentKey)
        const source: HoldSource = decision.holdSource ?? 'manual'
        if (currentSide === 'left' && fill != null) leftRef.current = fill
        p.onMeasured({
            ...(currentSide === 'single' ? { holdSec: fill } : {}),
            ...(currentSide === 'left' ? { leftSec: fill } : {}),
            ...(currentSide === 'right' ? { leftSec: leftRef.current, rightSec: fill } : {}),
            submit,
            source,
            nonce,
            side: currentSide,
            closesRound: p.closesRound,
            expiredWhileAway: reason === 'expired' ? away : false,
            advance: decision.advance,
        })
        if (submit) {
            setDone(true)
            setSavedSec(currentSide === 'right' ? (leftRef.current ?? 0) + (fill ?? 0) : fill)
        }
        if (decision.advanceSide) {
            autoStartNextRef.current = decision.autoStartNextSide
            setSideIdx((i) => i + 1)
        }
    }, [resetKey])
    useEffect(() => {
        finishRef.current = finish
    })

    // Reset por serie / miembro / ronda.
    useEffect(() => {
        setSideIdx(0)
        setDone(false)
        setExpiredAway(false)
        setSavedSec(null)
        leftRef.current = null
        autoStartNextRef.current = false
    }, [resetKey])

    // Cambio de lado: el reloj ya quedó re-armado en idle por `resetKey`; si el izquierdo cerró en
    // foreground, el derecho arranca solo (eyes-free); si venció fuera, espera el toque (R6).
    useEffect(() => {
        if (sideIdx === 0) return
        if (autoStartNextRef.current) {
            autoStartNextRef.current = false
            countdownRef.current.restart()
        }
    }, [sideIdx])

    // Descanso de grupo corriendo ⇒ pausa forzada, sin decisión del motor.
    useEffect(() => {
        if (suspended && countdownRef.current.isActive) countdownRef.current.toggle()
    }, [suspended])

    const status: HoldModuleStatus = done
        ? 'done'
        : suspended
          ? 'paused'
          : countdown.isActive
            ? 'running'
            : countdown.started
              ? 'paused'
              : 'idle'
    useEffect(() => {
        onStatusChange?.(status)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    const start = () => {
        if (countdown.isActive || done) return
        countdown.toggle()
    }
    const pause = () => {
        if (!countdown.isActive) return
        countdown.toggle()
        finish('paused')
    }
    const doneEarly = () => {
        if (countdown.isActive) countdown.toggle()
        finish('done-early')
    }
    const remeasure = () => {
        countdown.prime()
        finish('restart')
    }
    /** CA-90: «Listo» desde idle siembra el OBJETIVO en la fila y NO envía (el alumno confirma). */
    const seedObjective = () => {
        if (countdown.isActive) return
        const p = propsRef.current
        const nonce = Date.now()
        if (side === 'left') leftRef.current = p.prescribedSec
        p.onMeasured({
            ...(side === 'single' ? { holdSec: p.prescribedSec } : {}),
            ...(side === 'left' ? { leftSec: p.prescribedSec } : {}),
            ...(side === 'right' ? { leftSec: leftRef.current, rightSec: p.prescribedSec } : {}),
            submit: false,
            source: 'manual',
            nonce,
            side,
            closesRound: p.closesRound,
            expiredWhileAway: false,
            advance: 'stay',
        })
        if (side === 'left') {
            autoStartNextRef.current = false
            setSideIdx((i) => i + 1)
        }
    }

    const running = status === 'running'
    const idle = status === 'idle'
    const primedRight = idle && side === 'right' && expiredAway
    const startLabel = kind === 'strength_time' ? 'Iniciar serie' : primedRight ? 'Iniciar lado derecho' : 'Iniciar hold'
    const doneLabel = perSide && isLeft ? 'Listo este lado' : 'Listo'
    const frac = done ? 1 : countdown.frac
    const style = accent ? ({ '--exec-hold-accent': accent } as CSSProperties) : undefined

    return (
        <div className={cn('exec-v3-holdmod', className)} data-size={size} data-status={status} data-testid={`${testIdPrefix}-module`} style={style}>
            {perSide && !done && (
                <div className="exec-v3-holdmod-sidepill" aria-live="polite">
                    <span className="exec-v3-holdmod-sidedot" aria-hidden />
                    Lado {side === 'left' ? 'izquierdo' : 'derecho'}
                </div>
            )}

            <div className="exec-v3-holdmod-ringrow">
                <div className="exec-v3-holdmod-ring" role="timer" aria-label={done ? 'Hold guardado' : `Quedan ${countdown.timeLeft} segundos`}>
                    <svg className="exec-v3-holdmod-svg" viewBox="0 0 208 208" aria-hidden>
                        <circle cx="104" cy="104" r="92" className="exec-v3-holdmod-track" fill="none" strokeWidth="23" />
                        <circle
                            cx="104"
                            cy="104"
                            r="92"
                            className="exec-v3-holdmod-fill"
                            fill="none"
                            strokeWidth="23"
                            strokeLinecap="round"
                            strokeDasharray={DASH}
                            strokeDashoffset={DASH * (1 - frac)}
                        />
                    </svg>
                    <div className="exec-v3-holdmod-txt">
                        {done ? (
                            <>
                                <Check className="exec-v3-holdmod-check" strokeWidth={3} aria-hidden />
                                <span className="exec-v3-holdmod-done">¡Listo!</span>
                            </>
                        ) : (
                            <span className="exec-v3-holdmod-num tabular-nums" data-testid={`${testIdPrefix}-clock`}>
                                {formatCountdown(countdown.timeLeft)}
                            </span>
                        )}
                    </div>
                </div>
                {size !== 'ss' && countdown.started && !done && (
                    <button type="button" onClick={remeasure} className="exec-v3-restart" aria-label="Volver a medir desde el objetivo">
                        <RotateCcw className="h-4 w-4" aria-hidden />
                    </button>
                )}
            </div>

            {done ? (
                <span className="exec-v3-holdmod-saved tabular-nums">Guardado{savedSec != null ? ` · ${savedSec} s` : ''}</span>
            ) : perSide && isLeft ? (
                <p className="exec-v3-then">luego: <b>lado derecho</b></p>
            ) : nextLabel ? (
                <p className="exec-v3-then">luego: <b>{nextLabel}</b></p>
            ) : null}

            {!done && (
                <div className="exec-v3-holdmod-ctas">
                    {idle ? (
                        <>
                            <button type="button" onClick={start} className="exec-v3-juicy exec-v3-holdmod-cta" data-testid={`${testIdPrefix}-start`}>
                                <Play className="h-[18px] w-[18px]" aria-hidden />
                                {startLabel}
                            </button>
                            {/* CA-90: «Listo» desde idle siembra el objetivo sin enviar. Sólo en movilidad: en fuerza
                                por tiempo el camino manual es tipear SEG en el tile. */}
                            {kind === 'mobility' && size !== 'ss' && (
                                <button type="button" onClick={seedObjective} className="exec-v3-holdmod-btn2" data-testid={`${testIdPrefix}-seed-objective`}>
                                    {doneLabel}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={running ? pause : start}
                                className="exec-v3-holdmod-btn2"
                                data-testid={`${testIdPrefix}-toggle`}
                                aria-label={running ? 'Pausar el hold' : 'Reanudar el hold'}
                            >
                                {running ? <Pause className="h-[17px] w-[17px]" aria-hidden /> : <Play className="h-[17px] w-[17px]" aria-hidden />}
                                {running ? 'Pausar' : 'Reanudar'}
                            </button>
                            <button type="button" onClick={doneEarly} className="exec-v3-juicy exec-v3-holdmod-cta is-done" data-testid={`${testIdPrefix}-done`}>
                                {doneLabel}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
