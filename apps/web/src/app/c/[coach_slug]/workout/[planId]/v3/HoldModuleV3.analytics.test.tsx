/**
 * Analítica del módulo de HOLD web (specs/cuenta-atras-en-pantalla, **W6.1** · DATA-TESTING §8.1).
 *
 * Protege el contrato de los TRES eventos —nombre y props EXACTAS—, no la UI: si alguien renombra
 * una prop o emite `hold_timer_started` en el lado 2, el insight de adopción (§8.2) y el denominador
 * del umbral de alarma (§8.4) quedan mal y nadie se entera hasta leer PostHog.
 *
 * Reglas que se fijan acá:
 *  · `hold_timer_started` es UNO por serie — el arranque del PRIMER lado. El lado 2 auto-arrancado y
 *    el «Reanudar» tras la pausa NO re-emiten.
 *  · `hold_timer_completed` / `hold_early_finished` son UNO por SERIE, no por lado: en `per_side` el
 *    commit ocurre al cerrar el derecho.
 *  · `via_app_state` conserva el nombre canónico de R19 con el VALOR de `expiredWhileAway` (R27).
 *  · Sin PII: sólo `block_id`, enums y segundos.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HoldModuleV3, type HoldModuleV3Props } from './HoldModuleV3'

// El reloj emite sonido y vibración al llegar a 0: acá sólo interesa la analítica.
vi.mock('@/lib/audioUtils', () => ({ playTimerSound: vi.fn() }))
vi.mock('@/lib/client/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('../rest-timer-preferences', () => ({
    readRestTimerSound: () => 'beep',
    readRestTimerVolume: () => 0,
}))

// `vi.hoisted`: la factoría del mock corre ANTES del cuerpo del archivo, así que el espía no puede
// ser un `const` de módulo (quedaría sin inicializar).
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }))

const BASE: HoldModuleV3Props = {
    kind: 'mobility',
    size: 'solo214',
    blockId: 'blk-1',
    prescribedSec: 30,
    sideMode: null,
    context: 'solo',
    closesRound: false,
    resetKey: 'blk-1:1:1',
    onMeasured: () => {},
}

function mount(over: Partial<HoldModuleV3Props> = {}) {
    return render(<HoldModuleV3 {...BASE} {...over} />)
}

/** Eventos capturados con ese nombre (par `[nombre, props]`). */
function eventsNamed(name: string) {
    return capture.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>)
}

function advance(ms: number) {
    act(() => {
        vi.advanceTimersByTime(ms)
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    capture.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('HoldModuleV3 · hold_timer_started (W6.1)', () => {
    it('se emite al tocar «Iniciar hold» con las 4 props del contrato', () => {
        mount({ sideMode: 'per_side', context: 'superset' })
        fireEvent.click(screen.getByTestId('hold-start'))

        expect(eventsNamed('hold_timer_started')).toEqual([
            { block_id: 'blk-1', exercise_type: 'mobility', context: 'superset', side_mode: 'per_side' },
        ])
    })

    it('fuerza por tiempo viaja como exercise_type strength', () => {
        mount({ kind: 'strength_time', size: 'solo130' })
        fireEvent.click(screen.getByTestId('hold-start'))
        expect(eventsNamed('hold_timer_started')[0]).toMatchObject({ exercise_type: 'strength', side_mode: null })
    })

    it('«Reanudar» tras la pausa NO re-emite (uno por serie)', () => {
        mount()
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(4_000)
        fireEvent.click(screen.getByTestId('hold-toggle')) // Pausar
        fireEvent.click(screen.getByTestId('hold-toggle')) // Reanudar
        expect(eventsNamed('hold_timer_started')).toHaveLength(1)
    })

    it('per_side: el lado 2 arranca SOLO y tampoco re-emite', () => {
        mount({ sideMode: 'per_side', prescribedSec: 4 })
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(4_500)
        expect(eventsNamed('hold_timer_started')).toHaveLength(1)
    })
})

describe('HoldModuleV3 · hold_timer_completed (W6.1)', () => {
    it('a 0 se emite con las 6 props; via_app_state false en pestaña visible', () => {
        mount({ prescribedSec: 5, context: 'superset', closesRound: true })
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(5_500)

        expect(eventsNamed('hold_timer_completed')).toEqual([
            {
                block_id: 'blk-1',
                exercise_type: 'mobility',
                context: 'superset',
                hold_source: 'timer',
                closes_round: true,
                via_app_state: false,
            },
        ])
        // El cierre por reloj NUNCA es «Listo antes de 0».
        expect(eventsNamed('hold_early_finished')).toHaveLength(0)
    })

    it('per_side: UNO por serie (el izquierdo siembra, el derecho envía)', () => {
        mount({ sideMode: 'per_side', prescribedSec: 4 })
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(4_500) // cierra el izquierdo → el derecho arranca solo
        advance(4_500) // cierra el derecho → commit
        expect(eventsNamed('hold_timer_completed')).toHaveLength(1)
    })
})

describe('HoldModuleV3 · hold_early_finished (W6.1)', () => {
    it('«Listo» antes de 0 emite lo transcurrido y el objetivo', () => {
        mount({ prescribedSec: 30 })
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(12_000)
        fireEvent.click(screen.getByTestId('hold-done'))

        expect(eventsNamed('hold_early_finished')).toEqual([
            {
                block_id: 'blk-1',
                exercise_type: 'mobility',
                context: 'solo',
                elapsed_sec: 12,
                prescribed_sec: 30,
            },
        ])
        expect(eventsNamed('hold_timer_completed')).toHaveLength(0)
    })

    it('la PAUSA no cierra la serie ⇒ no emite ninguno de los dos cierres', () => {
        mount({ prescribedSec: 30 })
        fireEvent.click(screen.getByTestId('hold-start'))
        advance(8_000)
        fireEvent.click(screen.getByTestId('hold-toggle'))
        expect(eventsNamed('hold_early_finished')).toHaveLength(0)
        expect(eventsNamed('hold_timer_completed')).toHaveLength(0)
    })

    it('CA-90: «Listo» desde idle siembra el objetivo y NO emite cierre', () => {
        mount({ prescribedSec: 30 })
        fireEvent.click(screen.getByTestId('hold-seed-objective'))
        expect(capture).not.toHaveBeenCalled()
    })
})
