import { describe, it, expect } from 'vitest'
import { moduleCtxForPlan, shouldLogExchangePdf, groupMatchesTenant } from './nutrition-exchanges.service'

describe('moduleCtxForPlan (resolución por contexto del RECURSO — pool manda)', () => {
    it('alumno de pool ⇒ decide el team (NO el coach)', () => {
        expect(
            moduleCtxForPlan({ clientTeamId: 'team-1', clientOrgId: null, coachId: 'coach-1' })
        ).toEqual({ teamId: 'team-1' })
    })
    it('alumno standalone ⇒ decide el coach dueño del plan', () => {
        expect(
            moduleCtxForPlan({ clientTeamId: null, clientOrgId: null, coachId: 'coach-1' })
        ).toEqual({ coachId: 'coach-1' })
    })
    it('alumno enterprise (org) ⇒ decide el coach (enabled_modules no vive en orgs)', () => {
        expect(
            moduleCtxForPlan({ clientTeamId: null, clientOrgId: 'org-1', coachId: 'coach-1' })
        ).toEqual({ coachId: 'coach-1' })
    })
    it('team_id presente PERO con org ⇒ no es pool: decide el coach', () => {
        expect(
            moduleCtxForPlan({ clientTeamId: 'team-1', clientOrgId: 'org-1', coachId: 'coach-1' })
        ).toEqual({ coachId: 'coach-1' })
    })
})

describe('shouldLogExchangePdf (AC7: SOLO coach en contexto team)', () => {
    it('coach con workspace team activo + alumno de ESE pool ⇒ se registra', () => {
        expect(
            shouldLogExchangePdf({ activeTeamId: 't1', clientTeamId: 't1', clientOrgId: null })
        ).toBe(true)
    })
    it('coach standalone ⇒ no-op', () => {
        expect(
            shouldLogExchangePdf({ activeTeamId: null, clientTeamId: null, clientOrgId: null })
        ).toBe(false)
    })
    it('workspace team activo pero alumno de OTRO pool ⇒ no-op (no falsear bitácora)', () => {
        expect(
            shouldLogExchangePdf({ activeTeamId: 't1', clientTeamId: 't2', clientOrgId: null })
        ).toBe(false)
    })
    it('alumno enterprise ⇒ no-op', () => {
        expect(
            shouldLogExchangePdf({ activeTeamId: 't1', clientTeamId: 't1', clientOrgId: 'org-1' })
        ).toBe(false)
    })
})

describe('groupMatchesTenant (filtro de tenant del alumno — F5 áreas)', () => {
    const tenant = { planCoachId: 'coach-1', clientTeamId: 'team-1' }

    it('system siempre resuelve', () => {
        expect(groupMatchesTenant({ isSystem: true, coachId: null, teamId: null }, tenant)).toBe(true)
    })
    it('custom del coach del plan resuelve', () => {
        expect(groupMatchesTenant({ isSystem: false, coachId: 'coach-1', teamId: null }, tenant)).toBe(true)
    })
    it('custom del team del alumno resuelve', () => {
        expect(groupMatchesTenant({ isSystem: false, coachId: null, teamId: 'team-1' }, tenant)).toBe(true)
    })
    it('un id cross-team JAMÁS resuelve (data minimization)', () => {
        expect(groupMatchesTenant({ isSystem: false, coachId: null, teamId: 'team-AJENO' }, tenant)).toBe(false)
        expect(groupMatchesTenant({ isSystem: false, coachId: 'coach-AJENO', teamId: null }, tenant)).toBe(false)
    })
    it('alumno sin team: solo system y coach del plan', () => {
        const t = { planCoachId: 'coach-1', clientTeamId: null }
        expect(groupMatchesTenant({ isSystem: false, coachId: null, teamId: 'team-1' }, t)).toBe(false)
        expect(groupMatchesTenant({ isSystem: false, coachId: 'coach-1', teamId: null }, t)).toBe(true)
    })
})
