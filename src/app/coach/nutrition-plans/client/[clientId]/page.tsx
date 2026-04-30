import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../../_components/PlanBuilder'
import { getClientNutritionPlan, getClientAdherence } from '../../_data/nutrition-coach.queries'
import { mapClientPlanRowToInitialData } from '../../_data/plan-builder-mappers'
import { AdherenceStrip } from '@/app/c/[coach_slug]/nutrition/_components/AdherenceStrip'

interface Props {
  params: Promise<{ clientId: string }>
}

export default async function CoachClientNutritionPlanPage({ params }: Props) {
  const { clientId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: client }, { data: intake }] = await Promise.all([
    supabase.from('clients').select('id, full_name, coach_id').eq('id', clientId).maybeSingle(),
    supabase.from('client_intake').select('weight_kg, height_cm').eq('client_id', clientId).maybeSingle(),
  ])

  if (!client || client.coach_id !== user.id) notFound()

  const plan = await getClientNutritionPlan(clientId, user.id)
  const initialData = plan ? mapClientPlanRowToInitialData(plan) : null

  const adherence =
    plan?.id && plan.nutrition_meals?.length
      ? await getClientAdherence(clientId, plan.id)
      : []
  const planMealsStrip =
    plan?.nutrition_meals?.map((m) => ({
      id: m.id as string,
      day_of_week: (m as { day_of_week?: number | null }).day_of_week ?? null,
    })) ?? []

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
          <h1 className="text-2xl font-black tracking-tight">Plan nutricional</h1>
          <p className="text-xs text-muted-foreground font-medium">{client.full_name}</p>
        </div>
        <Link
          href={`/coach/clients/${clientId}`}
          className="ml-auto text-xs font-semibold text-[color:var(--theme-primary)]"
        >
          Ver perfil →
        </Link>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 w-full">
          <PlanBuilder
            mode="client-plan"
            coachId={user.id}
            clientId={clientId}
            initialData={initialData}
            clientProfile={intake ? { weight_kg: intake.weight_kg, height_cm: intake.height_cm } : null}
          />
        </div>
        {adherence.length > 0 && planMealsStrip.length > 0 && (
          <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-24 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Alumno — 30 días</p>
            <div className="bg-card border border-border rounded-2xl p-4">
              <AdherenceStrip data={adherence} planMeals={planMealsStrip} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
