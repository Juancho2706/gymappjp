import { createClient } from '@/lib/supabase/server'
import { NutritionHub } from './_components/NutritionHub'
import {
  getCoachTemplates,
  getActivePlansBoardData,
  getCoachClients,
  getFoodLibrary,
} from './_data/nutrition-coach.queries'

type NutritionPlanRow = { id: string; name: string; is_active: boolean | null }

export default async function NutritionPlansPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const coachId = user.id

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
