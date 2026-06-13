import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * R2/AC2 — `logExchangePdfGenerated` debe pasar por `assertModule` (vía
 * `assertExchangesModuleForPlan`) ANTES de insertar la fila `pdf_generate`:
 * con el módulo OFF (o kill-switch) un coach de team NO puede seguir poblando
 * `team_access_logs` (falseando la bitácora Ley 21.719). El fire-and-forget se
 * preserva: assertModule lanza ⇒ catch ⇒ no-op silencioso, jamás rompe la descarga.
 */

const mocks = vi.hoisted(() => ({
    assertModule: vi.fn(),
    logTeamClientAccess: vi.fn(),
    findPlanModuleContext: vi.fn(),
}))

vi.mock('@/services/entitlements.service', () => ({
    assertModule: mocks.assertModule,
    getCoachEnabledModules: vi.fn(),
    getTeamEnabledModules: vi.fn(),
}))

vi.mock('@/services/team/team.service', () => ({
    logTeamClientAccess: mocks.logTeamClientAccess,
}))

vi.mock('@/infrastructure/db/exchanges.repository', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/infrastructure/db/exchanges.repository')>()),
    findPlanModuleContext: mocks.findPlanModuleContext,
}))

import { logExchangePdfGenerated } from './nutrition-exchanges.service'

const db = {} as never

const POOL_CTX = {
    planId: 'plan-1',
    coachId: 'coach-1',
    clientId: 'client-1',
    planMode: 'exchanges' as const,
    clientTeamId: 'team-1',
    clientOrgId: null,
}

const BASE_INPUT = {
    actorCoachId: 'coach-1',
    activeTeamId: 'team-1',
    planId: 'plan-1',
    format: 'compact' as const,
}

describe('logExchangePdfGenerated (R2/AC2: assertModule antes del insert)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mocks.findPlanModuleContext.mockResolvedValue(POOL_CTX)
        mocks.logTeamClientAccess.mockResolvedValue(undefined)
    })

    it('módulo OFF ⇒ assertModule lanza ⇒ NO inserta fila y NO propaga el error', async () => {
        mocks.assertModule.mockRejectedValue(new Error('Módulo no habilitado para este contexto.'))

        await expect(logExchangePdfGenerated(db, BASE_INPUT)).resolves.toBeUndefined()

        expect(mocks.assertModule).toHaveBeenCalledTimes(1)
        expect(mocks.logTeamClientAccess).not.toHaveBeenCalled()
    })

    it('módulo ON + coach en SU pool ⇒ inserta pdf_generate con metadata {format, plan_id}', async () => {
        mocks.assertModule.mockResolvedValue(undefined)

        await logExchangePdfGenerated(db, BASE_INPUT)

        // Gating por contexto del RECURSO (pool manda): el team del alumno decide.
        expect(mocks.assertModule).toHaveBeenCalledWith(db, 'nutrition_exchanges', { teamId: 'team-1' })
        expect(mocks.logTeamClientAccess).toHaveBeenCalledWith(db, {
            teamId: 'team-1',
            actorCoachId: 'coach-1',
            clientId: 'client-1',
            resource: 'nutrition_plan',
            action: 'pdf_generate',
            metadata: { format: 'compact', plan_id: 'plan-1' },
        })
    })

    it('módulo ON pero contexto standalone ⇒ no-op (AC7 intacto, sin bitácora que falsear)', async () => {
        mocks.assertModule.mockResolvedValue(undefined)
        mocks.findPlanModuleContext.mockResolvedValue({
            ...POOL_CTX,
            clientTeamId: null,
        })

        await logExchangePdfGenerated(db, { ...BASE_INPUT, activeTeamId: null })

        expect(mocks.logTeamClientAccess).not.toHaveBeenCalled()
    })

    it('plan inexistente ⇒ no-op silencioso (assertExchangesModuleForPlan lanza, catch lo come)', async () => {
        mocks.findPlanModuleContext.mockResolvedValue(null)

        await expect(logExchangePdfGenerated(db, BASE_INPUT)).resolves.toBeUndefined()
        expect(mocks.logTeamClientAccess).not.toHaveBeenCalled()
    })
})
