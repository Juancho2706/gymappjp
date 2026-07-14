import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpCircle, PieChart, Repeat, Users, Utensils } from 'lucide-react'
import { NutritionHub } from './_components/NutritionHub'
import {
  getCoachTemplates,
  getActivePlansBoardData,
  getCoachClients,
  getFoodLibrary,
} from './_data/nutrition-coach.queries'
import { getTierCapabilities, getTierPriceClp, type SubscriptionTier } from '@/lib/constants'
import { UpgradeGateTracker } from '@/components/analytics/UpgradeGateTracker'
import { getNutritionPlansPageCoach, getCoachOrgNutritionTemplates } from './_data/nutrition-page.queries'
import { OrgTemplatesSection } from './_components/OrgTemplatesSection'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getCoachRecipes } from './_data/recipes.queries'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import { createClient } from '@/lib/supabase/server'
import { hasModule } from '@/services/entitlements.service'

type NutritionPlanRow = {
  id: string
  name: string
  is_active: boolean | null
  nutrition_meals?: { count: number }[] | null
}

const planHasMeals = (plan: NutritionPlanRow) => (plan.nutrition_meals?.[0]?.count ?? 0) > 0

export default async function NutritionPlansPage() {
  const { user, coach } = await getNutritionPlansPageCoach()
  if (!user) return null

  const coachId = user.id
  const tier = (coach?.subscription_tier ?? 'starter') as SubscriptionTier
  const capabilities = getTierCapabilities(tier)
  if (!capabilities.canUseNutrition) {
    const proMonthly = getTierPriceClp('pro', 'monthly')
    const proAnnualMonthly = Math.round(getTierPriceClp('pro', 'annual') / 12)

    return (
      <main className="mx-auto max-w-2xl animate-fade-in space-y-4 px-4 py-8">
        <UpgradeGateTracker gate="nutrition" currentTier={tier} />
        <div className="px-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] text-strong">
            Nutrición
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">Módulo Pro</p>
        </div>

        <div className="rounded-card p-6 text-center" style={{ background: 'var(--surface-inverse)' }}>
          <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-control bg-[var(--sport-500)] text-white">
            <Utensils className="h-7 w-7" />
          </span>
          <h2
            className="font-display text-[24px] font-black leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--text-on-dark)' }}
          >
            Desbloquea Nutrición
          </h2>
          <p
            className="mx-auto mt-2 max-w-sm text-sm leading-relaxed"
            style={{ color: 'var(--text-on-dark-muted)' }}
          >
            Arma planes de alimentación profesionales para tus alumnos. Disponible en el plan{' '}
            <strong style={{ color: 'var(--text-on-dark)' }}>Pro</strong>.
          </p>
        </div>

        <div className="pointer-events-none select-none space-y-4 rounded-card border border-subtle bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="mb-1.5 h-2.5 w-32 rounded-full bg-sport-200" />
              <div className="h-1.5 w-20 rounded-full bg-surface-sunken" />
            </div>
            <div className="rounded-lg bg-sport-100 px-3 py-1.5">
              <span className="eva-mono text-xs font-bold text-sport-600">1.690 kcal</span>
            </div>
          </div>

          {[
            { meal: 'Desayuno', time: '08:00', kcal: '520 kcal', width: 'w-28', done: true },
            { meal: 'Almuerzo', time: '13:00', kcal: '680 kcal', width: 'w-40', done: true },
            { meal: 'Merienda', time: '17:00', kcal: '210 kcal', width: 'w-20', done: false },
            { meal: 'Cena', time: '20:00', kcal: '490 kcal', width: 'w-32', done: false },
          ].map(({ meal, time, kcal, width, done }) => (
            <div key={meal} className="flex items-center gap-3">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-sport-300 bg-sport-100' : 'border-subtle'}`}>
                {done && <div className="h-2 w-2 rounded-full bg-sport-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-body">{meal}</span>
                  <span className="text-[10px] text-subtle">{time}</span>
                </div>
                <div className={`h-1.5 ${width} rounded-full ${done ? 'bg-sport-300' : 'bg-surface-sunken'}`} />
              </div>
              <span className="eva-mono shrink-0 text-[11px] text-subtle">{kcal}</span>
            </div>
          ))}

          <div className="h-px bg-[var(--border-subtle)]" />
          <div className="grid grid-cols-3 gap-2">
            {[
              ['P', '145g', 'bg-ember-500/10 border-ember-500/20 text-ember-600'],
              ['C', '210g', 'bg-sport-500/10 border-sport-500/20 text-sport-600'],
              ['G', '65g', 'bg-aqua-500/10 border-aqua-500/20 text-aqua-600'],
            ].map(([macro, value, className]) => (
              <div key={macro} className={`rounded-lg border px-2 py-2 text-center ${className}`}>
                <p className="text-[10px] font-bold">{macro}</p>
                <p className="mt-0.5 text-xs font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-subtle bg-surface-card p-5">
          <div className="flex flex-col gap-3.5">
            {([
              [Utensils, 'Planes de nutrición personalizados por alumno'],
              [PieChart, 'Seguimiento de macros y calorías diarias'],
              [Repeat, 'Plantillas reutilizables por objetivo'],
              [Users, 'Hasta 30 alumnos activos (3× más que Free)'],
            ] as const).map(([Icon, feature]) => (
              <div key={feature} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-sport-100 text-sport-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-body">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 rounded-card border border-subtle bg-surface-card p-4">
            <p className="mb-1 text-xs font-bold text-muted">Mensual</p>
            <p className="eva-metric text-[22px] text-strong">${proMonthly.toLocaleString('es-CL')}</p>
            <p className="mt-0.5 text-[10.5px] text-subtle">/mes</p>
          </div>
          <div className="relative flex-1 rounded-card border-[1.5px] border-[color:var(--sport-500)] bg-surface-card p-4">
            <span className="absolute -top-2.5 right-3 rounded-pill bg-sport-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
              -20%
            </span>
            <p className="mb-1 text-xs font-bold text-muted">Anual</p>
            <p className="eva-metric text-[22px] text-strong">${proAnnualMonthly.toLocaleString('es-CL')}</p>
            <p className="mt-0.5 text-[10.5px] text-subtle">/mes · facturado anual</p>
          </div>
        </div>

        <Link
          href="/coach/subscription?upgrade=pro"
          className="eva-press flex h-12 w-full items-center justify-center gap-2 rounded-control text-[15px] font-bold text-white shadow-[var(--glow-sport)] transition-[filter] hover:brightness-105"
          style={{ background: 'var(--cta-fill)' }}
        >
          <ArrowUpCircle className="h-[18px] w-[18px]" />
          Mejorar a Pro
        </Link>
        <p className="text-center text-xs text-muted">Sin permanencia · Cancela cuando quieras</p>
      </main>
    )
  }

  const workspace = await getPreferredWorkspaceForRender(coachId)
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const scope = { orgId, activeTeamId }

  const nutritionDomainEnabled = await resolveNutritionDomainEnabled({
    coachId,
    clientTeamId: activeTeamId,
    clientOrgId: orgId,
  })
  if (!nutritionDomainEnabled) redirect('/coach/dashboard')

  const entitlementDb = await createClient()
  const [
    templates,
    activePlans,
    coachClientsRaw,
    foodLib,
    orgTemplates,
    recipes,
    nutritionProEnabled,
  ] = await Promise.all([
    getCoachTemplates(coachId, orgId),
    getActivePlansBoardData(coachId, scope),
    getCoachClients(coachId, scope),
    getFoodLibrary(coachId, { page: 0, pageSize: 120, orgId }),
    orgId ? getCoachOrgNutritionTemplates(orgId) : Promise.resolve([]),
    getCoachRecipes({ coachId, teamId: activeTeamId }),
    hasModule(entitlementDb, 'nutrition_exchanges', {
      coachId,
      teamId: activeTeamId,
    }),
  ])

  const assignClients = coachClientsRaw.map((client) => {
    const plans = client.nutrition_plans as NutritionPlanRow[] | null | undefined
    const active = plans?.find((plan) => plan.is_active && planHasMeals(plan))
    return {
      id: client.id,
      full_name: client.full_name,
      active_plan: active ? { id: active.id, name: active.name } : undefined,
    }
  })

  const clientsWithoutPlan = coachClientsRaw
    .filter((client) => {
      const plans = client.nutrition_plans as NutritionPlanRow[] | null | undefined
      return !plans?.some((plan) => plan.is_active && planHasMeals(plan))
    })
    .map((client) => ({ id: client.id, full_name: client.full_name }))

  return (
    <div className="space-y-4">
      {orgTemplates.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <OrgTemplatesSection orgName="tu organización" templates={orgTemplates} />
        </div>
      )}
      <NutritionHub
        coachId={coachId}
        templates={templates}
        activePlans={activePlans}
        assignClients={assignClients}
        clientsWithoutPlan={clientsWithoutPlan}
        foods={foodLib}
        recipes={recipes}
        nutritionProEnabled={nutritionProEnabled}
      />
    </div>
  )
}
