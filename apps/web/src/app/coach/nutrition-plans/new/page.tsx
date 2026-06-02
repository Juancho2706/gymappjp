import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../_components/PlanBuilder'
import { getNewNutritionTemplateUser } from './_data/new-template.queries'
import { getCoachOrgNutritionTemplates } from '../_data/nutrition-page.queries'
import { createClient } from '@/lib/supabase/server'
import type { PlanBuilderInitialData } from '../_components/PlanBuilder/types'

interface Props {
  searchParams: Promise<{ org_template?: string }>
}

export default async function NewNutritionTemplatePage({ searchParams }: Props) {
  const user = await getNewNutritionTemplateUser()
  if (!user) redirect('/login')

  const { org_template } = await searchParams

  let initialData: PlanBuilderInitialData | null = null

  if (org_template) {
    const supabase = await createClient()
    const { data: coach } = await supabase
      .from('coaches')
      .select('active_org_id')
      .eq('id', user.id)
      .maybeSingle()

    if (coach?.active_org_id) {
      const orgTemplates = await getCoachOrgNutritionTemplates(coach.active_org_id)
      const tpl = orgTemplates.find(t => t.id === org_template)
      if (tpl) {
        initialData = {
          name: tpl.name,
          daily_calories: tpl.daily_calories ?? 0,
          protein_g: tpl.protein_g ?? 0,
          carbs_g: tpl.carbs_g ?? 0,
          fats_g: tpl.fats_g ?? 0,
          instructions: tpl.instructions ?? '',
          meals: tpl.meal_names.map((m, idx) => ({
            id: `meal-${m.order_index}-${idx}`,
            name: m.name,
            notes: m.description ?? null,
            foodItems: [],
          })),
        }
      }
    }
  }

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
          <h1 className="text-2xl font-black tracking-tight">
            {initialData ? `Desde template: ${initialData.name}` : 'Nueva plantilla'}
          </h1>
          <p className="text-xs text-muted-foreground font-medium">
            {initialData ? 'Pre-llenado desde template de tu organización — personalizá a tu gusto' : 'Arrastrá comidas y ajustá macros con datos reales'}
          </p>
        </div>
      </header>
      <PlanBuilder mode="template" coachId={user.id} initialData={initialData} />
    </div>
  )
}
