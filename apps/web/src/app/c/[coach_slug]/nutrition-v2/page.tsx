import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, History, Info, ListChecks, Utensils } from 'lucide-react'
import {
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  NutritionToolbar,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import { formatNutritionShortDate, getTodayInSantiago } from '@/lib/date-utils'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientNutritionUser } from '../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../nutrition/_data/client-scope.queries'
import {
  getNutritionHistoryV2ForWeb,
  getNutritionPlanV2ForWeb,
  getNutritionTodayV2ForWeb,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { TodayExperience } from './_components/TodayExperience'

export const metadata = { title: 'Nutrición' }

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
      eyebrow="Vista previa"
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
      <div className="mx-auto w-full max-w-2xl">
        {view === 'today' ? <TodayView clientId={user.id} date={today} base={base} /> : null}
        {view === 'plan' ? <PlanView clientId={user.id} date={today} /> : null}
        {view === 'history' ? (
          <HistoryView clientId={user.id} before={query.before ?? null} base={base} today={today} />
        ) : null}
      </div>
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
          ? 'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-control bg-primary/100 px-3 text-sm font-semibold text-white'
          : 'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-control px-3 text-sm font-semibold text-muted hover:bg-surface-sunken hover:text-strong'
      }
    >
      {icon}
      {children}
    </Link>
  )
}

async function TodayView({ clientId, date, base }: { clientId: string; date: string; base: string }) {
  // El empty-state depende SOLO del plan vigente en vivo (misma senal que el tab "Plan" y que la
  // ficha del coach). El registro del dia (`today.plan`) puede seguir apuntando al plan anterior o
  // venir vacio si se genero antes de publicar el nuevo: eso NO oculta la pantalla, se refleja con
  // un aviso honesto arriba y el alumno igual puede registrar lo que coma.
  const [today, plan] = await Promise.all([
    getNutritionTodayV2ForWeb({ clientId, date }),
    getNutritionPlanV2ForWeb({ clientId, date }),
  ])

  if (!plan.plan) {
    return (
      <NutritionStatePanel
        icon="empty"
        illustration="sin-plan"
        title="Tu plan todavía no está publicado"
        description="Cuando tu coach publique la primera versión, aparecerán aquí tus objetivos, comidas y registros."
      />
    )
  }

  const showTodayPlanLag = today.plan === null || today.plan.id !== plan.plan.id
  const lagMessage =
    today.plan === null
      ? 'Tu nuevo plan ya está publicado. Las metas y comidas de hoy se activan mañana; hoy puedes registrar lo que comas.'
      : 'Tu nuevo plan ya está publicado. Hoy todavía ves las metas del plan anterior; desde mañana se aplican las del nuevo.'

  return (
    <>
      {showTodayPlanLag ? (
        <div className="mb-4 flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-body">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <p>{lagMessage}</p>
        </div>
      ) : null}
      <TodayExperience
        today={today}
        clientId={clientId}
        revalidatePath={`${base}/nutrition-v2`}
        scanHref={`${base}/nutrition-v2/scanner`}
      />
    </>
  )
}

async function PlanView({ clientId, date }: { clientId: string; date: string }) {
  const plan = await getNutritionPlanV2ForWeb({ clientId, date })
  if (!plan.plan) {
    return (
      <NutritionStatePanel
        illustration="sin-plan"
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
          <p className="mt-1 text-sm tabular-nums text-muted">
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
  today,
}: {
  clientId: string
  before: string | null
  base: string
  today: string
}) {
  const history = await getNutritionHistoryV2ForWeb({ clientId, before, pageSize: 14 })
  if (history.items.length === 0) {
    return (
      <NutritionStatePanel
        illustration="historial-vacio"
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
              <h2 className="font-display text-lg font-semibold text-strong">
                {formatNutritionShortDate(day.localDate, { todayIso: today, relative: true })}
              </h2>
              <p className="mt-1 text-sm tabular-nums text-muted">
                {day.legacyDisclosure && day.activeEntryCount === 0
                  ? 'Registrado en el sistema anterior'
                  : `${day.activeEntryCount} registro${day.activeEntryCount === 1 ? '' : 's'} · ${day.consumed.calories} kcal`}
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
