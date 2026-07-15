import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getNutritionPlansPageCoach } from '../../../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
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
    ? { id: existing.id, versionNumber: existing.versionNumber, strategy: existing.strategy }
    : null

  return (
    <NutritionPageShell
      eyebrow={existingPlan ? 'Nueva version del plan' : 'Nuevo plan V2'}
      title={detail.client.fullName}
      description="Define la estrategia, las metas y (si aplica) las franjas prescritas. Al publicar, el plan queda vigente para el alumno."
      actions={
        <Link
          href={`/coach/nutrition-v2/${clientId}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la ficha
        </Link>
      }
    >
      <PlanBuilderClient clientId={clientId} existingPlan={existingPlan} today={today} />
    </NutritionPageShell>
  )
}
