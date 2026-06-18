import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
  platePropFromMacros,
} from './_data/sections.queries'

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
  ])

  // Proporción del plato derivada del split de macros del plan (guía, no meta).
  const plateProportion = platePropFromMacros(plan.protein_g ?? 0, plan.carbs_g ?? 0)
  const hasTodayWorkout = heroBundle.hero.hasWorkout
  // Marca del tenant resuelta SERVER-SIDE desde headers del proxy (free tier ⇒ EVA, AC4).
  const pdfBrand = pdfBrandFromProxyHeaders(headersList)
  const brandLogoUrl = pdfBrand.poweredByEva ? null : headersList.get('x-coach-logo-url')

  return (
    <div className="min-h-dvh bg-background">
      <div
        className="fixed top-0 right-0 w-72 h-72 opacity-[0.06] blur-3xl rounded-full pointer-events-none"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 px-4 py-3.5 pt-safe flex items-center gap-3">
        <Link
          href={`${base}/dashboard`}
          className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black tracking-tight text-foreground">Plan Nutricional</h1>
            <p className="text-[10px] text-muted-foreground font-medium">{plan.name}</p>
          </div>
          <InfoTooltip content="Registra tus comidas del día. Toca cada comida para marcarla como completada y ver los macros. El anillo te muestra cuánto del objetivo diario llevas." />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5 relative z-0">
        <PushNotificationBanner />

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
          brandLogoUrl={brandLogoUrl}
          notes={notes}
          shoppingList={shoppingList}
          offPlanRecents={offPlanRecents}
          dayMicros={dayMicros}
          microTargets={microTargets}
          plateProportion={plateProportion}
        />

        <RecipeIdeasSection recipes={recipes} />
      </main>
    </div>
  )
}
