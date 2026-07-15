import type { NutritionV2CoachScope } from '@eva/nutrition-v2'

/**
 * nutrition-v2-scope — logica PURA (sin react-native / supabase) para colapsar el workspace coach
 * activo al contrato de lectura profesional scoped. Es el nucleo testeable que consumen la API RN
 * (`nutrition-v2.api.ts`) y las pantallas coach de Nutricion V2; la glue de red vive en la API.
 */

/**
 * Workspace coach activo tal como lo modela la app (`useWorkspace()` / `ClientActionWorkspace`).
 * El enum `kind` colapsa al scope de lectura profesional (`standalone` | `team` | `organization`).
 */
export type NutritionV2WorkspaceInput = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
}

/**
 * Colapsa el workspace coach al contrato scoped. Fail-closed: devuelve `null` (jamas un fallback
 * "sin scope") cuando el workspace es irreconocible o a un scope team/org le falta su id, para que
 * el caller bloquee el fetch en vez de filtrar otro pool. El RPC del servidor revalida igual.
 */
export function nutritionV2CoachScope(
  workspace: NutritionV2WorkspaceInput,
): NutritionV2CoachScope | null {
  switch (workspace.kind) {
    case 'standalone':
      return { scopeType: 'standalone', teamId: null, orgId: null }
    case 'team_owner':
    case 'team_member':
      return workspace.teamId ? { scopeType: 'team', teamId: workspace.teamId, orgId: null } : null
    case 'enterprise':
      return workspace.orgId ? { scopeType: 'organization', teamId: null, orgId: workspace.orgId } : null
    default:
      return null
  }
}

/**
 * Segmento estable de cache-key para un scope. Dos workspaces del mismo coach NO deben compartir una
 * entrada de cache local, asi que este segmento se pliega en cada `scopeKey` de lecturas coach.
 */
export function nutritionV2CoachScopeCacheKey(scope: NutritionV2CoachScope): string {
  return `${scope.scopeType}:${scope.teamId ?? '-'}:${scope.orgId ?? '-'}`
}
