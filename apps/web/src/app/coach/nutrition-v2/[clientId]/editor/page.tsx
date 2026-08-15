import { redirect } from 'next/navigation'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { createClient } from '@/lib/supabase/server'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  fetchItemSubstitutionsForVersion,
  type ItemSubstitutionsLoad,
} from '../../_data/item-substitutions.data'
import {
  EMPTY_CLIENT_FOOD_PREFS,
  fetchClientFoodPrefsForPicker,
} from '../../_data/client-food-prefs.data'
import { EditorClient } from './EditorClient'

/**
 * EDITOR UNICO de nutricion (T3.x, W1) — ruta propia, SIN CTA publica todavia: se llega solo
 * por URL directa mientras dura el QA de la tanda (el corte de la CTA de la ficha es W4).
 *
 * W1 = modo EDICION del plan vigente con metadatos editables (`editPlanMeta`): mismo arbol,
 * provider y publish CAS del quick-edit (una sola gramatica, ver SPEC de
 * `docs/specs/nutrition-unified-editor/`). Sin plan vigente todavia no hay editor: la
 * creacion (hidratacion `?from=`) es la siguiente tanda y hasta entonces manda el wizard.
 *
 * Mismo perimetro fail-closed que la ficha: sesion coach + workspace no-enterprise + scope V2
 * del workspace (el RPC de lectura deniega 42501 fuera del pool) + entitlement Pro resuelto
 * server-side solo como afordancia.
 */
export default async function NutritionUnifiedEditorPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })

  // Sin plan vigente no hay que editar: crear sigue siendo del wizard hasta la tanda de
  // hidratacion `?from=` (W1.5/W2 del PLAN).
  if (detail.plan.plan === null) redirect(`/coach/nutrition-v2/${clientId}/builder`)

  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )

  // Carry-over F-02 + NUT-008: identico a la ficha — un fallo de lectura NO degrada a [],
  // viaja como flag y el provider bloquea "Publicar" (republicar borraria los reemplazos).
  const substitutionsLoad: ItemSubstitutionsLoad = await fetchItemSubstitutionsForVersion(
    detail.plan.plan?.versionId,
  )
  const itemSubstitutions = substitutionsLoad.ok ? substitutionsLoad.rows : []
  const substitutionsLoadFailed = !substitutionsLoad.ok

  // Señales dietarias del alumno para el picker (fail-soft: ayudas visuales, no autorizacion).
  const foodPrefs = await fetchClientFoodPrefsForPicker(clientId).catch(() => EMPTY_CLIENT_FOOD_PREFS)

  return (
    <EditorClient
      clientId={clientId}
      clientName={detail.client.fullName}
      planModel={detail.plan}
      itemSubstitutions={itemSubstitutions}
      substitutionsLoadFailed={substitutionsLoadFailed}
      today={today}
      hasNutritionPro={nutritionProEnabled}
      viewerCoachId={user.id}
      foodRestrictions={foodPrefs.restrictions}
      favoriteFoodIds={foodPrefs.favoriteIds}
    />
  )
}
