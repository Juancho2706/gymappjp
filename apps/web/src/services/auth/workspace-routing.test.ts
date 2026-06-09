import { describe, expect, it } from 'vitest'
import { canAccessWorkspacePath, defaultWorkspaceHome } from './workspace-route-guard.service'
import { workspaceHome } from '@/app/workspace/select/workspace-home'
import type { WorkspaceSummary } from '@/domain/auth/types'

// Invariantes de ruteo por workspace (regresión del smoke test 2026-06-09):
// cada contexto rutea a SU área y no se cruza con las demás.

const ws = {
    coachStandalone: { type: 'coach_standalone', userId: 'u', coachId: 'c', label: 'Mi negocio' } as WorkspaceSummary,
    enterpriseCoach: { type: 'enterprise_coach', userId: 'u', orgId: 'o', coachId: 'c', memberId: 'm', label: 'Org - Coach' } as WorkspaceSummary,
    enterpriseStaff: { type: 'enterprise_staff', userId: 'u', orgId: 'o', memberId: 'm', role: 'org_admin', label: 'Org - Admin', slug: 'gym' } as WorkspaceSummary,
    coachTeam: { type: 'coach_team', userId: 'u', coachId: 'c', teamId: 't', label: 'Movida - Equipo', slug: 'movida-test' } as WorkspaceSummary,
    studentStandalone: { type: 'student_standalone', userId: 'u', clientId: 'cl', coachId: 'c', label: 'Entrenar', slug: 'josefit' } as WorkspaceSummary,
    studentEnterprise: { type: 'student_enterprise', userId: 'u', clientId: 'cl', orgId: 'o', coachId: 'c', label: 'Entrenar', slug: 'josefit' } as WorkspaceSummary,
    studentTeam: { type: 'student_team', userId: 'u', clientId: 'cl', teamId: 't', label: 'Entrenar con Movida', slug: 'movida-test' } as WorkspaceSummary,
}

describe('workspaceHome / defaultWorkspaceHome', () => {
    it('coach_team rutea al dashboard del coach (mismo shell, contexto team)', () => {
        expect(workspaceHome(ws.coachTeam)).toBe('/coach/dashboard')
        expect(defaultWorkspaceHome(ws.coachTeam)).toBe('/coach/dashboard')
    })

    it('student_team rutea al área del team /t/[slug], NUNCA al /c del coach personal', () => {
        expect(workspaceHome(ws.studentTeam)).toBe('/t/movida-test/dashboard')
        expect(defaultWorkspaceHome(ws.studentTeam)).toBe('/t/movida-test/dashboard')
    })

    it('student_team sin slug cae a /login (no a /c)', () => {
        const noSlug = { ...ws.studentTeam, slug: null } as WorkspaceSummary
        expect(workspaceHome(noSlug)).toBe('/login')
        expect(defaultWorkspaceHome(noSlug)).toBe('/login')
    })

    it('tipos legacy no cambian (zero regresión)', () => {
        expect(workspaceHome(ws.coachStandalone)).toBe('/coach/dashboard')
        expect(workspaceHome(ws.enterpriseCoach)).toBe('/coach/dashboard')
        expect(workspaceHome(ws.enterpriseStaff)).toBe('/org/gym')
        expect(workspaceHome(ws.studentStandalone)).toBe('/c/josefit/dashboard')
        expect(defaultWorkspaceHome(ws.studentStandalone)).toBe('/c/josefit/dashboard')
    })
})

describe('canAccessWorkspacePath', () => {
    it('coach_team accede a /coach/* pero NO a billing/marca personal', () => {
        expect(canAccessWorkspacePath(ws.coachTeam, '/coach/dashboard').allowed).toBe(true)
        expect(canAccessWorkspacePath(ws.coachTeam, '/coach/team').allowed).toBe(true)
        expect(canAccessWorkspacePath(ws.coachTeam, '/coach/subscription').allowed).toBe(false)
        expect(canAccessWorkspacePath(ws.coachTeam, '/coach/settings').allowed).toBe(false)
    })

    it('student_team accede a /c/* (lo sirve el rewrite del proxy /t)', () => {
        expect(canAccessWorkspacePath(ws.studentTeam, '/c/josefit/dashboard').allowed).toBe(true)
    })

    it('student_team NO accede a /coach/* ni /org/*', () => {
        expect(canAccessWorkspacePath(ws.studentTeam, '/coach/dashboard').allowed).toBe(false)
        expect(canAccessWorkspacePath(ws.studentTeam, '/org/gym').allowed).toBe(false)
    })

    it('coach_team NO accede a /org/*', () => {
        expect(canAccessWorkspacePath(ws.coachTeam, '/org/gym').allowed).toBe(false)
    })
})
