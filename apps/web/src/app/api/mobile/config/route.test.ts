import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'

/**
 * Decision D9 opcion A del owner (22-08, ratificada 26-08): la preferencia de modulos vive SOLO
 * en el panel del COACH. Con `coach_feature_prefs` apagando Nutricion, el coach deja de ver su
 * modulo pero SUS ALUMNOS lo conservan — la app del alumno se modula unicamente por los
 * entitlements reales del plan. Prefs siempre-on (Ola de orden W1.10, 2026-09-01): sin flag
 * Edge Config que mockear.
 *
 * W1.1 (2026-09-01): el endpoint expone `featurePrefs.domains` con los 5 dominios resueltos por
 * `resolveDomainEnabled`, en UNA sola lectura de la tabla de prefs. `nutritionEnabled` queda como
 * espejo legacy y debe ser SIEMPRE `=== domains.nutrition`.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────────
const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// El endpoint solo lo usa con `?workspaceKind=`; los casos team/enterprise lo mockean.
const resolveMobileClientMutationContext = vi.fn()
vi.mock('../coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: (...a: unknown[]) =>
        resolveMobileClientMutationContext(...a),
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

/** Filas que devuelve el fake admin, enrutadas por tabla. */
type PrefsRow = { domain: string; preset: string | null; sections: Record<string, boolean> | null }
let coachRow: { enabled_modules: Record<string, boolean> | null } | null = null
let clientRow: { coach_id: string | null; team_id: string | null; org_id: string | null } | null =
    null
/** Prefs por dominio: ahora se leen TODAS de una (sin `.eq('domain', …)`). */
let coachPrefsRows: PrefsRow[] = []
let teamPrefsRows: PrefsRow[] = []
/** Cuando es `true`, la cadena de las tablas de prefs rechaza (prueba el fail-open). */
let prefsReadRejects = false
/** Tablas efectivamente consultadas: pinnea que el camino alumno NI SIQUIERA lee las prefs. */
let touchedTables: string[] = []

const PREFS_TABLES = ['coach_feature_prefs', 'team_feature_prefs']

const fakeAdmin = {
    from: vi.fn((table: string) => {
        touchedTables.push(table)
        const maybeSingle = vi.fn(async () => {
            if (table === 'coaches') return { data: coachRow, error: null }
            if (table === 'clients') return { data: clientRow, error: null }
            return { data: null, error: null }
        })
        const rowsForTable = () => {
            if (table === 'coach_feature_prefs') return coachPrefsRows
            if (table === 'team_feature_prefs') return teamPrefsRows
            return []
        }
        // La lectura de prefs se `await`ea directo sobre `.select().eq()` (sin `.maybeSingle()`),
        // asi que la cadena tiene que ser THENABLE como el builder de PostgREST.
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            maybeSingle,
            then: (
                resolve: (v: { data: PrefsRow[]; error: null }) => unknown,
                reject: (e: unknown) => unknown,
            ) => {
                if (prefsReadRejects && PREFS_TABLES.includes(table)) {
                    return Promise.reject(new Error('prefs read boom')).then(resolve, reject)
                }
                return Promise.resolve({ data: rowsForTable(), error: null }).then(resolve, reject)
            },
        }
        return chain
    }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

import { GET } from './route'

function req(query = '', withAuth = true) {
    return new NextRequest(`http://localhost/api/mobile/config${query}`, {
        headers: withAuth ? { authorization: 'Bearer tok' } : {},
    })
}

type ConfigBody = {
    featurePrefsEnabled: boolean
    featurePrefs: {
        nutritionEnabled: boolean
        sections: Record<string, boolean>
        domains: Record<string, boolean>
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    getCoachEnabledModules.mockResolvedValue({})
    getTeamEnabledModules.mockResolvedValue({})
    resolveStudentAccessForCoach.mockResolvedValue({ state: 'active', graceEndsAt: null })
    verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'user-1' })
    coachRow = null
    clientRow = null
    // El coach apago Nutricion entera y quedo en preset basico (lo que siembra la persona).
    coachPrefsRows = [
        { domain: 'nutrition', preset: 'basico', sections: { _enabled: false, micros_base: false } },
    ]
    teamPrefsRows = []
    prefsReadRejects = false
    touchedTables = []
})

describe('GET /api/mobile/config — D9-A: la pref del coach no gobierna a sus alumnos', () => {
    it('ALUMNO: con el coach en nutrition._enabled=false igual recibe nutritionEnabled true', async () => {
        clientRow = { coach_id: 'coach-1', team_id: null, org_id: null }

        const res = await GET(req())
        const body = (await res.json()) as ConfigBody

        expect(res.status).toBe(200)
        // Espejo legacy fijo en `true` (W1.10): lo leen binarios/OTAs anteriores, ya no es un flag.
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
        coachPrefsRows = [{ domain: 'nutrition', preset: 'basico', sections: null }]
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

describe('GET /api/mobile/config — W1.1: featurePrefs.domains con los 5 dominios', () => {
    it('COACH standalone: respeta el `_enabled` de cada fila y deja el resto prendido', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [
            { domain: 'nutrition', preset: null, sections: { _enabled: false } },
            { domain: 'cardio', preset: null, sections: { _enabled: false } },
        ]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.domains).toEqual({
            nutrition: false,
            training: true,
            cardio: false,
            movement: true,
            bodycomp: true,
        })
        expect(body.featurePrefs.nutritionEnabled).toBe(false)
        // Dominio apagado => TODAS las secciones de Nutricion en false (incluidas las core).
        expect(Object.values(body.featurePrefs.sections).every((v) => v === false)).toBe(true)
    })

    it('COACH sin filas de prefs: los 5 dominios vienen prendidos', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = []

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.domains).toEqual({
            nutrition: true,
            training: true,
            cardio: true,
            movement: true,
            bodycomp: true,
        })
        expect(body.featurePrefs.nutritionEnabled).toBe(true)
    })

    it('FORMA: `domains` trae exactamente FEATURE_DOMAIN_KEYS en orden y todo boolean', async () => {
        coachRow = { enabled_modules: null }

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(Object.keys(body.featurePrefs.domains)).toEqual([...FEATURE_DOMAIN_KEYS])
        expect(
            Object.values(body.featurePrefs.domains).every((v) => typeof v === 'boolean'),
        ).toBe(true)
        // Invariante del espejo legacy.
        expect(body.featurePrefs.nutritionEnabled).toBe(body.featurePrefs.domains.nutrition)
    })

    it('ALUMNO: los 5 vienen true y no se toca ninguna tabla de prefs (D9-A)', async () => {
        clientRow = { coach_id: 'coach-1', team_id: null, org_id: null }
        coachPrefsRows = [
            { domain: 'nutrition', preset: null, sections: { _enabled: false } },
            { domain: 'training', preset: null, sections: { _enabled: false } },
            { domain: 'cardio', preset: null, sections: { _enabled: false } },
            { domain: 'movement', preset: null, sections: { _enabled: false } },
            { domain: 'bodycomp', preset: null, sections: { _enabled: false } },
        ]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(Object.values(body.featurePrefs.domains).every((v) => v === true)).toBe(true)
        expect(body.featurePrefs.nutritionEnabled).toBe(body.featurePrefs.domains.nutrition)
        expect(touchedTables).not.toContain('coach_feature_prefs')
        expect(touchedTables).not.toContain('team_feature_prefs')
    })

    it('TEAM: la base es `team_feature_prefs`, no la del coach', async () => {
        resolveMobileClientMutationContext.mockResolvedValue({
            scope: { type: 'team', teamId: 'team-1' },
        })
        teamPrefsRows = [{ domain: 'training', preset: null, sections: { _enabled: false } }]

        const body = (await (
            await GET(req('?workspaceKind=team_owner&teamId=team-1'))
        ).json()) as ConfigBody

        expect(touchedTables).toContain('team_feature_prefs')
        expect(touchedTables).not.toContain('coach_feature_prefs')
        expect(body.featurePrefs.domains.training).toBe(false)
        // La fila apagada del coach standalone no aplica en modo team.
        expect(body.featurePrefs.domains.nutrition).toBe(true)
        expect(body.featurePrefs.nutritionEnabled).toBe(true)
    })

    it('ENTERPRISE: los 5 prendidos y sin leer prefs (no hay zona Funciones donde reactivar)', async () => {
        resolveMobileClientMutationContext.mockResolvedValue({
            scope: { type: 'enterprise', orgId: 'org-1' },
        })

        const body = (await (
            await GET(req('?workspaceKind=org_owner&orgId=org-1'))
        ).json()) as ConfigBody

        expect(Object.values(body.featurePrefs.domains).every((v) => v === true)).toBe(true)
        expect(body.featurePrefs.nutritionEnabled).toBe(true)
        expect(touchedTables).not.toContain('coach_feature_prefs')
        expect(touchedTables).not.toContain('team_feature_prefs')
    })

    it('FAIL-OPEN: si la lectura de prefs revienta, responde 200 con los 5 prendidos', async () => {
        coachRow = { enabled_modules: null }
        prefsReadRejects = true

        const res = await GET(req())
        const body = (await res.json()) as ConfigBody

        expect(res.status).toBe(200)
        expect(Object.values(body.featurePrefs.domains).every((v) => v === true)).toBe(true)
        expect(body.featurePrefs.nutritionEnabled).toBe(true)
        // Secciones fail-open: las core siguen visibles.
        expect(body.featurePrefs.sections.plan).toBe(true)
    })

    it('UNA sola lectura: `coach_feature_prefs` se consulta exactamente una vez por request', async () => {
        coachRow = { enabled_modules: null }

        await GET(req())

        expect(touchedTables.filter((t) => t === 'coach_feature_prefs')).toHaveLength(1)
        expect(
            fakeAdmin.from.mock.calls.filter(([t]) => t === 'coach_feature_prefs'),
        ).toHaveLength(1)
    })
})
