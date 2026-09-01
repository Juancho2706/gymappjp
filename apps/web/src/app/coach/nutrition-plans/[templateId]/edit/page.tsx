import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../../_components/PlanBuilder'
import { getCoachTemplateById } from '../../_data/nutrition-coach.queries'
import { mapTemplateRowToInitialData } from '../../_data/plan-builder-mappers'
import { getEditNutritionTemplateUser } from './_data/edit-template.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  assertDomainEnabled,
  resolveFeaturePrefs,
} from '@/services/feature-prefs.service'
import { shouldSwapCockpitToNutritionV2 } from '../../_lib/nutrition-v2-swap'

interface Props {
  params: Promise<{ templateId: string }>
}

export default async function EditNutritionTemplatePage({ params }: Props) {
  const { templateId } = await params
  const user = await getEditNutritionTemplateUser()
  if (!user) redirect('/login')

  // Sellado V1: standalone y Team no editan plantillas legacy (las plantillas V1 no existen en
  // V2, así que no hay destino equivalente por id) — van al Centro V2. Enterprise sigue igual.
  if (await shouldSwapCockpitToNutritionV2(user.id)) {
    redirect('/coach/nutrition-v2')
  }

  // Resolve workspace so org-scoped coach can only edit their org's templates
  const workspace = await getPreferredWorkspaceForRender(user.id)
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null

  // Gate de dominio (Ola de orden W1) + flags de seccion Pro (fail-OPEN sin fila). Dominio OFF =>
  // `assertDomainEnabled` redirige y el builder no se construye (atrapa refresh/visita directa).
  // Esto es visibilidad, nunca autorización: render-only, no borra datos. El rechazo del
  // `redirect()` se propaga por el `Promise.all`, así que no perdemos el paralelismo.
  const [, sectionFlags] = await Promise.all([
    assertDomainEnabled('nutrition', {
      coachId: user.id,
      clientTeamId: teamId,
      clientOrgId: orgId,
    }),
    resolveFeaturePrefs({
      domain: 'nutrition',
      coachId: user.id,
      clientTeamId: teamId,
      clientOrgId: orgId,
    }),
  ])

  const row = await getCoachTemplateById(user.id, templateId, orgId)
  if (!row) notFound()

  const initialData = mapTemplateRowToInitialData(row)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <Link
          href="/coach/nutrition-plans"
          className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Editar plantilla</h1>
          <p className="text-xs text-muted-foreground font-medium truncate max-w-[70vw]">{initialData.name}</p>
        </div>
      </header>
      <PlanBuilder
        mode="template"
        coachId={user.id}
        initialData={initialData}
        sectionFlags={sectionFlags}
      />
    </div>
  )
}
