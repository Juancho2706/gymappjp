import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, History, ListChecks, Utensils } from 'lucide-react'
import {
  MacroBudget,
  MealTimeline,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  NutritionToolbar,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import type { NutritionMealSlotModel } from '@eva/nutrition-v2'
import { createNutritionMacroValue } from '@eva/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientNutritionUser } from '../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../nutrition/_data/client-scope.queries'
import {
  getNutritionHistoryV2ForWeb,
  getNutritionPlanV2ForWeb,
  getNutritionTodayV2ForWeb,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

export const metadata = { title: 'Nutrición V2' }

interface Props {
  params: Promise<{ coach_slug: string }>
  searchParams: Promise<{ view?: string; before?: string }>
}

export default async function StudentNutritionV2Page({ params, searchParams }: Props) {
  const [{ coach_slug }, query] = await Promise.all([params, searchParams])
  const base = await getClientBasePath(coach_slug)
  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user || !hasClientRow) redirect(`${base}/login`)

  const scope = await getClientScope(user.id)
  const enabled = await isNutritionV2Enabled({
    surface: 'webStudent',
    userId: user.id,
    clientId: user.id,
    coachId: scope.coachId,
    teamId: scope.teamId,
    orgId: scope.orgId,
  })
  if (!enabled) redirect(`${base}/nutrition`)

  const { iso: today } = getTodayInSantiago()
  const view = query.view === 'plan' || query.view === 'history' ? query.view : 'today'

  return (
    <NutritionPageShell
      eyebrow="Canary privado"
      title="Nutrición"
      description="Prescripción, consumo real e historial en una sola experiencia."
      actions={
        <Link
          href={`${base}/dashboard`}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      }
      toolbar={
        <NutritionToolbar>
          <ViewLink active={view === 'today'} href={`${base}/nutrition-v2`} icon={<Utensils className="h-4 w-4" />}>
            Hoy
          </ViewLink>
          <ViewLink active={view === 'plan'} href={`${base}/nutrition-v2?view=plan`} icon={<ListChecks className="h-4 w-4" />}>
            Plan
          </ViewLink>
          <ViewLink active={view === 'history'} href={`${base}/nutrition-v2?view=history`} icon={<History className="h-4 w-4" />}>
            Historial
          </ViewLink>
        </NutritionToolbar>
      }
    >
      {view === 'today' ? <TodayView clientId={user.id} date={today} /> : null}
      {view === 'plan' ? <PlanView clientId={user.id} date={today} /> : null}
      {view === 'history' ? (
        <HistoryView clientId={user.id} before={query.before ?? null} base={base} />
      ) : null}
    </NutritionPageShell>
  )
}

function ViewLink({
  active,
  href,
  icon,
  children,
}: {
  active: boolean
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      href={href}
      className={
        active
          ? 'inline-flex min-h-10 items-center gap-2 rounded-control bg-ember-500 px-3 text-sm font-semibold text-white'
          : 'inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-muted hover:bg-surface-sunken hover:text-strong'
      }
    >
      {icon}
      {children}
    </Link>
  )
}

async function TodayView({ clientId, date }: { clientId: string; date: string }) {
  const today = await getNutritionTodayV2ForWeb({ clientId, date })

  if (!today.plan) {
    return (
      <NutritionStatePanel
        icon="empty"
        title="Tu plan V2 todavía no está publicado"
        description="Cuando tu coach publique la primera versión, aparecerán aquí tus objetivos, comidas y registros."
      />
    )
  }

  const slots: NutritionMealSlotModel[] = today.mealSlots.map((slot) => {
    const intakeFoods = slot.intakeItems.map((item) => ({
      id: item.id,
      name: item.snapshot.name,
      detail: item.snapshot.brand,
      quantityLabel: `${item.quantity} ${item.unit}`,
      calories: item.totals.calories,
      proteinG: item.totals.proteinG,
      carbsG: item.totals.carbsG,
      fatsG: item.totals.fatsG,
      status: 'default' as const,
    }))
    const prescribedFoods = slot.prescriptionItems.map((item) => ({
      id: item.id,
      name: item.name ?? 'Alimento prescrito',
      detail: item.brand,
      quantityLabel: `${item.quantity} ${item.unit}`,
      calories: item.macros.calories,
      proteinG: item.macros.proteinG,
      carbsG: item.macros.carbsG,
      fatsG: item.macros.fatsG,
      status: 'default' as const,
    }))

    return {
      id: slot.id,
      name: slot.name,
      timeLabel: slot.startTime,
      prescriptionLabel: slot.prescriptionItems.length > 0
        ? `${slot.prescriptionItems.length} elemento${slot.prescriptionItems.length === 1 ? '' : 's'} esperado${slot.prescriptionItems.length === 1 ? '' : 's'}`
        : null,
      state: intakeFoods.length > 0
        ? 'consumed'
        : prescribedFoods.length > 0
          ? 'prescribed'
          : 'empty',
      subtotalCalories: intakeFoods.reduce((sum, food) => sum + (food.calories ?? 0), 0),
      foods: intakeFoods.length > 0 ? intakeFoods : prescribedFoods,
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StrategyBadge strategy={today.plan.strategy} />
        <PlanVersionBadge
          version={today.plan.versionNumber}
          status={today.plan.status}
          effectiveLabel={`desde ${today.plan.effectiveFrom}`}
        />
      </div>
      <MacroBudget
        calories={{
          consumed: today.consumed.calories,
          target: today.targets.calories ?? 0,
        }}
        macros={[
          createNutritionMacroValue('protein', {
            consumed: today.consumed.proteinG,
            target: today.targets.proteinG ?? 0,
          }),
          createNutritionMacroValue('carbs', {
            consumed: today.consumed.carbsG,
            target: today.targets.carbsG ?? 0,
          }),
          createNutritionMacroValue('fats', {
            consumed: today.consumed.fatsG,
            target: today.targets.fatsG ?? 0,
          }),
        ]}
      />
      <MealTimeline slots={slots} />
      {today.unassignedIntake.length > 0 ? (
        <NutritionCard tone="info">
          <h2 className="font-display text-lg font-semibold">Otros registros</h2>
          <p className="mt-1 text-sm opacity-80">
            {today.unassignedIntake.length} registro{today.unassignedIntake.length === 1 ? '' : 's'} sin franja asignada.
          </p>
        </NutritionCard>
      ) : null}
    </div>
  )
}

async function PlanView({ clientId, date }: { clientId: string; date: string }) {
  const plan = await getNutritionPlanV2ForWeb({ clientId, date })
  if (!plan.plan) {
    return (
      <NutritionStatePanel
        title="No hay un plan vigente"
        description="El plan aparecerá cuando tu coach publique una versión con fecha efectiva."
      />
    )
  }

  return (
    <div className="space-y-4">
      <NutritionCard>
        <div className="flex flex-wrap items-center gap-2">
          <StrategyBadge strategy={plan.plan.strategy} />
          <PlanVersionBadge version={plan.plan.versionNumber} status={plan.plan.status} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-strong">{plan.plan.name}</h2>
        {plan.visibleNotes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-body">{plan.visibleNotes}</p> : null}
      </NutritionCard>
      {plan.dayVariants.map((variant) => (
        <NutritionCard key={variant.id}>
          <h3 className="font-display text-lg font-semibold text-strong">{variant.label}</h3>
          <p className="mt-1 text-sm text-muted">
            {variant.mealSlots.length} franja{variant.mealSlots.length === 1 ? '' : 's'} · {variant.targets.calories ?? 0} kcal
          </p>
        </NutritionCard>
      ))}
    </div>
  )
}

async function HistoryView({
  clientId,
  before,
  base,
}: {
  clientId: string
  before: string | null
  base: string
}) {
  const history = await getNutritionHistoryV2ForWeb({ clientId, before, pageSize: 14 })
  if (history.items.length === 0) {
    return (
      <NutritionStatePanel
        title="Todavía no hay historial"
        description="Tus días aparecerán aquí después del primer registro o snapshot del plan."
      />
    )
  }

  return (
    <div className="space-y-3">
      {history.items.map((day) => (
        <NutritionCard key={day.localDate}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-strong">{day.localDate}</h2>
              <p className="mt-1 text-sm text-muted">
                {day.activeEntryCount} registro{day.activeEntryCount === 1 ? '' : 's'} · {day.consumed.calories} kcal
              </p>
            </div>
            {day.legacyDisclosure ? (
              <span className="rounded-pill border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                Historial anterior
              </span>
            ) : null}
          </div>
        </NutritionCard>
      ))}
      {history.hasMore && history.nextCursor ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong"
          href={`${base}/nutrition-v2?view=history&before=${history.nextCursor}`}
        >
          Ver días anteriores
        </Link>
      ) : null}
    </div>
  )
}
