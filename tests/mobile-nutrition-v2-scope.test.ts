import { describe, expect, it } from 'vitest'
import {
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../apps/mobile/lib/nutrition-v2-scope'

const TEAM_A = '11111111-1111-4111-8111-111111111111'
const TEAM_B = '22222222-2222-4222-8222-222222222222'
describe('mobile nutrition v2 · workspace -> scope', () => {
  it('colapsa standalone y Team a su scope de lectura profesional', () => {
    expect(nutritionV2CoachScope({ kind: 'standalone', teamId: null, orgId: null })).toEqual({
      scopeType: 'standalone',
      teamId: null,
      orgId: null,
    })
    expect(nutritionV2CoachScope({ kind: 'team_owner', teamId: TEAM_A, orgId: null })).toEqual({
      scopeType: 'team',
      teamId: TEAM_A,
      orgId: null,
    })
    expect(nutritionV2CoachScope({ kind: 'team_member', teamId: TEAM_A, orgId: null })).toEqual({
      scopeType: 'team',
      teamId: TEAM_A,
      orgId: null,
    })
  })

  it('falla cerrado para Enterprise, team sin id o kind irreconocible', () => {
    expect(nutritionV2CoachScope({ kind: 'team_owner', teamId: null, orgId: null })).toBeNull()
    expect(nutritionV2CoachScope({ kind: 'enterprise', teamId: null, orgId: '33333333-3333-4333-8333-333333333333' })).toBeNull()
    expect(
      nutritionV2CoachScope({ kind: 'bogus' as never, teamId: null, orgId: null }),
    ).toBeNull()
  })
})

describe('mobile nutrition v2 · cache key por workspace', () => {
  it('produce keys DISTINTAS para workspaces distintos del mismo coach', () => {
    const standalone = nutritionV2CoachScopeCacheKey({ scopeType: 'standalone', teamId: null, orgId: null })
    const teamA = nutritionV2CoachScopeCacheKey({ scopeType: 'team', teamId: TEAM_A, orgId: null })
    const teamB = nutritionV2CoachScopeCacheKey({ scopeType: 'team', teamId: TEAM_B, orgId: null })
    const keys = [standalone, teamA, teamB]
    expect(new Set(keys).size).toBe(keys.length)
    expect(standalone).toBe('standalone:-:-')
    expect(teamA).toBe(`team:${TEAM_A}:-`)
  })

  it('es estable para el mismo scope (misma key en dos llamadas)', () => {
    const first = nutritionV2CoachScopeCacheKey({ scopeType: 'team', teamId: TEAM_A, orgId: null })
    const second = nutritionV2CoachScopeCacheKey({ scopeType: 'team', teamId: TEAM_A, orgId: null })
    expect(first).toBe(second)
  })
})
