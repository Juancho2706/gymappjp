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
import { PlanBuilderClient } from './_components/PlanBuilderClient'

interface Props {
  params: Promise<{ clientId: string }>
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
        versionNumber: existing.versionNumber,
        strategy: existing.strategy,
        effectiveFrom: existing.effectiveFrom,
        name: existing.name,
      }
    : null

  // Espejo UI del addon Nutricion Pro: marca/deshabilita las opciones Pro (estrategia hibrida)
  // en el wizard. La barrera real vive en publishPlanAction (re-valida server-side).
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
      backHref={`/coach/nutrition-v2/${clientId}`}
      eyebrow={existingPlan ? 'Nueva versión' : 'Nuevo plan'}
      title={detail.client.fullName}
      description="Estrategia, metas y publicación del plan"
    >
      <PlanBuilderClient
        clientId={clientId}
        existingPlan={existingPlan}
        today={today}
        nutritionProEnabled={nutritionProEnabled}
      />
    </NutritionPageShell>
  )
}
