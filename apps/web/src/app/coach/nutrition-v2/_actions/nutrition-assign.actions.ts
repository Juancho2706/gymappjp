'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  hasNutritionProV2,
  requiredNutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  authorizeCoach,
  fail,
  persistAndPublishDraft,
  resolveActiveClientPlanId,
  zodFields,
  type ActionFailure,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import {
  MAX_ASSIGN_TARGETS,
  aggregateAssignResults,
  assignmentKeyForClient,
  buildDraftForTarget,
  validateAssignTargets,
  type AssignClientResult,
  type AssignSummary,
} from '@/app/coach/nutrition-v2/_lib/assign-plan'

// Server action "Asignar este plan a otros alumnos" (web coach). Carga la estructura del plan
// FUENTE (read model del detalle, scoped), re-checa el gate Pro sobre el draft resultante y,
// por CADA alumno destino, persiste + publica con clave de idempotencia estable. Reporte parcial:
// continua con los demas si uno falla. La RLS (publish_nutrition_plan_v2 / can_manage) es la
// barrera real por alumno; aca cortamos temprano con validaciones amables.

const AssignInputSchema = z.object({
  sourceClientId: z.string().uuid(),
  sourcePlanVersion: z.number().int().positive().optional(),
  targetClientIds: z.array(z.string().uuid()).min(1).max(MAX_ASSIGN_TARGETS),
  effectiveFrom: z.string().date(),
  operationId: z.string().trim().min(8).max(200),
})

export type AssignPlanActionResult =
  | { ok: true; results: AssignClientResult[]; summary: AssignSummary }
  | ActionFailure

export async function assignPlanToClientsAction(input: unknown): Promise<AssignPlanActionResult> {
  const parsed = AssignInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'La asignacion tiene datos invalidos.', zodFields(parsed.error))
  }
  const { sourceClientId, sourcePlanVersion, targetClientIds, effectiveFrom, operationId } = parsed.data

  // Validacion pura de la seleccion (vacia / duplicados / fuente incluida / tope).
  const targetsCheck = validateAssignTargets(sourceClientId, targetClientIds)
  if (!targetsCheck.ok) return fail(targetsCheck.code, targetsCheck.error)
  const targets = targetsCheck.targets

  // Gate + scope del coach (re-verifica rollout/webCoach sobre el alumno fuente).
  const auth = await authorizeCoach(sourceClientId)
  if (!auth.ok) return auth
  const { db, userId } = auth

  // Carga la estructura del plan fuente (scoped: el RPC niega 42501 fuera del pool).
  const scope = nutritionV2CoachScopeFromWorkspace(auth.workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId: sourceClientId, scope, date: today })
  const source = detail.plan

  if (!source.plan) {
    return fail('SOURCE_NO_PLAN', 'El alumno de origen no tiene un plan V2 vigente para copiar.')
  }
  // Guarda anti-stale: si la UI pidio una version puntual, exige que sea la vigente cargada.
  if (sourcePlanVersion !== undefined && source.plan.versionNumber !== sourcePlanVersion) {
    return fail('SOURCE_VERSION_MISMATCH', 'El plan de origen cambio. Vuelve a abrir el dialogo e intenta de nuevo.')
  }

  // Gate comercial del addon Nutricion Pro sobre el draft RESULTANTE (mismo para todos los
  // destinos): estrategia hibrida o multiples variantes exigen el addon. Se checa UNA vez.
  const probe = buildDraftForTarget({ source, targetClientId: targets[0], effectiveFrom })
  if (!probe.ok) return fail('SOURCE_NO_PLAN', probe.error)
  const proFeature = requiredNutritionProFeature(probe.draft)
  if (proFeature) {
    const proEnabled = await hasNutritionProV2(db as unknown as SupabaseClient, auth.proCtx)
    if (!proEnabled) {
      return {
        ok: false,
        code: 'UPGRADE_REQUIRED',
        feature: proFeature,
        error: `Activa Nutricion Pro para asignar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
      }
    }
  }

  // Publicacion por alumno destino (reporte parcial: no aborta al primer fallo).
  const results: AssignClientResult[] = []
  for (const targetClientId of targets) {
    const planIdRes = await resolveActiveClientPlanId(db, targetClientId)
    if (!planIdRes.ok) {
      results.push({ clientId: targetClientId, ok: false, error: planIdRes.error })
      continue
    }

    const built = buildDraftForTarget({
      source,
      targetClientId,
      effectiveFrom,
      planId: planIdRes.planId,
    })
    if (!built.ok) {
      results.push({ clientId: targetClientId, ok: false, error: built.error })
      continue
    }

    // Barrera server-side: el draft copiado se re-valida contra el contrato antes de escribir.
    const validated = NutritionPlanDraftSchema.safeParse(built.draft)
    if (!validated.success) {
      results.push({ clientId: targetClientId, ok: false, error: 'El plan copiado quedo invalido para este alumno.' })
      continue
    }

    const idempotencyKey = assignmentKeyForClient({ operationId, targetClientId })
    const publishRes = await persistAndPublishDraft({
      db,
      userId,
      draft: validated.data,
      idempotencyKey,
      effectiveFrom,
    })
    if (publishRes.ok) {
      results.push({ clientId: targetClientId, ok: true, versionId: publishRes.versionId })
      revalidatePath('/coach/nutrition-v2/' + targetClientId)
    } else {
      results.push({ clientId: targetClientId, ok: false, error: publishRes.error })
    }
  }

  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + sourceClientId)
  return { ok: true, results, summary: aggregateAssignResults(results) }
}
