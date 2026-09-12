import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `specs/cuenta-atras-en-pantalla` · W4.2 / W4.3 / W4.4 / W4.6 — el AUTO-ENVÍO del hold en la web.
 *
 * Lo que fija esta suite es lo que fallaba **en silencio**:
 *  · W4.2 — el auto-envío vive en DOS componentes (`StrengthLogSetForm` y `TypedLogSetRow`), porque la
 *    fuerza por tiempo se pinta en la fila de FUERZA y `holdPrefill` solo existía en la tipada.
 *  · W4.3 — el guard de serie vacía de fuerza (`w == null && r == null`) se tragaba la serie por
 *    tiempo, que llega con `reps_done` nulo y solo segundos.
 *  · W4.4 — `hold_source` viaja en el MISMO objeto jsonb que `{left_sec, right_sec}` (el UPDATE
 *    reemplaza la columna entera) y `reps_done` NUNCA viaja en modo tiempo (R2).
 *  · W4.6 / CA-80 — con la preferencia OFF no se arranca descanso **ni se corta el que ya corre**.
 */

const harness = vi.hoisted(() => ({
    logSetAction: vi.fn(async () => ({ success: true })),
    startRest: vi.fn(),
    cancelRest: vi.fn(),
    startHold: vi.fn(),
    startInterval: vi.fn(),
    startStopwatch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useParams: () => ({ coach_slug: 'coach', planId: 'plan-1' }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    useSearchParams: () => ({ get: vi.fn() }),
    usePathname: () => '',
}))

vi.mock('./_actions/workout-log.actions', () => ({
    logSetAction: (...args: unknown[]) => harness.logSetAction(...(args as [])),
}))

// El provider real monta timers y portales: acá interesa QUIÉN llama a `startRest`, no el cronómetro.
// `parseRestTime` se conserva (es pura y decide si hay descanso que arrancar).
vi.mock('./WorkoutTimerProvider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./WorkoutTimerProvider')>()
    return {
        ...actual,
        useWorkoutTimer: () => ({
            startRest: harness.startRest,
            cancelRest: harness.cancelRest,
            startHold: harness.startHold,
            startInterval: harness.startInterval,
            startStopwatch: harness.startStopwatch,
        }),
    }
})

vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/lib/client/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('./v3/use-celebrations', () => ({
    useCelebrations: () => ({ celebrate: vi.fn(), plan: () => ({ tier: null, visual: 'none', reducedMotion: true }) }),
}))

import { DEFAULT_REST_FALLBACK_SEC } from '@eva/workout-engine'
import { LogSetForm, type HoldPrefill } from './LogSetForm'

const BLOCK_ID = '11111111-1111-4111-8111-111111111111'

/** FormData del último (o único) envío que llegó a `logSetAction`. */
function lastFormData(): FormData {
    const call = harness.logSetAction.mock.calls.at(-1) as unknown as [unknown, FormData]
    return call[1]
}

type Row = Parameters<typeof LogSetForm>[0]

/**
 * Monta la fila y devuelve un `bump(prefill)` que simula al módulo de hold: cambia el `nonce`, que es
 * lo que dispara el efecto (los inputs son uncontrolled — se mutan por ref, sin re-render).
 */
function mountRow(props: Partial<Row> & { holdPrefill?: HoldPrefill }) {
    const base: Row = {
        blockId: BLOCK_ID,
        setNumber: 1,
        restTimeStr: '90',
        isActive: true,
        autoTimerEnabled: true,
        ...props,
    } as Row
    const view = render(<LogSetForm {...base} />)
    const bump = (prefill: HoldPrefill) => {
        act(() => {
            view.rerender(<LogSetForm {...base} holdPrefill={prefill} />)
        })
    }
    return { ...view, bump, base }
}

beforeEach(() => {
    vi.clearAllMocks()
    harness.logSetAction.mockResolvedValue({ success: true })
})

afterEach(() => {
    localStorage.clear()
})

describe('W4.2b — auto-envío en la fila de FUERZA (fuerza por tiempo)', () => {
    it('un `holdPrefill` con `submit` dispara UN solo envío, con los segundos y la marca del reloj', async () => {
        const { bump } = mountRow({ strengthTimeMode: true })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        const fd = lastFormData()
        expect(fd.get('actual_hold_sec')).toBe('30')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ hold_source: 'timer' })
        // R2: la serie por tiempo NO manda reps (la columna queda NULL, nunca 0).
        expect(fd.has('reps_done')).toBe(false)
    })

    it('`submit:false` (pausa / «Listo» sin reloj) solo pre-llena: cero envíos', async () => {
        const { bump } = mountRow({ strengthTimeMode: true })

        bump({ holdSec: 22, submit: false, source: 'manual', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
        expect((screen.getByLabelText('Segundos sostenidos') as HTMLInputElement).value).toBe('22')
    })

    it('con la serie YA logueada no re-envía nada (gate `|| isLogged`, copiado de cardio)', async () => {
        const { bump } = mountRow({
            strengthTimeMode: true,
            existingLog: { weight_kg: 10, reps_done: null, rpe: null, actual_hold_sec: 30 },
        })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
    })

    it('`per_side` por tiempo: las TRES claves en `metadata` y la suma L+R en `actual_hold_sec`', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, sideMode: 'per_side' })

        bump({ leftSec: 30, rightSec: 28, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        const fd = lastFormData()
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ left_sec: 30, right_sec: 28, hold_source: 'timer' })
        expect(fd.get('actual_hold_sec')).toBe('58')
        expect(fd.has('reps_done')).toBe(false)
        // Los inputs por lado no son columnas: se retiran del payload.
        expect(fd.has('hold_left_sec')).toBe(false)
        expect(fd.has('hold_right_sec')).toBe(false)
    })

    it('`alternating` por tiempo captura UN solo lado (H7 / `holdSidesFor`)', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, sideMode: 'alternating' })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        const fd = lastFormData()
        expect(fd.get('actual_hold_sec')).toBe('30')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ hold_source: 'timer' })
    })

    it('la fuerza CLÁSICA no cambia: sigue mandando kg × reps y sin metadata', async () => {
        const { container } = mountRow({})
        const weight = container.querySelector('input[name="weight_kg"]') as HTMLInputElement
        const reps = container.querySelector('input[name="reps_done"]') as HTMLInputElement
        weight.value = '50'
        reps.value = '10'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        const fd = lastFormData()
        expect(fd.get('weight_kg')).toBe('50')
        expect(fd.get('reps_done')).toBe('10')
        expect(fd.has('metadata')).toBe(false)
        expect(fd.has('actual_hold_sec')).toBe(false)
    })
})

describe('W4.3 — el guard de serie vacía deja pasar la serie por tiempo', () => {
    it('un submit programático con SOLO segundos guarda', async () => {
        const { container } = mountRow({ strengthTimeMode: true })
        ;(screen.getByLabelText('Segundos sostenidos') as HTMLInputElement).value = '30'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(lastFormData().get('actual_hold_sec')).toBe('30')
    })

    it('sin NINGÚN valor sigue sin guardar (el cinturón contra el submit programático no se toca)', async () => {
        const { container } = mountRow({ strengthTimeMode: true })

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(harness.logSetAction).not.toHaveBeenCalled()
    })
})

// ── F1 (owner 11-09) — el tile REPS vuelve a la fila de fuerza por tiempo ────────────────────────
// «Le quitaste la parte de reps, y reps es algo esencial para los ejercicios de fuerza aunque le
// pongamos tiempo». Contrato: KG · REPS · SEG, reps OPCIONALES, `reps_done` fuera del FormData sólo
// cuando está vacío (nunca un `0`, que contaría como serie de cero reps en récords/tonelaje).
describe('F1 — reps opcionales en fuerza por tiempo', () => {
    it('la fila por tiempo pinta la caja de REPS junto a la de segundos', () => {
        mountRow({ strengthTimeMode: true })

        expect(screen.getByLabelText('Repeticiones (opcional)')).toBeTruthy()
        expect(screen.getByLabelText('Segundos sostenidos')).toBeTruthy()
    })

    it('reps tipeadas + segundos ⇒ las DOS columnas viajan', async () => {
        const { container } = mountRow({ strengthTimeMode: true })
        ;(container.querySelector('input[name="weight_kg"]') as HTMLInputElement).value = '45'
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'
        ;(screen.getByLabelText('Segundos sostenidos') as HTMLInputElement).value = '30'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        const fd = lastFormData()
        expect(fd.get('weight_kg')).toBe('45')
        expect(fd.get('reps_done')).toBe('5')
        expect(fd.get('actual_hold_sec')).toBe('30')
    })

    it('reps VACÍAS ⇒ `reps_done` no viaja (la columna queda NULL, como hasta hoy)', async () => {
        const { container } = mountRow({ strengthTimeMode: true })
        ;(screen.getByLabelText('Segundos sostenidos') as HTMLInputElement).value = '30'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(lastFormData().has('reps_done')).toBe(false)
    })

    it('un `0` en la caja de reps NO viaja (R2: jamás una serie de cero reps)', async () => {
        const { container } = mountRow({ strengthTimeMode: true })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '0'
        ;(screen.getByLabelText('Segundos sostenidos') as HTMLInputElement).value = '30'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(lastFormData().has('reps_done')).toBe(false)
        expect(lastFormData().get('actual_hold_sec')).toBe('30')
    })

    it('el auto-envío del reloj se lleva las reps que el alumno ya había tipeado', async () => {
        const { bump } = mountRow({ strengthTimeMode: true })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        const fd = lastFormData()
        expect(fd.get('reps_done')).toBe('5')
        expect(fd.get('actual_hold_sec')).toBe('30')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ hold_source: 'timer' })
    })

    it('SOLO reps (sin segundos) igual guarda: el guard de fila vacía mira los tres ejes', async () => {
        const { container } = mountRow({ strengthTimeMode: true })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(lastFormData().get('reps_done')).toBe('5')
        expect(lastFormData().has('actual_hold_sec')).toBe(false)
    })

    it('`per_side` por tiempo: UNA caja de reps y los DOS lados del hold', async () => {
        const { container } = mountRow({ strengthTimeMode: true, sideMode: 'per_side' })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '8'
        ;(screen.getByLabelText('Segundos lado izquierdo') as HTMLInputElement).value = '30'
        ;(screen.getByLabelText('Segundos lado derecho') as HTMLInputElement).value = '28'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        const fd = lastFormData()
        expect(fd.get('reps_done')).toBe('8')
        expect(fd.get('actual_hold_sec')).toBe('58')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ left_sec: 30, right_sec: 28 })
        expect(fd.has('reps_right')).toBe(false)
    })
})

describe('W4.2a — auto-envío en la fila TIPADA (movilidad)', () => {
    it('un `holdPrefill` con `submit` dispara UN solo envío y marca la fuente', async () => {
        const { bump } = mountRow({ mode: 'mobility' })

        bump({ holdSec: 45, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        const fd = lastFormData()
        expect(fd.get('actual_hold_sec')).toBe('45')
        // CA-28/CA-84: el hold BILATERAL también sale con marca (antes solo la ganaba `per_side`).
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ hold_source: 'timer' })
    })

    it('`per_side` de movilidad: lados + fuente en el MISMO objeto', async () => {
        const { bump } = mountRow({ mode: 'mobility', sideMode: 'per_side' })

        bump({ leftSec: 30, rightSec: 25, submit: true, source: 'manual', nonce: 1 })
        await act(async () => {})

        const fd = lastFormData()
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ left_sec: 30, right_sec: 25, hold_source: 'manual' })
        expect(fd.get('actual_hold_sec')).toBe('55')
    })

    it('sin fuente, un hold bilateral NO gana la key `metadata` (no se ensucia el jsonb)', async () => {
        const { bump } = mountRow({ mode: 'mobility' })

        bump({ holdSec: 45, submit: true, nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(lastFormData().has('metadata')).toBe(false)
    })

    it('con la serie ya logueada no re-envía (gate `|| isLogged`)', async () => {
        const { bump } = mountRow({
            mode: 'mobility',
            existingLog: { weight_kg: null, reps_done: null, rpe: null, actual_hold_sec: 45 },
        })

        bump({ holdSec: 45, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
    })

    it('el gate de CARDIO queda intacto: `cardioAutolog` sigue enviando en modo cardio', async () => {
        const base = {
            blockId: BLOCK_ID,
            setNumber: 1,
            restTimeStr: '90',
            isActive: true,
            autoTimerEnabled: true,
            mode: 'cardio' as const,
        }
        const view = render(<LogSetForm {...base} />)
        await act(async () => {
            view.rerender(<LogSetForm {...base} cardioAutolog={{ minutesSec: 600, submit: true, nonce: 1 }} />)
        })

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(lastFormData().get('actual_duration_sec')).toBe('600')
    })
})

describe('W4.6 / CA-80 — canal de supresión del descanso', () => {
    it('submit POR RELOJ con la preferencia OFF ⇒ 0 llamadas a `startRest` (fuerza por tiempo)', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, autoTimerEnabled: false })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(harness.startRest).not.toHaveBeenCalled()
        // CA-80: OFF significa «no arranco uno nuevo», NO «mato el que hay». El descanso que el alumno
        // pidió a mano con «Descansar N s» tiene que seguir corriendo.
        expect(harness.cancelRest).not.toHaveBeenCalled()
    })

    it('lo mismo en la fila TIPADA (movilidad)', async () => {
        const { bump } = mountRow({ mode: 'mobility', autoTimerEnabled: false })

        bump({ holdSec: 45, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(harness.startRest).not.toHaveBeenCalled()
        expect(harness.cancelRest).not.toHaveBeenCalled()
    })

    it('con la preferencia ON el descanso sigue arrancando solo (cero regresión)', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, autoTimerEnabled: true })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledTimes(1)
        // Desde el 11-09 los segundos ya vienen RESUELTOS por el motor y viajan como `"90s"`.
        expect(harness.startRest).toHaveBeenCalledWith('90s', expect.objectContaining({ warmup: false }))
    })

    it('superserie: un miembro que NO cierra la ronda sigue cortando el descanso en curso (pref ON)', async () => {
        const { bump } = mountRow({
            strengthTimeMode: true,
            autoTimerEnabled: true,
            supersetRest: { groupRestSeconds: 90, closesRound: () => false },
        })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).not.toHaveBeenCalled()
        expect(harness.cancelRest).toHaveBeenCalledTimes(1)
    })
})

/**
 * Reporte de un alumno (2026-09-11): con «Pasar solo al descanso» encendida, «a veces al terminar una
 * serie salta el descanso y va al próximo ejercicio». Regla de producto del owner: terminar una serie
 * SIEMPRE lleva al descanso; **saltarlo lo decide el alumno**. El motor (`resolveEffectiveRest`) elige
 * aproximación → `rest_time` → fallback de 60 s y nunca devuelve 0, así que las ramas «sin descanso»
 * (`cancelRest()` por `rest_time` vacío) que vivían acá dejaron de existir.
 */
describe('Reporte 2026-09-11 — terminar una serie SIEMPRE lleva al descanso', () => {
    it('fuerza sin `rest_time` ⇒ fallback de 60 s, no «ningún descanso»', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, restTimeStr: '' })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledWith(
            `${DEFAULT_REST_FALLBACK_SEC}s`,
            expect.objectContaining({ warmup: false }),
        )
        expect(harness.cancelRest).not.toHaveBeenCalled()
    })

    it('fila TIPADA sin `rest_time` (movilidad, como la crea el builder) ⇒ el mismo fallback', async () => {
        const { bump } = mountRow({ mode: 'mobility', restTimeStr: '' })

        bump({ holdSec: 45, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledWith(
            `${DEFAULT_REST_FALLBACK_SEC}s`,
            expect.objectContaining({ label: undefined }),
        )
        expect(harness.cancelRest).not.toHaveBeenCalled()
    })

    it('warmup VACÍO en la serie 1 de un bloque de ≥3 series cae al `rest_time`, no al vacío', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, restTimeStr: '90', warmupRestTimeStr: '', totalSets: 4 })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledWith('90s', expect.objectContaining({ warmup: false }))
    })

    it('warmup VÁLIDO en la serie 1 de un bloque de ≥3 series sigue mandando (M2 · 6)', async () => {
        const { bump } = mountRow({ strengthTimeMode: true, restTimeStr: '90', warmupRestTimeStr: '30', totalSets: 4 })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledWith('30s', expect.objectContaining({ warmup: true }))
    })

    it('superserie con el grupo en 0: la ronda que CIERRA descansa igual', async () => {
        const { bump } = mountRow({
            strengthTimeMode: true,
            supersetRest: { groupRestSeconds: 0, closesRound: () => true },
        })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).toHaveBeenCalledWith(`${DEFAULT_REST_FALLBACK_SEC}s`, expect.anything())
    })

    it('V4 intacto: el miembro que NO cierra la ronda sigue sin descanso aunque el grupo esté en 0', async () => {
        const { bump } = mountRow({
            strengthTimeMode: true,
            supersetRest: { groupRestSeconds: 0, closesRound: () => false },
        })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).not.toHaveBeenCalled()
        expect(harness.cancelRest).toHaveBeenCalledTimes(1)
    })
})

/**
 * Reporte 2026-09-11 (segunda causa): el guard `!navigator.onLine` retornaba ANTES de armar el
 * descanso ⇒ sin conexión la serie entraba a la cola local pero el cronómetro no arrancaba nunca. El
 * descanso es LOCAL (cero red), así que se arma igual.
 */
describe('Reporte 2026-09-11 — sin conexión el descanso arranca igual', () => {
    const setOnline = (value: boolean) => {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
    }
    afterEach(() => setOnline(true))

    it('fuerza: la serie se encola (0 envíos al server) y el descanso arranca', async () => {
        setOnline(false)
        const { bump } = mountRow({ strengthTimeMode: true, restTimeStr: '90' })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
        expect(harness.startRest).toHaveBeenCalledWith('90s', expect.objectContaining({ warmup: false }))
    })

    it('fila TIPADA: mismo contrato', async () => {
        setOnline(false)
        const { bump } = mountRow({ mode: 'mobility', restTimeStr: '90' })

        bump({ holdSec: 45, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
        expect(harness.startRest).toHaveBeenCalledWith('90s', expect.anything())
    })

    it('con la preferencia OFF, offline tampoco arranca nada (CA-80 intacto)', async () => {
        setOnline(false)
        const { bump } = mountRow({ strengthTimeMode: true, restTimeStr: '90', autoTimerEnabled: false })

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.startRest).not.toHaveBeenCalled()
        expect(harness.cancelRest).not.toHaveBeenCalled()
    })
})

/**
 * specs/reps-tras-el-reloj · W3.3 (R10 · riesgo 4) — la marca del reloj SOBREVIVE al re-submit.
 *
 * La sheet de huecos monta esta misma fila en EDICIÓN sobre una serie que ya cerró el reloj. Como
 * `holdSourceRef` nacía en `null` y el efecto de prefill se saltea con `isLogged`, el re-guardado
 * armaba la metadata sin `hold_source`… y el UPDATE reemplaza el jsonb ENTERO
 * (`_actions/workout-log.actions.ts:177`), así que la marca `'timer'` se borraba en silencio y con
 * ella la adopción del auto-registro (DATA-TESTING §8.2).
 */
describe('W3.3 — `hold_source` sobrevive al re-submit desde la sheet', () => {
    it('anotar las reps de una serie cerrada por el reloj manda `reps_done` Y conserva la marca', async () => {
        const { container } = mountRow({
            strengthTimeMode: true,
            // `reopenNonce` es el carril con el que la sheet abre la fila en edición.
            reopenNonce: 1,
            existingLog: {
                weight_kg: 10,
                reps_done: null,
                rpe: null,
                actual_hold_sec: 30,
                metadata: { hold_source: 'timer' },
            },
        })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        const fd = lastFormData()
        expect(fd.get('reps_done')).toBe('5')
        // Los segundos vuelven a viajar: el UPDATE escribe `actual_hold_sec` SIEMPRE, así que una
        // fila de edición sin la caja de SEG dejaría el hold en NULL.
        expect(fd.get('actual_hold_sec')).toBe('30')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ hold_source: 'timer' })
    })

    it('`per_side`: la marca viaja en el MISMO objeto que los dos lados', async () => {
        const { container } = mountRow({
            strengthTimeMode: true,
            sideMode: 'per_side',
            reopenNonce: 1,
            existingLog: {
                weight_kg: 10,
                reps_done: null,
                rpe: null,
                actual_hold_sec: 58,
                metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
            },
        })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        const fd = lastFormData()
        expect(fd.get('reps_done')).toBe('5')
        expect(fd.get('actual_hold_sec')).toBe('58')
        expect(JSON.parse(String(fd.get('metadata')))).toEqual({ left_sec: 30, right_sec: 28, hold_source: 'timer' })
    })

    it('una serie SIN marca guardada no se inventa una (`undefined` ≠ «lo tipeó a mano»)', async () => {
        const { container } = mountRow({
            strengthTimeMode: true,
            reopenNonce: 1,
            existingLog: { weight_kg: 10, reps_done: null, rpe: null, actual_hold_sec: 30 },
        })
        ;(screen.getByLabelText('Repeticiones (opcional)') as HTMLInputElement).value = '5'

        await act(async () => {
            ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
        })

        expect(lastFormData().has('metadata')).toBe(false)
    })
})

/**
 * specs/reps-tras-el-reloj · R8 — «Repetir»: el auto-envío del reloj atraviesa el gate `isLogged`
 * SÓLO con el permiso explícito del paso, y ese re-commit vuelve a armar el descanso.
 */
describe('R8 — el permiso de repetición no relaja el gate para todos (fuerza por tiempo)', () => {
    // `reopenNonce`: es lo que hace el paso al repetir — sin reabrir la fila no habría `<form>` que
    // `requestSubmit()` pudiera disparar (la serie logueada se pinta como chip colapsado).
    const loggedRow = {
        strengthTimeMode: true,
        reopenNonce: 1,
        existingLog: { weight_kg: 10, reps_done: null, rpe: null, actual_hold_sec: 30 },
    }

    it('sin la marca `repeat`, una serie ya logueada sigue sin re-enviarse', async () => {
        const { bump } = mountRow(loggedRow)

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1 })
        await act(async () => {})

        expect(harness.logSetAction).not.toHaveBeenCalled()
    })

    it('con `repeat` el re-commit sale y el descanso vuelve a arrancar (serie nueva pese a `isLogged`)', async () => {
        const { bump } = mountRow(loggedRow)

        bump({ holdSec: 30, submit: true, source: 'timer', nonce: 1, repeat: true })
        await act(async () => {})

        expect(harness.logSetAction).toHaveBeenCalledTimes(1)
        expect(lastFormData().get('actual_hold_sec')).toBe('30')
        expect(harness.startRest).toHaveBeenCalledWith('90s', expect.objectContaining({ warmup: false }))
    })
})
