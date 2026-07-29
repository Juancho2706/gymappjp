import { redirect } from 'next/navigation'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getNutritionPlansPageCoach } from '../../../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { createClient } from '@/lib/supabase/server'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { fetchItemSubstitutionsForVersion } from '@/app/coach/nutrition-v2/_data/item-substitutions.data'
import { fetchBuilderFoodsByIds } from './_data/plan-foods.data'
import { collectPlanFoodIds, rehydrateBuilderState } from './_lib/rehydrate'
import { portionsKey } from './_components/portions-state'
import { PlanBuilderClient } from './_components/PlanBuilderClient'

interface Props {
  params: Promise<{ clientId: string }>
}

type PlanReadModel = Awaited<ReturnType<typeof getNutritionClientDetailV2ForWeb>>['plan']

/**
 * Arma el estado inicial del wizard desde el plan vigente. Devuelve `null` cuando alguna
 * lectura auxiliar falla: preferimos el guard anti-colapso a rehidratar a medias (publicar
 * reescribe el arbol completo, asi que un dato faltante seria una perdida silenciosa).
 */
async function buildInitialDraft(planModel: PlanReadModel, versionId: string, today: string) {
  const substitutionsLoad = await fetchItemSubstitutionsForVersion(versionId)
  if (!substitutionsLoad.ok) return null

  const foodsLoad = await fetchBuilderFoodsByIds(collectPlanFoodIds(planModel, substitutionsLoad.rows))
  if (!foodsLoad.ok) return null

  const substitutionsByItemId: Record<string, typeof substitutionsLoad.rows> = {}
  for (const row of substitutionsLoad.rows) {
    const list = substitutionsByItemId[row.prescriptionItemId] ?? []
    list.push(row)
    substitutionsByItemId[row.prescriptionItemId] = list
  }

  return rehydrateBuilderState({
    planModel,
    foods: foodsLoad.foods,
    substitutionsByItemId,
    // Version nueva: arranca vigente hoy (igual que un wizard en blanco).
    effectiveFrom: today,
    portionKeyOf: portionsKey,
  })
}

export default async function CoachNutritionV2BuilderPage({ params }: Props) {
  const { clientId } = await params
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    clientId,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) redirect('/coach/nutrition-plans')

  // Propagate the active workspace: the scoped RPC denies (42501) a client outside this pool.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })
  const existing = detail.plan.plan
  const existingPlan = existing
    ? {
        id: existing.id,
        // Id de la version vigente: viaja al wizard para el compare-and-swap del publish
        // (NUT-011). Si alguien publica entremedio, el RPC responde STALE_BASE.
        versionId: existing.versionId,
        versionNumber: existing.versionNumber,
        strategy: existing.strategy,
        effectiveFrom: existing.effectiveFrom,
        name: existing.name,
        // Cuántos días tiene el plan vigente. Con la rehidratación viva (abajo) el wizard los
        // edita todos; este número solo alimenta el guard de respaldo cuando la rehidratación
        // falla y publicar en blanco los borraría.
        dayVariantCount: detail.plan.dayVariants.length,
      }
    : null

  // REHIDRATACIÓN del plan vigente (FD1c): "Rehacer con el asistente" abre el wizard con los
  // N días, franjas, items, reemplazos y porciones del plan — publicar sin tocar nada produce
  // el MISMO plan. Dos lecturas auxiliares fuera del read-model hot-path:
  //  - reemplazos autorizados congelados (no viajan en el read-model),
  //  - alimentos del catálogo (el read-model trae macros congeladas, no las del alimento).
  // Cualquiera de las dos en `ok:false` ⇒ NO rehidratamos (initialDraft null): la UI cae al
  // guard anti-colapso en vez de abrir un wizard con datos mutilados.
  let initialDraft: Awaited<ReturnType<typeof buildInitialDraft>> = null
  if (existing) {
    initialDraft = await buildInitialDraft(detail.plan, existing.versionId, today)
  }

  // Espejo UI del addon Nutricion Pro: candado en "Personalizar {dia}" (dias con contenido propio)
  // y en el checkbox de registro libre sobre planes con franjas. La barrera real vive en
  // publishPlanAction (re-valida server-side y responde UPGRADE_REQUIRED).
  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )

  return (
    // Header compacto (backHref): flecha de vuelta + nombre del alumno en una sola fila.
    // La flecha reemplaza al boton "Volver a la ficha" (misma ruta), asi el header movil no
    // apila pills antes del titulo. Eyebrow corto para que el pill no aplaste el titulo en 390px.
    <NutritionPageShell
      flushMobile
      backHref={`/coach/nutrition-v2/${clientId}`}
      eyebrow={existingPlan ? 'Nueva versión' : 'Nuevo plan'}
      title={detail.client.fullName}
      description="El plan y sus días, en dos pasos"
    >
      <PlanBuilderClient
        clientId={clientId}
        existingPlan={existingPlan}
        initialDraft={initialDraft}
        today={today}
        nutritionProEnabled={nutritionProEnabled}
      />
    </NutritionPageShell>
  )
}
