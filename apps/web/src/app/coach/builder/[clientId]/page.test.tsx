import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OB9 — el planificador semanal era la puerta que quedaba abierta del dominio `training`.
 * `/coach/workout-programs` ya gatea (W1.4a) y la ficha esconde las pestañas Entreno/Programa,
 * pero `/coach/builder/[clientId]` se abría igual por link directo, refresh o historial.
 *
 * Se protegen dos cosas: que el gate EXISTA con el contexto del workspace, y que corra ANTES de
 * `getBuilderData` (si alguien lo baja, el coach con el dominio apagado igual paga las lecturas
 * del builder — alumno, catálogo de ejercicios, áreas, zonas de cardio — para una pantalla que
 * nunca se pinta).
 *
 * Recordá que esto es VISIBILIDAD, nunca autorización: RLS y los entitlements siguen intactos.
 */

const getCoach = vi.fn()
const getPreferredWorkspaceForRender = vi.fn()
const getBuilderData = vi.fn()
const getCoachOnboardingEmptyContext = vi.fn()
const assertDomainEnabled = vi.fn()

vi.mock('@/lib/coach/get-coach', () => ({
    getCoach: (...args: unknown[]) => getCoach(...args),
}))

vi.mock('@/services/auth/workspace-render-cache', () => ({
    getPreferredWorkspaceForRender: (...args: unknown[]) => getPreferredWorkspaceForRender(...args),
}))

vi.mock('./_data/builder.queries', () => ({
    getBuilderData: (...args: unknown[]) => getBuilderData(...args),
}))

vi.mock('../../_data/onboarding-empty.queries', () => ({
    getCoachOnboardingEmptyContext: (...args: unknown[]) => getCoachOnboardingEmptyContext(...args),
}))

vi.mock('./WeeklyPlanBuilder', () => ({
    WeeklyPlanBuilder: () => null,
}))

vi.mock('@/services/feature-prefs.service', () => ({
    assertDomainEnabled: (...args: unknown[]) => assertDomainEnabled(...args),
}))

import BuilderPage from './page'

const CLIENT_ID = '66666666-6666-4666-8666-666666666666'

function props() {
    return {
        params: Promise.resolve({ clientId: CLIENT_ID }),
        searchParams: Promise.resolve({}),
    }
}

describe('BuilderPage — gate de dominio training (OB9)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getCoach.mockResolvedValue({ id: 'coach-1' })
        getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_team', teamId: 'team-1' })
        getBuilderData.mockResolvedValue({
            user: { id: 'coach-1' },
            client: { id: CLIENT_ID },
            exercises: [],
            initialProgram: null,
            lastEditor: null,
            areas: [],
            cardio: { enabled: false, zones: null },
            orgId: null,
            teamId: 'team-1',
        })
        getCoachOnboardingEmptyContext.mockResolvedValue({ demoClientId: null })
        assertDomainEnabled.mockResolvedValue(undefined)
    })

    it('con el dominio prendido: gatea con el contexto del workspace y sigue al fetch', async () => {
        await BuilderPage(props())

        expect(assertDomainEnabled).toHaveBeenCalledWith('training', {
            coachId: 'coach-1',
            clientTeamId: 'team-1',
            clientOrgId: null,
        })
        expect(getBuilderData).toHaveBeenCalledWith(CLIENT_ID, undefined)
    })

    it('standalone (sin team ni org): el ctx va con las dos keys en null', async () => {
        getPreferredWorkspaceForRender.mockResolvedValue(null)

        await BuilderPage(props())

        expect(assertDomainEnabled).toHaveBeenCalledWith('training', {
            coachId: 'coach-1',
            clientTeamId: null,
            clientOrgId: null,
        })
    })

    it('enterprise: el ctx lleva el orgId del workspace', async () => {
        getPreferredWorkspaceForRender.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-7' })

        await BuilderPage(props())

        expect(assertDomainEnabled).toHaveBeenCalledWith('training', {
            coachId: 'coach-1',
            clientTeamId: null,
            clientOrgId: 'org-7',
        })
    })

    it('con el dominio apagado: propaga el redirect y NO hace fetch del builder', async () => {
        // Sentinel que simula el throw de `redirect()` de Next (`NEXT_REDIRECT`).
        const nextRedirect = new Error('NEXT_REDIRECT')
        assertDomainEnabled.mockRejectedValue(nextRedirect)

        await expect(BuilderPage(props())).rejects.toBe(nextRedirect)

        expect(getBuilderData).not.toHaveBeenCalled()
    })
})
