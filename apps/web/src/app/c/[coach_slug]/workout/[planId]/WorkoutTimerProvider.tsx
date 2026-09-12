'use client'

import React, { useState, useEffect, createContext, useContext, useCallback, useRef, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RestTimer } from './RestTimer'
import { HoldTimer } from './HoldTimer'
import { IntervalTimer } from './IntervalTimer'
import { Stopwatch } from './Stopwatch'
import { buildIntervalSequence, type IntervalPhase } from '@eva/workout-engine'
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
    /**
     * «Reps tras el reloj» · Enmienda E1 (owner 12-09): arranca el descanso YA MINIMIZADO — la barra
     * compacta que el `RestTimer` v3 muestra al minimizar — en vez del interstitial a pantalla
     * completa. Sirve al caso del reloj de fuerza por tiempo que llega a 0 con huecos: el alumno anota
     * kg/reps SOBRE la pantalla del ejercicio con el contador mini a la vista, y al resolver la sheet
     * el descanso se expande con `expandRest()`, con el MISMO reloj (nunca se reinicia).
     *
     * Sin la opción el descanso arranca expandido, exactamente como siempre. En `variant='compact'`
     * (legacy V2) es inerte: ahí no hay interstitial que minimizar.
     */
    minimized?: boolean
}

/**
 * Opciones del cronómetro (hallazgo E · paridad con el `StopwatchHero` de RN): `onPause` recibe los
 * segundos CONGELADOS al pausar, para que el bloque por distancia vuelque sus minutos en la fila de
 * captura activa. Sin la opción el cronómetro se comporta exactamente como siempre.
 */
interface StopwatchOptions {
    onPause?: (elapsedSec: number) => void
}

/**
 * Reloj del descanso activo (W5.2b) — mini-store FUERA de React. El chip «Descanso 1:27» de la sheet
 * de huecos necesita el tiempo vivo, pero un `setState` por tick en el provider re-renderizaría el
 * ejecutor entero (3,6k líneas de cliente + todos los pasos) una vez por segundo. Así que el valor
 * viaja por un ref + listeners y sólo el chip —una hoja— se re-renderiza, con su propio intervalo.
 *
 * · `endAtMs` — epoch en el que el descanso llega a 0, mientras CORRE.
 * · `pausedRemainingSec` — segundos congelados mientras está PAUSADO (o `0` cuando suena la alarma).
 * · Los dos en `null` ⇒ no hay descanso: el chip no se pinta.
 */
export type RestClockSnapshot = {
    endAtMs: number | null
    pausedRemainingSec: number | null
}

const REST_CLOCK_IDLE: RestClockSnapshot = { endAtMs: null, pausedRemainingSec: null }

/** Segundos que quedan según el snapshot, o `null` si no hay descanso. Nunca negativo. */
function remainingFromClock(clock: RestClockSnapshot): number | null {
    if (clock.pausedRemainingSec != null) return Math.max(0, clock.pausedRemainingSec)
    if (clock.endAtMs == null) return null
    return Math.max(0, Math.ceil((clock.endAtMs - Date.now()) / 1000))
}

interface WorkoutContextType {
    startRest: (timeStr: string | null, opts?: RestOptions) => void
    startHold: (seconds: number, label?: string) => void
    startInterval: (config: IntervalConfig, sets?: number) => void
    startStopwatch: (opts?: StopwatchOptions) => void
    /** Auto-skip (M2): cortar el descanso en curso (p.ej. al registrar la siguiente serie). */
    cancelRest: () => void
    /**
     * Enmienda E1: sube el descanso de la barra compacta al interstitial a pantalla completa SIN
     * remontarlo — mismo reloj, misma alarma, mismo WakeLock. Lo llaman las sheets de huecos al
     * resolverse (Guardar / «Sin reps» / scrim / X). Sin descanso montado no hace nada.
     */
    expandRest: () => void
    /** W5.2b: se suscribe a los CAMBIOS DE FORMA del reloj (arranque, pausa, ±15 s, 0, cierre). */
    subscribeRestClock: (listener: () => void) => () => void
    /** W5.2b: lee el snapshot vigente sin suscribirse (lo usa `useRestRemainingSec` en cada tick). */
    readRestClock: () => RestClockSnapshot
}

type ActiveTimer =
    | { kind: 'rest'; seconds: number; label?: string; warmup?: boolean; minimized?: boolean }
    | { kind: 'hold'; seconds: number; label?: string }
    | { kind: 'interval'; phases: IntervalPhase[] }
    | { kind: 'stopwatch'; onPause?: (elapsedSec: number) => void }

const WorkoutContext = createContext<WorkoutContextType | null>(null)

export function useWorkoutTimer() {
    const context = useContext(WorkoutContext)
    if (!context) {
        throw new Error('useWorkoutTimer must be used within a WorkoutTimerProvider')
    }
    return context
}

/**
 * Segundos que le quedan al descanso activo, o `null` si no hay ninguno (W5.2b).
 *
 * El intervalo de 1 s vive ACÁ, en el consumidor, y muere con él: sin chip montado nadie cuenta nada.
 * Las suscripción cubre lo que el intervalo no puede adivinar (pausa, ±15 s, un descanso nuevo, el
 * cierre). `setState` con el mismo número no re-renderiza (React hace bail-out), así que un descanso
 * pausado no cuesta nada.
 *
 * Montalo SÓLO en componentes hoja: quien lo llame se re-renderiza una vez por segundo.
 */
export function useRestRemainingSec(): number | null {
    const { subscribeRestClock, readRestClock } = useWorkoutTimer()
    const [remaining, setRemaining] = useState<number | null>(() => remainingFromClock(readRestClock()))
    useEffect(() => {
        const sync = () => setRemaining(remainingFromClock(readRestClock()))
        sync()
        const unsubscribe = subscribeRestClock(sync)
        const id = setInterval(sync, 1000)
        return () => {
            unsubscribe()
            clearInterval(id)
        }
    }, [subscribeRestClock, readRestClock])
    return remaining
}

/** `1:27`, el mismo formato de la barra y del interstitial. */
function formatRestClock(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

/** «1 minuto 27 segundos» — para el lector de pantalla, que no lee bien `1:27`. */
function spokenRestClock(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    const parts: string[] = []
    if (m > 0) parts.push(`${m} minuto${m === 1 ? '' : 's'}`)
    if (s > 0) parts.push(`${s} segundo${s === 1 ? '' : 's'}`)
    return parts.join(' ')
}

/**
 * Chip vivo «Descanso 1:27» (W5.2b · Enmienda E1). El owner pidió que el alumno VEA el contador
 * mientras anota: con la sheet de huecos abierta (z-62) la barra minimizada del descanso queda
 * tapada, así que el reloj se repite en la cabecera de la sheet.
 *
 * Es un componente HOJA a propósito: `useRestRemainingSec` re-renderiza a quien lo llame una vez por
 * segundo, y acá eso es un `<span>`, no el paso entero.
 *
 * · Sin descanso activo ⇒ no se pinta nada.
 * · A 0 dice «¡A entrenar!» hasta que el `RestTimer` se auto-descarta (~1,5 s): así el caso «el
 *   descanso se acabó con la sheet abierta» tiene señal visual y no desaparece en silencio.
 * · `aria-live="off"`: un contador que se anuncia cada segundo es ruido puro; el `aria-label` da el
 *   valor a quien lo consulte.
 * · Estilo: la MISMA receta del chip «Guardado · N s» del módulo de hold (`.exec-v3-holdmod-saved`).
 *   Esa clase resuelve su color contra `--exec-hold-accent`, que sólo existe dentro de
 *   `.exec-v3-holdmod` ⇒ acá se siembra inline con la marca del ejecutor.
 */
export function RestClockChip({ className }: { className?: string }) {
    const remaining = useRestRemainingSec()
    if (remaining == null) return null
    const done = remaining === 0
    return (
        <span
            className={cn('exec-v3-holdmod-saved tabular-nums', className)}
            style={{ '--exec-hold-accent': 'var(--exec-brand)' } as CSSProperties}
            aria-live="off"
            aria-label={done ? '¡A entrenar!' : `Descanso, quedan ${spokenRestClock(remaining)}`}
            data-testid="rest-clock-chip"
        >
            {done ? '¡A entrenar!' : `Descanso ${formatRestClock(remaining)}`}
        </span>
    )
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
    /**
     * Señal de EXPANDIR (E1). Es un nonce y no un booleano de presentación a propósito: el estado
     * `minimized` sigue viviendo dentro del `RestTimer` (que lo cambia solo con «Minimizar» /
     * «Ampliar el descanso»), y esto es apenas un pulso — así expandir jamás remonta el cronómetro
     * ni reinicia el conteo, que es todo el punto del pedido del owner.
     */
    const [expandNonce, setExpandNonce] = useState(0)
    // W5.2b · mini-store del reloj: ref + listeners, CERO estado de React (ver `RestClockSnapshot`).
    const restClockRef = useRef<RestClockSnapshot>(REST_CLOCK_IDLE)
    const restClockListenersRef = useRef<Set<() => void>>(new Set())
    const activeRef = useRef<ActiveTimer | null>(null)
    // Patrón "latest ref": activeRef solo se lee en replaceWith (callback de evento), nunca en render.
    // El compiler tolera este caso; el write en render hace que el callback vea el valor actual sin lag.
    // eslint-disable-next-line react-hooks/refs
    activeRef.current = active

    /**
     * W5.2b — publica el reloj y avisa a los suscriptores SÓLO si cambió la forma. Mientras el
     * descanso corre, `endAtMs` es constante: el `RestTimer` puede llamar esto en cada tick (lo hace,
     * porque su efecto depende de `timeLeft`) y nadie se entera. Cero `setState` acá.
     */
    const publishRestClock = useCallback((next: RestClockSnapshot) => {
        const cur = restClockRef.current
        if (cur.endAtMs === next.endAtMs && cur.pausedRemainingSec === next.pausedRemainingSec) return
        restClockRef.current = next
        for (const listener of restClockListenersRef.current) listener()
    }, [])
    const subscribeRestClock = useCallback((listener: () => void) => {
        const listeners = restClockListenersRef.current
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }, [])
    const readRestClock = useCallback(() => restClockRef.current, [])

    /** Reemplazo suave: si ya hay un timer corriendo, avisa que fue reemplazado (AC5). */
    const replaceWith = useCallback((next: ActiveTimer | null) => {
        if (activeRef.current && next && activeRef.current.kind !== next.kind) {
            toast.info('Temporizador anterior reemplazado')
        }
        // W5.2b: el descanso que había (si había) deja de existir acá mismo. El CICLO DE VIDA del
        // reloj lo maneja el provider —`replaceWith`, `close`, `cancelRest`—; el `RestTimer` sólo
        // reporta la FORMA (pausa, ±15 s, 0) mientras vive. Si no, su cleanup de desmontaje borraría
        // la semilla que `startRest` acaba de sembrar y el chip parpadearía.
        publishRestClock(REST_CLOCK_IDLE)
        // Forzar remount aunque sea el mismo tipo (reinicia el conteo)
        setActive(null)
        if (next) setTimeout(() => setActive(next), 10)
    }, [publishRestClock])

    const startRest = useCallback((timeStr: string | null, opts?: RestOptions) => {
        const seconds = parseRestTime(timeStr)
        if (seconds > 0) {
            replaceWith({
                kind: 'rest',
                seconds,
                label: opts?.label,
                warmup: opts?.warmup,
                minimized: opts?.minimized,
            })
            // W5.2b: semilla inmediata. El `RestTimer` monta 10 ms después (`replaceWith`) y corrige
            // el `endAtMs` con el suyo; sin la semilla, un chip que se monta en el MISMO tick que el
            // descanso (justo lo que hace la sheet de huecos) arrancaría en blanco.
            publishRestClock({ endAtMs: Date.now() + seconds * 1000, pausedRemainingSec: null })
        }
    }, [replaceWith, publishRestClock])

    const startHold = useCallback((seconds: number, label?: string) => {
        if (Number.isFinite(seconds) && seconds > 0) {
            replaceWith({ kind: 'hold', seconds: Math.round(seconds), label })
        }
    }, [replaceWith])

    const startInterval = useCallback((config: IntervalConfig, sets: number = 1) => {
        // Secuencia COMPLETA (Fase D · deuda #6 cardio-ejes): los pasos por DISTANCIA entran como
        // fases `manual` y el overlay muestra la distancia + "Fase siguiente" — antes acá había un
        // early-return con toast y 8×400m/HYROX quedaban sin timer flotante. `[]` solo si el work
        // no prescribe ni tiempo ni distancia.
        const phases = buildIntervalSequence(config, sets)
        if (phases.length === 0) return
        replaceWith({ kind: 'interval', phases })
    }, [replaceWith])

    const startStopwatch = useCallback((opts?: StopwatchOptions) => {
        replaceWith({ kind: 'stopwatch', onPause: opts?.onPause })
    }, [replaceWith])

    const close = useCallback(() => {
        // W5.2b: cerrar/saltar/auto-descartar el descanso apaga el chip (ver `replaceWith`).
        publishRestClock(REST_CLOCK_IDLE)
        setActive(null)
    }, [publishRestClock])
    // Auto-skip (M2): sólo corta si HAY un descanso corriendo (no pisa hold/interval/cronómetro).
    const cancelRest = useCallback(() => {
        publishRestClock(REST_CLOCK_IDLE)
        setActive((cur) => (cur?.kind === 'rest' ? null : cur))
    }, [publishRestClock])
    // E1: un pulso, no un estado de presentación (ver `expandNonce`). Idempotente y barato: si no hay
    // descanso montado el nonce sube y nadie lo escucha.
    const expandRest = useCallback(() => setExpandNonce((n) => n + 1), [])

    return (
        <WorkoutContext.Provider
            value={{
                startRest,
                startHold,
                startInterval,
                startStopwatch,
                cancelRest,
                expandRest,
                subscribeRestClock,
                readRestClock,
            }}
        >
            {children}
            {active?.kind === 'rest' && (
                <RestTimer
                    initialSeconds={active.seconds}
                    nextLabel={active.label}
                    warmup={active.warmup}
                    variant={v3 ? 'v3' : 'compact'}
                    initialMinimized={active.minimized}
                    expandNonce={expandNonce}
                    onClockChange={publishRestClock}
                    onClose={close}
                />
            )}
            {active?.kind === 'hold' && (
                <HoldTimer initialSeconds={active.seconds} label={active.label} onClose={close} />
            )}
            {active?.kind === 'interval' && (
                <IntervalTimer phases={active.phases} onClose={close} />
            )}
            {active?.kind === 'stopwatch' && <Stopwatch onClose={close} onPause={active.onPause} />}
        </WorkoutContext.Provider>
    )
}
