import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../../_components/PlanBuilder'
import { getCoachTemplateById } from '../../_data/nutrition-coach.queries'
import { mapTemplateRowToInitialData } from '../../_data/plan-builder-mappers'
import { getEditNutritionTemplateUser } from './_data/edit-template.queries'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

interface Props {
  params: Promise<{ templateId: string }>
}

export default async function EditNutritionTemplatePage({ params }: Props) {
  const { templateId } = await params
  const user = await getEditNutritionTemplateUser()
  if (!user) redirect('/login')

  // Resolve workspace so org-scoped coach can only edit their org's templates
  const supabase = await createClient()
  const workspace = await resolvePreferredWorkspace(supabase, user.id)
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

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
      <PlanBuilder mode="template" coachId={user.id} initialData={initialData} />
    </div>
  )
}
