import 'server-only'

import type { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'

/**
 * Contexto autorizado de la superficie coach en mobile. Centraliza la validación del workspace
 * declarado y del alumno de la ruta para que un coach que también es alumno nunca mezcle pools.
 * Enterprise no produce un scope V2; las RPC scoped/RLS siguen siendo la barrera de datos.
 */
type Admin = ReturnType<typeof createServiceRoleClient>

export type MobileCoachNutritionContext = {
  coachId: string
  clientId: string | null
  teamId: string | null
  orgId: string | null
}

export type MobileCoachNutritionContextResult =
  | { ok: true; context: MobileCoachNutritionContext }
  | { ok: false; code: 'WORKSPACE_NOT_ALLOWED' }

function scopeIds(scope: NutritionV2CoachScope): { teamId: string | null; orgId: string | null } {
  if (scope.scopeType === 'team') return { teamId: scope.teamId, orgId: null }
  return { teamId: null, orgId: null }
}

/** Verifica pertenencia activa al Team declarado; standalone pertenece al coach autenticado. */
export async function coachBelongsToWorkspace(
  admin: Admin,
  userId: string,
  scope: NutritionV2CoachScope,
): Promise<boolean> {
  if (scope.scopeType === 'standalone') return true
  if (scope.scopeType !== 'team' || !scope.teamId) return false

  const [{ data: membership }, { data: team }] = await Promise.all([
    admin
      .from('team_members')
      .select('id')
      .eq('team_id', scope.teamId)
      .eq('coach_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('teams')
      .select('id')
      .eq('id', scope.teamId)
      .is('deleted_at', null)
      .is('suspended_at', null)
      .maybeSingle(),
  ])
  return Boolean(membership && team)
}

/** Confirma que el alumno pertenece al pool standalone/Team previamente resuelto. */
export async function coachWorkspaceOwnsClient(
  admin: Admin,
  scope: { teamId: string | null; orgId: string | null },
  userId: string,
  clientId: string,
): Promise<boolean> {
  if (scope.teamId) {
    const { data } = await admin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('team_id', scope.teamId)
      .is('org_id', null)
      .maybeSingle()
    return Boolean(data)
  }

  const { data } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('coach_id', userId)
    .is('org_id', null)
    .is('team_id', null)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Deriva el contexto de una request móvil sin tomar identidad ni scopes desde el body. Un alumno
 * ajeno/inexistente queda fuera del contexto para que la ruta responda con su error de scope.
 */
export async function resolveMobileCoachNutritionContext(
  admin: Admin,
  userId: string,
  scope: NutritionV2CoachScope,
  requestedClientId: string | null,
): Promise<MobileCoachNutritionContextResult> {
  const { teamId, orgId } = scopeIds(scope)
  if (!(await coachBelongsToWorkspace(admin, userId, scope))) {
    return { ok: false, code: 'WORKSPACE_NOT_ALLOWED' }
  }

  const workspaceClientId =
    requestedClientId && (await coachWorkspaceOwnsClient(admin, { teamId, orgId }, userId, requestedClientId))
      ? requestedClientId
      : null

  return { ok: true, context: { coachId: userId, clientId: workspaceClientId, teamId, orgId } }
}
