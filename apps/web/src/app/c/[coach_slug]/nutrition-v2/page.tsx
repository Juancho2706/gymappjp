import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, History, Info, ListChecks, Utensils } from 'lucide-react'
import {
  NutritionCard,
  NutritionDomainOff,
  NutritionPageShell,
  NutritionStatePanel,
  NutritionToolbar,
  StrategyBadge,
} from '@/components/nutrition-v2'
import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  addNutritionDays,
  buildNutritionWeek,
  buildNutritionWeekDates,
  formatNutritionAmount,
  formatNutritionCalories,
  formatNutritionTodayVariantBadge,
  mapNutritionItemSubstitutionRow,
  nutritionDayOfWeekFromIso,
  resolveNutritionDayVariantForDate,
  type NutritionHistoryDay,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { formatNutritionShortDate, getTodayInSantiago } from '@/lib/date-utils'
import { getClientBasePath } from '@/lib/client/base-path'
import { createClient } from '@/lib/supabase/server'
import {
  getCurrentStudentNutritionDisplayName,
  getCurrentStudentNutritionScope,
  getCurrentStudentNutritionSession,
} from '@/services/auth/current-student-nutrition.service'
import {
  getNutritionHistoryV2ForWeb,
  getNutritionLegacyHistoryDetailV2ForWeb,
  getNutritionPlanV2ForWeb,
  getNutritionTodayV2ForWeb,
} from '@/services/nutrition-v2-read.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import { TodayExperience } from './_components/TodayExperience'
import { FutureDayPreview } from './_components/FutureDayPreview'
import { PastDaySummary } from './_components/PastDaySummary'
import { LegacyHistoryDetail } from './_components/LegacyHistoryDetail'
import { PlanVariantCard, type PlanVariant } from './_components/PlanVariantCard'
import { WeekDayNavigator } from './_components/WeekDayNavigator'
import { HistoryWeeksList } from './_components/HistoryWeeksList'
import { groupSubstitutionsByPrescriptionItem } from './_components/nutrition-today.logic'
import {
  NUTRITION_WEEK_HISTORY_PAGE_SIZE,
  formatSelectedDayCaption,
  groupHistoryDaysByWeek,
  nutritionWeekHistoryCursor,
  resolveWeekIsoFromDateParam,
  resolveWeekIsoFromDowParam,
  toWeekNavCells,
} from './_components/week-nav.logic'

/** Filas de historial por tanda del tab "Historial" (~3-4 semanas si el alumno es activo a diario;
 *  el historial es DISPERSO, así que una tanda puede cubrir más semanas si registra poco). */
const NUTRITION_HISTORY_PAGE_ROWS = 21

export const metadata = { title: 'Nutrición' }

interface Props {
  params: Promise<{ coach_slug: string }>
  searchParams: Promise<{ view?: string; before?: string; dow?: string; date?: string }>
}

export default async function StudentNutritionV2Page({ params, searchParams }: Props) {
  const [{ coach_slug }, query] = await Promise.all([params, searchParams])
  const base = await getClientBasePath(coach_slug)
  const { user, hasClientRow } = await getCurrentStudentNutritionSession()
  if (!user || !hasClientRow) redirect(`${base}/login`)

  const scope = await getCurrentStudentNutritionScope(user.id)
  // Nutrition V2 is canonical for standalone and Team only. Enterprise remains on
  // its isolated legacy surface until its separately scoped removal project.
  if (scope.orgId) redirect(`${base}/nutrition`)

  const domainEnabled = await resolveNutritionDomainEnabled({
      coachId: scope.coachId ?? '',
      clientId: user.id,
      clientTeamId: scope.teamId,
      clientOrgId: scope.orgId,
    })
  if (!domainEnabled) return <NutritionDomainOff coachSlug={coach_slug} />

  const { iso: today } = getTodayInSantiago()
  const view = query.view === 'plan' || query.view === 'history' ? query.view : 'today'

  // Navegación semanal SERVER-FIRST: el día que el alumno mira vive en la URL y se resuelve
  // contra las 7 fechas Lu-Do de la semana en curso. Parámetro ausente, inválido o de otra
  // semana ⇒ hoy (la pantalla solo tiene datos descargados de esta semana).
  const weekDates = buildNutritionWeekDates(today)
  const planDayIso = resolveWeekIsoFromDowParam(weekDates, query.dow, today)
  const todayViewIso = resolveWeekIsoFromDateParam(weekDates, query.date, today)

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
            <TodayView base={base} clientId={user.id} selectedIso={todayViewIso} todayIso={today} />
          </Suspense>
        ) : null}
        {view === 'plan' ? (
          <Suspense fallback={<ViewSkeleton />}>
            <PlanView base={base} clientId={user.id} selectedIso={planDayIso} todayIso={today} />
          </Suspense>
        ) : null}
        {view === 'history' ? (
          <Suspense fallback={<ViewSkeleton />}>
            <HistoryView
              base={base}
              before={query.before ?? null}
              clientId={user.id}
              date={query.date ?? null}
              today={today}
            />
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

/**
 * Cliente acotado (cast, cero `any` fuera de esta forma) para leer la tabla nueva
 * `nutrition_item_substitutions_v2` por lectura directa RLS-scoped. La tabla aun no esta en
 * `database.types.ts` — la crea la migracion aditiva `20260721150000_nutrition_item_substitutions_v2.sql`
 * (protocolo aditivo-en-LIVE). Regenerar `database.types.ts` y retirar este cast cuando este LIVE.
 * Mismo patron acotado que `getNutritionConversionLinkForWeb` en el read service.
 */
type SubstitutionReadClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: Array<Parameters<typeof mapNutritionItemSubstitutionRow>[0]> | null
        error: { message: string; code?: string } | null
      }>
    }
  }
}

/**
 * Reemplazos autorizados por el coach (F-02) de la version vigente, agrupados por item prescrito.
 * Lectura directa RLS-scoped: `nutrition_item_substitutions_v2_select` (can_read_version) cubre al
 * propio alumno sobre versiones published/superseded. Sin plan/version ⇒ mapa vacio. No-bloqueante
 * por diseno: cualquier fallo de lectura degrada a mapa vacio — la fila de reemplazos es
 * informativa y jamas debe tumbar el Today.
 */
async function fetchSubstitutionsByItem(
  versionId: string | null,
): Promise<Record<string, NutritionItemSubstitutionRead[]>> {
  if (!versionId) return {}
  const client = await createClient()
  const { data, error } = await (client as unknown as SubstitutionReadClient)
    .from('nutrition_item_substitutions_v2')
    .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
    .eq('version_id', versionId)

  if (error || !data) {
    if (error) {
      console.error('nutrition_v2_web_read', {
        rpc: 'nutrition_item_substitutions_v2.select',
        ok: false,
        errorCode: error.code ?? 'READ_ERROR',
      })
    }
    return {}
  }

  return groupSubstitutionsByPrescriptionItem(data.map(mapNutritionItemSubstitutionRow))
}

/**
 * Tab "Hoy" con navegación semanal.
 *
 * REGLA DURA: `getNutritionTodayV2ForWeb` se llama SOLO cuando el día elegido es hoy. Ese RPC es
 * `volatile` — llama `ensure_day_snapshot`, que materializa filas create-once y lanza
 * `nutrition_v2_snapshot_date_out_of_window` con fecha > hoy+1. Mirar el lunes o el sábado jamás
 * debe escribir datos. El pasado se pinta del historial ya descargado y el futuro de la
 * proyección de `plan.dayVariants` (misma regla del snapshot, sin fetch por celda).
 */
async function TodayView({
  base,
  clientId,
  selectedIso,
  todayIso,
}: {
  base: string
  clientId: string
  /** Día que el alumno está mirando (siempre dentro de la semana en curso). */
  selectedIso: string
  todayIso: string
}) {
  const isToday = selectedIso === todayIso

  // El empty-state depende SOLO del plan vigente en vivo (misma senal que el tab "Plan" y que la
  // ficha del coach). El registro del dia (`today.plan`) puede seguir apuntando al plan anterior o
  // venir vacio si se genero antes de publicar el nuevo: eso NO oculta la pantalla, se refleja con
  // un aviso honesto arriba y el alumno igual puede registrar lo que coma.
  const [today, plan, history, clientName] = await Promise.all([
    isToday ? getNutritionTodayV2ForWeb({ clientId, date: todayIso }) : null,
    getNutritionPlanV2ForWeb({ clientId, date: todayIso }),
    getNutritionHistoryV2ForWeb({
      clientId,
      before: nutritionWeekHistoryCursor(todayIso),
      pageSize: NUTRITION_WEEK_HISTORY_PAGE_SIZE,
    }),
    isToday ? getCurrentStudentNutritionDisplayName(clientId) : null,
  ])

  // Reemplazos estructurados de la version que el alumno VE hoy (`today.plan`, no `plan.plan`): los
  // items mostrados son de esa version, asi los reemplazos empatan durante el lag de publicacion.
  const substitutionsByItem = today != null ? await fetchSubstitutionsByItem(today.plan?.versionId ?? null) : {}

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

  // La semana se compone de datos YA descargados: plan (7 variantes) + historial disperso.
  const cells = buildNutritionWeek({
    variants: plan.dayVariants,
    history: history.items,
    weekStartIso: todayIso,
    todayIso,
  })
  const selectedCell = cells.find((cell) => cell.isoDate === selectedIso) ?? null
  const homeHref = `${base}/nutrition-v2`

  let body: ReactNode = null
  if (today != null) {
    const showTodayPlanLag = today.plan === null || today.plan.id !== plan.plan.id
    const lagMessage =
      today.plan === null
        ? 'Tu nuevo plan ya está publicado. Las metas y comidas de hoy se activan mañana; hoy puedes registrar lo que comas.'
        : 'Tu nuevo plan ya está publicado. Hoy todavía ves las metas del plan anterior; desde mañana se aplican las del nuevo.'

    // Badge multi-día (FD3): SOLO con más de una variante, y SOLO cuando el registro del día ya
    // corresponde al plan vigente — durante el lag de publicación el snapshot es de otra versión
    // y nombrar la variante nueva sería mentir. No decide nada: explica lo que el snapshot ya fijó.
    const todayVariant =
      plan.dayVariants.length > 1 && !showTodayPlanLag
        ? resolveNutritionDayVariantForDate(plan.dayVariants, todayIso)
        : null

    body = (
      <>
        {showTodayPlanLag ? (
          <div className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-body">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <p>{lagMessage}</p>
          </div>
        ) : null}
        {todayVariant ? (
          <p className="inline-flex items-center gap-2 rounded-pill border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:border-primary/40 dark:bg-primary/15">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {formatNutritionTodayVariantBadge(todayVariant)}
          </p>
        ) : null}
        <TodayExperience
          today={today}
          clientId={clientId}
          clientName={clientName}
          substitutionsByItem={substitutionsByItem}
          scanHref={`${base}/nutrition-v2/scanner`}
          visibleNotes={plan.visibleNotes}
        />
      </>
    )
  } else if (selectedCell != null) {
    body =
      selectedCell.state === 'future' ? (
        <FutureDayPreview backHref={homeHref} cell={selectedCell} />
      ) : (
        <PastDaySummary backHref={homeHref} cell={selectedCell} />
      )
  }

  // Sin semana compuesta (fecha imposible) no se pinta un calendario inventado: queda el día.
  if (cells.length === 0 || selectedCell == null) return <div className="space-y-4">{body}</div>

  return (
    <WeekDayNavigator
      cells={toWeekNavCells(cells)}
      hrefByIso={Object.fromEntries(
        // Hoy vive en la URL canónica (sin `?date=`), que es la misma a la que vuelve el banner.
        cells.map((cell): [string, string] => [
          cell.isoDate,
          cell.isoDate === todayIso ? homeHref : `${homeHref}?date=${cell.isoDate}`,
        ]),
      )}
      label="Días de la semana"
      selectedIso={selectedCell.isoDate}
      sticky
    >
      {body}
    </WeekDayNavigator>
  )
}

/**
 * Tab "Plan": selector semanal + LA variante del día elegido.
 *
 * Antes apilaba las 7 variantes expandidas (~9.700 px) y repetía una tira Lu-Do por card
 * (auditoría P1-9/P1-10). Ahora hay un solo selector arriba —el que además navega— y una sola
 * card. "Metas del día" lee la variante SELECCIONADA, no la variante por defecto (P1-8: con
 * multi-día mostraba una cifra que no era la del día que el alumno estaba mirando).
 */
async function PlanView({
  base,
  clientId,
  selectedIso,
  todayIso,
}: {
  base: string
  clientId: string
  selectedIso: string
  todayIso: string
}) {
  const [plan, history] = await Promise.all([
    getNutritionPlanV2ForWeb({ clientId, date: todayIso }),
    getNutritionHistoryV2ForWeb({
      clientId,
      before: nutritionWeekHistoryCursor(todayIso),
      pageSize: NUTRITION_WEEK_HISTORY_PAGE_SIZE,
    }),
  ])
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
  const multiDay = plan.dayVariants.length > 1
  const cells = buildNutritionWeek({
    variants: plan.dayVariants,
    history: history.items,
    weekStartIso: todayIso,
    todayIso,
  })
  const selectedCell = cells.find((cell) => cell.isoDate === selectedIso) ?? null
  // Sin semana compuesta (fecha imposible) se cae al día base para no dejar la vista muda.
  const fallbackVariant = plan.dayVariants.find((variant) => variant.isDefault) ?? plan.dayVariants[0] ?? null
  const dayVariant = selectedCell != null ? selectedCell.variant : fallbackVariant

  const dayBody =
    dayVariant != null ? (
      <>
        <PlanObjectivesCard
          caption={multiDay && selectedCell != null ? formatSelectedDayCaption(selectedCell) : null}
          targets={dayVariant.targets}
          title={multiDay ? 'Metas del día' : 'Metas diarias'}
        />
        <PlanVariantCard variant={dayVariant} />
      </>
    ) : (
      <NutritionStatePanel
        illustration="sin-plan"
        title="Ese día no tiene comidas prescritas"
        description="Tu plan no define una estructura para ese día ni un día base al que seguir. Si crees que falta algo, coméntalo con tu coach."
      />
    )

  return (
    <div className="space-y-4">
      {/* Encabezado del plan */}
      <NutritionCard>
        <div className="flex flex-wrap items-center gap-2">
          <StrategyBadge strategy={summary.strategy} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-strong">{summary.name}</h2>
        <p className="mt-1 text-xs text-muted">
          Vigente desde {formatNutritionShortDate(summary.effectiveFrom)}
          {summary.effectiveTo ? ` hasta ${formatNutritionShortDate(summary.effectiveTo)}` : ''}
        </p>
        {/* Auditoría P2: fuera el párrafo de descripción de la estrategia — texto de folleto,
            constante, se lee una vez en la vida y no cambia ninguna decisión del alumno. */}
        {plan.visibleNotes ? (
          <div className="mt-4 rounded-control border border-border-subtle bg-surface-sunken p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Notas de tu coach</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-body">{plan.visibleNotes}</p>
          </div>
        ) : null}
      </NutritionCard>

      {/* Selector semanal + el día elegido (metas + estructura). Todo lo que va entre el selector
          y las reglas habla del día seleccionado; lo que no depende del día queda fuera. */}
      {selectedCell != null ? (
        <WeekDayNavigator
          cells={toWeekNavCells(cells)}
          hrefByIso={Object.fromEntries(
            cells.map((cell, index): [string, string] => [
              cell.isoDate,
              `${base}/nutrition-v2?view=plan&dow=${index + 1}`,
            ]),
          )}
          label="Días del plan"
          selectedIso={selectedCell.isoDate}
        >
          {dayBody}
        </WeekDayNavigator>
      ) : (
        dayBody
      )}

      {/* Reglas del plan (no dependen del día) */}
      <PlanRulesCard permissions={plan.permissions} />
    </div>
  )
}

/** Metas del día seleccionado (energía + macros), en una grilla legible. */
function PlanObjectivesCard({
  targets,
  title = 'Metas diarias',
  caption = null,
}: {
  targets: PlanVariant['targets']
  /** Con multi-día se titula "Metas del día": son las de la variante que el alumno está viendo. */
  title?: string
  /** "Lunes · Día alto" — deja claro de qué día son las cifras (auditoría P1-8). */
  caption?: string | null
}) {
  const rows: Array<{ label: string; value: string }> = []
  if (targets.calories != null) rows.push({ label: 'Energía', value: formatNutritionCalories(targets.calories) })
  if (targets.proteinG != null) rows.push({ label: 'Proteína', value: formatNutritionAmount(targets.proteinG, 'g') })
  if (targets.carbsG != null) rows.push({ label: 'Carbohidratos', value: formatNutritionAmount(targets.carbsG, 'g') })
  if (targets.fatsG != null) rows.push({ label: 'Grasas', value: formatNutritionAmount(targets.fatsG, 'g') })
  // Auditoría P4: fuera "Fibra" — ningún builder actual escribe `targets.fiberG` (siempre null),
  // así que era una fila de código inalcanzable con cualquier plan creado hoy.
  if (rows.length === 0) return null
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{title}</p>
        {caption ? <p className="text-xs font-medium text-muted">{caption}</p> : null}
      </div>
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

/**
 * Reglas/permisos del alumno como pastillas.
 *
 * Auditoría P1: podado a los 2 permisos que de verdad cambian la pantalla del alumno
 * (`canRegisterFreely`, `canAdjustPrescribedQuantity` — ver tabla §3). Se retiraron
 * "Intercambios permitidos" / "Puedes mover comidas de franja" / "Puedes omitir opcionales": los
 * tres son chips de texto sin setter en ningún builder ni consumidor real en la UI del alumno —
 * la card prometía reglas que la pantalla no cumplía.
 */
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

/**
 * Tab "Historial": card por SEMANA (SPEC ola 3 punto 7), no por día suelto.
 *
 * Con `?date=` presente delega en `HistoryDayDetailView` (el día abierto desde el mini-strip, en
 * modo lectura — mismo mecanismo/componentes de "día pasado" de la ola 1, `PastDaySummary`).
 * Sin `date`, pagina por semanas de forma ACUMULATIVA: la carga inicial es 100% RSC y "Ver
 * semanas anteriores" AGREGA tandas vía server action (`HistoryWeeksList`), nunca reemplaza el
 * listado — a diferencia del link `?before=` legado, que navegaba la página entera.
 */
async function HistoryView({
  clientId,
  before,
  base,
  today,
  date,
}: {
  clientId: string
  before: string | null
  base: string
  today: string
  date: string | null
}) {
  if (date != null) {
    return <HistoryDayDetailView base={base} clientId={clientId} dateIso={date} today={today} />
  }

  const history = await getNutritionHistoryV2ForWeb({ clientId, before, pageSize: NUTRITION_HISTORY_PAGE_ROWS })
  const weeks = groupHistoryDaysByWeek(history.items, today)
  if (weeks.length === 0) {
    return (
      <NutritionStatePanel
        illustration="historial-vacio"
        title="Todavía no hay historial"
        description="Tus semanas aparecerán aquí después del primer registro o snapshot del plan."
      />
    )
  }

  return (
    <HistoryWeeksList
      base={base}
      clientId={clientId}
      initialCursor={history.nextCursor}
      initialHasMore={history.hasMore}
      initialWeeks={weeks}
      pageSize={NUTRITION_HISTORY_PAGE_ROWS}
      todayIso={today}
    />
  )
}

/**
 * Un día del historial abierto desde el mini-strip de su semana, en modo lectura estricta.
 *
 * NO reusa la ventana semanal de "Hoy" (`TodayView`/`week-nav.logic`, deliberadamente acotada a la
 * semana en curso — ver comentario de `resolveWeekIsoFromDateParam`): esta es la "otra página"
 * que ese comentario prevé para navegar semanas anteriores. Solo pide UNA fila de historial
 * (`get_nutrition_history_page_v2`, jamás `get_nutrition_today_v2` — ese RPC es `volatile` y
 * revienta con fecha ≠ hoy) y reconstruye la celda con el mismo helper puro (`buildNutritionWeek`)
 * que arma la semana de Hoy/Plan, así el read-only del día es byte-idéntico al de un día pasado
 * de la semana en curso (`PastDaySummary`, sin variantes: acá no importa la estructura del plan,
 * solo lo que el alumno realmente tuvo).
 */
async function HistoryDayDetailView({
  clientId,
  dateIso,
  base,
  today,
}: {
  clientId: string
  dateIso: string
  base: string
  today: string
}) {
  const historyHref = `${base}/nutrition-v2?view=history`
  if (nutritionDayOfWeekFromIso(dateIso) == null || dateIso > today) {
    redirect(historyHref)
  }

  const [page, legacyDetail] = await Promise.all([
    getNutritionHistoryV2ForWeb({
      clientId,
      before: addNutritionDays(dateIso, 1),
      pageSize: 1,
    }),
    getNutritionLegacyHistoryDetailV2ForWeb({ clientId, date: dateIso }),
  ])
  const row = page.items.find((item) => item.localDate === dateIso) ?? null
  // Generics explícitos: sin variantes reales que inferir de `[]`, fija el mismo par
  // (PlanVariant, NutritionHistoryDay) que `StudentNutritionWeekCell` espera — la celda vale para
  // `PastDaySummary` sin casts. `variant` queda `null` en los 7 días (no hay estructura que mostrar
  // aquí; el día solo necesita lo que el alumno realmente consumió).
  const cells = buildNutritionWeek<PlanVariant, NutritionHistoryDay>({
    variants: [],
    history: row ? [row] : [],
    weekStartIso: dateIso,
    todayIso: today,
  })
  const cell = cells.find((candidate) => candidate.isoDate === dateIso) ?? null
  if (cell == null) redirect(historyHref)

  return (
    <>
      <PastDaySummary backHref={historyHref} backLabel="Volver al historial" cell={cell} />
      <LegacyHistoryDetail detail={legacyDetail} />
    </>
  )
}
