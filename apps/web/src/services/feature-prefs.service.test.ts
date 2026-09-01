import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Decision D9 opcion A del owner (22-08, ratificada 26-08): la preferencia de modulos gobierna
 * SOLO el panel del coach. `audience: 'student'` desacopla la superficie del alumno — fail-open,
 * modulado solo por entitlements.
 *
 * Prefs SIEMPRE-ON (Ola de orden W1.10, 2026-09-01): ya no hay flag Edge Config que mockear; el
 * camino del coach siempre pasa por las prefs y el del alumno nunca.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────────
/** Tablas consultadas: pinnea que en camino ALUMNO ni se toca el catalogo de prefs. */
let touchedTables: string[] = []

/**
 * Estado por tabla, ahora como ARRAYS de filas (`{domain, preset, sections}`): el agregador
 * `resolveDomainsEnabled` lee los 5 dominios de una, sin `.eq('domain', …)` ni `maybeSingle()`.
 * La cadena es THENABLE (devuelve todas las filas que pasan los `.eq()` registrados) y ADEMAS
 * conserva `maybeSingle()` (primera fila que matchea) para `resolveFeaturePrefs`, que sigue
 * leyendo dominio por dominio.
 */
type PrefsRow = { domain: string; preset?: string | null; sections: Record<string, boolean> | null }
let coachPrefsRows: PrefsRow[] = []
let teamPrefsRows: PrefsRow[] = []
let clientPrefsRows: PrefsRow[] = []
/** Tablas cuya lectura debe RECHAZAR (para ejercitar el fail-open del agregador). */
let rejectingTables: string[] = []

function rowsFor(table: string): PrefsRow[] {
    if (table === 'coach_feature_prefs') return coachPrefsRows
    if (table === 'team_feature_prefs') return teamPrefsRows
    if (table === 'client_feature_prefs') return clientPrefsRows
    return []
}

function fakeDb() {
    return {
        from: vi.fn((table: string) => {
            touchedTables.push(table)
            const filters: Record<string, unknown> = {}
            const rows = () =>
                rowsFor(table).filter(
                    (r) => filters.domain === undefined || r.domain === filters.domain,
                )
            const chain = {
                select: vi.fn(() => chain),
                eq: vi.fn((col: string, val: unknown) => {
                    filters[col] = val
                    return chain
                }),
                maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
                // Thenable: `await chain` (sin `maybeSingle`) devuelve TODAS las filas.
                then: (
                    resolve: (v: { data: PrefsRow[]; error: null }) => void,
                    reject: (e: unknown) => void,
                ) => {
                    if (rejectingTables.includes(table)) {
                        reject(new Error(`lectura caida: ${table}`))
                        return
                    }
                    resolve({ data: rows(), error: null })
                },
            }
            return chain
        }),
    }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fakeDb()) }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: vi.fn(() => fakeDb()) }))

const hasModule = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false)
vi.mock('@/services/entitlements.service', () => ({
    hasModule: (...a: unknown[]) => hasModule(...a),
}))

const hasExchangesModuleForClientContext = vi.fn<(...a: unknown[]) => Promise<boolean>>(
    async () => false,
)
vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
    hasExchangesModuleForClientContext: (...a: unknown[]) =>
        hasExchangesModuleForClientContext(...a),
}))

vi.mock('@/infrastructure/db/exchanges.repository', () => ({
    findPlanModuleContext: vi.fn(async () => null),
}))

/** `redirect()` real lanza; acá solo se registra la URL con la que lo llamo el gate. */
const redirectMock = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }))

import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'
import {
    assertDomainEnabled,
    resolveBodycompDomainEnabled,
    resolveCardioDomainEnabled,
    resolveDomainsEnabled,
    resolveFeaturePrefs,
    resolveMovementDomainEnabled,
    resolveNutritionDomainEnabled,
    resolveTrainingDomainEnabled,
    type DomainCtx,
} from './feature-prefs.service'

/** Los 5 wrappers boolean por dominio, para parametrizar los casos con `it.each`. */
const RESOLVERS: Record<FeatureDomain, (ctx: DomainCtx) => Promise<boolean>> = {
    nutrition: resolveNutritionDomainEnabled,
    training: resolveTrainingDomainEnabled,
    cardio: resolveCardioDomainEnabled,
    movement: resolveMovementDomainEnabled,
    bodycomp: resolveBodycompDomainEnabled,
}

beforeEach(() => {
    vi.clearAllMocks()
    hasModule.mockResolvedValue(false)
    hasExchangesModuleForClientContext.mockResolvedValue(false)
    // El coach apago Nutricion entera y quedo en preset basico (lo que siembra la persona).
    coachPrefsRows = [
        { domain: 'nutrition', preset: 'basico', sections: { _enabled: false, micros_base: false } },
    ]
    teamPrefsRows = [{ domain: 'nutrition', preset: 'basico', sections: { _enabled: false } }]
    clientPrefsRows = []
    rejectingTables = []
    touchedTables = []
})

describe('resolveNutritionDomainEnabled — audiencia', () => {
    it('COACH (default): respeta el master switch apagado del coach', async () => {
        await expect(resolveNutritionDomainEnabled({ coachId: 'coach-1' })).resolves.toBe(false)
        expect(touchedTables).toContain('coach_feature_prefs')
    })

    it('ALUMNO: el master switch del coach no lo apaga, y no se leen las prefs', async () => {
        await expect(
            resolveNutritionDomainEnabled({
                coachId: 'coach-1',
                clientId: 'client-1',
                audience: 'student',
            }),
        ).resolves.toBe(true)
        expect(touchedTables).toEqual([])
    })

    it('ALUMNO de pool: tampoco hereda el master switch del team', async () => {
        await expect(
            resolveNutritionDomainEnabled({
                coachId: 'coach-1',
                clientId: 'client-1',
                clientTeamId: 'team-1',
                audience: 'student',
            }),
        ).resolves.toBe(true)
        expect(touchedTables).toEqual([])
    })
})

describe('resolveFeaturePrefs — audiencia', () => {
    it('COACH (default): el preset basico achica las secciones opcionales', async () => {
        hasExchangesModuleForClientContext.mockResolvedValue(true)
        coachPrefsRows = [{ domain: 'nutrition', preset: 'basico', sections: null }]

        const prefs = await resolveFeaturePrefs({ domain: 'nutrition', coachId: 'coach-1' })

        expect(prefs.plan).toBe(true)
        expect(prefs.micros_base).toBe(false)
        expect(prefs.micros_advanced).toBe(false)
    })

    it('ALUMNO: fail-open — todo lo gratis ON y lo Pro solo por entitlement real', async () => {
        hasExchangesModuleForClientContext.mockResolvedValue(true)

        const prefs = await resolveFeaturePrefs({
            domain: 'nutrition',
            coachId: 'coach-1',
            clientId: 'client-1',
            audience: 'student',
        })

        expect(prefs.plan).toBe(true)
        expect(prefs.micros_base).toBe(true)
        // Entitled => visible pese al `_enabled:false` y al preset basico del coach.
        expect(prefs.micros_advanced).toBe(true)
        // Sin modulo `body_composition` => sigue apagada (la pref no es lo que la gatea).
        expect(prefs.goals_bodycomp).toBe(false)
        expect(touchedTables).toEqual([])
    })

    it('ALUMNO: el override por-alumno tampoco puede ocultarle una seccion', async () => {
        clientPrefsRows = [{ domain: 'nutrition', sections: { _enabled: false, micros_base: false } }]

        const prefs = await resolveFeaturePrefs({
            domain: 'nutrition',
            coachId: 'coach-1',
            clientId: 'client-1',
            audience: 'student',
        })

        expect(prefs.plan).toBe(true)
        expect(prefs.micros_base).toBe(true)
        expect(touchedTables).toEqual([])
    })
})

/**
 * Regresion del retiro del flag (Ola de orden W1.10, 2026-09-01): sin `FEATURE_PREFS_ENABLED`,
 * el `_enabled:false` guardado por el coach manda SIEMPRE en su panel, D9-A sigue protegiendo al
 * alumno, y un coach SIN fila conserva el fail-open.
 */
describe('resolveNutritionDomainEnabled — prefs siempre-on (sin flag, W1.10)', () => {
    it('fila del coach con `_enabled:false` => false para el coach y true para el alumno', async () => {
        coachPrefsRows = [{ domain: 'nutrition', preset: 'basico', sections: { _enabled: false } }]

        await expect(resolveNutritionDomainEnabled({ coachId: 'coach-w110' })).resolves.toBe(false)
        expect(touchedTables).toContain('coach_feature_prefs')

        touchedTables = []
        await expect(
            resolveNutritionDomainEnabled({
                coachId: 'coach-w110',
                clientId: 'client-w110',
                audience: 'student',
            }),
        ).resolves.toBe(true)
        expect(touchedTables).toEqual([])
    })

    it('coach SIN fila de prefs => fail-open, el dominio queda prendido', async () => {
        coachPrefsRows = []

        await expect(resolveNutritionDomainEnabled({ coachId: 'coach-sin-fila' })).resolves.toBe(
            true,
        )
    })
})

/**
 * Ola de orden W1.3 + W1.13.a — master switch de los 5 dominios.
 *
 * El agregador `resolveDomainsEnabled` hace UNA lectura para los 5; los wrappers boolean por
 * dominio delegan en él, así que testear los wrappers testea el agregador de punta a punta.
 */
describe('resolveDomainsEnabled — los 5 dominios × estado de la fila (W1.13.a)', () => {
    it.each(FEATURE_DOMAIN_KEYS)('%s: fila ausente => fail-open, dominio prendido', async (domain) => {
        coachPrefsRows = []

        await expect(RESOLVERS[domain]({ coachId: 'coach-1' })).resolves.toBe(true)
    })

    it.each(FEATURE_DOMAIN_KEYS)('%s: fila con `_enabled:false` => apagado', async (domain) => {
        coachPrefsRows = [{ domain, sections: { _enabled: false } }]

        await expect(RESOLVERS[domain]({ coachId: 'coach-1' })).resolves.toBe(false)
    })

    it.each(FEATURE_DOMAIN_KEYS)('%s: fila con `_enabled:true` => prendido', async (domain) => {
        coachPrefsRows = [{ domain, sections: { _enabled: true } }]

        await expect(RESOLVERS[domain]({ coachId: 'coach-1' })).resolves.toBe(true)
    })

    it.each(FEATURE_DOMAIN_KEYS)(
        '%s: ALUMNO (D9-A) => prendido pese al `false` del coach, sin tocar tablas',
        async (domain) => {
            coachPrefsRows = [{ domain, sections: { _enabled: false } }]

            await expect(
                RESOLVERS[domain]({ coachId: 'coach-1', clientId: 'c-1', audience: 'student' }),
            ).resolves.toBe(true)
            expect(touchedTables).toEqual([])
        },
    )

    it('BASE TEAM: lee `team_feature_prefs` y no el catalogo del coach', async () => {
        coachPrefsRows = [{ domain: 'training', sections: { _enabled: true } }]
        teamPrefsRows = [{ domain: 'training', sections: { _enabled: false } }]

        const domains = await resolveDomainsEnabled({ coachId: 'coach-1', clientTeamId: 'team-1' })

        // El default del pool manda sobre la preferencia personal del coach.
        expect(domains.training).toBe(false)
        expect(domains.nutrition).toBe(true)
        expect(touchedTables).toEqual(['team_feature_prefs'])
    })

    it('ENTERPRISE: `clientOrgId` => los 5 prendidos y CERO lecturas', async () => {
        coachPrefsRows = FEATURE_DOMAIN_KEYS.map((domain) => ({
            domain,
            sections: { _enabled: false },
        }))

        const domains = await resolveDomainsEnabled({ coachId: 'coach-1', clientOrgId: 'org-1' })

        expect(domains).toEqual({
            nutrition: true,
            training: true,
            cardio: true,
            movement: true,
            bodycomp: true,
        })
        expect(touchedTables).toEqual([])
    })

    it('OVERRIDE POR ALUMNO: la fila del alumno gana sobre la del coach', async () => {
        coachPrefsRows = [{ domain: 'nutrition', sections: { _enabled: true } }]
        clientPrefsRows = [{ domain: 'nutrition', sections: { _enabled: false } }]

        const domains = await resolveDomainsEnabled({ coachId: 'coach-1', clientId: 'c-1' })

        expect(domains.nutrition).toBe(false)
        expect(domains.training).toBe(true)
        expect(domains.cardio).toBe(true)
        expect(domains.movement).toBe(true)
        expect(domains.bodycomp).toBe(true)
        expect(touchedTables).toContain('client_feature_prefs')
    })

    it('FAIL-OPEN: si la lectura del catalogo del coach revienta, los 5 quedan prendidos', async () => {
        coachPrefsRows = [{ domain: 'nutrition', sections: { _enabled: false } }]
        rejectingTables = ['coach_feature_prefs']

        const domains = await resolveDomainsEnabled({ coachId: 'coach-1' })

        expect(domains).toEqual({
            nutrition: true,
            training: true,
            cardio: true,
            movement: true,
            bodycomp: true,
        })
    })

    it('UNA SOLA LECTURA: un ctx de coach toca `coach_feature_prefs` una vez y nada mas', async () => {
        await resolveDomainsEnabled({ coachId: 'coach-1' })

        expect(touchedTables).toEqual(['coach_feature_prefs'])
    })
})

describe('assertDomainEnabled — gate de ruta (W1.13.a)', () => {
    it('dominio apagado => redirect con la URL exacta del aviso', async () => {
        coachPrefsRows = [{ domain: 'training', sections: { _enabled: false } }]

        await assertDomainEnabled('training', { coachId: 'coach-1' })

        expect(redirectMock).toHaveBeenCalledTimes(1)
        expect(redirectMock).toHaveBeenCalledWith(
            '/coach/dashboard?notice=domain_off&domain=training',
        )
    })

    it('fila ausente => fail-open, no redirige', async () => {
        coachPrefsRows = []

        await assertDomainEnabled('training', { coachId: 'coach-1' })

        expect(redirectMock).not.toHaveBeenCalled()
    })
})
