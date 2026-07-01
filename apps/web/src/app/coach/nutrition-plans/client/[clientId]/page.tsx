import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PlanBuilder } from '../../_components/PlanBuilder'
import { getClientNutritionPlan, getClientAdherence } from '../../_data/nutrition-coach.queries'
import {
  getCoachPdfBrand,
  getExchangeEquivalencesForGroups,
  getExchangeGroups,
  getHasExchangesModule,
  getPlanExchangeBundle,
} from '../../_data/exchange.queries'
import type { ExchangeBuilderData } from '../../_components/PlanBuilder/types'
import { mapClientPlanRowToInitialData } from '../../_data/plan-builder-mappers'
import { AdherenceStrip } from '@/app/c/[coach_slug]/nutrition/_components/AdherenceStrip'
import { getClientNutritionPlanPageAuthData, getCoachDisplayName } from './_data/client-plan-page.queries'
import { EditedByBadge } from '@/components/coach/EditedByBadge'
import {
  resolveFeaturePrefs,
  resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'

interface Props {
  params: Promise<{ clientId: string }>
}

export default async function CoachClientNutritionPlanPage({ params }: Props) {
  const { clientId } = await params
  const { user, client, intake, orgId, activeTeamId } = await getClientNutritionPlanPageAuthData(clientId)
  if (!user) redirect('/login')

  // El query de auth ya scopeó por workspace activo (team = pool colaborativo, sin
  // exigir coach_id propio; standalone/org sí lo exigen dentro del query).
  if (!client) notFound()

  // Contexto de feature-prefs para ESTE alumno (mismo modelo que la ficha del coach):
  // coach del alumno + team activo (pool-base) + org. El resolver fija entitlement
  // (pool-wins + kill-switch) y preferencia de forma identica a la vista del alumno.
  const featurePrefsInput = {
    coachId:
      (client as { coach_id?: string | null }).coach_id ?? user.id,
    clientId,
    clientTeamId: activeTeamId ?? null,
    clientOrgId: (client as { org_id?: string | null }).org_id ?? orgId ?? null,
  }

  // Master switch del dominio (fail-OPEN con flag OFF). Dominio OFF => el editor no se
  // construye (atrapa refresh/visita directa aunque el menú esté oculto). Render-only.
  const nutritionDomainEnabled = await resolveNutritionDomainEnabled(featurePrefsInput)
  if (!nutritionDomainEnabled) redirect('/coach/dashboard')

  const plan = await getClientNutritionPlan(clientId, user.id, orgId ?? null, activeTeamId ?? null)
  const initialData = plan ? mapClientPlanRowToInitialData(plan) : null

  // Visibilidad por seccion: gobierna los paneles Pro del builder (objetivos por
  // composición corporal = goals_bodycomp; micros avanzados = micros_advanced). Las
  // flags ya hornean el entitlement (body_composition / nutrition_exchanges) AND la
  // preferencia coach/team/cliente. planId => pool-wins del entitlement.
  const sectionFlags = await resolveFeaturePrefs({
    domain: 'nutrition',
    ...featurePrefsInput,
    planId: (plan?.id as string | undefined) ?? null,
  })

  // Módulo nutrition_exchanges (gating server-side espejo; assertModule en actions es el techo).
  const scope = { orgId: orgId ?? null, activeTeamId: activeTeamId ?? null }
  const hasExchanges = await getHasExchangesModule(user.id, scope)
  let exchange: ExchangeBuilderData | null = null
  if (hasExchanges) {
    const [groups, bundle, pdfBrand] = await Promise.all([
      getExchangeGroups(user.id, scope),
      plan?.id
        ? getPlanExchangeBundle(plan.id as string)
        : Promise.resolve({
            planMode: 'grams' as const,
            targetsByMealId: {},
            variants: [],
            variantByMealId: {},
          }),
      getCoachPdfBrand(user.id, scope),
    ])
    const equivalences = await getExchangeEquivalencesForGroups(groups.map((g) => g.id))
    exchange = {
      planId: (plan?.id as string | undefined) ?? null,
      planMode: bundle.planMode,
      groups,
      targetsByMealId: bundle.targetsByMealId,
      variants: bundle.variants,
      variantByMealId: bundle.variantByMealId,
      equivalences,
      brand: pdfBrand.brand,
      brandLogoUrl: pdfBrand.logoUrl,
      clientName: client.full_name,
    }
  }

  // E (awareness): badge solo en el pool y solo si el último editor fue OTRO coach.
  let lastEditor: { name: string; at: string | null } | null = null
  const editedBy = (plan as { last_edited_by_coach_id?: string | null } | null)?.last_edited_by_coach_id
  if (activeTeamId && editedBy && editedBy !== user.id) {
    const editor = await getCoachDisplayName(editedBy)
    if (editor) lastEditor = { name: editor, at: (plan as { updated_at?: string | null } | null)?.updated_at ?? null }
  }

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
          className="p-2 rounded-xl text-muted hover:bg-surface-sunken hover:text-strong transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">Plan nutricional</h1>
            {lastEditor && <EditedByBadge name={lastEditor.name} at={lastEditor.at} />}
          </div>
          <p className="text-xs text-muted font-medium">{client.full_name}</p>
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
            exchange={exchange}
            sectionFlags={sectionFlags}
          />
        </div>
        {adherence.length > 0 && planMealsStrip.length > 0 && (
          <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-24 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-muted">Alumno — 30 días</p>
            <div className="bg-surface-card border border-subtle rounded-2xl p-4">
              <AdherenceStrip data={adherence} planMeals={planMealsStrip} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
