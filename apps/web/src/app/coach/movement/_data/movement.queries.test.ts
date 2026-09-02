import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W1.13.c (Ola de orden) — mitad «status» del gate de dominio, lado movimiento.
 *
 * Mismo invariante que en cardio: el ORDEN de los gates es lo que se protege.
 *   enterprise → module_off  ›  PREFERENCIA del coach → domain_off  ›  entitlement → module_off
 * Si el resolver cae debajo del `assertModule`, quien apagó Movimiento en Opciones › Mi panel
 * vería el aviso de venta del módulo en vez del de prenderlo.
 */

const {
    createClientMock,
    resolvePreferredWorkspace,
    assertModule,
    getMovementHubData,
    getClientMovementDetail,
    getMovementWizardData,
    getMovementPrintData,
    resolveMovementDomainEnabled,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    resolvePreferredWorkspace: vi.fn(),
    assertModule: vi.fn(),
    getMovementHubData: vi.fn(),
    getClientMovementDetail: vi.fn(),
    getMovementWizardData: vi.fn(),
    getMovementPrintData: vi.fn(),
    resolveMovementDomainEnabled: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...args: unknown[]) => resolvePreferredWorkspace(...args),
}))
vi.mock('@/services/entitlements.service', () => ({
    assertModule: (...args: unknown[]) => assertModule(...args),
}))
// El módulo bajo test importa las cuatro funciones del service (hub + subrutas por alumno): el
// factory tiene que exportarlas todas o el import falla antes de correr un solo caso.
vi.mock('@/services/assessment/movement-assessment.service', () => ({
    getMovementHubData: (...args: unknown[]) => getMovementHubData(...args),
    getClientMovementDetail: (...args: unknown[]) => getClientMovementDetail(...args),
    getMovementWizardData: (...args: unknown[]) => getMovementWizardData(...args),
    getMovementPrintData: (...args: unknown[]) => getMovementPrintData(...args),
}))
vi.mock('@/services/feature-prefs.service', () => ({
    resolveMovementDomainEnabled: (...args: unknown[]) => resolveMovementDomainEnabled(...args),
}))

const COACH_ID = '33333333-3333-4333-8333-333333333333'

/** `getMovementHub` está envuelto en `React.cache` y no recibe argumentos: módulo fresco por caso. */
async function loadFresh() {
    vi.resetModules()
    return await import('./movement.queries')
}

describe('getMovementHub — gate de dominio (W1.4b)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: COACH_ID } } })) },
        })
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_team', teamId: 'team-9' })
        assertModule.mockResolvedValue(undefined)
        getMovementHubData.mockResolvedValue({ clients: [] })
        resolveMovementDomainEnabled.mockResolvedValue(true)
    })

    it('dominio apagado ⇒ domain_off, sin tocar el módulo ni los datos del hub', async () => {
        resolveMovementDomainEnabled.mockResolvedValue(false)
        const { getMovementHub } = await loadFresh()

        await expect(getMovementHub()).resolves.toEqual({ status: 'domain_off' })
        expect(assertModule).not.toHaveBeenCalled()
        expect(getMovementHubData).not.toHaveBeenCalled()
    })

    it('dominio prendido en team ⇒ ok, con el ctx exacto del workspace', async () => {
        const { getMovementHub } = await loadFresh()

        await expect(getMovementHub()).resolves.toEqual({ status: 'ok', data: { clients: [] } })
        expect(resolveMovementDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-9',
            clientOrgId: null,
        })
    })

    it('standalone (sin team) ⇒ el ctx va con clientTeamId null', async () => {
        resolvePreferredWorkspace.mockResolvedValue(null)
        const { getMovementHub } = await loadFresh()

        await expect(getMovementHub()).resolves.toMatchObject({ status: 'ok' })
        expect(resolveMovementDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: null,
            clientOrgId: null,
        })
    })

    it('enterprise ⇒ module_off ANTES de la preferencia (no se lee prefs)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-7' })
        const { getMovementHub } = await loadFresh()

        await expect(getMovementHub()).resolves.toEqual({ status: 'module_off' })
        expect(resolveMovementDomainEnabled).not.toHaveBeenCalled()
    })

    it('dominio prendido pero sin entitlement ⇒ module_off (el módulo sigue mandando)', async () => {
        assertModule.mockRejectedValue(new Error('Modulo no habilitado: movement_assessment'))
        const { getMovementHub } = await loadFresh()

        await expect(getMovementHub()).resolves.toEqual({ status: 'module_off' })
        expect(resolveMovementDomainEnabled).toHaveBeenCalled()
        expect(getMovementHubData).not.toHaveBeenCalled()
    })
})

/**
 * OB9 — las SUBRUTAS por alumno (reporte, wizard, print) tenían el mismo `catch { return null }`
 * para todo, así que el coach que apagó Movimiento en Funciones se topaba con un 404 seco en vez
 * del aviso «prendelo de nuevo». Lo que se protege acá es que `domain_off` sea un estado PROPIO y
 * que se resuelva ANTES de leer datos del alumno (el service ni se toca).
 */
describe('subrutas por alumno — gate de dominio (OB9)', () => {
    const CLIENT_ID = '44444444-4444-4444-8444-444444444444'
    const ASSESSMENT_ID = '55555555-5555-4555-8555-555555555555'

    beforeEach(() => {
        vi.clearAllMocks()
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: COACH_ID } } })) },
        })
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_team', teamId: 'team-9' })
        resolveMovementDomainEnabled.mockResolvedValue(true)
        getClientMovementDetail.mockResolvedValue({ clientName: 'Ana', assessments: [], finals: [] })
        getMovementWizardData.mockResolvedValue({ clientName: 'Ana', draft: null, hasActiveConsent: true })
        getMovementPrintData.mockResolvedValue({ brandName: 'EVA' })
    })

    it('reporte: dominio apagado ⇒ domain_off, sin leer al alumno', async () => {
        resolveMovementDomainEnabled.mockResolvedValue(false)
        const { getMovementClientReport } = await loadFresh()

        await expect(getMovementClientReport(CLIENT_ID)).resolves.toEqual({ status: 'domain_off' })
        expect(getClientMovementDetail).not.toHaveBeenCalled()
        expect(resolveMovementDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-9',
            clientOrgId: null,
        })
    })

    it('wizard: dominio apagado ⇒ domain_off, sin tocar el borrador', async () => {
        resolveMovementDomainEnabled.mockResolvedValue(false)
        const { getMovementWizard } = await loadFresh()

        await expect(getMovementWizard(CLIENT_ID)).resolves.toEqual({ status: 'domain_off' })
        expect(getMovementWizardData).not.toHaveBeenCalled()
    })

    it('print: dominio apagado ⇒ domain_off, sin generar el PDF ni registrar la bitácora', async () => {
        resolveMovementDomainEnabled.mockResolvedValue(false)
        const { getMovementPrint } = await loadFresh()

        await expect(getMovementPrint(CLIENT_ID, ASSESSMENT_ID)).resolves.toEqual({ status: 'domain_off' })
        expect(getMovementPrintData).not.toHaveBeenCalled()
    })

    it('dominio prendido ⇒ ok con los datos del service (el wizard suma currentUserId)', async () => {
        const { getMovementClientReport, getMovementWizard, getMovementPrint } = await loadFresh()

        await expect(getMovementClientReport(CLIENT_ID)).resolves.toEqual({
            status: 'ok',
            data: { clientName: 'Ana', assessments: [], finals: [] },
        })
        await expect(getMovementWizard(CLIENT_ID)).resolves.toEqual({
            status: 'ok',
            data: { clientName: 'Ana', draft: null, hasActiveConsent: true, currentUserId: COACH_ID },
        })
        await expect(getMovementPrint(CLIENT_ID, ASSESSMENT_ID)).resolves.toEqual({
            status: 'ok',
            data: { brandName: 'EVA' },
        })
    })

    it('un fallo del service sigue siendo not_found (misma semántica que el null viejo)', async () => {
        getClientMovementDetail.mockRejectedValue(new Error('Modulo no habilitado'))
        const { getMovementClientReport } = await loadFresh()

        await expect(getMovementClientReport(CLIENT_ID)).resolves.toEqual({ status: 'not_found' })
    })

    it('sin sesión ⇒ not_found, sin consultar preferencias', async () => {
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: null } })) },
        })
        const { getMovementClientReport } = await loadFresh()

        await expect(getMovementClientReport(CLIENT_ID)).resolves.toEqual({ status: 'not_found' })
        expect(resolveMovementDomainEnabled).not.toHaveBeenCalled()
    })

    it('enterprise ⇒ NO se leen preferencias; el rechazo del service manda (not_found)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-7' })
        getClientMovementDetail.mockRejectedValue(new Error('Modulo no disponible en contexto enterprise (v1).'))
        const { getMovementClientReport } = await loadFresh()

        await expect(getMovementClientReport(CLIENT_ID)).resolves.toEqual({ status: 'not_found' })
        expect(resolveMovementDomainEnabled).not.toHaveBeenCalled()
    })

    it('standalone (sin team) ⇒ el ctx va con clientTeamId null', async () => {
        resolvePreferredWorkspace.mockResolvedValue(null)
        const { getMovementWizard } = await loadFresh()

        await expect(getMovementWizard(CLIENT_ID)).resolves.toMatchObject({ status: 'ok' })
        expect(resolveMovementDomainEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: null,
            clientOrgId: null,
        })
    })
})
