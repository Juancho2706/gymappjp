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
 *
 * QA del owner 01-09: se suma `featurePrefs.navOrder`, el orden PERSONAL de la barra del coach
 * (fila reservada `domain = '_nav'`). En standalone sale de la MISMA lectura; en team se pide
 * aparte y SOLO esa fila, porque el orden es del coach y no del pool.
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

/** Filas que devuelve el fake admin, enrutadas por tabla. `sections` guarda también la key `order`. */
type PrefsRow = { domain: string; preset: string | null; sections: Record<string, unknown> | null }
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
/** Filtros `.eq('domain', …)` por tabla: en team la tabla del coach solo se toca por la fila `_nav`. */
let domainFilters: { table: string; domain: string }[] = []

const PREFS_TABLES = ['coach_feature_prefs', 'team_feature_prefs']

const fakeAdmin = {
    from: vi.fn((table: string) => {
        touchedTables.push(table)
        const maybeSingle = vi.fn(async () => {
            if (table === 'coaches') return { data: coachRow, error: null }
            if (table === 'clients') return { data: clientRow, error: null }
            // Lectura puntual de la fila `_nav` del coach (camino team).
            if (table === 'coach_feature_prefs') {
                if (prefsReadRejects) throw new Error('prefs read boom')
                return { data: coachPrefsRows.find((row) => row.domain === '_nav') ?? null, error: null }
            }
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
            eq: vi.fn((column: string, value: unknown) => {
                if (column === 'domain') domainFilters.push({ table, domain: String(value) })
                return chain
            }),
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
        navOrder: string[] | null
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
    domainFilters = []
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
        // La ÚNICA fila del coach que se lee en team es `_nav` (su orden personal): sus prefs de
        // dominio no se consultan, y por eso la Nutrición que él apagó no aplica en el pool.
        expect(
            domainFilters.filter((f) => f.table === 'coach_feature_prefs').map((f) => f.domain),
        ).toEqual(['_nav'])
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

    it('la fila reservada `_nav` no ensucia `domains` (no es un dominio)', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [
            { domain: '_nav', preset: null, sections: { order: ['cardio', 'nutrition'] } },
        ]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(Object.keys(body.featurePrefs.domains)).toEqual([...FEATURE_DOMAIN_KEYS])
        expect(Object.values(body.featurePrefs.domains).every((v) => v === true)).toBe(true)
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

describe('GET /api/mobile/config — QA 01-09: featurePrefs.navOrder (orden de la barra)', () => {
    const SAVED = ['cardio', 'nutrition', 'training', 'movement', 'bodycomp']

    it('COACH standalone: devuelve el orden guardado en la fila `_nav`', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [
            { domain: 'nutrition', preset: null, sections: { _enabled: true } },
            { domain: '_nav', preset: null, sections: { order: SAVED } },
        ]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toEqual(SAVED)
        // Sigue siendo UNA sola lectura: la fila `_nav` viaja con las demás.
        expect(touchedTables.filter((t) => t === 'coach_feature_prefs')).toHaveLength(1)
    })

    it('COACH sin fila `_nav`: null (la app cae en el orden de su especialidad)', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [{ domain: 'nutrition', preset: null, sections: { _enabled: false } }]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toBeNull()
    })

    it('orden PARCIAL o con basura: se completa con los faltantes y se limpia lo inválido', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [
            { domain: '_nav', preset: null, sections: { order: ['bodycomp', 'nope', 'bodycomp', 7] } },
        ]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toEqual([
            'bodycomp',
            'nutrition',
            'training',
            'cardio',
            'movement',
        ])
    })

    it('fila `_nav` basura (no-array / sin la key): null, nunca a medias', async () => {
        coachRow = { enabled_modules: null }
        for (const sections of [{ order: 'cardio' }, { order: [] }, {}, null]) {
            touchedTables = []
            coachPrefsRows = [{ domain: '_nav', preset: null, sections }]
            const body = (await (await GET(req())).json()) as ConfigBody
            expect(body.featurePrefs.navOrder).toBeNull()
        }
    })

    it('TEAM: el orden es del COACH, no del pool (se lee su fila `_nav` aparte)', async () => {
        resolveMobileClientMutationContext.mockResolvedValue({
            scope: { type: 'team', teamId: 'team-1' },
        })
        coachPrefsRows = [{ domain: '_nav', preset: null, sections: { order: SAVED } }]
        teamPrefsRows = [{ domain: 'nutrition', preset: null, sections: { _enabled: false } }]

        const body = (await (
            await GET(req('?workspaceKind=team_owner&teamId=team-1'))
        ).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toEqual(SAVED)
        // El pool sigue mandando en la VISIBILIDAD; el orden no lo toca.
        expect(body.featurePrefs.domains.nutrition).toBe(false)
    })

    it('ALUMNO: null (no tiene barra de coach que ordenar) y sin tocar prefs', async () => {
        clientRow = { coach_id: 'coach-1', team_id: null, org_id: null }
        coachPrefsRows = [{ domain: '_nav', preset: null, sections: { order: SAVED } }]

        const body = (await (await GET(req())).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toBeNull()
        expect(touchedTables).not.toContain('coach_feature_prefs')
    })

    it('ENTERPRISE: null (no hay zona Funciones donde ordenar)', async () => {
        resolveMobileClientMutationContext.mockResolvedValue({
            scope: { type: 'enterprise', orgId: 'org-1' },
        })

        const body = (await (
            await GET(req('?workspaceKind=org_owner&orgId=org-1'))
        ).json()) as ConfigBody

        expect(body.featurePrefs.navOrder).toBeNull()
    })

    it('FAIL-OPEN: si la lectura revienta, navOrder es null y el 200 se mantiene', async () => {
        coachRow = { enabled_modules: null }
        coachPrefsRows = [{ domain: '_nav', preset: null, sections: { order: SAVED } }]
        prefsReadRejects = true

        const res = await GET(req())
        const body = (await res.json()) as ConfigBody

        expect(res.status).toBe(200)
        expect(body.featurePrefs.navOrder).toBeNull()
    })
})
