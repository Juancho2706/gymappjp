import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W1.13.c (Ola de orden) — mitad «status» del gate de dominio, lado composición corporal.
 *
 * Acá el orden tiene una vuelta más que en cardio/movimiento, y es justo lo que se pinnea:
 *   1. kill-switch de plataforma (`assertBodyCompositionEnabled`) → module_off
 *   2. acceso al alumno (`assertCoachClientWriteAccess`) → not_found
 *   3. PREFERENCIA del coach (`resolveBodycompDomainEnabled`) → domain_off
 *   4. entitlement (`assertModule`) → module_off
 * El (3) va después del (2) porque el ctx (team/org) sale del propio `access`, y NO le pasa
 * `clientId`: el override por-alumno es la puerta para volver a prender, no un candado extra
 * (mockup 4A). Si alguien lo agrega, este test lo caza.
 */

const { createClientMock, assertModule, assertBodyCompositionEnabled, assertCoachClientWriteAccess, listClientMeasurements, resolveBodycompDomainEnabled } =
    vi.hoisted(() => ({
        createClientMock: vi.fn(),
        assertModule: vi.fn(),
        assertBodyCompositionEnabled: vi.fn(),
        assertCoachClientWriteAccess: vi.fn(),
        listClientMeasurements: vi.fn(),
        resolveBodycompDomainEnabled: vi.fn(),
    }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/services/entitlements.service', () => ({
    assertModule: (...args: unknown[]) => assertModule(...args),
}))
vi.mock('@/services/bodycomp/body-composition.service', () => ({
    assertBodyCompositionEnabled: (...args: unknown[]) => assertBodyCompositionEnabled(...args),
    assertCoachClientWriteAccess: (...args: unknown[]) => assertCoachClientWriteAccess(...args),
    listClientMeasurements: (...args: unknown[]) => listClientMeasurements(...args),
}))
vi.mock('@/services/feature-prefs.service', () => ({
    resolveBodycompDomainEnabled: (...args: unknown[]) => resolveBodycompDomainEnabled(...args),
}))

const COACH_ID = '44444444-4444-4444-8444-444444444444'
const CLIENT_ID = '55555555-5555-4555-8555-555555555555'

/** `getClientBodyComposition` está envuelto en `React.cache`: módulo fresco por caso. */
async function loadFresh() {
    vi.resetModules()
    return await import('./body-composition.queries')
}

describe('getClientBodyComposition — gate de dominio (W1.4b)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: COACH_ID } } })) },
        })
        assertBodyCompositionEnabled.mockResolvedValue(undefined)
        assertCoachClientWriteAccess.mockResolvedValue({
            orgId: null,
            activeTeamId: 'team-5',
            viaTeam: true,
            teamId: 'team-5',
        })
        assertModule.mockResolvedValue(undefined)
        listClientMeasurements.mockResolvedValue({ bia: [], isak: [] })
        resolveBodycompDomainEnabled.mockResolvedValue(true)
    })

    it('kill-switch de plataforma ⇒ module_off, sin acceso ni preferencia', async () => {
        assertBodyCompositionEnabled.mockRejectedValue(new Error('kill switch'))
        const { getClientBodyComposition } = await loadFresh()

        await expect(getClientBodyComposition(CLIENT_ID)).resolves.toEqual({ status: 'module_off' })
        expect(assertCoachClientWriteAccess).not.toHaveBeenCalled()
        expect(resolveBodycompDomainEnabled).not.toHaveBeenCalled()
    })

    it('sin acceso al alumno ⇒ not_found, sin leer la preferencia', async () => {
        assertCoachClientWriteAccess.mockRejectedValue(new Error('no access'))
        const { getClientBodyComposition } = await loadFresh()

        await expect(getClientBodyComposition(CLIENT_ID)).resolves.toEqual({ status: 'not_found' })
        expect(resolveBodycompDomainEnabled).not.toHaveBeenCalled()
        expect(assertModule).not.toHaveBeenCalled()
    })

    it('dominio apagado ⇒ domain_off con el ctx del access y SIN clientId', async () => {
        resolveBodycompDomainEnabled.mockResolvedValue(false)
        const { getClientBodyComposition } = await loadFresh()

        await expect(getClientBodyComposition(CLIENT_ID)).resolves.toEqual({ status: 'domain_off' })
        // Igualdad estricta del objeto: si alguien suma `clientId` al ctx, esto falla.
        expect(resolveBodycompDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-5',
            clientOrgId: null,
        })
        expect(assertModule).not.toHaveBeenCalled()
        expect(listClientMeasurements).not.toHaveBeenCalled()
    })

    it('acceso standalone ⇒ el ctx va sin team (clientTeamId null)', async () => {
        assertCoachClientWriteAccess.mockResolvedValue({
            orgId: null,
            activeTeamId: null,
            viaTeam: false,
            teamId: null,
        })
        resolveBodycompDomainEnabled.mockResolvedValue(false)
        const { getClientBodyComposition } = await loadFresh()

        await expect(getClientBodyComposition(CLIENT_ID)).resolves.toEqual({ status: 'domain_off' })
        expect(resolveBodycompDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: null,
            clientOrgId: null,
        })
    })

    it('dominio prendido ⇒ sigue al módulo y devuelve las mediciones', async () => {
        const { getClientBodyComposition } = await loadFresh()

        await expect(getClientBodyComposition(CLIENT_ID)).resolves.toEqual({
            status: 'ok',
            data: { clientId: CLIENT_ID, bia: [], isak: [] },
        })
        expect(assertModule).toHaveBeenCalled()
        expect(listClientMeasurements).toHaveBeenCalled()
    })
})
