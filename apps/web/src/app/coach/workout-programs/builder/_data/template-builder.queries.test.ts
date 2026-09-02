import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * E3 — el builder de PLANTILLAS scopeaba el catálogo con 2 vías (`coach_id.is.null` +
 * `coach_id.eq.<uid>`), no con las 3 del catálogo real. Consecuencias reales:
 *   · una fila de team/org (que también tiene `coach_id` NULL) se colaba como "del sistema";
 *   · en workspace team aparecían los ejercicios PERSONALES del coach — «Editar» sobre uno de
 *     ellos terminaba en el error explícito de la action, y arrastrarlo al plan deja un bloque
 *     que el alumno del pool no puede leer (fantasma);
 *   · los eliminados seguían ofreciéndose (el catálogo sí los esconde).
 *
 * Este test pinnea el predicado `.or()` por contexto activo. Es VISIBILIDAD: la RLS sigue mandando.
 */

const { createClientMock, resolvePreferredWorkspace, listAvailableWorkoutAreas, hasModule } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    resolvePreferredWorkspace: vi.fn(),
    listAvailableWorkoutAreas: vi.fn(),
    hasModule: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...args: unknown[]) => resolvePreferredWorkspace(...args),
}))
vi.mock('@/services/workout/workout-areas.service', () => ({
    listAvailableWorkoutAreas: (...args: unknown[]) => listAvailableWorkoutAreas(...args),
}))
vi.mock('@/services/entitlements.service', () => ({
    hasModule: (...args: unknown[]) => hasModule(...args),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_PREDICATE = 'and(coach_id.is.null,org_id.is.null,team_id.is.null)'

/** Builder thenable de `exercises`: select → or → is → order → order (awaited en el Promise.all). */
function wireSupabase() {
    const orFilters: string[] = []
    const isCalls: [string, unknown][] = []
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => builder),
        or: vi.fn((filter: string) => {
            orFilters.push(filter)
            return builder
        }),
        is: vi.fn((col: string, val: unknown) => {
            isCalls.push([col, val])
            return builder
        }),
        order: vi.fn(() => builder),
        then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    })
    createClientMock.mockResolvedValue({
        auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: USER_ID } } })) },
        from: vi.fn((table: string) => {
            if (table === 'exercises') return builder
            throw new Error(`Unexpected table: ${table}`)
        }),
    })
    return { orFilters, isCalls }
}

/**
 * `getTemplateBuilderData` está envuelta en `React.cache` (dedup por request) y todos los casos la
 * llaman sin `programId`: sin módulo fresco, el segundo `it` se comería el resultado del primero.
 */
async function loadFresh() {
    vi.resetModules()
    return await import('./template-builder.queries')
}

describe('getTemplateBuilderData — scope 3 vías del catálogo (E3)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        listAvailableWorkoutAreas.mockResolvedValue([])
        hasModule.mockResolvedValue(true)
    })

    it('coach standalone ⇒ sistema + los propios, con el predicado de sistema completo', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_standalone', userId: USER_ID, coachId: USER_ID })
        const { orFilters } = wireSupabase()

        const { getTemplateBuilderData } = await loadFresh()
        await getTemplateBuilderData()

        expect(orFilters).toEqual([`${SYSTEM_PREDICATE},coach_id.eq.${USER_ID}`])
    })

    it('workspace team ⇒ sistema + catálogo del POOL, sin los personales del coach', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_team', userId: USER_ID, coachId: USER_ID, teamId: 'team-1' })
        const { orFilters } = wireSupabase()

        const { getTemplateBuilderData } = await loadFresh()
        await getTemplateBuilderData()

        expect(orFilters).toEqual([`${SYSTEM_PREDICATE},team_id.eq.team-1`])
        expect(orFilters[0]).not.toContain(`coach_id.eq.${USER_ID}`)
    })

    it('coach dentro de org ⇒ sistema + catálogo de la org', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'enterprise_coach', userId: USER_ID, orgId: 'org-1', coachId: USER_ID })
        const { orFilters } = wireSupabase()

        const { getTemplateBuilderData } = await loadFresh()
        await getTemplateBuilderData()

        expect(orFilters).toEqual([`${SYSTEM_PREDICATE},org_id.eq.org-1`])
    })

    it('esconde los eliminados, igual que el catálogo', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_standalone', userId: USER_ID, coachId: USER_ID })
        const { isCalls } = wireSupabase()

        const { getTemplateBuilderData } = await loadFresh()
        await getTemplateBuilderData()

        expect(isCalls).toContainEqual(['deleted_at', null])
    })
})
