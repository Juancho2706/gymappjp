import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeIsak } from '@eva/bodycomp'
import { athleteMaleInput } from '@eva/bodycomp/fixtures'
import { isakResultToMetricsJson } from './body-composition.mappers'

vi.mock('@/services/entitlements.service', () => ({
    assertModule: vi.fn(),
}))
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: vi.fn(),
}))
vi.mock('@/services/team/team.service', () => ({
    logTeamClientAccess: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/infrastructure/db/body-composition.repository', () => ({
    insert: vi.fn(),
    getById: vi.fn(),
    softDelete: vi.fn(),
    listByClientAndMethod: vi.fn(),
}))
// El kill-switch importa dinamicamente @vercel/edge-config — se intercepta igual con vi.mock.
vi.mock('@vercel/edge-config', () => ({
    get: vi.fn(),
}))

import { assertModule } from '@/services/entitlements.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { logTeamClientAccess } from '@/services/team/team.service'
import { get as edgeConfigGet } from '@vercel/edge-config'
import * as repo from '@/infrastructure/db/body-composition.repository'
import {
    bodyCompositionAccessFromExplicitScope,
    deleteBodyComposition,
    deleteBodyCompositionWithAccess,
    listClientMeasurements,
    listClientMeasurementsWithAccess,
    saveBodyComposition,
    saveBodyCompositionWithAccess,
    type WriteAccess,
} from './body-composition.service'

const USER = 'coach-1'
const TEAM = 'team-1'
const CLIENT = '6f9b1f0a-2d2c-4d6a-9d3e-8a1b2c3d4e5f' // uuid valido (lo exige el schema)

const TEAM_WS = { type: 'coach_team', teamId: TEAM } as never
const STANDALONE_WS = { type: 'coach_standalone' } as never

const TEAM_ACCESS: WriteAccess = { orgId: null, activeTeamId: TEAM, viaTeam: true, teamId: TEAM }
const STANDALONE_ACCESS: WriteAccess = { orgId: null, activeTeamId: null, viaTeam: false, teamId: null }
const ENTERPRISE_ACCESS: WriteAccess = { orgId: 'org-1', activeTeamId: null, viaTeam: false, teamId: null }

/**
 * Stub minimo del cliente Supabase: from(tabla) -> cadena (select/eq/is) -> maybeSingle con el
 * resultado configurado por tabla. El service solo consulta `clients` (write-access) y
 * `client_consents` (consentimiento); el resto del IO esta mockeado en el repository.
 */
function makeDb(tables: Record<string, unknown>) {
    return {
        from: vi.fn((table: string) => {
            const chain: Record<string, unknown> = {}
            chain.select = () => chain
            chain.eq = () => chain
            chain.is = () => chain
            chain.maybeSingle = async () => ({ data: tables[table] ?? null, error: null })
            return chain
        }),
    } as never
}

const TEAM_CLIENT = { id: CLIENT, team_id: TEAM }
const CONSENT = { id: 'consent-1' }
const ROW = { id: 'measurement-1', client_id: CLIENT, coach_id: USER, team_id: TEAM, org_id: null, method: 'bia' } as never

const BIA_INPUT = {
    method: 'bia' as const,
    clientId: CLIENT,
    metrics: { bodyFatPercent: 24.5, skeletalMuscleMassKg: 28.1 },
    weightKg: 70,
}

const ISAK_INPUT = {
    method: 'isak' as const,
    clientId: CLIENT,
    rawInput: athleteMaleInput(),
    bodyFatEquation: 'durnin_womersley' as const,
}

beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks NO borra implementaciones: re-fijar las felices para que cada test
    // configure SOLO su guarda fallida (mismo criterio que movement-assessment.service.test).
    vi.mocked(assertModule).mockResolvedValue(undefined)
    vi.mocked(repo.insert).mockResolvedValue({ row: ROW, error: null })
    vi.mocked(repo.softDelete).mockResolvedValue({ error: null })
})

afterEach(() => {
    delete process.env.EDGE_CONFIG
})

describe('orden de guardas: kill-switch -> Zod -> scope -> assertModule -> consentimiento', () => {
    it('kill-switch activo corta ANTES de todo (ni Zod ni scope ni insert)', async () => {
        process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/test'
        vi.mocked(edgeConfigGet).mockResolvedValue(true)
        const db = makeDb({})
        // Payload INVALIDO a proposito: si el kill-switch corre primero, el error es suyo (no ZodError).
        await expect(saveBodyComposition(db, USER, { method: 'bia' })).rejects.toThrow(/kill-switch/)
        expect(resolvePreferredWorkspace).not.toHaveBeenCalled()
        expect(repo.insert).not.toHaveBeenCalled()
    })

    it('kill-switch ausente/false NO bloquea (fail-open de Edge Config)', async () => {
        process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/test'
        vi.mocked(edgeConfigGet).mockResolvedValue(undefined)
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(STANDALONE_WS)
        const db = makeDb({ clients: { id: CLIENT } })
        await expect(saveBodyComposition(db, USER, BIA_INPUT)).resolves.toBeTruthy()
    })

    it('Zod valida ANTES del scope: payload invalido => rechaza sin resolver workspace', async () => {
        const db = makeDb({})
        await expect(
            saveBodyComposition(db, USER, { method: 'bia', clientId: 'no-es-uuid', metrics: {} })
        ).rejects.toThrow()
        expect(resolvePreferredWorkspace).not.toHaveBeenCalled()
        expect(repo.insert).not.toHaveBeenCalled()
    })

    it('ISAK con `metrics` inyectados por el cliente => rechazado (.strict), NO se persiste', async () => {
        const db = makeDb({})
        await expect(
            saveBodyComposition(db, USER, { ...ISAK_INPUT, metrics: { bodyFat: { percent: 1 } } })
        ).rejects.toThrow()
        expect(repo.insert).not.toHaveBeenCalled()
    })
})

describe('gating del modulo (assertModule por workspace ACTIVO)', () => {
    it('adapta los tres scopes explicitos sin mezclar tenants', () => {
        expect(bodyCompositionAccessFromExplicitScope({ type: 'standalone' })).toEqual(STANDALONE_ACCESS)
        expect(bodyCompositionAccessFromExplicitScope({ type: 'team', teamId: TEAM })).toEqual(TEAM_ACCESS)
        expect(bodyCompositionAccessFromExplicitScope({ type: 'enterprise', orgId: 'org-1' })).toEqual(ENTERPRISE_ACCESS)
    })

    it('enterprise explicito queda rechazado aunque el coach tenga addon personal', async () => {
        const db = makeDb({})
        await expect(
            saveBodyCompositionWithAccess(db, USER, BIA_INPUT, CLIENT, ENTERPRISE_ACCESS)
        ).rejects.toThrow(/no habilitado/)
        await expect(
            listClientMeasurementsWithAccess(db, USER, ENTERPRISE_ACCESS, CLIENT)
        ).rejects.toThrow(/no habilitado/)
        expect(repo.insert).not.toHaveBeenCalled()
        expect(repo.listByClientAndMethod).not.toHaveBeenCalled()
    })

    it('modulo OFF (assertModule lanza) => save lanza y NO inserta', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(TEAM_WS)
        vi.mocked(assertModule).mockRejectedValue(new Error('Modulo no habilitado: body_composition'))
        const db = makeDb({ clients: TEAM_CLIENT, client_consents: CONSENT })
        await expect(saveBodyComposition(db, USER, BIA_INPUT)).rejects.toThrow(/no habilitado/)
        expect(repo.insert).not.toHaveBeenCalled()
    })

    it('team: assertModule recibe el contexto del TEAM (no el coach)', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(TEAM_WS)
        const db = makeDb({ clients: TEAM_CLIENT, client_consents: CONSENT })
        await saveBodyComposition(db, USER, BIA_INPUT)
        expect(assertModule).toHaveBeenCalledWith(db, 'body_composition', { teamId: TEAM })
    })

    it('standalone: assertModule recibe el coachId', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(STANDALONE_WS)
        const db = makeDb({ clients: { id: CLIENT } })
        await saveBodyComposition(db, USER, BIA_INPUT)
        expect(assertModule).toHaveBeenCalledWith(db, 'body_composition', { coachId: USER })
    })
})

describe('consentimiento de salud (AC6, escritura) + estampado por workspace', () => {
    it('team SIN consentimiento activo => save lanza y NO inserta', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(TEAM_WS)
        const db = makeDb({ clients: TEAM_CLIENT, client_consents: null })
        await expect(saveBodyComposition(db, USER, BIA_INPUT)).rejects.toThrow(/consentimiento/)
        expect(repo.insert).not.toHaveBeenCalled()
    })

    it('team CON consentimiento => inserta con team_id/coach_id correctos y consent_confirmed_at', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(TEAM_WS)
        const db = makeDb({ clients: TEAM_CLIENT, client_consents: CONSENT })
        await saveBodyComposition(db, USER, BIA_INPUT)
        const values = vi.mocked(repo.insert).mock.calls[0][1]
        expect(values.team_id).toBe(TEAM)
        expect(values.coach_id).toBe(USER)
        expect(values.org_id).toBeNull()
        expect(values.created_by).toBe(USER)
        expect(values.consent_confirmed_at).toBeTruthy()
        expect(Number.isNaN(Date.parse(values.consent_confirmed_at as string))).toBe(false)
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({
                teamId: TEAM,
                actorCoachId: USER,
                clientId: CLIENT,
                resource: 'body_composition',
                action: 'create',
            })
        )
    })

    it('standalone => team_id null, sin consent_confirmed_at y SIN bitacora', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(STANDALONE_WS)
        const db = makeDb({ clients: { id: CLIENT } })
        await saveBodyComposition(db, USER, BIA_INPUT)
        const values = vi.mocked(repo.insert).mock.calls[0][1]
        expect(values.team_id).toBeNull()
        expect(values.coach_id).toBe(USER)
        expect(values.consent_confirmed_at).toBeNull()
        expect(logTeamClientAccess).not.toHaveBeenCalled()
    })
})

describe('derivados ISAK server-side (T3.3/T5.2)', () => {
    it('persiste metrics calculados con computeIsak, equation_used y is_validated=false', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(STANDALONE_WS)
        const db = makeDb({ clients: { id: CLIENT } })
        await saveBodyComposition(db, USER, ISAK_INPUT)

        // El mismo calculo puro que corre el server (DTO y dominio comparten forma 1:1).
        const expected = computeIsak(athleteMaleInput(), { bodyFatEquation: 'durnin_womersley' })
        const values = vi.mocked(repo.insert).mock.calls[0][1]
        expect(values.method).toBe('isak')
        expect(values.metrics).toEqual(isakResultToMetricsJson(expected))
        expect(values.equation_used).toBe(expected.equationUsed)
        expect(values.raw_input).toEqual(ISAK_INPUT.rawInput)
        expect(values.is_validated).toBe(false) // AC7: "preliminar" hasta validar vs fichas reales
        // weight/height caen al raw_input cuando no vienen al tope del payload.
        expect(values.weight_kg).toBe(ISAK_INPUT.rawInput.weightKg)
        expect(values.height_cm).toBe(ISAK_INPUT.rawInput.heightCm)
    })

    it('BIA persiste los metrics capturados tal cual (sin calculo) y is_validated=false', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(STANDALONE_WS)
        const db = makeDb({ clients: { id: CLIENT } })
        await saveBodyComposition(db, USER, BIA_INPUT)
        const values = vi.mocked(repo.insert).mock.calls[0][1]
        expect(values.method).toBe('bia')
        expect(values.metrics).toEqual(BIA_INPUT.metrics)
        expect(values.equation_used).toBeNull()
        expect(values.is_validated).toBe(false)
    })
})

describe('lectura (AC6): consentimiento + bitacora view en team', () => {
    it('team SIN consentimiento => la LECTURA falla server-side y no lista nada', async () => {
        const db = makeDb({ client_consents: null })
        await expect(listClientMeasurements(db, USER, TEAM_ACCESS, CLIENT)).rejects.toThrow(/consentimiento/)
        expect(repo.listByClientAndMethod).not.toHaveBeenCalled()
        expect(logTeamClientAccess).not.toHaveBeenCalled()
    })

    it('team CON consentimiento => lista ambos metodos y registra UNA accion view', async () => {
        const db = makeDb({ client_consents: CONSENT })
        vi.mocked(repo.listByClientAndMethod).mockImplementation(
            async (_db, _clientId, method) => (method === 'bia' ? [ROW] : []) as never
        )
        const data = await listClientMeasurements(db, USER, TEAM_ACCESS, CLIENT)
        expect(data.bia).toHaveLength(1)
        expect(data.isak).toHaveLength(0)
        expect(logTeamClientAccess).toHaveBeenCalledTimes(1)
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({
                teamId: TEAM,
                actorCoachId: USER,
                clientId: CLIENT,
                resource: 'body_composition',
                action: 'view',
            })
        )
    })

    it('team no recibe filas historicas estampadas por otro tenant', async () => {
        const db = makeDb({ client_consents: CONSENT })
        const foreign = {
            id: 'measurement-foreign', client_id: CLIENT, coach_id: USER,
            team_id: 'team-2', org_id: null, method: 'bia',
        } as never
        vi.mocked(repo.listByClientAndMethod).mockImplementation(
            async (_db, _clientId, method) => (method === 'bia' ? [ROW, foreign] : []) as never
        )
        const data = await listClientMeasurements(db, USER, TEAM_ACCESS, CLIENT)
        expect(data.bia.map((row) => row.id)).toEqual(['measurement-1'])
    })

    it('standalone => lista sin exigir consentimiento y SIN bitacora', async () => {
        const db = makeDb({})
        vi.mocked(repo.listByClientAndMethod).mockResolvedValue([])
        const data = await listClientMeasurements(db, USER, STANDALONE_ACCESS, CLIENT)
        expect(data).toEqual({ bia: [], isak: [] })
        expect(logTeamClientAccess).not.toHaveBeenCalled()
    })
})

describe('soft-delete con guardas', () => {
    it('scope explicito rechaza una medicion estampada por otro team', async () => {
        vi.mocked(repo.getById).mockResolvedValue({
            id: 'measurement-1', client_id: CLIENT, coach_id: USER,
            team_id: 'team-2', org_id: null, method: 'bia',
        } as never)
        const db = makeDb({})
        await expect(
            deleteBodyCompositionWithAccess(db, USER, 'measurement-1', CLIENT, TEAM_ACCESS)
        ).rejects.toThrow(/no encontrada/)
        expect(repo.softDelete).not.toHaveBeenCalled()
    })

    it('scope explicito team conserva entitlement y bitacora al eliminar', async () => {
        vi.mocked(repo.getById).mockResolvedValue(ROW)
        const db = makeDb({})
        await deleteBodyCompositionWithAccess(db, USER, 'measurement-1', CLIENT, TEAM_ACCESS)
        expect(assertModule).toHaveBeenCalledWith(db, 'body_composition', { teamId: TEAM })
        expect(repo.softDelete).toHaveBeenCalledWith(db, 'measurement-1')
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ action: 'delete', teamId: TEAM, clientId: CLIENT })
        )
    })

    it('medicion inexistente => lanza sin tocar el repo de escritura', async () => {
        vi.mocked(repo.getById).mockResolvedValue(null)
        const db = makeDb({})
        await expect(deleteBodyComposition(db, USER, 'measurement-x')).rejects.toThrow(/no encontrada/)
        expect(repo.softDelete).not.toHaveBeenCalled()
    })

    it('team: soft-delete + bitacora delete', async () => {
        vi.mocked(resolvePreferredWorkspace).mockResolvedValue(TEAM_WS)
        vi.mocked(repo.getById).mockResolvedValue(ROW)
        const db = makeDb({ clients: TEAM_CLIENT })
        await deleteBodyComposition(db, USER, 'measurement-1')
        expect(repo.softDelete).toHaveBeenCalledWith(db, 'measurement-1')
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ action: 'delete', resource: 'body_composition' })
        )
    })
})
