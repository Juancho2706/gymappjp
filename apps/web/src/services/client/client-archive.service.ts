import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { tierMaxClientsFor, type SubscriptionTier } from '@/lib/constants'

type Db = SupabaseClient<Database>

/**
 * Scope server-side del alumno que se archiva. Nunca viene del body sin haber sido validado
 * por el caller: el servicio vuelve a aplicarlo porque opera con service role para poder
 * sincronizar el ban de Auth.
 */
export type ClientArchiveWorkspace =
  | { type: 'standalone' }
  | { type: 'team'; teamId: string }
  | { type: 'enterprise'; orgId: string }

export type ClientArchiveActor = {
  coachId: string
  workspace: ClientArchiveWorkspace
}

export type ArchivedClient = {
  id: string
  fullName: string
  email: string | null
  isArchived: boolean
  isActive: boolean | null
}

export type ClientArchiveFailureCode =
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_NOT_ARCHIVED'
  | 'CLIENT_ARCHIVED_READ_ONLY'
  | 'CLIENT_LIMIT_REACHED'
  | 'CLIENT_LIMIT_CHECK_FAILED'
  | 'ARCHIVE_UPDATE_FAILED'
  | 'UNARCHIVE_UPDATE_FAILED'
  | 'ACCESS_UPDATE_FAILED'
  | 'AUTH_BAN_FAILED'
  | 'AUTH_UNBAN_FAILED'

export type ClientArchiveResult =
  | { ok: true; client: ArchivedClient; idempotent?: boolean }
  | { ok: false; code: ClientArchiveFailureCode; error: string; limit?: number }

type Filterable<T> = T & {
  eq: (column: string, value: string | boolean) => Filterable<T>
  is: (column: string, value: null) => Filterable<T>
}

/**
 * Same pool semantics as `applyCoachClientScope`, but intentionally local to the archive
 * service so its service-role queries cannot accidentally escape the active workspace.
 */
export function applyArchiveScope<T>(query: Filterable<T>, actor: ClientArchiveActor): Filterable<T> {
  switch (actor.workspace.type) {
    case 'team':
      return query.is('org_id', null).eq('team_id', actor.workspace.teamId)
    case 'enterprise':
      return query.eq('org_id', actor.workspace.orgId).is('team_id', null)
    case 'standalone':
      return query
        .eq('coach_id', actor.coachId)
        .is('org_id', null)
        .is('team_id', null)
  }
}

function toClient(row: {
  id: string
  full_name: string
  email: string | null
  is_archived: boolean | null
  is_active: boolean | null
}): ArchivedClient {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isArchived: row.is_archived === true,
    isActive: row.is_active,
  }
}

async function findScopedClient(db: Db, actor: ClientArchiveActor, clientId: string): Promise<ArchivedClient | null> {
  const query = applyArchiveScope(
    db
      .from('clients')
      .select('id, full_name, email, is_archived, is_active')
      .eq('id', clientId),
    actor,
  )
  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return toClient(data)
}

export type ArchiveAuthIdentityFacts = {
  hasCoachProfile: boolean
  hasActiveOrganizationRole: boolean
  hasOtherActiveStudentMembership: boolean
  checksAvailable: boolean
}

/**
 * A GoTrue ban is identity-wide. Never ban an account that also operates as a coach/staff or has
 * another active student context: row-scoped RLS still closes the archived student without taking
 * away its unrelated workspace. Dedicated student identities receive the stronger Auth ban.
 */
export function isDedicatedStudentAuthIdentity(facts: ArchiveAuthIdentityFacts): boolean {
  return facts.checksAvailable
    && !facts.hasCoachProfile
    && !facts.hasActiveOrganizationRole
    && !facts.hasOtherActiveStudentMembership
}

/** A roster row may exist before its student creates an Auth identity. That is not a ban failure. */
export function isMissingAuthIdentityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown }
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''
  return candidate.status === 404
    || candidate.code === 'user_not_found'
    || message.includes('user not found')
}

async function clientAuthAccountIds(db: Db, clientId: string): Promise<string[]> {
  const { data, error } = await db
    .from('client_memberships')
    .select('account_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .is('deleted_at', null)

  // Legacy rows predate `client_memberships` and use clients.id as the Auth id. If the lookup
  // itself fails we keep that legacy fallback; the eligibility check below still fails closed.
  if (error || !data || data.length === 0) return [clientId]
  return [...new Set(data.map((row) => row.account_id).filter((id): id is string => Boolean(id)))]
}

async function archiveAuthIdentityFacts(
  db: Db,
  accountId: string,
  clientId: string,
): Promise<ArchiveAuthIdentityFacts> {
  const [coachResult, orgResult, otherMembershipResult] = await Promise.all([
    db.from('coaches').select('id').eq('id', accountId).maybeSingle(),
    db
      .from('organization_members')
      .select('id')
      .eq('user_id', accountId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1),
    db
      .from('client_memberships')
      .select('id')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .neq('client_id', clientId)
      .limit(1),
  ])

  const checksAvailable = !coachResult.error && !orgResult.error && !otherMembershipResult.error
  return {
    hasCoachProfile: Boolean(coachResult.data),
    hasActiveOrganizationRole: (orgResult.data?.length ?? 0) > 0,
    hasOtherActiveStudentMembership: (otherMembershipResult.data?.length ?? 0) > 0,
    checksAvailable,
  }
}

async function syncAuthBan(db: Db, clientId: string, banned: boolean): Promise<boolean> {
  const accountIds = await clientAuthAccountIds(db, clientId)
  if (accountIds.length === 0) return true

  const candidates = await Promise.all(accountIds.map(async (accountId) => ({
    accountId,
    eligible: isDedicatedStudentAuthIdentity(await archiveAuthIdentityFacts(db, accountId, clientId)),
  })))
  const dedicatedIds = candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.accountId)

  // Shared identities remain authenticated for their other workspaces; RLS/API guards are the
  // row-level enforcement for the archived student context.
  if (dedicatedIds.length === 0) return true

  // `ban_duration: none` is the documented inverse of a GoTrue ban. Auth administration is
  // deliberately performed only with the service-role client received by this server service.
  const results = await Promise.all(dedicatedIds.map(async (accountId) => {
    const { error } = await db.auth.admin.updateUserById(accountId, {
      ban_duration: banned ? '876000h' : 'none',
    })
    return !error || isMissingAuthIdentityError(error)
  }))
  return results.every(Boolean)
}

/**
 * `null` means the workspace has no persisted client quota. It is deliberately distinct from
 * an unavailable entitlement check: a Team's `seat_limit` constrains coaches in `team_members`,
 * never the shared client pool.
 */
type WorkspaceCapacity = { limit: number | null; label: string }

export type ClientUnarchiveCapacity =
  | { ok: true; limit: number; used: number; label: string }
  | { ok: true; limit: null; used: null; label: string }
  | { ok: false }

export function hasClientUnarchiveCapacity(capacity: Extract<ClientUnarchiveCapacity, { ok: true }>): boolean {
  return capacity.limit === null || (capacity.used !== null && capacity.used < capacity.limit)
}

async function getWorkspaceCapacity(db: Db, actor: ClientArchiveActor): Promise<WorkspaceCapacity | null> {
  if (actor.workspace.type === 'standalone') {
    const { data } = await db
      .from('coaches')
      .select('max_clients, subscription_tier, created_at')
      .eq('id', actor.coachId)
      .maybeSingle()
    if (!data) return null
    return {
      // Pricing v2 (P2): la columna max_clients SIGUE ganando; el fallback usa el helper con la
      // fecha de creación (grandfather) — nunca el catálogo de venta plano para un coach existente.
      limit: data.max_clients ?? tierMaxClientsFor((data.subscription_tier ?? 'free') as SubscriptionTier, data.created_at),
      label: 'tu plan actual',
    }
  }

  if (actor.workspace.type === 'team') {
    const { data } = await db
      .from('teams')
      .select('id')
      .eq('id', actor.workspace.teamId)
      .is('deleted_at', null)
      .is('suspended_at', null)
      .maybeSingle()
    if (!data) return null
    // Team has a shared client pool but no client quota in the schema. `teams.seat_limit`
    // governs active coach memberships only (team_members_seat_guard), and must never block
    // an archived student's restoration.
    return { limit: null, label: 'tu equipo' }
  }

  const { data } = await db
    .from('organizations')
    .select('client_limit')
    .eq('id', actor.workspace.orgId)
    .maybeSingle()
  if (!data || !Number.isInteger(data.client_limit) || data.client_limit < 1) return null
  return { limit: data.client_limit, label: 'tu organización' }
}

async function activeClientCount(db: Db, actor: ClientArchiveActor): Promise<number | null> {
  const query = applyArchiveScope(
    // `is_demo = false` (onboarding v2): el alumno de ejemplo no ocupa cupo, así que tampoco puede
    // bloquear el DESARCHIVO de un alumno real — mismo predicado que el gate del alta.
    db
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false)
      .eq('is_demo', false),
    actor,
  )
  const { count, error } = await query
  return error ? null : (count ?? 0)
}

export async function getClientUnarchiveCapacity(
  db: Db,
  actor: ClientArchiveActor,
): Promise<ClientUnarchiveCapacity> {
  const capacity = await getWorkspaceCapacity(db, actor)
  if (!capacity) return { ok: false }
  if (capacity.limit === null) {
    return { ok: true, limit: null, used: null, label: capacity.label }
  }

  const used = await activeClientCount(db, actor)
  if (used == null) return { ok: false }
  return { ok: true, limit: capacity.limit, used, label: capacity.label }
}

/**
 * Archive is intentionally fail-closed: the DB state and its RLS gate are committed first,
 * then the Auth ban is applied. If GoTrue is temporarily unavailable, the client remains
 * archived (therefore cannot read through RLS) and a retry repairs Auth instead of reopening
 * access or reactivating assignments.
 */
export async function archiveClient(
  db: Db,
  actor: ClientArchiveActor,
  clientId: string,
): Promise<ClientArchiveResult> {
  const current = await findScopedClient(db, actor, clientId)
  if (!current) return { ok: false, code: 'CLIENT_NOT_FOUND', error: 'Alumno no encontrado.' }

  if (!current.isArchived) {
    const query = applyArchiveScope(
      db.from('clients').update({ is_archived: true }).eq('id', clientId),
      actor,
    )
    const { data, error } = await query
      .select('id, full_name, email, is_archived, is_active')
      .maybeSingle()
    if (error || !data) {
      return { ok: false, code: 'ARCHIVE_UPDATE_FAILED', error: 'No se pudo archivar al alumno.' }
    }
  }

  const banned = await syncAuthBan(db, clientId, true)
  if (!banned) {
    return {
      ok: false,
      code: 'AUTH_BAN_FAILED',
      error: 'El alumno quedó archivado y sin datos por RLS, pero no pudimos cerrar su sesión. Reintenta para sincronizar Auth.',
    }
  }

  const archived = await findScopedClient(db, actor, clientId)
  if (!archived) return { ok: false, code: 'CLIENT_NOT_FOUND', error: 'Alumno no encontrado.' }
  return { ok: true, client: archived, idempotent: current.isArchived }
}

/**
 * Re-enables only the account and roster membership. Program/plan triggers deliberately do not
 * revive assignments, so the coach must assign fresh work after this succeeds.
 */
export async function unarchiveClient(
  db: Db,
  actor: ClientArchiveActor,
  clientId: string,
): Promise<ClientArchiveResult> {
  const current = await findScopedClient(db, actor, clientId)
  if (!current) return { ok: false, code: 'CLIENT_NOT_FOUND', error: 'Alumno no encontrado.' }
  if (!current.isArchived) {
    return { ok: false, code: 'CLIENT_NOT_ARCHIVED', error: 'Este alumno ya está activo.' }
  }

  const capacity = await getClientUnarchiveCapacity(db, actor)
  if (!capacity.ok) {
    return { ok: false, code: 'CLIENT_LIMIT_CHECK_FAILED', error: 'No pudimos validar el cupo del workspace.' }
  }
  if (!hasClientUnarchiveCapacity(capacity)) {
    // The only constrained shape has numeric `limit` and `used`; preserve the explicit guards
    // here so an accidental future capacity shape cannot turn into a false quota error.
    const { limit, used } = capacity
    if (limit === null || used === null) {
      return { ok: false, code: 'CLIENT_LIMIT_CHECK_FAILED', error: 'No pudimos validar el cupo del workspace.' }
    }
    return {
      ok: false,
      code: 'CLIENT_LIMIT_REACHED',
      error: `No hay cupo en ${capacity.label}: ${used} de ${limit} alumnos activos.`,
      limit,
    }
  }

  const query = applyArchiveScope(
    db.from('clients').update({ is_archived: false }).eq('id', clientId),
    actor,
  )
  const { data, error } = await query
    .select('id, full_name, email, is_archived, is_active')
    .maybeSingle()
  if (error || !data) {
    return { ok: false, code: 'UNARCHIVE_UPDATE_FAILED', error: 'No se pudo desarchivar al alumno.' }
  }

  if (data.is_active === false) {
    // A previous pause still wins. Unarchiving must never silently resume a paused account.
    return { ok: true, client: toClient(data) }
  }

  const unbanned = await syncAuthBan(db, clientId, false)
  if (!unbanned) {
    // Restore the archive marker to keep the account closed if GoTrue cannot unban it.
    await applyArchiveScope(
      db.from('clients').update({ is_archived: true }).eq('id', clientId),
      actor,
    )
    return {
      ok: false,
      code: 'AUTH_UNBAN_FAILED',
      error: 'No pudimos restablecer el acceso de la cuenta. El alumno sigue archivado; reintenta.',
    }
  }

  return { ok: true, client: toClient(data) }
}

export async function bulkArchiveClients(
  db: Db,
  actor: ClientArchiveActor,
  clientIds: string[],
): Promise<{ ok: true; clients: ArchivedClient[]; authFailures: string[] } | Extract<ClientArchiveResult, { ok: false }>> {
  const ids = [...new Set(clientIds)]
  if (ids.length === 0) return { ok: true, clients: [], authFailures: [] }

  // Resolve the complete scoped set before mutating. A partial bulk archive is especially
  // confusing when a coach has standalone and Team pools with overlapping names; fail closed
  // instead of reporting a misleading partial success for IDs outside the selected workspace.
  const scopedQuery = applyArchiveScope(
    db.from('clients').select('id, full_name, email, is_archived, is_active').in('id', ids),
    actor,
  )
  const { data: scopedRows, error: scopedError } = await scopedQuery
  if (scopedError) return { ok: false, code: 'ARCHIVE_UPDATE_FAILED', error: 'No se pudieron validar los alumnos.' }
  if ((scopedRows?.length ?? 0) !== ids.length) {
    return { ok: false, code: 'CLIENT_NOT_FOUND', error: 'Uno o más alumnos no pertenecen a este workspace.' }
  }

  const rows = scopedRows ?? []
  const activeIds = rows.filter((client) => client.is_archived !== true).map((client) => client.id)
  if (activeIds.length > 0) {
    const archiveQuery = applyArchiveScope(
      db.from('clients').update({ is_archived: true }).in('id', activeIds).eq('is_archived', false),
      actor,
    )
    const { error } = await archiveQuery
    if (error) return { ok: false, code: 'ARCHIVE_UPDATE_FAILED', error: 'No se pudieron archivar los alumnos.' }
  }

  const clients = rows.map((row) => ({ ...toClient(row), isArchived: true }))
  const results = await Promise.all(clients.map(async (client) => ({
    id: client.id,
    ok: await syncAuthBan(db, client.id, true),
  })))
  return {
    ok: true,
    clients,
    authFailures: results.filter((result) => !result.ok).map((result) => result.id),
  }
}

/** Explicit pause/resume; archive state is never writable through a generic PATCH. */
export async function setClientAccessState(
  db: Db,
  actor: ClientArchiveActor,
  clientId: string,
  isActive: boolean,
): Promise<ClientArchiveResult> {
  const current = await findScopedClient(db, actor, clientId)
  if (!current) return { ok: false, code: 'CLIENT_NOT_FOUND', error: 'Alumno no encontrado.' }
  if (current.isArchived) {
    return { ok: false, code: 'CLIENT_ARCHIVED_READ_ONLY', error: 'Desarchiva al alumno antes de cambiar su acceso.' }
  }

  const query = applyArchiveScope(
    db.from('clients').update({ is_active: isActive }).eq('id', clientId),
    actor,
  )
  const { data, error } = await query
    .select('id, full_name, email, is_archived, is_active')
    .maybeSingle()
  if (error || !data) return { ok: false, code: 'ACCESS_UPDATE_FAILED', error: 'No se pudo actualizar el acceso.' }

  const synced = await syncAuthBan(db, clientId, !isActive)
  if (!synced) {
    if (isActive) {
      await applyArchiveScope(
        db.from('clients').update({ is_active: false }).eq('id', clientId),
        actor,
      )
    }
    return {
      ok: false,
      code: isActive ? 'AUTH_UNBAN_FAILED' : 'AUTH_BAN_FAILED',
      error: 'No pudimos sincronizar el acceso de Auth. Reintenta.',
    }
  }

  return { ok: true, client: toClient(data) }
}
