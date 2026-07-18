import type { ClientActionWorkspace } from './client-actions'

export type BuilderExerciseOwnerRow = {
  coach_id?: string | null
  org_id?: string | null
  team_id?: string | null
}

function isSystemExerciseOwner(row: BuilderExerciseOwnerRow): boolean {
  return row.coach_id == null && row.org_id == null && row.team_id == null
}

/** Defensa pura post-RLS: exactamente system + owner del workspace explícito. */
export function exerciseMatchesBuilderWorkspace(
  row: BuilderExerciseOwnerRow,
  coachId: string,
  workspace: ClientActionWorkspace,
): boolean {
  if (isSystemExerciseOwner(row)) return true
  if (workspace.kind === 'enterprise') {
    return Boolean(workspace.orgId)
      && row.org_id === workspace.orgId
      && row.coach_id == null
      && row.team_id == null
  }
  if (workspace.kind === 'team_owner' || workspace.kind === 'team_member') {
    return Boolean(workspace.teamId)
      && row.team_id === workspace.teamId
      && row.coach_id == null
      && row.org_id == null
  }
  return row.coach_id === coachId && row.org_id == null && row.team_id == null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requireScopeUuid(value: string | null | undefined, label: string): string {
  if (!value || !UUID_RE.test(value)) throw new Error(`${label} inválido.`)
  return value
}

/** Predicado PostgREST idéntico a web `getExerciseCatalog`. */
export function builderExerciseWorkspaceFilter(coachId: string, workspace: ClientActionWorkspace): string {
  const system = 'and(coach_id.is.null,org_id.is.null,team_id.is.null)'
  if (workspace.kind === 'enterprise') {
    return `${system},org_id.eq.${requireScopeUuid(workspace.orgId, 'Workspace enterprise')}`
  }
  if (workspace.kind === 'team_owner' || workspace.kind === 'team_member') {
    return `${system},team_id.eq.${requireScopeUuid(workspace.teamId, 'Workspace de equipo')}`
  }
  return `${system},coach_id.eq.${requireScopeUuid(coachId, 'Coach')}`
}
