import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    createCardioElapsed,
    decideCardioAutolog,
    readCardioElapsed,
    startCardioElapsed,
} from '@eva/workout-engine'

import { formatCountdown, useExecCountdown } from './useExecCountdown'

// El hook emite sonido y vibración al llegar a 0 (paridad con `HoldTimer`): acá sólo interesa la
// máquina de conteo, así que se neutralizan los efectos de plataforma.
vi.mock('@/lib/audioUtils', () => ({ playTimerSound: vi.fn() }))
vi.mock('@/lib/client/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('../rest-timer-preferences', () => ({
    readRestTimerSound: () => 'beep',
    readRestTimerVolume: () => 0,
}))

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useExecCountdown — fin natural del conteo', () => {
    it('`onDone` dispara UNA sola vez al cruzar 0 y deja el reloj en done', () => {
        const onDone = vi.fn()
        const { result } = renderHook(() => useExecCountdown(3, { autoStart: true, onDone }))

        expect(result.current.isActive).toBe(true)
        act(() => {
            vi.advanceTimersByTime(3_500)
        })
        expect(result.current.timeLeft).toBe(0)
        expect(result.current.done).toBe(true)
        expect(result.current.isActive).toBe(false)
        expect(onDone).toHaveBeenCalledTimes(1)

        // Seguir corriendo el reloj no vuelve a disparar (guard `firedRef`).
        act(() => {
            vi.advanceTimersByTime(5_000)
        })
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('el restante y la fracción del anillo acompañan al avance del objetivo', () => {
        const { result } = renderHook(() => useExecCountdown(10, { autoStart: true }))
        expect(result.current.timeLeft).toBe(10)
        expect(result.current.frac).toBe(1)
        act(() => {
            vi.advanceTimersByTime(4_000)
        })
        expect(result.current.timeLeft).toBe(6)
        expect(result.current.frac).toBeCloseTo(0.6, 5)
    })

    it('pausar antes de 0 NO dispara `onDone` (el alumno detuvo: decide él)', () => {
        const onDone = vi.fn()
        const { result } = renderHook(() => useExecCountdown(10, { autoStart: true, onDone }))

        act(() => {
            vi.advanceTimersByTime(2_000)
        })
        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(30_000)
        })

        expect(result.current.isActive).toBe(false)
        expect(result.current.done).toBe(false)
        expect(onDone).not.toHaveBeenCalled()
    })
})

describe('useExecCountdown — `resetKey` (ronda nueva)', () => {
    it('cambiar la clave devuelve el reloj al objetivo, sin done y DETENIDO', () => {
        const onDone = vi.fn()
        const { result, rerender } = renderHook(
            ({ key }: { key: number }) => useExecCountdown(5, { autoStart: false, resetKey: key, onDone }),
            { initialProps: { key: 1 } },
        )

        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(5_500)
        })
        expect(result.current.done).toBe(true)
        expect(onDone).toHaveBeenCalledTimes(1)

        rerender({ key: 2 })
        expect(result.current.timeLeft).toBe(5)
        expect(result.current.done).toBe(false)
        expect(result.current.isActive).toBe(false)

        // Y el disparo vuelve a estar armado para la ronda nueva.
        act(() => {
            result.current.toggle()
        })
        act(() => {
            vi.advanceTimersByTime(5_500)
        })
        expect(onDone).toHaveBeenCalledTimes(2)
    })
})

describe('useExecCountdown — pestaña oculta', () => {
    it('volver a la pestaña con el fin ya vencido cierra el conteo y dispara `onDone`', () => {
        const onDone = vi.fn()
        const { result } = renderHook(() => useExecCountdown(30, { autoStart: true, onDone }))

        // Chrome congela el `setInterval` en segundo plano: el reloj de pared avanza pero no hay ticks.
        act(() => {
            vi.setSystemTime(Date.now() + 60_000)
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(result.current.timeLeft).toBe(0)
        expect(result.current.done).toBe(true)
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('volver a la pestaña ANTES del vencimiento sólo re-sincroniza el restante', () => {
        const onDone = vi.fn()
        const { result } = renderHook(() => useExecCountdown(60, { autoStart: true, onDone }))

        act(() => {
            vi.setSystemTime(Date.now() + 20_000)
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(result.current.timeLeft).toBe(40)
        expect(result.current.done).toBe(false)
        expect(onDone).not.toHaveBeenCalled()
    })

    it('con la pestaña OCULTA no toca nada (el evento también llega al esconderse)', () => {
        const onDone = vi.fn()
        const { result } = renderHook(() => useExecCountdown(30, { autoStart: true, onDone }))
        const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

        act(() => {
            vi.setSystemTime(Date.now() + 60_000)
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(result.current.done).toBe(false)
        expect(onDone).not.toHaveBeenCalled()
        spy.mockRestore()
    })
})

describe('formatCountdown', () => {
    it('mm:ss con segundos siempre en dos dígitos', () => {
        expect(formatCountdown(0)).toBe('0:00')
        expect(formatCountdown(65)).toBe('1:05')
        expect(formatCountdown(1800)).toBe('30:00')
    })
})

describe('cardio continuo + auto-registro: el MIN que se envía es el prescrito', () => {
    /** Espejo del `handleSegment` de `CardioStepV3` para el bloque continuo (reloj de pared + tope). */
    function mountBlock(durationSec: number) {
        const elapsed = { current: createCardioElapsed() }
        const rows: { fillSeconds: number; rawElapsed: number; submit: boolean }[] = []
        const hook = renderHook(() =>
            useExecCountdown(durationSec, {
                autoStart: false,
                onDone: () => {
                    const rawElapsed = readCardioElapsed(elapsed.current, Date.now())
                    const decision = decideCardioAutolog({
                        reason: 'expired',
                        elapsedSec: rawElapsed,
                        closesRound: true,
                        prescribedSec: durationSec,
                    })
                    if (decision.fillSeconds != null) {
                        rows.push({ fillSeconds: decision.fillSeconds, rawElapsed, submit: decision.submit })
                    }
                },
            }),
        )
        const start = () =>
            act(() => {
                elapsed.current = startCardioElapsed(elapsed.current, Date.now())
                hook.result.current.toggle()
            })
        return { ...hook, rows, start }
    }

    it('bloque de 20 min con la pestaña oculta 45 min ⇒ se registran 20, no 45 (AC-E10)', () => {
        const { result, rows, start } = mountBlock(1200)
        start()

        // Chrome congela el tick con la pestaña escondida; al volver, el fin absoluto ya venció.
        act(() => {
            vi.setSystemTime(Date.now() + 45 * 60_000)
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(result.current.done).toBe(true)
        expect(rows).toHaveLength(1)
        expect(rows[0].submit).toBe(true)
        expect(rows[0].rawElapsed).toBe(2700)
        expect(rows[0].fillSeconds).toBe(1200)
    })

    it('sin background el tope no cambia nada: se registra lo que duró el bloque', () => {
        const { rows, start } = mountBlock(600)
        start()
        act(() => {
            vi.advanceTimersByTime(600_500)
        })
        expect(rows.map((r) => r.fillSeconds)).toEqual([600])
    })
})
