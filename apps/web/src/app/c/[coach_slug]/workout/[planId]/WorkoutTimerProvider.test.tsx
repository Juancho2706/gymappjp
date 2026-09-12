import { useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * specs/reps-tras-el-reloj · Enmienda E1 (owner 12-09) — el CONTRATO del provider con el `RestTimer`:
 * `startRest(t, { minimized: true })` lo monta en la barra compacta y `expandRest()` lo sube a
 * pantalla completa **sin remontarlo** (mismo `initialSeconds`, misma instancia ⇒ el reloj sigue
 * donde estaba, que es todo el pedido: «que siga normal a la pantalla grande del descanso continuando
 * con el timer que ya tenía el mini»).
 *
 * El `RestTimer` va MOCKEADO: arrastra audio, WakeLock, Media Session y framer-motion, y su propio
 * comportamiento (qué hace con `initialMinimized` / `expandNonce`) se ve en el ejecutor. Acá el sujeto
 * es lo que el provider LE PASA.
 */

const harness = vi.hoisted(() => ({
    /** Props de cada render del `RestTimer` (el orden importa: el último es el vigente). */
    rest: [] as Array<Record<string, unknown>>,
}))

vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }),
}))
vi.mock('./RestTimer', () => ({
    RestTimer: (props: Record<string, unknown>) => {
        harness.rest.push(props)
        return null
    },
}))
vi.mock('./HoldTimer', () => ({ HoldTimer: () => null }))
vi.mock('./IntervalTimer', () => ({ IntervalTimer: () => null }))
vi.mock('./Stopwatch', () => ({ Stopwatch: () => null }))

import { WorkoutTimerProvider, useWorkoutTimer, useRestRemainingSec } from './WorkoutTimerProvider'

/** Puente al contexto. La captura va en un EFECTO (asignar en render es un side effect prohibido). */
const probe: { api: ReturnType<typeof useWorkoutTimer> | null } = { api: null }
function Probe() {
    const timer = useWorkoutTimer()
    useEffect(() => {
        probe.api = timer
    }, [timer])
    return null
}
const api = () => probe.api

/** Hoja que consume el mini-store del reloj (W5.2b) — lo que hace el chip de la sheet de huecos. */
function ClockProbe() {
    const remaining = useRestRemainingSec()
    return <span data-testid="clock">{remaining == null ? '—' : String(remaining)}</span>
}

/** `replaceWith` nulea y re-monta con un `setTimeout(…, 10)`: hay que dejarlo pasar de verdad. */
async function settle() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
    })
}

function mountProvider({ clock = false } = {}) {
    return render(
        <WorkoutTimerProvider v3>
            <Probe />
            {clock && <ClockProbe />}
        </WorkoutTimerProvider>,
    )
}

const lastRest = () => harness.rest.at(-1)

beforeEach(() => {
    harness.rest = []
    probe.api = null
})

describe('E1 — `minimized` y `expandRest` en el provider', () => {
    it('sin la opción el descanso se monta EXPANDIDO (byte-idéntico a lo de siempre)', async () => {
        mountProvider()
        act(() => api()?.startRest('90s', { label: 'Sentadilla' }))
        await settle()

        expect(lastRest()?.initialSeconds).toBe(90)
        expect(lastRest()?.initialMinimized).toBeUndefined()
    })

    it('`minimized: true` lo monta en la barra compacta', async () => {
        mountProvider()
        act(() => api()?.startRest('90s', { label: 'Sentadilla', minimized: true }))
        await settle()

        expect(lastRest()?.initialMinimized).toBe(true)
    })

    it('`expandRest()` sube el nonce SIN remontar: mismos segundos, misma presentación pedida', async () => {
        mountProvider()
        act(() => api()?.startRest('90s', { minimized: true }))
        await settle()
        const before = lastRest()

        act(() => api()?.expandRest())

        const after = lastRest()
        expect(after?.expandNonce).not.toBe(before?.expandNonce)
        // Lo que NO cambia es lo que garantiza que el reloj no se reinicia: el `RestTimer` sigue
        // siendo la MISMA instancia (mismo `initialSeconds`, sin pasar por `replaceWith`).
        expect(after?.initialSeconds).toBe(90)
        expect(after?.initialMinimized).toBe(true)
    })

    it('un descanso nuevo vuelve a expandido aunque el anterior se haya pedido minimizado', async () => {
        mountProvider()
        act(() => api()?.startRest('90s', { minimized: true }))
        await settle()
        act(() => api()?.startRest('60s'))
        await settle()

        expect(lastRest()?.initialSeconds).toBe(60)
        expect(lastRest()?.initialMinimized).toBeUndefined()
    })

    it('`cancelRest()` sigue desmontando el descanso, minimizado o no', async () => {
        mountProvider()
        act(() => api()?.startRest('90s', { minimized: true }))
        await settle()
        const renders = harness.rest.length

        act(() => api()?.cancelRest())
        await settle()

        expect(harness.rest.length).toBe(renders)
    })
})

/**
 * specs/reps-tras-el-reloj · W5.2b — el reloj que alimenta el chip «Descanso 1:27». Lo que se congela
 * acá es el CONTRATO del mini-store: cuenta solo (intervalo del consumidor, no del provider) y se
 * apaga cuando el descanso deja de existir. El `RestTimer` va mockeado, así que lo único que publica
 * es el provider — que es justo la mitad que importa para el ciclo de vida.
 */
describe('W5.2b — `useRestRemainingSec`', () => {
    it('sin descanso devuelve `null` (el chip no se pinta)', () => {
        mountProvider({ clock: true })

        expect(screen.getByTestId('clock').textContent).toBe('—')
    })

    it('cuenta desde el arranque con su propio intervalo y `cancelRest` lo apaga', () => {
        vi.useFakeTimers()
        try {
            mountProvider({ clock: true })
            act(() => api()?.startRest('90s'))
            expect(screen.getByTestId('clock').textContent).toBe('90')

            act(() => {
                vi.advanceTimersByTime(5000)
            })
            expect(screen.getByTestId('clock').textContent).toBe('85')

            act(() => api()?.cancelRest())
            expect(screen.getByTestId('clock').textContent).toBe('—')
        } finally {
            vi.useRealTimers()
        }
    })
})
