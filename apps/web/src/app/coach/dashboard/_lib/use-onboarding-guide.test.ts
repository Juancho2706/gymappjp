// @vitest-environment jsdom
// Opt-in por archivo: desde el reparto por projects (vitest.config.ts, 2026-09-02) los
// `*.test.ts` corren en `node`, y este ejercita DOM real (window/document/localStorage).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { OnboardingSignals } from '@eva/onboarding'

const { persistMock, postStepCompletedMock, postAhaMock, postDismissedMock, confettiMock } = vi.hoisted(
    () => ({
        // El parámetro existe solo para tipar `mock.calls` (los asserts leen el payload).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        persistMock: vi.fn(async (_payload: Record<string, unknown>) => ({ ok: true as const })),
        postStepCompletedMock: vi.fn(async () => {}),
        postAhaMock: vi.fn(async () => {}),
        postDismissedMock: vi.fn(async () => {}),
        confettiMock: vi.fn(),
    })
)

vi.mock('../_actions/onboarding-guide.actions', () => ({ persistOnboardingGuideAction: persistMock }))
vi.mock('./onboarding-telemetry.client', () => ({
    postStepCompleted: postStepCompletedMock,
    postAhaMoment: postAhaMock,
    postOnboardingDismissed: postDismissedMock,
    postGuideEngagement: vi.fn(),
}))
vi.mock('canvas-confetti', () => ({ default: confettiMock }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { onboardingGuideStorageKey, useOnboardingGuide } from './use-onboarding-guide'

const NO_SIGNALS: OnboardingSignals = {
    hasBrand: false,
    viveTuAppOpened: false,
    hasFirstArtifact: false,
    realClients: 0,
    realStudentActivity: false,
}

const ALL_SIGNALS: OnboardingSignals = {
    hasBrand: true,
    viveTuAppOpened: true,
    hasFirstArtifact: true,
    realClients: 2,
    realStudentActivity: true,
}

function renderGuide(over: {
    signals?: OnboardingSignals
    initialGuide?: unknown
    enabled?: boolean
} = {}) {
    return renderHook(() =>
        useOnboardingGuide({
            coachId: 'coach-1',
            persona: 'nutrition',
            initialGuide: (over.initialGuide ?? {}) as never,
            signals: over.signals ?? NO_SIGNALS,
            enabled: over.enabled,
        })
    )
}

describe('useOnboardingGuide', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        sessionStorage.clear()
    })

    it('sin señales arranca en 0/5 con los pasos de la persona', async () => {
        const { result } = renderGuide()
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.done).toBe(0)
        expect(result.current.steps[2].label).toContain('pauta de Ana')
        expect(result.current.atFoot).toBe(false)
    })

    it('las señales del servidor tildan los pasos solas y emiten `step_completed` UNA vez', async () => {
        const { result, rerender } = renderGuide({ signals: ALL_SIGNALS })
        await waitFor(() => expect(result.current.done).toBe(5))

        await waitFor(() => expect(postStepCompletedMock).toHaveBeenCalledTimes(5))
        rerender()
        rerender()
        // El re-render no vuelve a postear: los pasos emitidos viven en el estado persistido. Ese
        // re-emit por render fue el que dejó 2.293 filas de `first_client` para 19 coaches.
        expect(postStepCompletedMock).toHaveBeenCalledTimes(5)
    })

    it('los pasos ya emitidos según el servidor no se vuelven a emitir', async () => {
        const { result } = renderGuide({
            signals: ALL_SIGNALS,
            initialGuide: {
                emitted: ['profile_branding', 'vive_tu_app', 'first_artifact', 'first_client', 'aha'],
                ahaMomentSent: true,
                completed: { aha: true },
            },
        })
        await waitFor(() => expect(result.current.done).toBe(5))
        expect(postStepCompletedMock).not.toHaveBeenCalled()
        expect(postAhaMock).not.toHaveBeenCalled()
        expect(confettiMock).not.toHaveBeenCalled()
    })

    it('el aha dispara confeti y su evento una sola vez', async () => {
        const { result, rerender } = renderGuide({ signals: ALL_SIGNALS })
        await waitFor(() => expect(result.current.allDone).toBe(true))
        await waitFor(() => expect(postAhaMock).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(confettiMock).toHaveBeenCalledTimes(1))
        rerender()
        expect(postAhaMock).toHaveBeenCalledTimes(1)
    })

    it('un paso tildado se queda tildado aunque la señal se apague (sticky)', async () => {
        const { result, rerender } = renderGuide({ signals: { ...NO_SIGNALS, hasFirstArtifact: true } })
        await waitFor(() => expect(result.current.completed.first_artifact).toBe(true))

        // El coach borra el programa del demo: la señal se cae, el progreso no.
        const stored = JSON.parse(localStorage.getItem(onboardingGuideStorageKey('coach-1'))!)
        expect(stored.completed.first_artifact).toBe(true)
        rerender()
        expect(result.current.completed.first_artifact).toBe(true)
    })

    it('«Ocultar» manda la guía al pie y lo persiste', async () => {
        const { result } = renderGuide()
        await waitFor(() => expect(result.current.ready).toBe(true))

        act(() => result.current.sendToFoot())

        expect(result.current.atFoot).toBe(true)
        expect(result.current.hidden).toBe(false)
        expect(postDismissedMock).toHaveBeenCalled()
        await waitFor(() => expect(persistMock).toHaveBeenCalled())
        expect(persistMock.mock.calls.at(-1)?.[0]).toMatchObject({ dismissed: true })
    })

    it('«Ocultar» en la tira del pie apaga la guía entera', async () => {
        const { result } = renderGuide()
        await waitFor(() => expect(result.current.ready).toBe(true))

        act(() => result.current.hide())

        expect(result.current.hidden).toBe(true)
        await waitFor(() =>
            expect(persistMock.mock.calls.at(-1)?.[0]).toMatchObject({ dismissed: true, hidden: true })
        )
    })

    it('el servidor le gana a localStorage cuando tiene algo escrito', async () => {
        localStorage.setItem(
            onboardingGuideStorageKey('coach-1'),
            JSON.stringify({ dismissed: false, completed: {}, emitted: [], hidden: false })
        )
        const { result } = renderGuide({ initialGuide: { dismissed: true } })
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.atFoot).toBe(true)
    })

    it('sin nada en el servidor, sube lo que había en el navegador', async () => {
        localStorage.setItem(
            onboardingGuideStorageKey('coach-1'),
            JSON.stringify({ dismissed: true, completed: {}, emitted: [], hidden: false })
        )
        const { result } = renderGuide({ initialGuide: {} })
        await waitFor(() => expect(result.current.atFoot).toBe(true))
        await waitFor(() => expect(persistMock).toHaveBeenCalledWith(expect.objectContaining({ dismissed: true })))
    })

    it('con la guía apagada el hook queda dormido: ni hidrata ni escribe', async () => {
        const { result } = renderGuide({ signals: ALL_SIGNALS, enabled: false })
        await new Promise((r) => setTimeout(r, 20))
        expect(result.current.ready).toBe(false)
        expect(persistMock).not.toHaveBeenCalled()
        expect(postStepCompletedMock).not.toHaveBeenCalled()
    })
})
