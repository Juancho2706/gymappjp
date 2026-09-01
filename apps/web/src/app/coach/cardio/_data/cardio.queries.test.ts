import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W1.13.c (Ola de orden) — mitad «status» del gate de dominio, lado cardio.
 *
 * Lo que se pinnea es el ORDEN de los gates, que es la parte fácil de romper al refactorizar:
 *   enterprise → module_off  ›  PREFERENCIA del coach → domain_off  ›  entitlement → module_off
 * Si alguien mueve el resolver debajo del `assertModule`, un coach que apagó Cardio en Opciones ›
 * Mi panel vería «comprá el módulo» (o pagaría las queries) en vez del aviso para prenderlo.
 *
 * Esto es VISIBILIDAD, nunca autorización: `assertModule` sigue corriendo igual y RLS no se toca.
 */

const { createClientMock, resolvePreferredWorkspace, assertModule, listCardioClients, getCardioClientForCoach, resolveCardioDomainEnabled } =
    vi.hoisted(() => ({
        createClientMock: vi.fn(),
        resolvePreferredWorkspace: vi.fn(),
        assertModule: vi.fn(),
        listCardioClients: vi.fn(),
        getCardioClientForCoach: vi.fn(),
        resolveCardioDomainEnabled: vi.fn(),
    }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...args: unknown[]) => resolvePreferredWorkspace(...args),
}))
vi.mock('@/services/entitlements.service', () => ({
    assertModule: (...args: unknown[]) => assertModule(...args),
}))
vi.mock('@/services/cardio-zones.service', () => ({
    listCardioClients: (...args: unknown[]) => listCardioClients(...args),
    getCardioClientForCoach: (...args: unknown[]) => getCardioClientForCoach(...args),
}))
vi.mock('@/services/feature-prefs.service', () => ({
    resolveCardioDomainEnabled: (...args: unknown[]) => resolveCardioDomainEnabled(...args),
}))

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'

/**
 * Las dos funciones están envueltas en `React.cache` (dedup por request) y `getCardioPageData` no
 * recibe argumentos: si compartieran módulo entre casos, el segundo `it` podría comerse el
 * resultado del primero. Cada caso estrena su propio módulo (mismo patrón que
 * `email-verification.queries.test.ts`).
 */
async function loadFresh() {
    vi.resetModules()
    return await import('./cardio.queries')
}

describe('cardio.queries — gate de dominio (W1.4b)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: COACH_ID } } })) },
        })
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_team', teamId: 'team-1' })
        assertModule.mockResolvedValue(undefined)
        listCardioClients.mockResolvedValue([])
        getCardioClientForCoach.mockResolvedValue({ id: CLIENT_ID, full_name: 'Ana' })
        resolveCardioDomainEnabled.mockResolvedValue(true)
    })

    describe('getCardioPageData', () => {
        it('dominio apagado ⇒ domain_off, sin tocar el módulo ni la DB de cardio', async () => {
            resolveCardioDomainEnabled.mockResolvedValue(false)
            const { getCardioPageData } = await loadFresh()

            await expect(getCardioPageData()).resolves.toEqual({ status: 'domain_off' })
            expect(assertModule).not.toHaveBeenCalled()
            expect(listCardioClients).not.toHaveBeenCalled()
        })

        it('dominio prendido en team ⇒ ok, con el ctx exacto del workspace', async () => {
            const { getCardioPageData } = await loadFresh()

            const result = await getCardioPageData()

            expect(result.status).toBe('ok')
            expect(resolveCardioDomainEnabled).toHaveBeenCalledWith({
                coachId: COACH_ID,
                clientTeamId: 'team-1',
                clientOrgId: null,
            })
            expect(assertModule).toHaveBeenCalled()
        })

        it('standalone (sin team) ⇒ el ctx va con clientTeamId null', async () => {
            resolvePreferredWorkspace.mockResolvedValue(null)
            const { getCardioPageData } = await loadFresh()

            await expect(getCardioPageData()).resolves.toMatchObject({ status: 'ok' })
            expect(resolveCardioDomainEnabled).toHaveBeenCalledWith({
                coachId: COACH_ID,
                clientTeamId: null,
                clientOrgId: null,
            })
        })

        it('enterprise ⇒ module_off ANTES de la preferencia (no se lee prefs)', async () => {
            resolvePreferredWorkspace.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-1' })
            const { getCardioPageData } = await loadFresh()

            await expect(getCardioPageData()).resolves.toEqual({ status: 'module_off' })
            expect(resolveCardioDomainEnabled).not.toHaveBeenCalled()
        })

        it('dominio prendido pero sin entitlement ⇒ module_off (el módulo sigue mandando)', async () => {
            assertModule.mockRejectedValue(new Error('Modulo no habilitado: cardio'))
            const { getCardioPageData } = await loadFresh()

            await expect(getCardioPageData()).resolves.toEqual({ status: 'module_off' })
            expect(resolveCardioDomainEnabled).toHaveBeenCalled()
        })
    })

    describe('getCardioClientData', () => {
        it('dominio apagado ⇒ domain_off, sin módulo ni lectura del alumno', async () => {
            resolveCardioDomainEnabled.mockResolvedValue(false)
            const { getCardioClientData } = await loadFresh()

            await expect(getCardioClientData(CLIENT_ID)).resolves.toEqual({ status: 'domain_off' })
            expect(assertModule).not.toHaveBeenCalled()
            expect(getCardioClientForCoach).not.toHaveBeenCalled()
        })

        it('dominio prendido ⇒ sigue al módulo y devuelve el perfil', async () => {
            const { getCardioClientData } = await loadFresh()

            await expect(getCardioClientData(CLIENT_ID)).resolves.toMatchObject({ status: 'ok' })
            expect(resolveCardioDomainEnabled).toHaveBeenCalledWith({
                coachId: COACH_ID,
                clientTeamId: 'team-1',
                clientOrgId: null,
            })
            expect(getCardioClientForCoach).toHaveBeenCalled()
        })
    })
})
