import { describe, it, expect } from 'vitest'
import { pickPreferredWorkspace } from './workspace.service'
import type { WorkspaceSummary } from '@/domain/auth/types'
import type { WorkspacePreferenceRow } from '@/infrastructure/db/workspace.repository'

const standalone = { type: 'coach_standalone', userId: 'u', coachId: 'c1', label: 'A' } as WorkspaceSummary
const team = { type: 'coach_team', userId: 'u', coachId: 'c1', teamId: 't1', label: 'B', slug: 'mov' } as WorkspaceSummary

const pref = (over: Partial<WorkspacePreferenceRow>): WorkspacePreferenceRow => ({
    user_id: 'u',
    last_workspace_type: 'coach_standalone',
    last_org_id: null,
    last_coach_id: null,
    last_client_id: null,
    updated_at: '2026-06-17T00:00:00Z',
    ...over,
})

describe('pickPreferredWorkspace — resolución del workspace activo (pura)', () => {
    it('0 workspaces -> null', () => {
        expect(pickPreferredWorkspace([], null)).toBeNull()
        expect(pickPreferredWorkspace([], pref({}))).toBeNull()
    })

    it('1 workspace -> ese, marcado isLastUsed (ignora preferencia)', () => {
        const r = pickPreferredWorkspace([standalone], null)
        expect(r).toMatchObject({ type: 'coach_standalone', coachId: 'c1', isLastUsed: true })
    })

    it('N workspaces SIN preferencia -> null (el caller muestra el selector)', () => {
        expect(pickPreferredWorkspace([standalone, team], null)).toBeNull()
    })

    it('N workspaces con preferencia que matchea -> ese workspace, isLastUsed', () => {
        const r = pickPreferredWorkspace([standalone, team], pref({ last_workspace_type: 'coach_team', last_coach_id: 'c1' }))
        expect(r).toMatchObject({ type: 'coach_team', teamId: 't1', isLastUsed: true })
    })

    it('N workspaces con preferencia que NO matchea ninguno -> null', () => {
        const r = pickPreferredWorkspace([standalone, team], pref({ last_workspace_type: 'enterprise_staff', last_org_id: 'o-inexistente' }))
        expect(r).toBeNull()
    })

    it('preferencia coach_standalone (con coach_id) matchea el standalone, no el team', () => {
        const r = pickPreferredWorkspace([standalone, team], pref({ last_workspace_type: 'coach_standalone', last_coach_id: 'c1' }))
        expect(r).toMatchObject({ type: 'coach_standalone', coachId: 'c1', isLastUsed: true })
    })

    it('matching es ESTRICTO: coach_standalone sin last_coach_id NO matchea (evita rutear mal)', () => {
        const r = pickPreferredWorkspace([standalone, team], pref({ last_workspace_type: 'coach_standalone', last_coach_id: null }))
        expect(r).toBeNull()
    })
})
