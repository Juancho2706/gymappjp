/**
 * Clasificación pura del corte V1 -> V2. No conoce Supabase ni la CLI para que
 * el gate pueda probarse sin credenciales y no confunda un V2 nativo con una
 * conversión trazable.
 */

export type CutoverWorkspace = 'standalone' | 'team' | 'enterprise' | 'archived' | 'unknown'

export type CutoverV1Plan = {
  id: string
  clientId: string
  coachId: string
  updatedAt: string
  workspace: CutoverWorkspace
}

export type CutoverConversionLink = {
  v1PlanId: string
  v2PlanId: string
  v2VersionId: string
  clientId: string
  coachId: string
  lastSyncedV1UpdatedAt: string
}

export type CutoverV2Plan = {
  id: string
  clientId: string
  coachId: string
  lifecycleStatus: 'active' | 'archived' | string
  currentPublishedVersionId: string | null
}

export type CutoverV2Version = {
  id: string
  planId: string
  status: 'draft' | 'published' | 'superseded' | 'archived' | string
}

export type CutoverBlocker =
  | 'missing_conversion_link'
  | 'link_identity_mismatch'
  | 'linked_v2_plan_missing'
  | 'linked_v2_plan_identity_mismatch'
  | 'linked_v2_plan_inactive'
  | 'linked_v2_current_version_missing'
  | 'linked_v2_version_missing'
  | 'linked_v2_version_plan_mismatch'
  | 'linked_v2_version_not_published'
  | 'v1_changed_after_conversion'
  | 'archived_client_has_active_v1'
  | 'unknown_client_workspace'

export type CutoverAssessment = {
  v1PlanId: string
  clientId: string
  coachId: string
  workspace: CutoverWorkspace
  status: 'verified' | 'blocked' | 'out_of_scope'
  blocker: CutoverBlocker | null
  detail: string | null
}

export type CutoverPreflight = {
  assessments: CutoverAssessment[]
  verifiedPlanIds: string[]
  blockerCount: number
  outOfScopeCount: number
}

function timestampAtOrBefore(left: string, right: string): boolean {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  // Unknown/malformed timestamps are never safe enough for an irreversible cutover.
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime <= rightTime
}

function blocked(plan: CutoverV1Plan, blocker: CutoverBlocker, detail: string): CutoverAssessment {
  return {
    v1PlanId: plan.id,
    clientId: plan.clientId,
    coachId: plan.coachId,
    workspace: plan.workspace,
    status: 'blocked',
    blocker,
    detail,
  }
}

/**
 * Verifica que cada V1 activo de standalone/Team tenga una conversión V2 vigente y trazable.
 * Enterprise queda explícitamente fuera de este corte; una fila V1 activa de un archivado es
 * una violación de la invariante de archivado y sí bloquea el corte.
 */
export function evaluateNutritionV2Cutover(input: {
  activeV1Plans: readonly CutoverV1Plan[]
  links: readonly CutoverConversionLink[]
  v2Plans: readonly CutoverV2Plan[]
  v2Versions: readonly CutoverV2Version[]
}): CutoverPreflight {
  const linkByV1 = new Map(input.links.map((link) => [link.v1PlanId, link]))
  const v2PlanById = new Map(input.v2Plans.map((plan) => [plan.id, plan]))
  const v2VersionById = new Map(input.v2Versions.map((version) => [version.id, version]))

  const assessments = input.activeV1Plans
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((plan): CutoverAssessment => {
      if (plan.workspace === 'enterprise') {
        return {
          v1PlanId: plan.id,
          clientId: plan.clientId,
          coachId: plan.coachId,
          workspace: plan.workspace,
          status: 'out_of_scope',
          blocker: null,
          detail: 'Enterprise permanece aislado de Nutrition V2 en este corte.',
        }
      }
      if (plan.workspace === 'archived') {
        return blocked(plan, 'archived_client_has_active_v1', 'Un alumno archivado aún conserva un plan V1 activo.')
      }
      if (plan.workspace === 'unknown') {
        return blocked(plan, 'unknown_client_workspace', 'No se pudo clasificar el workspace del alumno.')
      }

      const link = linkByV1.get(plan.id)
      if (!link) return blocked(plan, 'missing_conversion_link', 'No existe enlace V1→V2 para este plan activo.')
      if (link.clientId !== plan.clientId || link.coachId !== plan.coachId) {
        return blocked(plan, 'link_identity_mismatch', 'El enlace de conversión no pertenece al mismo alumno y coach.')
      }

      const v2Plan = v2PlanById.get(link.v2PlanId)
      if (!v2Plan) return blocked(plan, 'linked_v2_plan_missing', 'El enlace apunta a un plan V2 inexistente.')
      if (v2Plan.clientId !== plan.clientId || v2Plan.coachId !== plan.coachId) {
        return blocked(plan, 'linked_v2_plan_identity_mismatch', 'El plan V2 enlazado no pertenece al mismo alumno y coach.')
      }
      if (v2Plan.lifecycleStatus !== 'active') {
        return blocked(plan, 'linked_v2_plan_inactive', 'El plan V2 enlazado no está activo.')
      }
      if (!v2Plan.currentPublishedVersionId) {
        return blocked(plan, 'linked_v2_current_version_missing', 'El plan V2 enlazado no tiene versión publicada vigente.')
      }

      const linkedVersion = v2VersionById.get(link.v2VersionId)
      if (!linkedVersion) return blocked(plan, 'linked_v2_version_missing', 'El enlace apunta a una versión V2 inexistente.')
      if (linkedVersion.planId !== v2Plan.id) {
        return blocked(plan, 'linked_v2_version_plan_mismatch', 'La versión enlazada no pertenece al plan V2 enlazado.')
      }
      // Una edición posterior V2 deja la versión de conversión como superseded: sigue siendo
      // trazable mientras el plan conserve una versión vigente publicada.
      if (linkedVersion.status !== 'published' && linkedVersion.status !== 'superseded') {
        return blocked(plan, 'linked_v2_version_not_published', 'La versión enlazada nunca fue publicada.')
      }
      if (!timestampAtOrBefore(plan.updatedAt, link.lastSyncedV1UpdatedAt)) {
        return blocked(plan, 'v1_changed_after_conversion', 'El plan V1 cambió después de su última sincronización V2.')
      }

      return {
        v1PlanId: plan.id,
        clientId: plan.clientId,
        coachId: plan.coachId,
        workspace: plan.workspace,
        status: 'verified',
        blocker: null,
        detail: null,
      }
    })

  const verifiedPlanIds = assessments
    .filter((assessment) => assessment.status === 'verified')
    .map((assessment) => assessment.v1PlanId)

  return {
    assessments,
    verifiedPlanIds,
    blockerCount: assessments.filter((assessment) => assessment.status === 'blocked').length,
    outOfScopeCount: assessments.filter((assessment) => assessment.status === 'out_of_scope').length,
  }
}
