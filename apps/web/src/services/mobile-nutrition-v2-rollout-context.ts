import 'server-only'

import type { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'

/**
 * Contexto de rollout de la superficie COACH en mobile (NUT-013).
 *
 * Problema que cierra: `config/route.ts` (el que enciende el flag en la app) resolvia el
 * rollout con el workspace declarado + el alumno validado, mientras que el gate de la API
 * (`api/mobile/nutrition-v2/_shared.ts`) lo resolvia con `teamId/orgId/clientId` en null —
 * y, peor, con los ids de la fila `clients` del PROPIO coach cuando ese usuario tambien es
 * alumno de alguien. Resultado: un canary por Team/alumno prendia la UI y la API respondia
 * 404, y un coach-que-es-alumno se evaluaba contra un workspace que no estaba operando.
 *
 * Este modulo es la UNICA fuente de ese contexto: lo consumen `config/route.ts`,
 * `nutrition-v2/_shared.ts` (lecturas) y `nutrition-v2/coach/mutate` (escrituras), asi la
 * UI y la API no pueden volver a divergir.
 *
 * Fail-closed: la pertenencia del coach al team/org declarado se VALIDA server-side antes de
 * tocar Edge Config (workspace ajeno => WORKSPACE_NOT_ALLOWED, jamas una decision de rollout);
 * el `clientId` del canary por alumno solo viaja si el workspace lo posee. Nada de esto
 * autoriza datos: las RPC scoped y la RLS siguen siendo la barrera real.
 */

type Admin = ReturnType<typeof createServiceRoleClient>

export type MobileCoachRolloutContext = {
  coachId: string
  clientId: string | null
  teamId: string | null
  orgId: string | null
}

export type MobileCoachRolloutContextResult =
  | { ok: true; context: MobileCoachRolloutContext }
  | { ok: false; code: 'WORKSPACE_NOT_ALLOWED' }

/** Ids de scope derivados del `scopeType` declarado (invariantes ya validadas por el schema). */
function scopeIds(scope: NutritionV2CoachScope): { teamId: string | null; orgId: string | null } {
  if (scope.scopeType === 'team') return { teamId: scope.teamId, orgId: null }
  if (scope.scopeType === 'organization') return { teamId: null, orgId: scope.orgId }
  return { teamId: null, orgId: null }
}

/**
 * ¿El coach pertenece REALMENTE al workspace que declaro? Espejo de `resolveExplicitScope`
 * (`api/mobile/coach/clients/_mutation-auth.ts`) acotado a lo que el rollout necesita:
 * membresia activa de team (equipo vivo, no suspendido) u organizacion (rol coach activo).
 * `standalone` no tiene nada que validar mas alla de la fila `coaches`, que el gate ya exigio.
 */
export async function coachBelongsToWorkspace(
  admin: Admin,
  userId: string,
  scope: NutritionV2CoachScope,
): Promise<boolean> {
  if (scope.scopeType === 'standalone') return true

  if (scope.scopeType === 'team') {
    if (!scope.teamId) return false
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

  if (!scope.orgId) return false
  const { data: membership } = await admin
    .from('organization_members')
    .select('id')
    .eq('org_id', scope.orgId)
    .eq('user_id', userId)
    .eq('coach_id', userId)
    .eq('role', 'coach')
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  return Boolean(membership)
}

/**
 * ¿El alumno `clientId` pertenece al workspace coach ya resuelto? Espeja `mobileContextOwnsClient`:
 * standalone/team por columna de scope, enterprise por asignacion activa. Solo decide si el canary
 * por alumno (allowlist por alumno) puede alcanzar la ficha/constructor del coach en mobile — y, en
 * el endpoint de mutaciones, sirve ademas de pre-chequeo amable antes de la RLS.
 */
export async function coachWorkspaceOwnsClient(
  admin: Admin,
  scope: { teamId: string | null; orgId: string | null },
  userId: string,
  clientId: string,
): Promise<boolean> {
  if (scope.orgId) {
    const [{ data: client }, { data: assignment }] = await Promise.all([
      admin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('org_id', scope.orgId)
        .is('team_id', null)
        .maybeSingle(),
      admin
        .from('coach_client_assignments')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('client_id', clientId)
        .eq('coach_id', userId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])
    return Boolean(client && assignment)
  }
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
 * Contexto de rollout coach, listo para `resolveNutritionV2RolloutDecision`.
 *
 * - `coachId` sale SIEMPRE del usuario autenticado (nunca del cable).
 * - `teamId/orgId` salen del workspace declarado, previa validacion de pertenencia
 *   (403 `WORKSPACE_NOT_ALLOWED` si no pertenece; no se consulta Edge Config).
 * - `clientId` viaja solo si el workspace posee al alumno; un id ajeno/inexistente se IGNORA
 *   (se evalua el canary global del coach) en vez de fallar: el canary por alumno es una
 *   ampliacion, no una restriccion.
 * - La fila `clients` del propio usuario NO participa: un coach que ademas es alumno de otro
 *   coach ya no contamina su decision de rollout con ese team/org.
 *
 * `membershipVerified` lo usa `config/route.ts`, que ya resolvio la pertenencia con
 * `resolveMobileClientMutationContext`: evita repetir las mismas consultas sin desviarse del
 * orden ni del resultado de este helper.
 */
export async function resolveMobileCoachRolloutContext(
  admin: Admin,
  userId: string,
  scope: NutritionV2CoachScope,
  requestedClientId: string | null,
  options: { membershipVerified?: boolean } = {},
): Promise<MobileCoachRolloutContextResult> {
  const { teamId, orgId } = scopeIds(scope)

  if (!options.membershipVerified) {
    const belongs = await coachBelongsToWorkspace(admin, userId, scope)
    if (!belongs) return { ok: false, code: 'WORKSPACE_NOT_ALLOWED' }
  }

  const canaryClientId =
    requestedClientId && (await coachWorkspaceOwnsClient(admin, { teamId, orgId }, userId, requestedClientId))
      ? requestedClientId
      : null

  return { ok: true, context: { coachId: userId, clientId: canaryClientId, teamId, orgId } }
}
