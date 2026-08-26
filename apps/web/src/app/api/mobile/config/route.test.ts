import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Decision D9 opcion A del owner (22-08, ratificada 26-08): la preferencia de modulos vive SOLO
 * en el panel del COACH. Con `FEATURE_PREFS_ENABLED` ON y `coach_feature_prefs` apagando
 * Nutricion, el coach deja de ver su modulo pero SUS ALUMNOS lo conservan — la app del alumno se
 * modula unicamente por los entitlements reales del plan.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────────
const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// El endpoint solo lo usa con `?workspaceKind=`; los tests van por el camino sin parametro.
vi.mock('../coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: vi.fn(),
}))

const resolveStudentAccessForCoach = vi.fn<
    (...a: unknown[]) => Promise<{ state: string; graceEndsAt: string | null }>
>(async () => ({ state: 'active', graceEndsAt: null }))
vi.mock('@/lib/student-access.server', () => ({
    resolveStudentAccessForCoach: (...a: unknown[]) => resolveStudentAccessForCoach(...a),
}))

type EnabledModulesFn = (...a: unknown[]) => Promise<Record<string, boolean>>
const getCoachEnabledModules = vi.fn<EnabledModulesFn>(async () => ({}))
const getTeamEnabledModules = vi.fn<EnabledModulesFn>(async () => ({}))
vi.mock('@/services/entitlements.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/entitlements.service')>()),
    getCoachEnabledModules: (...a: unknown[]) => getCoachEnabledModules(...a),
    getTeamEnabledModules: (...a: unknown[]) => getTeamEnabledModules(...a),
}))

const edgeConfigGet = vi.fn(async (key: string) => key === 'FEATURE_PREFS_ENABLED')
vi.mock('@vercel/edge-config', () => ({
    get: (...a: [string]) => edgeConfigGet(...a),
}))

/** Filas que devuelve el fake admin, enrutadas por tabla. */
let coachRow: { enabled_modules: Record<string, boolean> | null } | null = null
let clientRow: { coach_id: string | null; team_id: string | null; org_id: string | null } | null =
    null
let coachPrefsRow: { preset: string | null; sections: Record<string, boolean> | null } | null = null
/** Tablas efectivamente consultadas: pinnea que el camino alumno NI SIQUIERA lee las prefs. */
let touchedTables: string[] = []

const fakeAdmin = {
    from: vi.fn((table: string) => {
        touchedTables.push(table)
        const maybeSingle = vi.fn(async () => {
            if (table === 'coaches') return { data: coachRow, error: null }
            if (table === 'clients') return { data: clientRow, error: null }
            if (table === 'coach_feature_prefs') return { data: coachPrefsRow, error: null }
            return { data: null, error: null }
        })
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            maybeSingle,
        }
        return chain
    }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

import { GET } from './route'

function req(withAuth = true) {
    return new NextRequest('http://localhost/api/mobile/config', {
        headers: withAuth ? { authorization: 'Bearer tok' } : {},
    })
}

type ConfigBody = {
    featurePrefsEnabled: boolean
    featurePrefs: { nutritionEnabled: boolean; sections: Record<string, boolean> }
}

const previousEdgeConfig = process.env.EDGE_CONFIG

beforeEach(() => {
    vi.clearAllMocks()
    process.env.EDGE_CONFIG = 'https://edge-config.test/ec'
    edgeConfigGet.mockImplementation(async (key: string) => key === 'FEATURE_PREFS_ENABLED')
    getCoachEnabledModules.mockResolvedValue({})
    getTeamEnabledModules.mockResolvedValue({})
    resolveStudentAccessForCoach.mockResolvedValue({ state: 'active', graceEndsAt: null })
    verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'user-1' })
    coachRow = null
    clientRow = null
    // El coach apago Nutricion entera y quedo en preset basico (lo que siembra la persona).
    coachPrefsRow = { preset: 'basico', sections: { _enabled: false, micros_base: false } }
    touchedTables = []
})

afterEach(() => {
    if (previousEdgeConfig === undefined) delete process.env.EDGE_CONFIG
    else process.env.EDGE_CONFIG = previousEdgeConfig
})

describe('GET /api/mobile/config — D9-A: la pref del coach no gobierna a sus alumnos', () => {
    it('ALUMNO: con el coach en nutrition._enabled=false igual recibe nutritionEnabled true', async () => {
        clientRow = { coach_id: 'coach-1', team_id: null, org_id: null }

        const res = await GET(req())
        const body = (await res.json()) as ConfigBody

        expect(res.status).toBe(200)
        // El flag sigue ON (el coach lo usa); lo que cambia es que el alumno no lo hereda.
        expect(body.featurePrefsEnabled).toBe(true)
        expect(body.featurePrefs.nutritionEnabled).toBe(true)
        // Ni siquiera se leen las prefs del coach para el alumno.
        expect(touchedTables).not.toContain('coach_feature_prefs')
    })

    it('ALUMNO: las secciones salen fail-open (solo entitlements), ignorando preset y toggles', async () => {
        clientRow = { coach_id: 'coach-1', team_id: null, org_id: null }
        getCoachEnabledModules.mockResolvedValue({ nutrition_exchanges: true })

        const body = (await (await GET(req())).json()) as ConfigBody

        // Core + gratis: ON pese a `micros_base:false` y preset basico en la fila del coach.
        expect(body.featurePrefs.sections.plan).toBe(true)
        expect(body.featurePrefs.sections.micros_base).toBe(true)
        // Gateadas: SOLO por el entitlement real del plan.
        expect(body.featurePrefs.sections.micros_advanced).toBe(true)
        expect(body.featurePrefs.sections.goals_bodycomp).toBe(false)
    })

    it('COACH: la misma fila le apaga Nutricion en SU panel (nutritionEnabled false)', async () => {
        coachRow = { enabled_modules: null }

        const res = await GET(req())
        const body = (await res.json()) as ConfigBody

        expect(res.status).toBe(200)
        expect(body.featurePrefs.nutritionEnabled).toBe(false)
        expect(touchedTables).toContain('coach_feature_prefs')
    })

    it('COACH: el preset basico sigue achicando sus secciones (contraste con el alumno)', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRow = { preset: 'basico', sections: null }
        getCoachEnabledModules.mockResolvedValue({ nutrition_exchanges: true })

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.nutritionEnabled).toBe(true)
        expect(body.featurePrefs.sections.plan).toBe(true)
        expect(body.featurePrefs.sections.micros_base).toBe(false)
        expect(body.featurePrefs.sections.micros_advanced).toBe(false)
    })

    it('ALUMNO de team: tampoco hereda las prefs del pool', async () => {
        clientRow = { coach_id: 'coach-1', team_id: 'team-1', org_id: null }

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.nutritionEnabled).toBe(true)
        expect(touchedTables).not.toContain('team_feature_prefs')
    })
})
