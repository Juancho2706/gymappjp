import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Kilos o libras en la fila de FUERZA (tren kg-lb-ejecutor, docs/specs/kg-lb-ejecutor · W3).
 *
 * Fija lo que se puede romper sin que nadie lo vea:
 *  · R2 — lo que se tipea en libras llega a la columna en KILOS, con `weight_unit`;
 *  · R1 — cambiar la unidad con un número escrito lo CONVIERTE (no lo reinterpreta);
 *  · R3 — lo que el alumno ve (valor inicial, chip de serie guardada) está en su unidad;
 *  · R7 — sin provider (tests, superficies fuera del ejecutor) la fila es idéntica a la previa.
 */

const harness = vi.hoisted(() => ({
    logSetAction: vi.fn(async () => ({ success: true })),
    capture: vi.fn(),
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
vi.mock('./WorkoutTimerProvider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./WorkoutTimerProvider')>()
    return {
        ...actual,
        useWorkoutTimer: () => ({
            startRest: vi.fn(),
            cancelRest: vi.fn(),
            startHold: vi.fn(),
            startInterval: vi.fn(),
            startStopwatch: vi.fn(),
        }),
    }
})
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: harness.capture }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/lib/client/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('./v3/use-celebrations', () => ({
    useCelebrations: () => ({ celebrate: vi.fn(), plan: () => ({ tier: null, visual: 'none', reducedMotion: true }) }),
}))

import type { ReactNode } from 'react'
import { LogSetForm } from './LogSetForm'
import { WeightUnitProvider, useWeightUnitState, type BlockWeightUnitInfo } from './weight-unit-context'

const BLOCK_ID = '11111111-1111-4111-8111-111111111111'

type Row = Parameters<typeof LogSetForm>[0]

function lastFormData(): FormData {
    const call = harness.logSetAction.mock.calls.at(-1) as unknown as [unknown, FormData]
    return call[1]
}

/** Provider REAL (mismo hook que usa el ejecutor): bloque en `loadUnit`, sin historial previo. */
function Units({ loadUnit, lastUsed, children }: { loadUnit: string | null; lastUsed?: string; children: ReactNode }) {
    const blocks: Record<string, BlockWeightUnitInfo> = { [BLOCK_ID]: { exerciseKey: 'ex-1', loadUnit } }
    const value = useWeightUnitState({ blocks, lastUnitByExercise: lastUsed ? { 'ex-1': lastUsed } : {} })
    return <WeightUnitProvider value={value}>{children}</WeightUnitProvider>
}

function mountRow(props: Partial<Row>, units?: { loadUnit: string | null; lastUsed?: string }) {
    const base = {
        blockId: BLOCK_ID,
        setNumber: 1,
        restTimeStr: '90',
        isActive: true,
        autoTimerEnabled: true,
        ...props,
    } as Row
    const row = <LogSetForm {...base} />
    return render(units ? <Units {...units}>{row}</Units> : row)
}

async function submit(container: HTMLElement) {
    await act(async () => {
        ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
    })
}

const weightInput = (c: HTMLElement) => c.querySelector('input[name="weight_kg"]') as HTMLInputElement
const repsInput = (c: HTMLElement) => c.querySelector('input[name="reps_done"]') as HTMLInputElement

beforeEach(() => {
    vi.clearAllMocks()
    harness.logSetAction.mockResolvedValue({ success: true })
})

afterEach(() => {
    localStorage.clear()
})

describe('sin provider: fila idéntica a la previa (R7)', () => {
    it('manda el número tal cual y NO manda weight_unit', async () => {
        const { container } = mountRow({})
        weightInput(container).value = '45'
        repsInput(container).value = '8'
        await submit(container)
        const fd = lastFormData()
        expect(fd.get('weight_kg')).toBe('45')
        expect(fd.has('weight_unit')).toBe(false)
    })
})

describe('con el ejecutor (provider)', () => {
    it('bloque en kg: el número viaja igual y la unidad kg se registra', async () => {
        const { container } = mountRow({}, { loadUnit: null })
        weightInput(container).value = '62.5'
        repsInput(container).value = '5'
        await submit(container)
        const fd = lastFormData()
        expect(fd.get('weight_kg')).toBe('62.5')
        expect(fd.get('weight_unit')).toBe('kg')
    })

    it('bloque en lb: 45 lb tecleadas llegan como 20,41 kg + weight_unit lb (R2)', async () => {
        const { container } = mountRow({}, { loadUnit: 'lb' })
        weightInput(container).value = '45'
        repsInput(container).value = '8'
        await submit(container)
        const fd = lastFormData()
        expect(fd.get('weight_kg')).toBe('20.41')
        expect(fd.get('weight_unit')).toBe('lb')
        expect(fd.get('reps_done')).toBe('8')
    })

    it('la última unidad usada gana a la del bloque (D2)', async () => {
        const { container } = mountRow({}, { loadUnit: 'kg', lastUsed: 'lb' })
        weightInput(container).value = '50'
        repsInput(container).value = '6'
        await submit(container)
        expect(lastFormData().get('weight_unit')).toBe('lb')
        expect(lastFormData().get('weight_kg')).toBe('22.68')
    })

    it('el valor inicial (sugerido en kg) se muestra en libras, redondeado al 2,5', () => {
        const { container } = mountRow({ suggestedWeightKg: 20 }, { loadUnit: 'lb' })
        // 20 kg = 44,09 lb → 45 lb (paso de 2,5)
        expect(weightInput(container).value).toBe('45')
    })

    it('un log existente en kg se reabre en libras sin perder precisión', () => {
        const { container } = mountRow(
            {
                existingLog: { weight_kg: 20.41, reps_done: 8, rpe: null } as Row['existingLog'],
            },
            { loadUnit: 'lb' },
        )
        // La fila ya registrada se ve como chip: «45 lb × 8».
        expect(container.textContent).toContain('45 lb')
    })

    it('cambiar kg → lb con un número escrito lo convierte (R1) y el envío sale en kilos', async () => {
        const { container } = mountRow({}, { loadUnit: 'kg' })
        weightInput(container).value = '20'
        repsInput(container).value = '10'
        fireEvent.click(screen.getByRole('button', { name: /Cambiar a libras/ }))
        expect(weightInput(container).value).toBe('44.1')
        await submit(container)
        const fd = lastFormData()
        expect(fd.get('weight_unit')).toBe('lb')
        // 44,1 lb → 20,0 kg (ida y vuelta a centésimas: 20,00)
        expect(fd.get('weight_kg')).toBe('20')
        expect(harness.capture).toHaveBeenCalledWith('weight_unit_toggled', { from: 'kg', to: 'lb', surface: 'web' })
    })
})
