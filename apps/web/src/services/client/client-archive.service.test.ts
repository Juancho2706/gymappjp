import { describe, expect, it } from 'vitest'
import {
  applyArchiveScope,
  getClientUnarchiveCapacity,
  hasClientUnarchiveCapacity,
  isDedicatedStudentAuthIdentity,
  isMissingAuthIdentityError,
} from './client-archive.service'

function recordingQuery() {
  const operations: Array<[string, string, string | boolean | null]> = []
  const query = {
    eq(column: string, value: string | boolean) {
      operations.push(['eq', column, value])
      return query
    },
    is(column: string, value: null) {
      operations.push(['is', column, value])
      return query
    },
  }
  return { query, operations }
}

describe('applyArchiveScope', () => {
  it.each([
    [
      { coachId: 'coach-1', workspace: { type: 'standalone' as const } },
      [['eq', 'coach_id', 'coach-1'], ['is', 'org_id', null], ['is', 'team_id', null]],
    ],
    [
      { coachId: 'coach-1', workspace: { type: 'team' as const, teamId: 'team-1' } },
      [['is', 'org_id', null], ['eq', 'team_id', 'team-1']],
    ],
    [
      { coachId: 'coach-1', workspace: { type: 'enterprise' as const, orgId: 'org-1' } },
      [['eq', 'org_id', 'org-1'], ['is', 'team_id', null]],
    ],
  ])('aplica sólo el scope del workspace %o', (actor, expected) => {
    const { query, operations } = recordingQuery()
    applyArchiveScope(query as never, actor)
    expect(operations).toEqual(expected)
  })
})

describe('isDedicatedStudentAuthIdentity', () => {
  it('banea solo una identidad dedicada exclusivamente al alumno archivado', () => {
    expect(isDedicatedStudentAuthIdentity({
      hasCoachProfile: false,
      hasActiveOrganizationRole: false,
      hasOtherActiveStudentMembership: false,
      checksAvailable: true,
    })).toBe(true)
  })

  it.each([
    { hasCoachProfile: true, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: false, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: true, hasOtherActiveStudentMembership: false, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: true, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: false, checksAvailable: false },
  ])('no banea una identidad compartida o con verificación incompleta: %o', (facts) => {
    expect(isDedicatedStudentAuthIdentity(facts)).toBe(false)
  })
})

describe('hasClientUnarchiveCapacity', () => {
  it('permite el pool Team sin cuota de alumnos, aunque tenga seat_limit de coaches', () => {
    expect(hasClientUnarchiveCapacity({ ok: true, limit: null, used: null, label: 'tu equipo' })).toBe(true)
  })

  it('aplica la cuota numérica de standalone/enterprise', () => {
    expect(hasClientUnarchiveCapacity({ ok: true, limit: 3, used: 2, label: 'tu plan actual' })).toBe(true)
    expect(hasClientUnarchiveCapacity({ ok: true, limit: 3, used: 3, label: 'tu plan actual' })).toBe(false)
  })
})

describe('isMissingAuthIdentityError', () => {
  it('trata una ficha sin usuario Auth como un caso válido', () => {
    expect(isMissingAuthIdentityError({ status: 404, code: 'user_not_found', message: 'User not found' })).toBe(true)
    expect(isMissingAuthIdentityError({ status: 500, code: 'internal_error', message: 'Auth unavailable' })).toBe(false)
  })
})

describe('getClientUnarchiveCapacity — el alumno de ejemplo no bloquea el desarchivo', () => {
  /**
   * Doble del cliente Supabase: `coaches` devuelve el cupo y `clients` graba los filtros del
   * conteo antes de resolver con `count`. El desarchivo comparte predicado con el gate del alta
   * (onboarding v2, W1 F1.3): un coach Free con cupo 1, 1 alumno real archivado y 1 demo activo
   * DEBE poder recuperar al real.
   */
  function fakeDb({ maxClients, count }: { maxClients: number; count: number }) {
    const clientFilters: Array<[string, string, unknown]> = []
    const clientsQuery = {
      select: () => clientsQuery,
      eq(column: string, value: unknown) {
        clientFilters.push(['eq', column, value])
        return clientsQuery
      },
      is(column: string, value: null) {
        clientFilters.push(['is', column, value])
        return clientsQuery
      },
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ count, error: null }).then(onFulfilled),
    }
    const coachesQuery = {
      select: () => coachesQuery,
      eq: () => coachesQuery,
      maybeSingle: async () => ({
        data: { max_clients: maxClients, subscription_tier: 'free', created_at: '2026-08-21T00:00:00Z' },
      }),
    }
    const db = {
      from: (table: string) => {
        if (table === 'clients') return clientsQuery
        if (table === 'coaches') return coachesQuery
        throw new Error(`Unexpected table: ${table}`)
      },
    }
    return { db: db as never, clientFilters }
  }

  const ACTOR = { coachId: 'coach-1', workspace: { type: 'standalone' as const } }

  it('el conteo filtra is_archived=false + is_demo=false antes del scope', async () => {
    const { db, clientFilters } = fakeDb({ maxClients: 1, count: 0 })
    await getClientUnarchiveCapacity(db, ACTOR)
    expect(clientFilters).toEqual([
      ['eq', 'is_archived', false],
      ['eq', 'is_demo', false],
      ['eq', 'coach_id', 'coach-1'],
      ['is', 'org_id', null],
      ['is', 'team_id', null],
    ])
  })

  it('Free 1: con el demo fuera del conteo queda cupo para desarchivar', async () => {
    const { db } = fakeDb({ maxClients: 1, count: 0 })
    const capacity = await getClientUnarchiveCapacity(db, ACTOR)
    expect(capacity).toEqual({ ok: true, limit: 1, used: 0, label: 'tu plan actual' })
    expect(hasClientUnarchiveCapacity(capacity as Extract<typeof capacity, { ok: true }>)).toBe(true)
  })
})
