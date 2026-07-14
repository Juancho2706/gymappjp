import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
  getActiveNutritionPlan,
  getNutritionLogForDate,
  getNutritionAdherence30d,
} from './_data/nutrition.queries'
import { getHeroComplianceBundle } from '../dashboard/_data/heroComplianceBundle'
import { headers } from 'next/headers'
import { NutritionShell } from './_components/NutritionShell'
import { NutritionNoPlanFromServer } from './_components/NutritionNoPlanFromServer'
import { PushNotificationBanner } from './_components/PushNotificationBanner'
import { getClientNutritionUser } from './_data/nutrition-auth.queries'
import { getStudentExchangeData } from './_data/nutrition-exchanges.queries'
import { getAssignedRecipesForClient } from './_data/recipes.queries'
import { RecipeIdeasSection } from './_components/RecipeIdeasSection'
import { pdfBrandFromProxyHeaders } from '@/lib/nutrition-pdf-brand'
import { getClientMealComments } from './_data/nutrition-notes.queries'
import { getShoppingList } from './_data/shopping.queries'
import { getRecentIntakeFoods } from './_data/intake.queries'
import {
  getPlanDayMicros,
  getMicroTargetsForClient,
  getNutritionProEnabledForClient,
  platePropFromMacros,
} from './_data/sections.queries'
import { getClientScope } from './_data/client-scope.queries'
import {
  resolveFeaturePrefs,
  resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'
import { NutritionDomainOff } from './_components/NutritionDomainOff'
import { getNutritionWeeklyRecap } from './_data/recap.queries'
import { WeeklyRecapCard } from './_components/WeeklyRecapCard'

export const metadata: Metadata = { title: 'Plan Nutricional' }

import { getClientBasePath } from '@/lib/client/base-path'

interface Props {
  params: Promise<{ coach_slug: string }>
}

export default async function ClientNutritionPage({ params }: Props) {
  const { coach_slug } = await params
  const base = await getClientBasePath(coach_slug)
  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user) redirect(`${base}/login`)
  if (!hasClientRow) redirect(`${base}/login`)

  const plan = await getActiveNutritionPlan(user.id)
  if (!plan) {
    return <NutritionNoPlanFromServer coachSlug={coach_slug} userId={user.id} />
  }

  const { iso: today } = getTodayInSantiago()
  // Scope del alumno (team/org) — alimenta el resolver de feature-prefs (capa base = team en §4.9).
  const clientScope = await getClientScope(user.id)
  const prefsInput = {
    domain: 'nutrition' as const,
    coachId: plan.coach_id ?? '',
    clientId: user.id,
    planId: plan.id,
    clientTeamId: clientScope.teamId,
    clientOrgId: clientScope.orgId,
  }
  const [
    todayLog,
    adherence,
    heroBundle,
    exchange,
    recipes,
    headersList,
    notes,
    shoppingList,
    offPlanRecents,
    dayMicros,
    microTargets,
    nutritionProEnabled,
    domainEnabled,
    sectionFlags,
    weeklyRecap,
  ] = await Promise.all([
    getNutritionLogForDate(user.id, plan.id, today),
    getNutritionAdherence30d(user.id, plan.id),
    getHeroComplianceBundle(user.id, coach_slug),
    // Módulo nutrition_exchanges: bundle vacío si el plan es 'grams' o el módulo está OFF (AC5).
    getStudentExchangeData({
      clientId: user.id,
      planId: plan.id,
      planCoachId: plan.coach_id ?? null,
      planMode: (plan as { plan_mode?: string | null }).plan_mode,
    }),
    // Feature L: recetas-idea asignadas por el coach (inspiración, solo lectura).
    getAssignedRecipesForClient(user.id),
    headers(),
    // Overhaul (base tier): notas del día, lista de compras, recientes off-plan, micros.
    getClientMealComments(today),
    getShoppingList(user.id),
    getRecentIntakeFoods(10),
    getPlanDayMicros(user.id, plan.id, today),
    getMicroTargetsForClient(plan.coach_id ?? null, user.id),
    getNutritionProEnabledForClient(plan.id),
    // Master switch del dominio + visibilidad por seccion (fail-OPEN con flag OFF, §4.4).
    resolveNutritionDomainEnabled({
      coachId: plan.coach_id ?? '',
      clientId: user.id,
      clientTeamId: clientScope.teamId,
      clientOrgId: clientScope.orgId,
    }),
    resolveFeaturePrefs(prefsInput),
    // Recap semanal motivacional (K): on-demand desde el motor, tono adaptativo.
    getNutritionWeeklyRecap(user.id),
  ])

  // Dominio apagado por el coach => ocultar TODA la nutricion (menu + contenido), nunca blanco.
  if (!domainEnabled) {
    return <NutritionDomainOff coachSlug={coach_slug} />
  }

  // Proporción del plato derivada del split de macros del plan (guía, no meta).
  const plateProportion = platePropFromMacros(plan.protein_g ?? 0, plan.carbs_g ?? 0)
  const hasTodayWorkout = heroBundle.hero.hasWorkout
  // Marca del tenant resuelta SERVER-SIDE desde headers del proxy (free tier ⇒ EVA, AC4).
  // El logo del PDF se resuelve aparte, server-side y lazy (resolveClientPdfLogoDataUrl).
  const pdfBrand = pdfBrandFromProxyHeaders(headersList)

  return (
    <div className="min-h-dvh bg-background">
      <div
        className="fixed top-0 right-0 w-72 h-72 opacity-[0.06] blur-3xl rounded-full pointer-events-none"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 pt-safe">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3.5 md:max-w-5xl">
          <Link
            href={`${base}/dashboard`}
            className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight text-foreground">Plan Nutricional</h1>
              <p className="truncate text-[10px] text-muted-foreground font-medium">{plan.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`${base}/nutrition/add`}
                aria-label="Registrar alimento"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ember-500 text-white shadow-sm transition-transform hover:bg-ember-600 active:scale-[.97]"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </Link>
              <InfoTooltip content="Registra tus comidas del día. Toca cada comida para marcarla como completada y usa el botón + para añadir lo que realmente consumiste." />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg md:max-w-5xl mx-auto px-4 py-5 pb-28 space-y-5 relative z-0">
        <PushNotificationBanner />

        {weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />}

        {plan.instructions && (
          <details className="bg-muted/30 border border-border rounded-2xl">
            <summary className="px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground cursor-pointer list-none flex items-center justify-between">
              Indicaciones del coach
              <span className="text-muted-foreground/50">▼</span>
            </summary>
            <div className="px-4 pb-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {plan.instructions}
              </p>
            </div>
          </details>
        )}

        <NutritionShell
          hasTodayWorkout={hasTodayWorkout}
          plan={plan}
          initialLog={todayLog as Record<string, unknown> | null}
          adherence={adherence}
          userId={user.id}
          coachSlug={coach_slug}
          today={today}
          exchange={exchange}
          pdfBrand={pdfBrand}
          notes={notes}
          shoppingList={shoppingList}
          offPlanRecents={offPlanRecents}
          dayMicros={dayMicros}
          microTargets={microTargets}
          nutritionProEnabled={nutritionProEnabled}
          plateProportion={plateProportion}
          sectionFlags={sectionFlags}
        />

        {sectionFlags.recipes && <RecipeIdeasSection recipes={recipes} />}
      </main>
    </div>
  )
}
