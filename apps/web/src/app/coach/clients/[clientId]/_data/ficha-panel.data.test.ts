import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * B11 (Ola de orden, TASKS.md) — pinnea el ctx EXACTO con el que `assembleClientFichaPanel`
 * (panel derecho del master-detail de Alumnos) llama a `resolveDomainsEnabled`: mismo shape que
 * `[clientId]/page.tsx` (`coachId` + `clientTeamId` + `clientOrgId`, SIN `clientId` ni
 * `audience`) — el panel es la MISMA ficha y no puede esconder pestañas distintas (W1.8 · 4A).
 */

const getClientProfileData = vi.fn()
const getEnabledModulesForRender = vi.fn()
const resolveDomainsEnabled = vi.fn()
const resolveNutritionTabV2 = vi.fn()

vi.mock('@/services/client/client-detail.service', () => ({
    getClientProfileData: (...args: unknown[]) => getClientProfileData(...args),
}))

vi.mock('@/services/entitlements-render-cache', () => ({
    getEnabledModulesForRender: (...args: unknown[]) => getEnabledModulesForRender(...args),
    hasModuleFromMap: (modules: Record<string, boolean> | undefined, key: string) =>
        modules?.[key] === true,
}))

vi.mock('@/services/dashboard.service', () => ({
    applyNutritionAttentionScore: (base: number, atRisk: boolean | null | undefined) =>
        atRisk === true ? base + 1 : base,
}))

vi.mock('@/services/feature-prefs.service', () => ({
    resolveDomainsEnabled: (...args: unknown[]) => resolveDomainsEnabled(...args),
}))

vi.mock('../nutrition-tab-v2.data', () => ({
    resolveNutritionTabV2: (...args: unknown[]) => resolveNutritionTabV2(...args),
}))

import { assembleClientFichaPanel } from './ficha-panel.data'

const CLIENT_ID = 'client-1'
const COACH_ID = 'coach-1'

function baseClient(overrides: Record<string, unknown> = {}) {
    return {
        full_name: 'Alumno de prueba',
        email: 'alumno@test.cl',
        phone: null,
        subscription_start_date: null,
        created_at: '2026-01-01',
        is_active: true,
        coach_id: COACH_ID,
        team_id: null,
        org_id: null,
        ...overrides,
    }
}

function baseProfileData(overrides: Record<string, unknown> = {}) {
    return {
        client: baseClient(),
        nutritionPlans: [],
        checkIns: [],
        compliance: null,
        profileLastActivityAt: null,
        attentionScore: 0,
        activeProgram: null,
        ...overrides,
    }
}

describe('assembleClientFichaPanel — ctx exacto de resolveDomainsEnabled (B11)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientProfileData.mockResolvedValue(baseProfileData())
        getEnabledModulesForRender.mockResolvedValue({})
        resolveNutritionTabV2.mockResolvedValue(null)
        resolveDomainsEnabled.mockResolvedValue({
            nutrition: true,
            training: true,
            cardio: true,
            movement: true,
            bodycomp: true,
        })
    })

    it('standalone (sin team ni org): ctx con las dos keys en null, sin clientId ni audience', async () => {
        await assembleClientFichaPanel(CLIENT_ID)

        expect(resolveDomainsEnabled).toHaveBeenCalledTimes(1)
        expect(resolveDomainsEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: null,
            clientOrgId: null,
        })
        // El override por-alumno NO debe apagar pestañas acá (4A): sin `clientId` a propósito.
        const ctx = resolveDomainsEnabled.mock.calls[0][0] as Record<string, unknown>
        expect(ctx).not.toHaveProperty('clientId')
        expect(ctx).not.toHaveProperty('audience')
    })

    it('alumno de pool / enterprise: propaga team_id y org_id del alumno tal cual', async () => {
        getClientProfileData.mockResolvedValue(
            baseProfileData({ client: baseClient({ team_id: 'team-9', org_id: 'org-9' }) }),
        )

        await assembleClientFichaPanel(CLIENT_ID)

        expect(resolveDomainsEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-9',
            clientOrgId: 'org-9',
        })
    })

    it('sin coach dueño: NO llama a resolveDomainsEnabled y el bundle cae al fail-open ({})', async () => {
        getClientProfileData.mockResolvedValue(
            baseProfileData({ client: baseClient({ coach_id: null }) }),
        )

        const panel = await assembleClientFichaPanel(CLIENT_ID)

        expect(resolveDomainsEnabled).not.toHaveBeenCalled()
        expect(panel.domainsEnabled).toEqual({})
    })

    it('coach con los 5 dominios apagados: el resultado llega intacto al bundle (mismo objeto)', async () => {
        const allOff = {
            nutrition: false,
            training: false,
            cardio: false,
            movement: false,
            bodycomp: false,
        }
        resolveDomainsEnabled.mockResolvedValue(allOff)

        const panel = await assembleClientFichaPanel(CLIENT_ID)

        expect(panel.domainsEnabled).toEqual(allOff)
    })

    it('MISMO ctx que page.tsx: idéntica forma de llamado para que las dos rutas nunca diverjan', async () => {
        getClientProfileData.mockResolvedValue(
            baseProfileData({ client: baseClient({ team_id: 'team-5', org_id: null }) }),
        )

        await assembleClientFichaPanel(CLIENT_ID)

        // Mismo shape exacto que `[clientId]/page.tsx` (ver page.test.tsx): 3 keys, sin
        // `clientId` ni `audience`. Si algún día divergen, este test y el de `page.tsx` fallan
        // juntos y avisan que las pestañas de las dos rutas se desalinearon.
        expect(resolveDomainsEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-5',
            clientOrgId: null,
        })
    })
})
