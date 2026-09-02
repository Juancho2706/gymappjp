import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildIntervalSequence,
    createCardioElapsed,
    decideCardioAutolog,
    intervalPhaseClosesRound,
    intervalRoundPrescribedSec,
    readCardioElapsed,
    resetCardioElapsed,
    startCardioElapsed,
    type CardioElapsedState,
    type IntervalPhase,
} from '@eva/workout-engine'

import { useIntervalRunner } from './useIntervalRunner'

// Beep + vibración de cambio de fase: fuera del alcance de estos tests (la secuencia es lo que importa).
vi.mock('@/lib/audioUtils', () => ({ playTimerSound: vi.fn() }))
vi.mock('@/lib/client/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('../rest-timer-preferences', () => ({
    readRestTimerSound: () => 'beep',
    readRestTimerVolume: () => 0,
}))

/** 2×(trabajo 60" / recupera 30") por tiempo. */
const timedPhases: IntervalPhase[] = [
    { kind: 'work', durationSec: 60, repeat: 1, totalRepeats: 2, mode: 'timed' },
    { kind: 'recovery', durationSec: 30, repeat: 1, totalRepeats: 2, mode: 'timed' },
    { kind: 'work', durationSec: 60, repeat: 2, totalRepeats: 2, mode: 'timed' },
]

/** Trabajo por DISTANCIA (400 m ⇒ `manual`, sin cuenta regresiva) + recuperación por tiempo. */
const manualPhases: IntervalPhase[] = [
    { kind: 'work', durationSec: 0, repeat: 1, totalRepeats: 1, mode: 'manual', distanceM: 400 },
    { kind: 'recovery', durationSec: 90, repeat: 1, totalRepeats: 1, mode: 'timed' },
]

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useIntervalRunner — `onSegmentEnd`', () => {
    it('la fase que VENCE emite `expired` con el índice de la fase que terminó (no la siguiente)', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(timedPhases, { onSegmentEnd }))

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(60_500)
        })

        expect(onSegmentEnd).toHaveBeenCalledTimes(1)
        expect(onSegmentEnd).toHaveBeenLastCalledWith({ reason: 'expired', phaseIndex: 0 })
        expect(result.current.phaseIndex).toBe(1)

        act(() => {
            vi.advanceTimersByTime(30_500)
        })
        expect(onSegmentEnd).toHaveBeenCalledTimes(2)
        expect(onSegmentEnd).toHaveBeenLastCalledWith({ reason: 'expired', phaseIndex: 1 })
        expect(result.current.phaseIndex).toBe(2)
    })

    it('la última fase también emite antes de marcar la secuencia terminada', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(timedPhases, { onSegmentEnd }))

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(60_500 + 30_500 + 60_500)
        })

        expect(result.current.finished).toBe(true)
        expect(result.current.isActive).toBe(false)
        expect(onSegmentEnd).toHaveBeenCalledTimes(3)
        expect(onSegmentEnd).toHaveBeenLastCalledWith({ reason: 'expired', phaseIndex: 2 })
    })

    it('«Saltar fase» emite `skipped` (decisión del alumno, no un fin natural)', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(timedPhases, { onSegmentEnd }))

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        act(() => {
            result.current.skip()
        })

        expect(onSegmentEnd).toHaveBeenCalledTimes(1)
        expect(onSegmentEnd).toHaveBeenLastCalledWith({ reason: 'skipped', phaseIndex: 0 })
        expect(result.current.phaseIndex).toBe(1)
    })

    it('«Fase siguiente» de una fase por distancia emite `manual-next` y arranca la fase por tiempo', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(manualPhases, { onSegmentEnd }))

        expect(result.current.isManual).toBe(true)
        act(() => {
            result.current.next()
        })

        expect(onSegmentEnd).toHaveBeenCalledTimes(1)
        expect(onSegmentEnd).toHaveBeenLastCalledWith({ reason: 'manual-next', phaseIndex: 0 })
        expect(result.current.phaseIndex).toBe(1)
        expect(result.current.isActive).toBe(true)
    })

    it('con la secuencia terminada, saltar o avanzar ya no emite nada', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(timedPhases, { onSegmentEnd }))

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(160_000)
        })
        expect(result.current.finished).toBe(true)
        onSegmentEnd.mockClear()

        act(() => {
            result.current.skip()
            result.current.next()
        })
        expect(onSegmentEnd).not.toHaveBeenCalled()
    })

    it('«Reiniciar» NO emite (el consumidor decide la razón `restart` por su cuenta)', () => {
        const onSegmentEnd = vi.fn()
        const { result } = renderHook(() => useIntervalRunner(timedPhases, { onSegmentEnd }))

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        act(() => {
            result.current.restart()
        })

        expect(onSegmentEnd).not.toHaveBeenCalled()
        expect(result.current.phaseIndex).toBe(0)
        expect(result.current.isActive).toBe(true)
    })

    it('sin `onSegmentEnd` el corredor funciona igual (contrato opcional)', () => {
        const { result } = renderHook(() => useIntervalRunner(timedPhases))
        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(60_500)
        })
        expect(result.current.phaseIndex).toBe(1)
    })
})

/**
 * Espejo EXACTO de lo que hace `CardioStepV3` con cada fin de tramo (`handleSegment`): reloj de pared
 * del tramo, tope prescrito por ronda y reinicio del acumulador en el boundary cuando la secuencia
 * SIGUE corriendo. Sirve para probar de punta a punta lo que antes rompía el `key` por ronda.
 */
function mountSequence(phases: IntervalPhase[], repeatsPerRound: number, totalRounds: number) {
    const elapsed = { current: createCardioElapsed() as CardioElapsedState }
    const rows: { fillSeconds: number; rawElapsed: number }[] = []
    const visited: number[] = []

    const hook = renderHook(() =>
        useIntervalRunner(phases, {
            onSegmentEnd: ({ reason, phaseIndex }) => {
                visited.push(phaseIndex)
                const now = Date.now()
                const rawElapsed = readCardioElapsed(elapsed.current, now)
                const decision = decideCardioAutolog({
                    reason,
                    elapsedSec: rawElapsed,
                    closesRound: intervalPhaseClosesRound(phases, phaseIndex, repeatsPerRound, totalRounds),
                    prescribedSec: intervalRoundPrescribedSec(phases, phaseIndex, repeatsPerRound, totalRounds),
                })
                const keepsRunning = phaseIndex < phases.length - 1
                const cleared = decision.resetElapsed ? resetCardioElapsed() : elapsed.current
                elapsed.current = decision.resetElapsed && keepsRunning ? startCardioElapsed(cleared, now) : cleared
                if (decision.submit && decision.fillSeconds != null) {
                    rows.push({ fillSeconds: decision.fillSeconds, rawElapsed })
                }
            },
        }),
    )

    /** Play: el reloj de pared del tramo arranca con el gesto del alumno (nada corre al montar). */
    const start = () =>
        act(() => {
            elapsed.current = startCardioElapsed(elapsed.current, Date.now())
            hook.result.current.toggle()
        })
    /** CTA "Fase siguiente" de una fase por distancia (`handleNext` de la pantalla). */
    const next = () =>
        act(() => {
            elapsed.current = startCardioElapsed(elapsed.current, Date.now())
            hook.result.current.next()
        })

    return { ...hook, rows, visited, start, next, elapsed }
}

describe('secuencia de intervalos + auto-registro (integración con el motor)', () => {
    // 4×(1:00/0:30) con `sets: 2`, calentamiento 5:00 y vuelta a la calma 3:00.
    const phases = buildIntervalSequence(
        { repeats: 4, warmup_sec: 300, cooldown_sec: 180, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
        2,
    )

    it('la secuencia COMPLETA corre de corrido: warmup una vez, 2 filas y cooldown al final', () => {
        const { result, rows, visited, start } = mountSequence(phases, 4, 2)

        expect(phases[0].kind).toBe('warmup')
        expect(phases[phases.length - 1].kind).toBe('cooldown')

        start()
        act(() => {
            // Toda la secuencia (1170 s) + margen para el último tick.
            vi.advanceTimersByTime(1_171_000)
        })

        expect(result.current.finished).toBe(true)
        // El calentamiento (índice 0) se cierra UNA sola vez: no hay remonte que devuelva a la fase 0.
        expect(visited.filter((i) => i === 0)).toHaveLength(1)
        // Cada fase se cerró exactamente una vez, en orden, hasta el cooldown.
        expect(visited).toEqual(phases.map((_, i) => i))

        // Ronda 1 = warmup 300 + 4×(60+30) = 660 s (11 min): el warmup entra a la ronda 1 porque
        // `intervalRoundOfPhase` lo asigna ahí, y así la suma de las filas es la secuencia prescrita.
        // Ronda 2 = 4×60 + 3×30 + cooldown 180 = 510 s (8,5 min) — `buildIntervalSequence` no emite
        // recuperación después del último trabajo.
        expect(rows.map((r) => r.fillSeconds)).toEqual([660, 510])
        expect(rows[0].fillSeconds + rows[1].fillSeconds).toBe(phases.reduce((acc, p) => acc + p.durationSec, 0))
        // El reloj de pared crudo trae el drift de los ticks (≤250 ms por fase); el tope lo corta.
        for (const row of rows) expect(row.rawElapsed).toBeGreaterThanOrEqual(row.fillSeconds)
    })

    it('volver de la pestaña oculta no infla la fila: el tope es el tiempo PRESCRITO de la ronda', () => {
        const { rows, start } = mountSequence(phases, 4, 2)
        start()
        act(() => {
            // La pestaña se esconde a los 2 min y vuelve una hora después: el reloj de pared marca
            // 3600 s, pero la ronda 1 sólo prescribe 660.
            vi.advanceTimersByTime(120_000)
        })
        act(() => {
            // Una hora de pestaña oculta: al volver, el calentamiento cierra de una y la secuencia
            // sigue desde ahí (los 360 s que le faltan a la ronda 1).
            vi.setSystemTime(Date.now() + 3_600_000)
            vi.advanceTimersByTime(361_000)
        })
        expect(rows).toHaveLength(1)
        // El reloj de pared trae más de una hora; la fila registra los 660 s PRESCRITOS de la ronda.
        expect(rows[0].rawElapsed).toBeGreaterThan(3_000)
        expect(rows[0].fillSeconds).toBe(660)
    })

    it('una secuencia por DISTANCIA no arranca sola: el reloj cuenta desde el PRIMER gesto', () => {
        // 3 × 400 m (sin recuperación): cada trabajo cierra su ronda de captura.
        const manual = buildIntervalSequence({ repeats: 1, work: { distance_m: 400 } }, 3)
        expect(manual.map((p) => p.mode)).toEqual(['manual', 'manual', 'manual'])

        const { result, rows, next } = mountSequence(manual, 1, 3)
        expect(result.current.started).toBe(false)
        expect(result.current.isManual).toBe(true)

        // El alumno mira la pantalla 5 min antes de empezar: eso NO puede entrar en ninguna fila.
        act(() => {
            vi.advanceTimersByTime(300_000)
        })
        next()
        expect(result.current.started).toBe(true)
        // Ronda 1: el reloj recién arrancó con el gesto ⇒ 0 s ⇒ el motor no registra nada (la captura
        // queda a mano). Es la contrapartida deliberada de "nada corre solo al montar".
        expect(rows).toHaveLength(0)

        act(() => {
            vi.advanceTimersByTime(180_000)
        })
        next()
        act(() => {
            vi.advanceTimersByTime(120_000)
        })
        next()

        expect(rows.map((r) => r.fillSeconds)).toEqual([180, 120])
        expect(result.current.finished).toBe(true)
    })
})
