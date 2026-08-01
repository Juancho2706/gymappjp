import { describe, expect, it } from 'vitest'
import {
  applyArchiveScope,
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
