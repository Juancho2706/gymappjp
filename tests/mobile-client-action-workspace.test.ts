import { describe, expect, it } from 'vitest'
import {
  clientActionWorkspaceQuery,
  clientMatchesActionWorkspace,
  filterClientsForActionWorkspace,
  parseClientActionWorkspace,
  pendingClientAssignments,
  programBuilderDraftKey,
  templateMatchesActionWorkspace,
} from '../apps/mobile/lib/client-action-workspace'

describe('mobile client action workspace', () => {
  it('serializa y parsea los tres scopes sin mezclar ids', () => {
    expect(parseClientActionWorkspace({ workspaceKind: 'standalone' })).toEqual({ kind: 'standalone', teamId: null, orgId: null })
    expect(parseClientActionWorkspace({ workspaceKind: 'team_member', teamId: 'team-1' })).toEqual({ kind: 'team_member', teamId: 'team-1', orgId: null })
    expect(parseClientActionWorkspace({ workspaceKind: 'enterprise', orgId: 'org-1' })).toEqual({ kind: 'enterprise', teamId: null, orgId: 'org-1' })
    expect(parseClientActionWorkspace({ workspaceKind: 'team_owner', teamId: 'team-1', orgId: 'org-1' })).toBeNull()
    expect(clientActionWorkspaceQuery({ kind: 'team_owner', teamId: 'team 1', orgId: null })).toBe('workspaceKind=team_owner&teamId=team%201')
  })

  it('standalone exige coach directo y excluye team/org', () => {
    const workspace = { kind: 'standalone', teamId: null, orgId: null } as const
    expect(clientMatchesActionWorkspace({ coach_id: 'coach-1', team_id: null, org_id: null }, workspace, 'coach-1')).toBe(true)
    expect(clientMatchesActionWorkspace({ coach_id: 'coach-2', team_id: null, org_id: null }, workspace, 'coach-1')).toBe(false)
    expect(clientMatchesActionWorkspace({ coach_id: 'coach-1', team_id: 'team-1', org_id: null }, workspace, 'coach-1')).toBe(false)
  })

  it('team y enterprise se atan al recurso, no al coach creador legacy', () => {
    expect(clientMatchesActionWorkspace(
      { coach_id: 'otro', team_id: 'team-1', org_id: null },
      { kind: 'team_member', teamId: 'team-1', orgId: null },
      'coach-1',
    )).toBe(true)
    expect(clientMatchesActionWorkspace(
      { coach_id: 'creador-original', team_id: null, org_id: 'org-1' },
      { kind: 'enterprise', teamId: null, orgId: 'org-1' },
      'coach-1',
    )).toBe(true)
  })

  it('filtra selectores multi-alumno sin mezclar workspaces visibles por RLS', () => {
    const rows = [
      { id: 'standalone', coach_id: 'coach-1', team_id: null, org_id: null },
      { id: 'other-coach', coach_id: 'coach-2', team_id: null, org_id: null },
      { id: 'team-1', coach_id: 'coach-2', team_id: 'team-1', org_id: null },
      { id: 'team-2', coach_id: 'coach-1', team_id: 'team-2', org_id: null },
      { id: 'org-1', coach_id: 'coach-3', team_id: null, org_id: 'org-1' },
      { id: 'org-2', coach_id: 'coach-1', team_id: null, org_id: 'org-2' },
    ]

    expect(filterClientsForActionWorkspace(
      rows,
      { kind: 'standalone', teamId: null, orgId: null },
      'coach-1',
    ).map((row) => row.id)).toEqual(['standalone'])

    expect(filterClientsForActionWorkspace(
      rows,
      { kind: 'team_owner', teamId: 'team-1', orgId: null },
      'coach-1',
    ).map((row) => row.id)).toEqual(['team-1'])

    expect(filterClientsForActionWorkspace(
      rows,
      { kind: 'enterprise', teamId: null, orgId: 'org-1' },
      'coach-1',
    ).map((row) => row.id)).toEqual(['org-1'])
  })

  it('scopea plantillas por autor y separa enterprise del pool portable no-enterprise', () => {
    const ownPortable = { client_id: null, coach_id: 'coach-1', org_id: null }
    const ownEnterprise = { client_id: null, coach_id: 'coach-1', org_id: 'org-1' }
    const assigned = { client_id: 'client-1', coach_id: 'coach-1', org_id: null }

    expect(templateMatchesActionWorkspace(ownPortable, { kind: 'standalone', teamId: null, orgId: null }, 'coach-1')).toBe(true)
    expect(templateMatchesActionWorkspace(ownPortable, { kind: 'team_member', teamId: 'team-1', orgId: null }, 'coach-1')).toBe(true)
    expect(templateMatchesActionWorkspace(ownEnterprise, { kind: 'enterprise', teamId: null, orgId: 'org-1' }, 'coach-1')).toBe(true)
    expect(templateMatchesActionWorkspace(ownEnterprise, { kind: 'standalone', teamId: null, orgId: null }, 'coach-1')).toBe(false)
    expect(templateMatchesActionWorkspace(assigned, { kind: 'standalone', teamId: null, orgId: null }, 'coach-1')).toBe(false)
    expect(templateMatchesActionWorkspace(ownPortable, { kind: 'standalone', teamId: null, orgId: null }, 'coach-2')).toBe(false)
  })

  it('namespaces drafts por cuenta, workspace y recurso', () => {
    const base = {
      coachId: 'coach-1',
      workspace: { kind: 'team_member', teamId: 'team-1', orgId: null } as const,
      clientId: 'client-1',
      isTemplate: false,
    }
    const key = programBuilderDraftKey(base)
    expect(key).toContain('builder_draft_v2:coach-1:team_member:team-1:client%3Aclient-1%3Aprogram%3Anew')
    expect(programBuilderDraftKey({ ...base, coachId: 'coach-2' })).not.toBe(key)
    expect(programBuilderDraftKey({ ...base, workspace: { kind: 'team_owner', teamId: 'team-2', orgId: null } })).not.toBe(key)
    expect(programBuilderDraftKey({ ...base, isTemplate: true, templateId: 'tpl-1' })).not.toBe(key)
  })

  it('separa dos programas concretos del mismo alumno', () => {
    const base = {
      coachId: 'coach-1',
      workspace: { kind: 'standalone', teamId: null, orgId: null } as const,
      clientId: 'client-1',
      isTemplate: false,
    }
    const first = programBuilderDraftKey({ ...base, programId: 'program-1' })
    const second = programBuilderDraftKey({ ...base, programId: 'program-2' })
    expect(first).not.toBe(second)
    expect(first).toContain('client%3Aclient-1%3Aprogram%3Aprogram-1')
  })

  it('un retry parcial omite ids ya asignados y duplicados', () => {
    expect(pendingClientAssignments(
      ['client-1', 'client-2', 'client-1', 'client-3'],
      new Set(['client-1', 'client-3']),
    )).toEqual(['client-2'])
  })
})
