import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * specs/reps-tras-el-reloj · W3.2 — la SHEET de huecos del paso de fuerza por tiempo (R3/R10).
 *
 * Lo que congela esta suite es el CABLEADO del paso, no el motor: la regla en sí ya está probada en
 * `hold-capture-prompt.test.ts`. Acá se verifica que el paso arme la decisión con lo que el módulo
 * midió (`onMeasured`) y con lo que la fila realmente guardó (`onLogged`), y que la sheet aparezca —o
 * no— en los tres casos de PLAN §5.
 *
 * `HoldModuleV3` y `LogSetForm` van MOCKEADOS a propósito: el primero arrastra audio/rAF y el segundo
 * la cola offline entera; los dos tienen sus propias suites. Acá el sujeto es `ExerciseStepV3`.
 */

const harness = vi.hoisted(() => ({
    measured: null as null | ((m: Record<string, unknown>) => void),
    logged: null as null | ((p: Record<string, unknown>) => void),
    /** Último `holdPrefill` que recibió la fila ACTIVA (E1: por ahí viaja `minimizeRestIfGaps`). */
    holdPrefill: null as null | Record<string, unknown>,
    capture: vi.fn(),
    startRest: vi.fn(),
    cancelRest: vi.fn(),
    expandRest: vi.fn(),
}))

// framer-motion fuera (mismo stub que `CheckInForm.test.tsx`): `AnimatePresence` mantiene el nodo
// montado hasta que TERMINA la animación de salida, y en jsdom eso nunca completa de forma
// determinista — la sheet cerrada seguía en el DOM. Acá interesa SI la sheet está o no, no cómo entra.
vi.mock('framer-motion', async () => {
    const React = await import('react')
    const MOTION_ONLY = new Set([
        'initial', 'animate', 'exit', 'variants', 'custom', 'transition', 'layout', 'layoutId',
        'whileHover', 'whileTap', 'whileInView', 'whileDrag', 'drag', 'viewport',
        'onAnimationStart', 'onAnimationComplete',
    ])
    function stubFor(tag: string) {
        return function MotionStub(props: Record<string, unknown>) {
            const domProps: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(props)) {
                if (key !== 'children' && !MOTION_ONLY.has(key)) domProps[key] = value
            }
            return React.createElement(
                tag,
                domProps as React.HTMLAttributes<HTMLElement>,
                props.children as ReactNode,
            )
        }
    }
    const motion = new Proxy({} as Record<string, unknown>, {
        get: (_target, tag) => stubFor(String(tag)),
    })
    return {
        motion,
        AnimatePresence: ({ children }: { children?: ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        useReducedMotion: () => true,
    }
})
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: harness.capture }) }))
vi.mock('../WorkoutTimerProvider', () => ({
    parseRestTime: (s: string | null) => (s ? Number(s) || 0 : 0),
    useWorkoutTimer: () => ({
        startRest: harness.startRest,
        cancelRest: harness.cancelRest,
        expandRest: harness.expandRest,
    }),
    // W5.2b: el chip vivo se prueba de verdad en `WorkoutTimerProvider.test.tsx` (ahí está el reloj);
    // acá sólo interesa DÓNDE lo monta el paso, así que va como marca.
    RestClockChip: () => <span data-testid="rest-clock-chip">Descanso 1:27</span>,
}))
// El orquestador entero (3.6k líneas, server actions incluidas) no tiene por qué entrar al grafo del
// test: del módulo sólo se usa `RUT_TYPE_META` como VALOR (los demás imports son tipos, que se borran).
vi.mock('../WorkoutExecutionClient', () => ({
    RUT_TYPE_META: { strength: { label: 'Fuerza' }, mobility: { label: 'Movilidad' } },
}))
vi.mock('./ExecMediaCard', () => ({ ExecMediaCard: () => null }))
vi.mock('./SkipBlockV3', () => ({ BlockActionsV3: () => null }))
vi.mock('./WheelHint', () => ({ WheelHint: () => null }))
vi.mock('./HoldModuleV3', () => ({
    HoldModuleV3: (props: { onMeasured: (m: Record<string, unknown>) => void }) => {
        harness.measured = props.onMeasured
        return null
    },
}))
vi.mock('../LogSetForm', () => ({
    LogSetForm: (props: {
        setNumber: number
        isActive?: boolean
        holdPrefill?: Record<string, unknown>
        onLogged?: (p: Record<string, unknown>) => void
    }) => {
        if (props.isActive) {
            harness.logged = props.onLogged ?? null
            // E1: la fila REAL decide con esto si el descanso arranca minimizado; acá sólo se congela
            // que el paso lo emita (el `startRest({ minimized })` lo prueba `LogSetForm.test.tsx`).
            if (props.holdPrefill) harness.holdPrefill = props.holdPrefill
        }
        return <div data-testid={`row-${props.setNumber}`} />
    },
}))

import { ExerciseStepV3 } from './ExerciseStepV3'

type StepProps = Parameters<typeof ExerciseStepV3>[0]

const BLOCK_ID = '22222222-2222-4222-8222-222222222222'
const EXERCISE = {
    id: 'ex-1',
    name: 'Plancha con disco',
    muscle_group: 'Core',
    video_url: null,
    video_start_time: null,
    video_end_time: null,
    gif_url: null,
    instructions: null,
    exercise_type: 'strength',
} as StepProps['exercise']

/** Bloque de FUERZA POR TIEMPO del predicado único (`reps_unit === 'sec'` + `duration_sec > 0`). */
const BLOCK = {
    id: BLOCK_ID,
    order_index: 0,
    sets: 3,
    reps: '30',
    target_weight_kg: 10,
    tempo: null,
    rir: null,
    rest_time: '90',
    warmup_rest_time: null,
    notes: null,
    section: 'main',
    section_template_id: null,
    superset_group: null,
    progression_type: null,
    progression_value: null,
    progression_mode: null,
    is_override: false,
    reps_unit: 'sec',
    duration_sec: 30,
    exercises: EXERCISE,
} as unknown as StepProps['block']

function mountStep(overrides: Partial<StepProps> = {}) {
    const base = {
        block: BLOCK,
        exercise: EXERCISE,
        effType: 'strength',
        suggestedWeightKg: 10,
        overloadLabel: null,
        bestPrev: null,
        firstUnlogged: 1,
        doneCount: 0,
        blockLogs: [],
        exerciseMaxes: {},
        setFillByBlock: vi.fn(),
        reopenSignal: null,
        autoTimerEnabled: true,
        openTechnique: vi.fn(),
        handleLogged: vi.fn(),
        handleResult: vi.fn(),
        ...overrides,
    } as unknown as StepProps
    const view = render(<ExerciseStepV3 {...base} />)
    return { ...view, base, rerender: (next: Partial<StepProps>) => view.rerender(<ExerciseStepV3 {...base} {...(next as StepProps)} />) }
}

/**
 * Recorre el camino real: el módulo mide y envía (`onMeasured`) y la fila confirma (`onLogged`) con el
 * payload YA normalizado por el motor (`repsDone` entero > 0 o `null`). Entre las dos llamadas el
 * orquestador habría metido la serie en `blockLogs`, así que el rerender la trae.
 */
function closeSetByTimer(
    step: ReturnType<typeof mountStep>,
    opts: { repsDone: number | null; weightKg: number | null; expiredWhileAway?: boolean; submit?: boolean },
) {
    act(() => {
        harness.measured?.({
            holdSec: 30,
            submit: opts.submit ?? true,
            source: 'timer',
            nonce: 1,
            side: 'single',
            closesRound: false,
            expiredWhileAway: opts.expiredWhileAway ?? false,
            advance: 'stay',
        })
    })
    step.rerender({
        firstUnlogged: 2,
        blockLogs: [
            {
                block_id: BLOCK_ID,
                set_number: 1,
                weight_kg: opts.weightKg,
                reps_done: opts.repsDone,
                rpe: null,
                actual_hold_sec: 30,
                metadata: { hold_source: 'timer' },
            },
        ] as unknown as StepProps['blockLogs'],
    })
    act(() => {
        harness.logged?.({
            blockId: BLOCK_ID,
            setNumber: 1,
            weightKg: opts.weightKg,
            repsDone: opts.repsDone,
            rpe: null,
            rir: null,
            actualHoldSec: 30,
        })
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    harness.measured = null
    harness.logged = null
    harness.holdPrefill = null
})

describe('R3/R10 — cuándo aparece la sheet de huecos en pantalla sola', () => {
    it('el reloj cierra la serie con las reps vacías ⇒ la sheet aparece con su nombre accesible propio', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        const dialog = screen.getByRole('dialog', { name: 'Anotar la serie 1' })
        expect(dialog).toBeTruthy()
        // Copy de SPEC §6 (falta reps) + el secundario que cierra sin guardar.
        expect(screen.getByText('¿Cuántas reps hiciste?')).toBeTruthy()
        expect(screen.getByLabelText('Dejar la serie sin reps')).toBeTruthy()
        // Nunca «Descanso»: ese nombre es del interstitial y el E2E lo cuenta en 0.
        expect(screen.queryByRole('dialog', { name: 'Descanso' })).toBeNull()
    })

    it('con las reps ya tipeadas antes de «Iniciar serie» NO se abre nada', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: 8, weightKg: 10 })

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('si venció con la pestaña afuera (R6/R27) NO se abre nada, aunque falten las reps', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10, expiredWhileAway: true })

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('sin peso NI reps la sheet pide el peso (SPEC §5: foco en KG)', () => {
        const step = mountStep({ suggestedWeightKg: null })
        closeSetByTimer(step, { repsDone: null, weightKg: null })

        expect(screen.getByRole('dialog', { name: 'Anotar la serie 1' })).toBeTruthy()
        expect(screen.getByText('¿Con cuánto peso?')).toBeTruthy()
        expect(screen.getByLabelText('Dejar la serie sin peso')).toBeTruthy()
    })

    it('un commit SIN envío del reloj (guardado a mano) no abre nada', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10, submit: false })

        expect(screen.queryByRole('dialog')).toBeNull()
    })
})

describe('R12 — analítica de la sheet', () => {
    it('abrir emite `hold_capture_prompted` con las propiedades de SPEC §7 y cerrar emite el resuelto', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        expect(harness.capture).toHaveBeenCalledWith('hold_capture_prompted', {
            block_id: BLOCK_ID,
            exercise_type: 'strength',
            context: 'solo',
            missing: ['reps'],
            trigger: 'timer',
            platform: 'web',
        })

        fireEvent.click(screen.getByLabelText('Dejar la serie sin reps'))

        expect(harness.capture).toHaveBeenCalledWith('hold_capture_resolved', {
            block_id: BLOCK_ID,
            context: 'solo',
            outcome: 'dismissed',
            reps_filled: false,
            weight_changed: false,
        })
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})

describe('R7/R8 — línea «Serie N» con la preferencia OFF', () => {
    it('tras cerrar la serie aparece la línea del motor con «Editar» y «Repetir»', () => {
        const step = mountStep({ autoTimerEnabled: false })
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        // `formatStrengthTimeSetLine` sin reps ⇒ «10 kg × 30 s», sin guion inventado (W0.4 · 2).
        expect(screen.getByTestId('hold-lastset').textContent).toContain('10 kg × 30 s')
        expect(screen.getByLabelText('Editar la serie 1')).toBeTruthy()
        expect(screen.getByLabelText('Repetir la serie 1 desde el reloj')).toBeTruthy()
    })

    it('«Repetir» corta el descanso, cuenta el evento y devuelve la serie 1 a activa', () => {
        const step = mountStep({ autoTimerEnabled: false })
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })
        // La sheet se abrió sola (faltan reps): se cierra para llegar a la línea.
        fireEvent.click(screen.getByLabelText('Dejar la serie sin reps'))

        fireEvent.click(screen.getByLabelText('Repetir la serie 1 desde el reloj'))

        expect(harness.cancelRest).toHaveBeenCalledTimes(1)
        expect(harness.capture).toHaveBeenCalledWith('hold_set_repeated', { block_id: BLOCK_ID, set_number: 1 })
        // El override local devuelve el foco a la serie 1 aunque `firstUnlogged` ya sea 2.
        expect(screen.getByTestId('set-slot-active').querySelector('[data-testid="row-1"]')).toBeTruthy()
    })
})

/**
 * specs/reps-tras-el-reloj · Enmienda E1 (owner 12-09) — el descanso automático arranca MINIMIZADO
 * («el contador mini») mientras la sheet de huecos está abierta sobre la pantalla del ejercicio, y se
 * EXPANDE al resolverla, con el mismo reloj. Acá se congela el cableado del paso: qué le pide a la
 * fila (`minimizeRestIfGaps`) y cuándo llama a `expandRest` del provider.
 */
describe('E1 — contador mini mientras se anotan los huecos', () => {
    it('la medición del reloj le pide a la fila que el descanso arranque minimizado', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        expect(harness.holdPrefill?.minimizeRestIfGaps).toBe(true)
        // El otro permiso del prefill no se contamina: esta serie no es una repetición.
        expect(harness.holdPrefill?.repeat).toBe(false)
    })

    it('si venció con la pestaña afuera (R6/R27) el descanso arranca a pantalla completa, como siempre', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10, expiredWhileAway: true })

        expect(harness.holdPrefill?.minimizeRestIfGaps).toBe(false)
        expect(harness.expandRest).not.toHaveBeenCalled()
    })

    it('resolver la sheet con «Sin reps» expande el descanso (una sola vez)', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        expect(harness.expandRest).not.toHaveBeenCalled()
        fireEvent.click(screen.getByLabelText('Dejar la serie sin reps'))

        expect(harness.expandRest).toHaveBeenCalledTimes(1)
    })

    it('«Editar» (trigger manual) NO expande nada: ahí el descanso ya estaba como el alumno lo dejó', () => {
        const step = mountStep({ autoTimerEnabled: false })
        closeSetByTimer(step, { repsDone: 8, weightKg: 10 })

        fireEvent.click(screen.getByLabelText('Editar la serie 1'))
        // La sheet de «Editar» no tiene el secundario «Sin reps» (ese es copy del prompt del reloj,
        // SPEC §6): se cierra con la X, que es la vía real del alumno.
        fireEvent.click(screen.getByLabelText('Cerrar'))

        expect(harness.expandRest).not.toHaveBeenCalled()
    })
})

/**
 * specs/reps-tras-el-reloj · W5.2b — el contador mini tiene que VERSE mientras el alumno anota: la
 * sheet (z-62) tapa la barra del descanso, así que el reloj se repite en su cabecera. Sólo en la
 * sheet que abrió el RELOJ; la de «Editar» no tiene descanso propio que mostrar.
 */
describe('W5.2b — chip vivo del descanso en la cabecera de la sheet', () => {
    it('la sheet del reloj lo pinta y desaparece con ella', () => {
        const step = mountStep()
        closeSetByTimer(step, { repsDone: null, weightKg: 10 })

        expect(screen.getByTestId('rest-clock-chip')).toBeTruthy()

        fireEvent.click(screen.getByLabelText('Dejar la serie sin reps'))
        expect(screen.queryByTestId('rest-clock-chip')).toBeNull()
    })

    it('la sheet de «Editar» (trigger manual) NO lo pinta', () => {
        const step = mountStep({ autoTimerEnabled: false })
        closeSetByTimer(step, { repsDone: 8, weightKg: 10 })

        fireEvent.click(screen.getByLabelText('Editar la serie 1'))

        expect(screen.getByRole('dialog', { name: 'Editar la serie 1' })).toBeTruthy()
        expect(screen.queryByTestId('rest-clock-chip')).toBeNull()
    })
})
