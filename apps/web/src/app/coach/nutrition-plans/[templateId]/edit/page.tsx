import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../../_components/PlanBuilder'
import { getCoachTemplateById } from '../../_data/nutrition-coach.queries'
import { mapTemplateRowToInitialData } from '../../_data/plan-builder-mappers'
import { getEditNutritionTemplateUser } from './_data/edit-template.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  resolveFeaturePrefs,
  resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'

interface Props {
  params: Promise<{ templateId: string }>
}

export default async function EditNutritionTemplatePage({ params }: Props) {
  const { templateId } = await params
  const user = await getEditNutritionTemplateUser()
  if (!user) redirect('/login')

  // Resolve workspace so org-scoped coach can only edit their org's templates
  const workspace = await getPreferredWorkspaceForRender(user.id)
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null

  // Master switch del dominio + flags de seccion Pro (fail-OPEN con flag OFF). Dominio OFF =>
  // el builder no se construye (atrapa refresh/visita directa). Render-only: no borra datos.
  const [nutritionDomainEnabled, sectionFlags] = await Promise.all([
    resolveNutritionDomainEnabled({
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
  if (!nutritionDomainEnabled) redirect('/coach/dashboard')

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
