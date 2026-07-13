import { describe, expect, it } from 'vitest'
import {
  builderExerciseWorkspaceFilter,
  exerciseMatchesBuilderWorkspace,
} from '../apps/mobile/lib/exercise-workspace'

const COACH = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'
const system = { coach_id: null, org_id: null, team_id: null }
const own = { coach_id: COACH, org_id: null, team_id: null }
const otherOwn = { coach_id: '44444444-4444-4444-8444-444444444444', org_id: null, team_id: null }
const team = { coach_id: null, org_id: null, team_id: TEAM }
const org = { coach_id: null, org_id: ORG, team_id: null }

describe('builder exercise catalog workspace', () => {
  it('standalone acepta solo system + propios', () => {
    const workspace = { kind: 'standalone', teamId: null, orgId: null } as const
    expect([system, own, otherOwn, team, org].filter((row) => exerciseMatchesBuilderWorkspace(row, COACH, workspace)))
      .toEqual([system, own])
    expect(builderExerciseWorkspaceFilter(COACH, workspace))
      .toBe(`and(coach_id.is.null,org_id.is.null,team_id.is.null),coach_id.eq.${COACH}`)
  })

  it('team acepta solo system + team exacto', () => {
    const workspace = { kind: 'team_member', teamId: TEAM, orgId: null } as const
    expect([system, own, team, org].filter((row) => exerciseMatchesBuilderWorkspace(row, COACH, workspace)))
      .toEqual([system, team])
    expect(builderExerciseWorkspaceFilter(COACH, workspace))
      .toBe(`and(coach_id.is.null,org_id.is.null,team_id.is.null),team_id.eq.${TEAM}`)
  })

  it('enterprise acepta solo system + org exacta', () => {
    const workspace = { kind: 'enterprise', teamId: null, orgId: ORG } as const
    expect([system, own, team, org].filter((row) => exerciseMatchesBuilderWorkspace(row, COACH, workspace)))
      .toEqual([system, org])
    expect(builderExerciseWorkspaceFilter(COACH, workspace))
      .toBe(`and(coach_id.is.null,org_id.is.null,team_id.is.null),org_id.eq.${ORG}`)
  })

  it('rechaza ids inválidos antes de interpolar filtro PostgREST', () => {
    expect(() => builderExerciseWorkspaceFilter(COACH, { kind: 'team_owner', teamId: 'x),coach_id.not.is.null', orgId: null }))
      .toThrow('Workspace de equipo inválido.')
  })
})
