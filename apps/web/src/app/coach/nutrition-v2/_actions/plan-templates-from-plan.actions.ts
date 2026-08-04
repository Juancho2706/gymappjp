'use server'

/**
 * "Guardar el plan de un alumno como plantilla" (F3).
 *
 * Vive aparte de `plan-templates.actions.ts` porque necesita el read-model del plan y las
 * utilidades del builder — imports pesados que no tienen por que entrar en la ruta de las
 * acciones simples de la biblioteca (renombrar, favorito, eliminar).
 *
 * Todo el armado es SERVER-SIDE: el cliente manda un `clientId` y un nombre, nada mas. El plan
 * se lee con el scope del workspace (el RPC niega 42501 un alumno de otro pool), se ensambla el
 * MISMO draft que produciria el wizard y se le quita la identidad antes de guardar.
 *
 * Se guarda tambien el estado del wizard (`builder`): conserva las macros de los items LIBRES,
 * que el contrato del draft no lleva, y hace que reutilizar devuelva el plan identico.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { createClient } from '@/lib/supabase/server'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { fetchItemSubstitutionsForVersion } from '@/app/coach/nutrition-v2/_data/item-substitutions.data'
import { fetchBuilderFoodsByIds } from '@/app/coach/nutrition-v2/[clientId]/builder/_data/plan-foods.data'
import {
  collectPlanFoodIds,
  rehydrateBuilderState,
} from '@/app/coach/nutrition-v2/[clientId]/builder/_lib/rehydrate'
import { assembleDraft } from '@/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder'
import {
  attachPortionsAndValidate,
  portionsKey,
  variantPortionKeys,
} from '@/app/coach/nutrition-v2/[clientId]/builder/_components/portions-state'
import { savePlanTemplate } from '@/services/nutrition-v2/plan-templates.service'

const InputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, 'Ponle un nombre a la plantilla').max(180),
  description: z.string().trim().max(2000).nullish(),
})

export type SaveTemplateFromPlanResult = { ok: true; templateId: string } | { ok: false; error: string }

export async function savePlanTemplateFromClientAction(input: unknown): Promise<SaveTemplateFromPlanResult> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }
  }

  const { user } = await getCurrentCoachSession()
  if (!user) return { ok: false, error: 'No autorizado.' }

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()

  let detail: Awaited<ReturnType<typeof getNutritionClientDetailV2ForWeb>>
  try {
    detail = await getNutritionClientDetailV2ForWeb({ clientId: parsed.data.clientId, scope, date: today })
  } catch {
    return { ok: false, error: 'No pudimos leer el plan de ese alumno.' }
  }

  const plan = detail.plan.plan
  if (!plan) return { ok: false, error: 'Ese alumno todavía no tiene un plan para guardar.' }

  // Mismo camino de rehidratación que el builder: si alguna lectura auxiliar falla NO se guarda
  // una plantilla a medias (publicar desde ella reescribiría el árbol completo).
  const substitutions = await fetchItemSubstitutionsForVersion(plan.versionId)
  if (!substitutions.ok) return { ok: false, error: 'No pudimos leer el plan completo. Intenta de nuevo.' }
  const foodsLoad = await fetchBuilderFoodsByIds(collectPlanFoodIds(detail.plan, substitutions.rows))
  if (!foodsLoad.ok) return { ok: false, error: 'No pudimos leer el plan completo. Intenta de nuevo.' }

  const substitutionsByItemId: Record<string, typeof substitutions.rows> = {}
  for (const row of substitutions.rows) {
    const list = substitutionsByItemId[row.prescriptionItemId] ?? []
    list.push(row)
    substitutionsByItemId[row.prescriptionItemId] = list
  }

  const rehydrated = rehydrateBuilderState({
    planModel: detail.plan,
    foods: foodsLoad.foods,
    substitutionsByItemId,
    effectiveFrom: today,
    portionKeyOf: portionsKey,
  })
  if (!rehydrated) return { ok: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }

  let draft
  try {
    draft = assembleDraft(rehydrated.state, { clientId: parsed.data.clientId, planId: null })
    draft = attachPortionsAndValidate(
      draft,
      variantPortionKeys(rehydrated.state.variants),
      rehydrated.portionsBySlot
    )
  } catch {
    return { ok: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }
  }

  const supabase = await createClient()
  const result = await savePlanTemplate(supabase as unknown as SupabaseClient<Database>, {
    actorCoachId: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    draft,
    builder: rehydrated,
    source: 'plan',
  })
  if (!result.success) return { ok: false, error: result.error }

  revalidatePath('/coach/nutrition-v2')
  return { ok: true, templateId: result.template.id }
}
