import { describe, expect, it, vi } from 'vitest'
import { checkJoinCapacity } from './join-capacity'

/**
 * Admin double por tabla:
 * - coaches / organizations → select().eq().maybeSingle()
 * - clients → conteo head:true (await directo del builder), grabando los filtros
 *   para verificar que el scope espeja applyArchiveScope.
 */
function fakeAdmin({
    coachRow = null,
    coachError = null,
    orgRow = null,
    orgError = null,
    count = 0,
    countError = null,
}: {
    coachRow?: { max_clients: number | null; subscription_tier: string | null; created_at: string | null } | null
    coachError?: { message: string } | null
    orgRow?: { client_limit: number } | null
    orgError?: { message: string } | null
    count?: number
    countError?: { message: string } | null
} = {}) {
    const countFilters: Array<[string, string, unknown]> = []
    const clientsQuery = {
        select: vi.fn().mockReturnThis(),
        eq(column: string, value: unknown) {
            countFilters.push(['eq', column, value])
            return clientsQuery
        },
        is(column: string, value: null) {
            countFilters.push(['is', column, value])
            return clientsQuery
        },
        then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ count: countError ? null : count, error: countError }).then(onFulfilled),
    }
    const coachesQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: coachRow, error: coachError }),
    }
    const organizationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: orgRow, error: orgError }),
    }
    const from = vi.fn((table: string) => {
        if (table === 'clients') return clientsQuery
        if (table === 'coaches') return coachesQuery
        if (table === 'organizations') return organizationsQuery
        throw new Error(`Unexpected table: ${table}`)
    })
    return { admin: { from } as never, from, countFilters }
}

const STANDALONE = { scope: 'standalone' as const, coachId: 'coach-1' }
const ENTERPRISE = { scope: 'enterprise' as const, orgId: 'org-1' }
const TEAM = { scope: 'team' as const, teamId: 'team-1' }

describe('checkJoinCapacity — standalone (C-KILL apagado hoy; el cerco queda correcto igual)', () => {
    it('grandfather P2: coach VIEJO free sin columna → límite 3 (2 usados pasan, 3 rechazan)', async () => {
        const coachRow = { max_clients: null, subscription_tier: 'free', created_at: '2026-01-10T00:00:00Z' }

        const conCupo = fakeAdmin({ coachRow, count: 2 })
        expect(await checkJoinCapacity(conCupo.admin, STANDALONE)).toEqual({ ok: true, used: 2, limit: 3 })

        const lleno = fakeAdmin({ coachRow, count: 3 })
        expect(await checkJoinCapacity(lleno.admin, STANDALONE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 3,
            limit: 3,
        })
    })

    it('coach free de la ventana v2 (18-08 ≤ alta < 21-08) sin columna → límite 2', async () => {
        const coachRow = { max_clients: null, subscription_tier: 'free', created_at: '2026-08-19T10:00:00Z' }

        const lleno = fakeAdmin({ coachRow, count: 2 })
        expect(await checkJoinCapacity(lleno.admin, STANDALONE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 2,
            limit: 2,
        })
    })

    // Pricing v3 (2026-08-21): el catálogo de Free baja a 1; la escalera de `tierMaxClientsFor`
    // es el fallback cuando la fila no trae `max_clients` (la columna sigue ganando).
    it('coach NUEVO free (post-v3) sin columna → límite 1', async () => {
        const coachRow = { max_clients: null, subscription_tier: 'free', created_at: '2026-09-01T00:00:00Z' }

        const lleno = fakeAdmin({ coachRow, count: 1 })
        expect(await checkJoinCapacity(lleno.admin, STANDALONE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 1,
            limit: 1,
        })
    })

    // Caso canónico del trial (estudio de pricing 04-09): el coach Free de v3 con su cupo REAL en la
    // columna (1). Es el escenario que el cerco del /join tiene que cortar antes de crear auth.user.
    it('free con columna 1: 0 activos ACEPTA, 1 activo RECHAZA', async () => {
        const coachRow = { max_clients: 1, subscription_tier: 'free', created_at: '2026-09-01T00:00:00Z' }

        const vacio = fakeAdmin({ coachRow, count: 0 })
        expect(await checkJoinCapacity(vacio.admin, STANDALONE)).toEqual({ ok: true, used: 0, limit: 1 })

        const lleno = fakeAdmin({ coachRow, count: 1 })
        expect(await checkJoinCapacity(lleno.admin, STANDALONE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 1,
            limit: 1,
        })
    })

    it('la columna max_clients GANA sobre el catálogo del tier', async () => {
        // Pro viejo con columna 30: 29 usados pasan aunque el catálogo nuevo diga 25.
        const coachRow = { max_clients: 30, subscription_tier: 'pro', created_at: '2026-01-10T00:00:00Z' }
        const { admin } = fakeAdmin({ coachRow, count: 29 })
        expect(await checkJoinCapacity(admin, STANDALONE)).toEqual({ ok: true, used: 29, limit: 30 })
    })

    it('tier ilegible + fecha null → mundo viejo de free (3), jamás starter (P5)', async () => {
        const coachRow = { max_clients: null, subscription_tier: null, created_at: null }
        const { admin } = fakeAdmin({ coachRow, count: 3 })
        expect(await checkJoinCapacity(admin, STANDALONE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 3,
            limit: 3,
        })
    })

    it('el conteo espeja applyArchiveScope: coach_id + org_id null + team_id null + is_archived false + is_demo false', async () => {
        const coachRow = { max_clients: 10, subscription_tier: 'starter', created_at: '2026-01-10T00:00:00Z' }
        const { admin, countFilters } = fakeAdmin({ coachRow, count: 0 })
        await checkJoinCapacity(admin, STANDALONE)
        expect(countFilters).toEqual([
            ['eq', 'is_archived', false],
            // Onboarding v2 (W1 F1.3): el alumno de ejemplo no ocupa cupo, tampoco en el /join.
            ['eq', 'is_demo', false],
            ['eq', 'coach_id', 'coach-1'],
            ['is', 'org_id', null],
            ['is', 'team_id', null],
        ])
    })

    it('coach sin fila o error de lectura → fail-closed', async () => {
        const sinFila = fakeAdmin({ coachRow: null })
        expect(await checkJoinCapacity(sinFila.admin, STANDALONE)).toEqual({ ok: false, reason: 'check_failed' })

        const conError = fakeAdmin({
            coachRow: { max_clients: 10, subscription_tier: 'free', created_at: null },
            coachError: { message: 'boom' },
        })
        expect(await checkJoinCapacity(conError.admin, STANDALONE)).toEqual({ ok: false, reason: 'check_failed' })
    })
})

describe('checkJoinCapacity — enterprise (cupo de la ORG, no del coach)', () => {
    it('client_limit de la org manda: 4/5 pasa, 5/5 rechaza', async () => {
        const conCupo = fakeAdmin({ orgRow: { client_limit: 5 }, count: 4 })
        expect(await checkJoinCapacity(conCupo.admin, ENTERPRISE)).toEqual({ ok: true, used: 4, limit: 5 })

        const lleno = fakeAdmin({ orgRow: { client_limit: 5 }, count: 5 })
        expect(await checkJoinCapacity(lleno.admin, ENTERPRISE)).toEqual({
            ok: false,
            reason: 'limit_reached',
            used: 5,
            limit: 5,
        })
    })

    it('el conteo es sobre el pool completo de la org: org_id + team_id null + is_archived false', async () => {
        const { admin, countFilters } = fakeAdmin({ orgRow: { client_limit: 5 }, count: 0 })
        await checkJoinCapacity(admin, ENTERPRISE)
        expect(countFilters).toEqual([
            ['eq', 'is_archived', false],
            ['eq', 'is_demo', false],
            ['eq', 'org_id', 'org-1'],
            ['is', 'team_id', null],
        ])
    })

    it('org sin fila, límite inválido o error de conteo → fail-closed', async () => {
        const sinFila = fakeAdmin({ orgRow: null })
        expect(await checkJoinCapacity(sinFila.admin, ENTERPRISE)).toEqual({ ok: false, reason: 'check_failed' })

        const limiteInvalido = fakeAdmin({ orgRow: { client_limit: 0 } })
        expect(await checkJoinCapacity(limiteInvalido.admin, ENTERPRISE)).toEqual({ ok: false, reason: 'check_failed' })

        const errorConteo = fakeAdmin({ orgRow: { client_limit: 5 }, countError: { message: 'boom' } })
        expect(await checkJoinCapacity(errorConteo.admin, ENTERPRISE)).toEqual({ ok: false, reason: 'check_failed' })
    })
})

describe('checkJoinCapacity — team (pool sin cuota de alumnos en el schema)', () => {
    it('teams.seat_limit limita coaches (team_members_seat_guard), no alumnos: pasa sin consultar nada', async () => {
        const { admin, from } = fakeAdmin()
        expect(await checkJoinCapacity(admin, TEAM)).toEqual({ ok: true, used: null, limit: null })
        expect(from).not.toHaveBeenCalled()
    })
})
