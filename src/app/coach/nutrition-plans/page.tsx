import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { NutritionHub } from './_components/NutritionHub'
import {
  getCoachTemplates,
  getActivePlansBoardData,
  getCoachClients,
  getFoodLibrary,
} from './_data/nutrition-coach.queries'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'

type NutritionPlanRow = { id: string; name: string; is_active: boolean | null }

export default async function NutritionPlansPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const coachId = user.id
  const { data: coach } = await supabase
    .from('coaches')
    .select('subscription_tier')
    .eq('id', coachId)
    .maybeSingle()

  const tier = (coach?.subscription_tier ?? 'starter_lite') as SubscriptionTier
  const capabilities = getTierCapabilities(tier)
  if (!capabilities.canUseNutrition) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-bold text-foreground">Nutrición disponible en planes superiores</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Tu plan actual no incluye el módulo de nutrición. Haz upgrade para desbloquear plantillas,
            asignación y seguimiento nutricional.
          </p>
          <Link
            href="/coach/subscription"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Ver planes y hacer upgrade
          </Link>
        </div>
      </main>
    )
  }

  const [templates, activePlans, coachClientsRaw, foodLib] = await Promise.all([
    getCoachTemplates(coachId),
    getActivePlansBoardData(coachId),
    getCoachClients(coachId),
    getFoodLibrary(coachId, { page: 0, pageSize: 120 }),
  ])

  const assignClients = coachClientsRaw.map((c) => {
    const plans = c.nutrition_plans as NutritionPlanRow[] | null | undefined
    const active = plans?.find((p) => p.is_active)
    return {
      id: c.id,
      full_name: c.full_name,
      active_plan: active ? { id: active.id, name: active.name } : undefined,
    }
  })

  const clientsWithoutPlan = coachClientsRaw
    .filter((c) => {
      const plans = c.nutrition_plans as NutritionPlanRow[] | null | undefined
      return !plans?.some((p) => p.is_active)
    })
    .map((c) => ({ id: c.id, full_name: c.full_name }))

  return (
    <NutritionHub
      coachId={coachId}
      templates={templates}
      activePlans={activePlans}
      assignClients={assignClients}
      clientsWithoutPlan={clientsWithoutPlan}
      foods={foodLib}
    />
  )
}
