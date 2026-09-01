import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W1.13.c (Ola de orden) — mitad «redirect liso» del gate de dominio.
 *
 * Lo que se protege acá NO es que el redirect ocurra (eso lo garantiza `assertDomainEnabled`,
 * que ya tiene sus propios tests), sino el ORDEN: el gate corre ANTES de cualquier fetch de
 * datos. Si alguien mueve el `await assertDomainEnabled(...)` debajo del `Promise.all`, el coach
 * con el dominio apagado igual pagaría las queries (y el server component tocaría la DB para una
 * pantalla que nunca se pinta). El caso (b) falla en ese escenario.
 *
 * Recordá que esto es VISIBILIDAD, nunca autorización: RLS y los entitlements siguen intactos.
 */

const getCoach = vi.fn()
const getPreferredWorkspaceForRender = vi.fn()
const getWorkoutProgramsWithClients = vi.fn()
const getCoachOnboardingEmptyContext = vi.fn()
const assertDomainEnabled = vi.fn()

vi.mock('@/lib/coach/get-coach', () => ({
    getCoach: (...args: unknown[]) => getCoach(...args),
}))

vi.mock('@/services/auth/workspace-render-cache', () => ({
    getPreferredWorkspaceForRender: (...args: unknown[]) => getPreferredWorkspaceForRender(...args),
}))

vi.mock('./_data/workout-programs.queries', () => ({
    getWorkoutProgramsWithClients: (...args: unknown[]) => getWorkoutProgramsWithClients(...args),
}))

vi.mock('../_data/onboarding-empty.queries', () => ({
    getCoachOnboardingEmptyContext: (...args: unknown[]) => getCoachOnboardingEmptyContext(...args),
    templatesForSurface: vi.fn(() => []),
}))

vi.mock('./WorkoutProgramsClientShell', () => ({
    WorkoutProgramsClientShell: () => null,
}))

vi.mock('@/services/feature-prefs.service', () => ({
    assertDomainEnabled: (...args: unknown[]) => assertDomainEnabled(...args),
}))

import WorkoutProgramsPage from './page'

describe('WorkoutProgramsPage — gate de dominio (W1.4a)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getCoach.mockResolvedValue({ id: 'coach-1' })
        getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_team', teamId: 'team-1' })
        getWorkoutProgramsWithClients.mockResolvedValue({ programs: [], clients: [], areas: [] })
        getCoachOnboardingEmptyContext.mockResolvedValue({
            persona: null,
            demoClientId: null,
            demoName: null,
            demoLabel: null,
            noun: 'alumno',
        })
        assertDomainEnabled.mockResolvedValue(undefined)
    })

    it('con el dominio prendido: gatea con el contexto del workspace y sigue al fetch', async () => {
        await WorkoutProgramsPage()

        expect(assertDomainEnabled).toHaveBeenCalledWith('training', {
            coachId: 'coach-1',
            clientTeamId: 'team-1',
            clientOrgId: null,
        })
        expect(getWorkoutProgramsWithClients).toHaveBeenCalled()
    })

    it('con el dominio apagado: propaga el redirect y NO hace fetch de datos', async () => {
        // Sentinel que simula el throw de `redirect()` de Next (`NEXT_REDIRECT`).
        const nextRedirect = new Error('NEXT_REDIRECT')
        assertDomainEnabled.mockRejectedValue(nextRedirect)

        await expect(WorkoutProgramsPage()).rejects.toBe(nextRedirect)

        expect(getWorkoutProgramsWithClients).not.toHaveBeenCalled()
    })
})
