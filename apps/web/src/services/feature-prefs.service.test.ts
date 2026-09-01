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
let coachPrefsRow: { preset: string | null; sections: Record<string, boolean> | null } | null = null
let teamPrefsRow: { preset: string | null; sections: Record<string, boolean> | null } | null = null
let clientPrefsRow: { sections: Record<string, boolean> | null } | null = null

function fakeDb() {
    return {
        from: vi.fn((table: string) => {
            touchedTables.push(table)
            const maybeSingle = vi.fn(async () => {
                if (table === 'coach_feature_prefs') return { data: coachPrefsRow, error: null }
                if (table === 'team_feature_prefs') return { data: teamPrefsRow, error: null }
                if (table === 'client_feature_prefs') return { data: clientPrefsRow, error: null }
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

import { resolveFeaturePrefs, resolveNutritionDomainEnabled } from './feature-prefs.service'

beforeEach(() => {
    vi.clearAllMocks()
    hasModule.mockResolvedValue(false)
    hasExchangesModuleForClientContext.mockResolvedValue(false)
    // El coach apago Nutricion entera y quedo en preset basico (lo que siembra la persona).
    coachPrefsRow = { preset: 'basico', sections: { _enabled: false, micros_base: false } }
    teamPrefsRow = { preset: 'basico', sections: { _enabled: false } }
    clientPrefsRow = null
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
        coachPrefsRow = { preset: 'basico', sections: null }

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
        clientPrefsRow = { sections: { _enabled: false, micros_base: false } }

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
        coachPrefsRow = { preset: 'basico', sections: { _enabled: false } }

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
        coachPrefsRow = null

        await expect(resolveNutritionDomainEnabled({ coachId: 'coach-sin-fila' })).resolves.toBe(
            true,
        )
    })
})
