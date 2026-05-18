import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { NutritionHub } from './_components/NutritionHub'
import {
  getCoachTemplates,
  getActivePlansBoardData,
  getCoachClients,
  getFoodLibrary,
} from './_data/nutrition-coach.queries'
import { getTierCapabilities, getTierPriceClp, type SubscriptionTier } from '@/lib/constants'
import { Check, Salad } from 'lucide-react'
import { UpgradeGateTracker } from '@/components/analytics/UpgradeGateTracker'

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

  const tier = (coach?.subscription_tier ?? 'starter') as SubscriptionTier
  const capabilities = getTierCapabilities(tier)
  if (!capabilities.canUseNutrition) {
    const proMonthly = getTierPriceClp('pro', 'monthly')
    const proAnnualMonthly = Math.round(getTierPriceClp('pro', 'annual') / 12)

    return (
      <main className="mx-auto max-w-2xl px-4 py-10 animate-fade-in space-y-4">
        <UpgradeGateTracker gate="nutrition" currentTier={tier} />
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card p-6">
          <div className="relative z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/20 mb-4">
              <Salad className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground">Planes de nutrición</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
              Creá planes de alimentación personalizados para cada alumno. Seguimiento de macros y calorías — todo en EVA.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />
        </div>

        {/* Visual mockup */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 select-none pointer-events-none">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-2.5 w-32 rounded-full bg-emerald-500/40 mb-1.5" />
              <div className="h-1.5 w-20 rounded-full bg-muted" />
            </div>
            <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/20 px-3 py-1.5">
              <span className="text-xs font-bold text-emerald-400">1.690 kcal</span>
            </div>
          </div>

          {[
            { meal: 'Desayuno', time: '08:00', kcal: '520 kcal', w: 'w-28', done: true },
            { meal: 'Almuerzo', time: '13:00', kcal: '680 kcal', w: 'w-40', done: true },
            { meal: 'Merienda', time: '17:00', kcal: '210 kcal', w: 'w-20', done: false },
            { meal: 'Cena',     time: '20:00', kcal: '490 kcal', w: 'w-32', done: false },
          ].map(({ meal, time, kcal, w, done }) => (
            <div key={meal} className="flex items-center gap-3">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-border'}`}>
                {done && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground/70">{meal}</span>
                  <span className="text-[10px] text-muted-foreground/50">{time}</span>
                </div>
                <div className={`h-1.5 ${w} rounded-full ${done ? 'bg-emerald-500/35' : 'bg-muted'}`} />
              </div>
              <span className="text-[11px] text-muted-foreground/60 shrink-0">{kcal}</span>
            </div>
          ))}

          <div className="h-px bg-border" />
          <div className="grid grid-cols-3 gap-2">
            {[['P', '145g', 'bg-blue-500/10 border-blue-500/20 text-blue-400'], ['C', '210g', 'bg-amber-500/10 border-amber-500/20 text-amber-400'], ['G', '65g', 'bg-rose-500/10 border-rose-500/20 text-rose-400']] .map(([macro, val, cls]) => (
              <div key={macro} className={`rounded-lg border px-2 py-2 text-center ${cls}`}>
                <p className="text-[10px] font-bold">{macro}</p>
                <p className="text-xs font-semibold mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing + features + CTA */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponible en Pro</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1.5">
              <span className="text-2xl font-extrabold text-foreground">${proMonthly.toLocaleString('es-CL')}</span>
              <span className="text-sm text-muted-foreground">/mes</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-sm font-semibold text-emerald-400">${proAnnualMonthly.toLocaleString('es-CL')}/mes anual</span>
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">−20%</span>
            </div>
          </div>

          <ul className="space-y-2.5">
            {[
              'Planes de nutrición personalizados por alumno',
              'Seguimiento de macros y calorías diarias',
              'Plantillas reutilizables por objetivo',
              'Hasta 30 alumnos activos (3× más que Free)',
            ].map((feat) => (
              <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {feat}
              </li>
            ))}
          </ul>

          <Link
            href="/coach/subscription?upgrade=pro"
            className="flex h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
          >
            Desbloquear nutrición con Pro →
          </Link>
          <p className="text-center text-xs text-muted-foreground">Sin permanencia · Cancelá cuando quieras</p>
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
