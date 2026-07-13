import type { ClientActionWorkspace } from './client-actions'

type RouteWorkspaceParams = {
  workspaceKind?: string
  teamId?: string
  orgId?: string
}

type ScopedClientRow = {
  coach_id?: string | null
  team_id?: string | null
  org_id?: string | null
}

type ScopedTemplateRow = {
  client_id?: string | null
  coach_id?: string | null
  org_id?: string | null
}

export function clientActionWorkspaceQuery(workspace: ClientActionWorkspace): string {
  return [
    `workspaceKind=${encodeURIComponent(workspace.kind)}`,
    ...(workspace.teamId ? [`teamId=${encodeURIComponent(workspace.teamId)}`] : []),
    ...(workspace.orgId ? [`orgId=${encodeURIComponent(workspace.orgId)}`] : []),
  ].join('&')
}

export function parseClientActionWorkspace(params: RouteWorkspaceParams): ClientActionWorkspace | null {
  const kind = params.workspaceKind
  if (kind !== 'standalone' && kind !== 'team_owner' && kind !== 'team_member' && kind !== 'enterprise') return null
  const teamId = params.teamId?.trim() || null
  const orgId = params.orgId?.trim() || null
  if (kind === 'standalone') return teamId || orgId ? null : { kind, teamId: null, orgId: null }
  if (kind === 'enterprise') return orgId && !teamId ? { kind, teamId: null, orgId } : null
  return teamId && !orgId ? { kind, teamId, orgId: null } : null
}

/** Match puro posterior al SELECT RLS-scoped; evita mezclar recursos entre workspaces locales. */
export function clientMatchesActionWorkspace(
  client: ScopedClientRow,
  workspace: ClientActionWorkspace,
  coachId: string,
): boolean {
  if (workspace.kind === 'standalone') {
    return client.coach_id === coachId && client.team_id == null && client.org_id == null
  }
  if (workspace.kind === 'enterprise') {
    return Boolean(workspace.orgId) && client.org_id === workspace.orgId && client.team_id == null
  }
  return Boolean(workspace.teamId) && client.team_id === workspace.teamId && client.org_id == null
}

/**
 * Defensa local posterior a RLS para listas multi-alumno. El backend sigue siendo
 * el techo de autorizacion; este filtro evita mezclar filas visibles de otros
 * workspaces del mismo coach dentro de un selector abierto con scope explicito.
 */
export function filterClientsForActionWorkspace<T extends ScopedClientRow>(
  clients: readonly T[],
  workspace: ClientActionWorkspace,
  coachId: string,
): T[] {
  return clients.filter((client) => clientMatchesActionWorkspace(client, workspace, coachId))
}

/**
 * Las plantillas de entrenamiento son `client_id = null` y pertenecen a su autor.
 * El esquema no tiene `workout_programs.team_id`: por eso team y standalone comparten
 * deliberadamente el pool portable NO-enterprise del mismo coach; enterprise queda
 * aislado por `org_id`. RLS sigue siendo el techo de lectura/escritura.
 */
export function templateMatchesActionWorkspace(
  template: ScopedTemplateRow,
  workspace: ClientActionWorkspace,
  coachId: string,
): boolean {
  if (template.client_id != null || template.coach_id !== coachId) return false
  if (workspace.kind === 'enterprise') {
    return Boolean(workspace.orgId) && template.org_id === workspace.orgId
  }
  return template.org_id == null
}

function workspaceStorageId(workspace: ClientActionWorkspace): string {
  if (workspace.kind === 'enterprise') return workspace.orgId ?? 'invalid-org'
  if (workspace.kind === 'team_owner' || workspace.kind === 'team_member') return workspace.teamId ?? 'invalid-team'
  return 'self'
}

/** Namespace v2: nunca comparte drafts entre cuentas ni workspaces locales. */
export function programBuilderDraftKey(input: {
  coachId: string
  workspace: ClientActionWorkspace
  clientId?: string
  templateId?: string
  programId?: string | null
  isTemplate: boolean
}): string {
  const resource = input.isTemplate
    ? `template:${input.templateId ?? 'new'}`
    : `client:${input.clientId ?? 'missing'}:program:${input.programId ?? 'new'}`
  return [
    'builder_draft_v2',
    encodeURIComponent(input.coachId),
    input.workspace.kind,
    encodeURIComponent(workspaceStorageId(input.workspace)),
    encodeURIComponent(resource),
  ].join(':')
}

/** Deduplica el retry de una asignacion parcial dentro del mismo sheet abierto. */
export function pendingClientAssignments(
  selectedClientIds: readonly string[],
  alreadyAssignedClientIds: ReadonlySet<string>,
): string[] {
  return [...new Set(selectedClientIds)].filter((clientId) => !alreadyAssignedClientIds.has(clientId))
}
