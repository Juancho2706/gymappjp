import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { History, Info, ListChecks, Utensils } from 'lucide-react'
import {
  MacroChipRow,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  NutritionToolbar,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import {
  NUTRITION_STRATEGIES,
  describeLegacyHistoryDay,
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { formatNutritionShortDate, getTodayInSantiago } from '@/lib/date-utils'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientNutritionUser } from '../nutrition/_data/nutrition-auth.queries'
import { getClientDisplayName, getClientScope } from '../nutrition/_data/client-scope.queries'
import {
  getNutritionHistoryV2ForWeb,
  getNutritionPlanV2ForWeb,
  getNutritionTodayV2ForWeb,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { TodayExperience } from './_components/TodayExperience'
import { NutritionFoodRow } from './_components/NutritionFoodRow'

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
      title="Nutrición"
      description="Prescripción, consumo real e historial en una sola experiencia."
      backHref={`${base}/dashboard`}
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
        {/* Streaming: el shell + toolbar pintan de inmediato y cada vista (fan-out de
            queries en su componente async) baja por Suspense — el tap del menú no queda
            esperando el payload completo (QA CEO 2026-07-18). Cero cambio de datos. */}
        {view === 'today' ? (
          <Suspense fallback={<ViewSkeleton />}>
            <TodayView clientId={user.id} date={today} base={base} />
          </Suspense>
        ) : null}
        {view === 'plan' ? (
          <Suspense fallback={<ViewSkeleton />}>
            <PlanView clientId={user.id} date={today} />
          </Suspense>
        ) : null}
        {view === 'history' ? (
          <Suspense fallback={<ViewSkeleton />}>
            <HistoryView clientId={user.id} before={query.before ?? null} base={base} today={today} />
          </Suspense>
        ) : null}
      </div>
    </NutritionPageShell>
  )
}

/** Skeleton sobrio de una vista (cards apiladas) mientras stremea su fan-out de datos. */
function ViewSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="h-40 animate-pulse rounded-card border border-border-subtle bg-surface-sunken/60" />
      <div className="h-28 animate-pulse rounded-card border border-border-subtle bg-surface-sunken/60" />
      <div className="h-28 animate-pulse rounded-card border border-border-subtle bg-surface-sunken/60" />
    </div>
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
  const [today, plan, clientName] = await Promise.all([
    getNutritionTodayV2ForWeb({ clientId, date }),
    getNutritionPlanV2ForWeb({ clientId, date }),
    getClientDisplayName(clientId),
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
        clientName={clientName}
        revalidatePath={`${base}/nutrition-v2`}
        scanHref={`${base}/nutrition-v2/scanner`}
      />
    </>
  )
}

type PlanVariant = NutritionPlanReadModel['dayVariants'][number]
type PlanSlot = PlanVariant['mealSlots'][number]
type PlanItem = PlanSlot['prescriptionItems'][number]

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

  const summary = plan.plan
  const defaultVariant = plan.dayVariants.find((variant) => variant.isDefault) ?? plan.dayVariants[0] ?? null

  return (
    <div className="space-y-4">
      {/* Encabezado del plan */}
      <NutritionCard>
        <div className="flex flex-wrap items-center gap-2">
          <StrategyBadge strategy={summary.strategy} />
          <PlanVersionBadge version={summary.versionNumber} status={summary.status} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-strong">{summary.name}</h2>
        <p className="mt-1 text-xs text-muted">
          Vigente desde {formatNutritionShortDate(summary.effectiveFrom)}
          {summary.effectiveTo ? ` hasta ${formatNutritionShortDate(summary.effectiveTo)}` : ' · versión actual'}
        </p>
        <p className="mt-2 text-sm leading-6 text-body">{NUTRITION_STRATEGIES[summary.strategy].description}</p>
        {plan.visibleNotes ? (
          <div className="mt-4 rounded-control border border-border-subtle bg-surface-sunken p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Notas de tu coach</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-body">{plan.visibleNotes}</p>
          </div>
        ) : null}
      </NutritionCard>

      {/* Metas diarias */}
      {defaultVariant ? <PlanObjectivesCard targets={defaultVariant.targets} /> : null}

      {/* Reglas del plan */}
      <PlanRulesCard permissions={plan.permissions} />

      {/* Detalle por variante de día */}
      {plan.dayVariants.map((variant) => (
        <PlanVariantCard key={variant.id} variant={variant} showTargets={plan.dayVariants.length > 1} />
      ))}
    </div>
  )
}

/** Metas diarias del plan (energía + macros), en una grilla legible. */
function PlanObjectivesCard({ targets }: { targets: PlanVariant['targets'] }) {
  const rows: Array<{ label: string; value: string }> = []
  if (targets.calories != null) rows.push({ label: 'Energía', value: formatNutritionCalories(targets.calories) })
  if (targets.proteinG != null) rows.push({ label: 'Proteína', value: formatNutritionAmount(targets.proteinG, 'g') })
  if (targets.carbsG != null) rows.push({ label: 'Carbohidratos', value: formatNutritionAmount(targets.carbsG, 'g') })
  if (targets.fatsG != null) rows.push({ label: 'Grasas', value: formatNutritionAmount(targets.fatsG, 'g') })
  if (targets.fiberG != null) rows.push({ label: 'Fibra', value: formatNutritionAmount(targets.fiberG, 'g') })
  if (rows.length === 0) return null
  return (
    <NutritionCard>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Metas diarias</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dd className="font-display text-lg font-bold tabular-nums text-strong">{row.value}</dd>
            <dt className="text-xs text-muted">{row.label}</dt>
          </div>
        ))}
      </dl>
    </NutritionCard>
  )
}

/** Reglas/permisos del alumno como pastillas (qué puede ajustar, sustituir, etc.). */
function PlanRulesCard({ permissions }: { permissions: NutritionPlanReadModel['permissions'] }) {
  const chips: string[] = []
  chips.push(permissions.canRegisterFreely ? 'Registro libre habilitado' : 'Solo alimentos prescritos')
  if (permissions.canAdjustPrescribedQuantity) {
    chips.push(
      permissions.quantityAdjustmentPercent != null
        ? `Ajuste de cantidad ±${permissions.quantityAdjustmentPercent}%`
        : 'Ajuste de cantidad permitido',
    )
  }
  if (permissions.canSubstitute) chips.push('Intercambios permitidos')
  if (permissions.canMoveMealSlot) chips.push('Puedes mover comidas de franja')
  if (permissions.canSkipOptionalItems) chips.push('Puedes omitir opcionales')
  return (
    <NutritionCard>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Reglas del plan</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1 text-xs font-medium text-body"
          >
            {chip}
          </span>
        ))}
      </div>
    </NutritionCard>
  )
}

/** Detalle de una variante de día: franjas con hora, indicaciones y alimentos con macros. */
function PlanVariantCard({ variant, showTargets }: { variant: PlanVariant; showTargets: boolean }) {
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-strong">{variant.label}</h3>
        {variant.isDefault ? (
          <span className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary">
            Por defecto
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm tabular-nums text-muted">
        {variant.mealSlots.length} franja{variant.mealSlots.length === 1 ? '' : 's'}
        {variant.targets.calories != null ? ` · ${formatNutritionCalories(variant.targets.calories)}` : ''}
      </p>
      {showTargets ? (
        <span className="mt-2 block">
          <MacroChipRow
            calories={variant.targets.calories}
            proteinG={variant.targets.proteinG}
            carbsG={variant.targets.carbsG}
            fatsG={variant.targets.fatsG}
            size="sm"
          />
        </span>
      ) : null}
      <div className="mt-2 space-y-4">
        {variant.mealSlots.length === 0 ? (
          <p className="text-sm text-muted">
            Plan sin franjas fijas: sigue tus metas diarias y registra lo que comas.
          </p>
        ) : (
          variant.mealSlots.map((slot) => <PlanSlotBlock key={slot.id} slot={slot} />)
        )}
      </div>
    </NutritionCard>
  )
}

/** Una franja del plan: encabezado (hora), indicaciones, alimentos prescritos y subtotal. */
function PlanSlotBlock({ slot }: { slot: PlanSlot }) {
  const timeLabel = slot.startTime
    ? slot.endTime
      ? `${slot.startTime}–${slot.endTime}`
      : slot.startTime
    : null
  const subtotal = slot.prescriptionItems.reduce((sum, item) => sum + (item.macros.calories ?? 0), 0)
  const hasItems = slot.prescriptionItems.length > 0
  const targetChips =
    slot.targets.calories != null ||
    slot.targets.proteinG != null ||
    slot.targets.carbsG != null ||
    slot.targets.fatsG != null

  return (
    <div className="rounded-control border border-border-subtle bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-base font-semibold text-strong">{slot.name}</h4>
          {timeLabel ? <span className="font-mono text-xs text-muted">{timeLabel}</span> : null}
        </div>
        {hasItems && subtotal > 0 ? (
          <span className="font-mono text-xs font-semibold text-strong">{formatNutritionCalories(subtotal)}</span>
        ) : null}
      </div>
      {slot.instructions ? (
        <p className="mt-1 text-xs leading-5 text-subtle">{slot.instructions}</p>
      ) : null}
      {hasItems ? (
        <div className="mt-2 divide-y divide-border-subtle">
          {slot.prescriptionItems.map((item) => (
            <NutritionFoodRow
              key={item.id}
              name={item.name ?? 'Alimento prescrito'}
              detail={item.brand}
              quantityLabel={`${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`}
              calories={item.macros.calories}
              proteinG={item.macros.proteinG}
              carbsG={item.macros.carbsG}
              fatsG={item.macros.fatsG}
              note={describeItemGuidance(item)}
            />
          ))}
        </div>
      ) : targetChips ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Objetivo de la franja</p>
          <span className="mt-1 block">
            <MacroChipRow
              calories={slot.targets.calories}
              proteinG={slot.targets.proteinG}
              carbsG={slot.targets.carbsG}
              fatsG={slot.targets.fatsG}
              size="sm"
            />
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Franja flexible sin alimentos prescritos.</p>
      )}
    </div>
  )
}

/** Nota de guía de un item prescrito: rango de cantidad ajustable + indicaciones del coach. */
function describeItemGuidance(item: PlanItem): string | null {
  const unit = item.unit
  const range =
    item.minimumQuantity != null && item.maximumQuantity != null
      ? `Ajustable entre ${formatNutritionAmount(item.minimumQuantity, unit)} y ${formatNutritionAmount(item.maximumQuantity, unit)}`
      : item.maximumQuantity != null
        ? `Hasta ${formatNutritionAmount(item.maximumQuantity, unit)}`
        : item.minimumQuantity != null
          ? `Desde ${formatNutritionAmount(item.minimumQuantity, unit)}`
          : null
  return [range, item.notes].filter(Boolean).join(' · ') || null
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
      {history.items.map((day) => {
        const legacy = describeLegacyHistoryDay(day)
        const showLegacyMacros = legacy.legacyOnly && legacy.hasMacros && legacy.consumed != null
        return (
          <NutritionCard key={day.localDate}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-strong">
                  {formatNutritionShortDate(day.localDate, { todayIso: today, relative: true })}
                </h2>
                {showLegacyMacros && legacy.consumed ? (
                  <div className="mt-1">
                    <MacroChipRow
                      calories={legacy.consumed.calories}
                      proteinG={legacy.consumed.proteinG}
                      carbsG={legacy.consumed.carbsG}
                      fatsG={legacy.consumed.fatsG}
                      size="sm"
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm tabular-nums text-muted">
                    {legacy.legacyOnly
                      ? legacy.completionCount > 0
                        ? legacy.completionsLabel
                        : 'Registrado en el sistema anterior'
                      : `${day.activeEntryCount} registro${day.activeEntryCount === 1 ? '' : 's'} · ${day.consumed.calories} kcal`}
                  </p>
                )}
                {legacy.isLegacy && !legacy.legacyOnly && legacy.secondaryLabel ? (
                  <p className="mt-1 text-xs tabular-nums text-subtle">{legacy.secondaryLabel}</p>
                ) : null}
                {legacy.isLegacy && legacy.mealsLabel ? (
                  <p className="mt-1 line-clamp-2 text-xs text-subtle">{legacy.mealsLabel}</p>
                ) : null}
              </div>
              {legacy.isLegacy ? (
                <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  Historial anterior
                </span>
              ) : null}
            </div>
          </NutritionCard>
        )
      })}
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
