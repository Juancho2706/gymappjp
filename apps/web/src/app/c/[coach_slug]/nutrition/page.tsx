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
import { getIntakeEntriesForDate, getRecentIntakeFoods } from './_data/intake.queries'
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
import { NutritionDailyOverview } from './_components/NutritionDailyOverview'
import { NutritionIntakeLedger } from './_components/NutritionIntakeLedger'
import { NutritionGuidanceProgress } from './_components/NutritionGuidanceProgress'
import { getClientBasePath } from '@/lib/client/base-path'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

export const metadata: Metadata = { title: 'Plan Nutricional' }

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
  const clientScope = await getClientScope(user.id)
  const prefsInput = {
    domain: 'nutrition' as const,
    coachId: String(plan.coach_id ?? ''),
    clientId: user.id,
    planId: String(plan.id),
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
    intakeEntries,
    dayMicros,
    microTargets,
    nutritionProEnabled,
    domainEnabled,
    sectionFlags,
    weeklyRecap,
    nutritionV2StudentEnabled,
  ] = await Promise.all([
    getNutritionLogForDate(user.id, String(plan.id), today),
    getNutritionAdherence30d(user.id, String(plan.id)),
    getHeroComplianceBundle(user.id, coach_slug),
    getStudentExchangeData({
      clientId: user.id,
      planId: String(plan.id),
      planCoachId: plan.coach_id == null ? null : String(plan.coach_id),
      planMode: plan.plan_mode == null ? null : String(plan.plan_mode),
    }),
    getAssignedRecipesForClient(user.id),
    headers(),
    getClientMealComments(today),
    getShoppingList(user.id),
    getRecentIntakeFoods(10),
    getIntakeEntriesForDate(today),
    getPlanDayMicros(user.id, String(plan.id), today),
    getMicroTargetsForClient(plan.coach_id == null ? null : String(plan.coach_id), user.id),
    getNutritionProEnabledForClient(String(plan.id)),
    resolveNutritionDomainEnabled({
      coachId: String(plan.coach_id ?? ''),
      clientId: user.id,
      clientTeamId: clientScope.teamId,
      clientOrgId: clientScope.orgId,
    }),
    resolveFeaturePrefs(prefsInput),
    getNutritionWeeklyRecap(user.id),
    isNutritionV2Enabled({
      surface: 'webStudent',
      userId: user.id,
      clientId: user.id,
      coachId: clientScope.coachId,
      teamId: clientScope.teamId,
      orgId: clientScope.orgId,
    }),
  ])

  // Deprecación por etapas (decisión CEO 2026-07-17): con V2 activo para este
  // alumno, V1 deja de mostrarse — la experiencia canónica vive en /nutrition-v2.
  // Con el flag apagado (fail-closed) esta página sigue siendo V1 intacta.
  if (nutritionV2StudentEnabled) {
    redirect(`${base}/nutrition-v2`)
  }

  if (!domainEnabled) {
    return <NutritionDomainOff coachSlug={coach_slug} />
  }

  const plateProportion = platePropFromMacros(Number(plan.protein_g) || 0, Number(plan.carbs_g) || 0)
  const hasTodayWorkout = heroBundle.hero.hasWorkout
  const pdfBrand = pdfBrandFromProxyHeaders(headersList)
  const addHref = `${base}/nutrition/add`

  return (
    <div className="min-h-dvh bg-background">
      <div
        className="pointer-events-none fixed right-0 top-0 h-72 w-72 rounded-full opacity-[0.06] blur-3xl"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 border-b border-border/10 bg-background/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3.5 md:max-w-5xl">
          <Link
            href={`${base}/dashboard`}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-1 items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight text-foreground">Plan Nutricional</h1>
              <p className="truncate text-[10px] font-medium text-muted-foreground">{String(plan.name)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={addHref}
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

      <main className="relative z-0 mx-auto max-w-lg space-y-5 px-4 py-5 pb-28 md:max-w-5xl">
        <PushNotificationBanner />

        {weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />}

        {plan.instructions && (
          <details className="rounded-2xl border border-border bg-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
              Indicaciones del coach
              <span className="text-muted-foreground/50">▼</span>
            </summary>
            <div className="px-4 pb-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {String(plan.instructions)}
              </p>
            </div>
          </details>
        )}

        <NutritionDailyOverview
          plan={plan as never}
          todayLog={todayLog as Record<string, unknown> | null}
          intakeEntries={intakeEntries}
          today={today}
          addHref={addHref}
        />

        <NutritionGuidanceProgress
          plan={{
            supplement_guidance: Array.isArray(plan.supplement_guidance)
              ? plan.supplement_guidance.map(String)
              : [],
            protocol_notes: plan.protocol_notes == null ? null : String(plan.protocol_notes),
          }}
        />

        <NutritionIntakeLedger
          entries={intakeEntries}
          coachSlug={coach_slug}
          addHref={addHref}
        />

        <NutritionShell
          hasTodayWorkout={hasTodayWorkout}
          plan={plan as never}
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
