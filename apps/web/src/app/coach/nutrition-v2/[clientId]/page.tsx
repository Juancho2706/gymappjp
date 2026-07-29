import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Info, Plus } from 'lucide-react'
import {
  DayVariantWeekStrip,
  MacroBudget,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  PrescribedPortionChips,
  StrategyBadge,
} from '@/components/nutrition-v2'
import {
  buildNutritionWeek,
  createNutritionMacroValue,
  formatNutritionCalories,
  resolveNutritionDayVariantForDate,
  sortNutritionDayVariantsForDisplay,
} from '@eva/nutrition-v2'
import { formatDateDdMmYyyySantiago, getTodayInSantiago } from '@/lib/date-utils'
import { foodCategoryIconUrl, foodCategoryIconUrlFromName } from '@/lib/food-image'
import { cn } from '@/lib/utils'
import { getNutritionPlansPageCoach } from '../../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  getNutritionCoachRosterV2ForWeb,
  getNutritionConversionLinkForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { createClient } from '@/lib/supabase/server'
import {
  filterHistoryDaysToBaseWindow,
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { AssignPlanToClientsDialog, type AssignRosterEntry } from '../_components/AssignPlanToClientsDialog'
import { ArchivePlanButton } from '../_components/ArchivePlanButton'
import { ConvertedPlanBanner } from '../_components/ConvertedPlanBanner'
import { canAssignSourcePlan } from '../_lib/assign-plan'
import {
  fetchItemSubstitutionsForVersion,
  type ItemSubstitutionsLoad,
} from '../_data/item-substitutions.data'
import { QuickEditEntry } from './_quick-edit/QuickEditEntry'
import { PortionDayCoverageCard } from './PortionDayCoverageCard'
import { CoachWeekDayNav } from './CoachWeekDayNav'
import { SelectedDayPanel } from './SelectedDayPanel'
import { resolveCoachWeekSelection } from './_lib/week-nav'
import { FoodThumb } from './builder/_components/FoodImage'
import { resolveFoodImageUrl } from './builder/_components/food-card-presentation'

// Regla transversal (owner, 2026-07-29): toda lista de alimentos muestra su miniatura — foto
// real del catálogo vía `item.media` si existe, icono estático por categoría si no. Mismo par
// componente/helper que ya usa el builder del coach para las cards de resultado de búsqueda.
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

interface Props {
  params: Promise<{ clientId: string }>
  // `date` = día visto de la semana del alumno (tira Lu-Do). NO cambia la fecha del read: ver
  // el bloque "Semana del alumno" mas abajo y `_lib/week-nav.ts`.
  searchParams: Promise<{ published?: string; date?: string }>
}

export default async function CoachNutritionV2ClientPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const { published, date: requestedDate } = await searchParams
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    clientId,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) redirect('/coach/nutrition-plans')

  // Propagate the active workspace: the scoped RPC denies (42501) a client outside this pool.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })
  const hasPlan = detail.plan.plan !== null
  // "Asignar a otros alumnos" solo tiene sentido si la FUENTE tiene una version publicada
  // vigente (la misma senal en vivo que decide el empty-state de abajo, `detail.plan.plan`). Un
  // plan superseded/sin variantes no es copiable, por eso no gatilla el CTA ni la carga del roster.
  const canAssign = canAssignSourcePlan({
    vigentePlanStatus: detail.plan.plan?.status ?? null,
    hasPlanStructure: detail.plan.plan !== null,
    variantCount: detail.plan.dayVariants.length,
  })

  // Gate del addon Nutricion Pro: sin addon, el historial del alumno para el coach se
  // limita a la ventana BASE (~30 dias). Los RPC de lectura no aceptan corte temporal,
  // asi que recortamos server-side post-fetch (ver nutrition-pro.ts). El alumno no cambia.
  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )
  const recentDays = nutritionProEnabled
    ? detail.recentDays
    : filterHistoryDaysToBaseWindow(detail.recentDays, today)

  // Roster del workspace para "Asignar a otros alumnos": solo se carga si hay plan publicado.
  // NUT-026: primera pagina alfabetica server-side (antes: bucle de 8 paginas x 50 sobre el hub
  // scoped, tope silencioso de 399 destinos y busqueda client-side sobre el array truncado).
  // El dialogo busca en TODO el workspace via `searchCoachRosterAction`.
  let assignRoster: AssignRosterEntry[] = []
  let assignRosterHasMore = false
  if (canAssign) {
    const rosterPage = await getNutritionCoachRosterV2ForWeb({ scope, pageSize: 50 })
    assignRoster = rosterPage.items
      .filter((item) => item.clientId !== clientId)
      .map((item) => ({
        clientId: item.clientId,
        clientName: item.clientName ?? 'Alumno',
        hasPlan: item.planStatus === 'published',
      }))
    assignRosterHasMore = rosterPage.hasMore
  }

  // El plan vigente (`detail.plan.plan`) es la senal en vivo del plan activo/publicado. El bloque
  // "hoy" se calcula sobre el registro del dia, que puede haberse generado antes de publicar el
  // plan nuevo: en ese caso mostramos la ficha completa con un aviso, no un empty-state.
  const todayPlan = detail.today.plan
  const activePlan = detail.plan.plan
  const showTodayPlanLag = activePlan !== null && (todayPlan === null || todayPlan.id !== activePlan.id)
  const todayPlanLagMessage =
    todayPlan === null
      ? 'El plan vigente ya está publicado. El registro de hoy todavía no tiene metas asignadas; desde mañana se aplican las del nuevo plan.'
      : 'El plan vigente ya está publicado. Los registros de hoy siguen mostrando el plan anterior; desde mañana se usa el nuevo.'

  // FD3 (multi-dia): las cards de "Estructura prescrita" se ordenan con el dia base primero y
  // despues los dias especificos de lunes a domingo, y cada una muestra su tira Lu-Do. La card
  // que aplica hoy se marca solo si el registro del dia ya es del plan vigente (durante el lag
  // el snapshot es de otra version, nombrar la variante nueva seria mentir). Cero seleccion nueva:
  // se replica la regla que el snapshot ya congelo.
  const orderedVariants = sortNutritionDayVariantsForDisplay(detail.plan.dayVariants)
  const multiDayPlan = detail.plan.dayVariants.length > 1
  const todayVariant =
    multiDayPlan && !showTodayPlanLag
      ? resolveNutritionDayVariantForDate(detail.plan.dayVariants, today)
      : null

  // SEMANA DEL ALUMNO (`?date=`). La tira Lu-Do se compone con lo que YA viajó en ESTE render:
  // `plan.dayVariants` (el RPC devuelve TODAS las variantes, no solo la de hoy) + `recentDays` ya
  // recortado por el gate de Nutricion Pro. El read NO se repite ni se mueve de fecha: `?date=`
  // solo decide que dia se MUESTRA. Pedir el detalle con otra fecha llamaria a
  // `get_nutrition_today_v2` con esa fecha, que es `volatile` (materializa snapshots create-once,
  // congelando dias que el alumno nunca abrio) y revienta mas alla de hoy+1
  // (`nutrition_v2_snapshot_date_out_of_window`). Prohibido: factibilidad 2026-07-29 §2.3.
  const weekSelection = resolveCoachWeekSelection({
    requestedDate,
    todayIso: today,
    historyDays: recentDays,
  })
  const weekCells = buildNutritionWeek({
    variants: detail.plan.dayVariants,
    history: recentDays,
    weekStartIso: weekSelection.weekStartIso,
    todayIso: today,
  })
  const selectedCell = weekCells.find((cell) => cell.isoDate === weekSelection.selectedIso) ?? null
  const fichaHref = `/coach/nutrition-v2/${clientId}`
  const variantAnchorId = (variantId: string) => `variante-${variantId}`
  // Solo el FUTURO se ancla a su card de "Estructura prescrita": proyectar es legitimo porque
  // replica la regla que el snapshot congelara. Para un dia pasado manda la fila del historial
  // (pudo congelar otra version del plan), asi que no se resalta ninguna variante vigente.
  const previewVariantId = selectedCell?.state === 'future' ? (selectedCell.variant?.id ?? null) : null

  // Banner "plan convertido" (SPEC AC8): solo se consulta cuando hay plan vigente, y solo se
  // renderiza si existe link (`nutrition_v2_conversion_links`). Sin plan o sin link → cero query
  // extra visible / cero render, el read degrada a `null` si la tabla no esta disponible.
  const conversionLink = activePlan
    ? await getNutritionConversionLinkForWeb({ v2PlanId: activePlan.id })
    : null
  const convertedAtLabel = conversionLink ? formatDateDdMmYyyySantiago(conversionLink.convertedAt) : null

  // Carry-over F-02: reemplazos autorizados congelados de la version vigente. El read-model
  // hot-path no los transporta; se leen aparte (RLS-scoped) y se inyectan en el quick-edit para
  // que republicar NO los borre. Solo con plan vigente (el entry solo se monta ahi).
  // NUT-008: un fallo de lectura NO degrada a [] — viaja como `substitutionsLoadFailed` y el
  // quick-edit bloquea "Publicar" (republicar con el mapa vacio borraria los reemplazos).
  const substitutionsLoad: ItemSubstitutionsLoad = hasPlan
    ? await fetchItemSubstitutionsForVersion(detail.plan.plan?.versionId)
    : { ok: true, rows: [] }
  const itemSubstitutions = substitutionsLoad.ok ? substitutionsLoad.rows : []
  const substitutionsLoadFailed = !substitutionsLoad.ok

  return (
    // Header movil compacto: flecha (vuelve al Centro) + eyebrow/nombre + UNA CTA primaria.
    // "Asignar a otros alumnos" se demueve a accion secundaria junto a los badges del plan.
    <NutritionPageShell
      flushMobile
      eyebrow="Ficha nutricional"
      title={detail.client.fullName}
      backHref="/coach/nutrition-v2"
      actions={
        // Con plan vigente la CTA primaria es EDITAR in-place (quick-edit); el wizard queda
        // como camino secundario "Rehacer con el asistente" en el menu "..." del entry.
        hasPlan ? (
          <QuickEditEntry
            clientId={clientId}
            clientName={detail.client.fullName}
            planModel={detail.plan}
            itemSubstitutions={itemSubstitutions}
            substitutionsLoadFailed={substitutionsLoadFailed}
            today={today}
            hasNutritionPro={nutritionProEnabled}
          />
        ) : (
          <Link
            href={`/coach/nutrition-v2/${clientId}/builder`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-primary/100 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 md:gap-2 md:px-4"
          >
            <Plus className="h-4 w-4" />
            Crear plan
          </Link>
        )
      }
      // NUT-007 (opcion A): el aside "Nota profesional" se retiro. Leia
      // `nutrition_plan_private_notes_v2`, una tabla que NINGUN camino de escritura puebla
      // (no hay input de nota privada en el builder, en RN ni en quick-edit), asi que el
      // panel mostraba el fallback "Sin nota privada" de forma permanente para todo coach.
      // Las notas privadas del coach por alumno viven hoy en la ficha del alumno
      // (`nutrition_private_notes`, CoachPrivateNotesPanel). Reponer una nota clinica POR
      // VERSION exige SPEC + UI de escritura + copy-forward al republicar (opcion B).
    >
      {published ? (
        <div className="mb-5 flex items-center gap-2 rounded-control border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          Plan publicado. La version quedo vigente para el alumno.
        </div>
      ) : null}

      {/* El empty-state depende SOLO del plan vigente en vivo (`detail.plan.plan`, que
          get_nutrition_plan_read_v2 resuelve filtrando lifecycle_status='active'). Tras archivar,
          ese read model devuelve null de inmediato. El registro del dia (`detail.today.plan`) puede
          seguir apuntando al plan anterior o venir vacio si se genero antes de publicar el nuevo:
          eso NO oculta la ficha, se refleja con un aviso inline mas abajo. */}
      {!detail.plan.plan ? (
        <div data-testid="nutrition-v2-plan-empty">
          <NutritionStatePanel
            illustration="sin-plan"
            title="Sin plan vigente"
            description="Crea y publica un plan para revisar objetivos y adherencia."
            action={
              <Link
                href={`/coach/nutrition-v2/${clientId}/builder`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Crear plan
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-5" data-testid="nutrition-v2-plan-vigente">
          {convertedAtLabel ? (
            <ConvertedPlanBanner planId={detail.plan.plan.id} convertedAtLabel={convertedAtLabel} />
          ) : null}

          {/* Fila de estado del plan: badges a la izquierda, "Asignar a otros alumnos" como
              accion secundaria a la derecha (fuera del header; solo con plan publicado copiable). */}
          <div className="flex flex-wrap items-center gap-2">
            <StrategyBadge strategy={(detail.today.plan ?? detail.plan.plan).strategy} />
            {canAssign ? (
              <div className="ml-auto">
                <AssignPlanToClientsDialog
                  sourceClientId={clientId}
                  sourcePlanVersion={detail.plan.plan.versionNumber}
                  sourcePlanName={detail.plan.plan.name}
                  roster={assignRoster}
                  rosterHasMore={assignRosterHasMore}
                  today={today}
                />
              </div>
            ) : null}
          </div>

          {showTodayPlanLag ? (
            <div className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-body">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <p>{todayPlanLagMessage}</p>
            </div>
          ) : null}

          {/* Seguimiento por día: la tira Lu-Do encabeza el bloque y decide qué día se ve.
              HOY queda siempre marcado aunque el coach esté mirando otro día. */}
          {weekCells.length > 0 ? (
            <section aria-labelledby="semana-alumno" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-strong" id="semana-alumno">
                  Semana del alumno
                </h2>
                {!weekSelection.isToday ? (
                  <Link
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                    href={fichaHref}
                  >
                    Volver a hoy
                  </Link>
                ) : null}
              </div>
              <CoachWeekDayNav
                basePath={fichaHref}
                cells={weekCells}
                selectedIso={weekSelection.selectedIso}
                todayIso={today}
              />
            </section>
          ) : null}

          {weekSelection.isToday || selectedCell == null ? (
            <>
              <MacroBudget
                calories={{
                  consumed: detail.today.consumed.calories,
                  target: detail.today.targets.calories ?? 0,
                }}
                macros={[
                  createNutritionMacroValue('protein', {
                    consumed: detail.today.consumed.proteinG,
                    target: detail.today.targets.proteinG ?? 0,
                  }),
                  createNutritionMacroValue('carbs', {
                    consumed: detail.today.consumed.carbsG,
                    target: detail.today.targets.carbsG ?? 0,
                  }),
                  createNutritionMacroValue('fats', {
                    consumed: detail.today.consumed.fatsG,
                    target: detail.today.targets.fatsG ?? 0,
                  }),
                ]}
              />

              {/* Fila "Porciones" read-only bajo los macros del día (SPEC UX-b). Misma
                  fuente que el alumno (read-model), cero cálculo nuevo; sin targets de
                  porciones el componente no renderiza nada. Es la cobertura de HOY: con otro
                  día seleccionado no se pinta (el read-model no trae cobertura histórica). */}
              <PortionDayCoverageCard coverage={detail.today.dayCoverage} />
            </>
          ) : (
            <SelectedDayPanel
              cell={selectedCell}
              todayIso={today}
              variantAnchorId={previewVariantId ? variantAnchorId(previewVariantId) : null}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <NutritionCard>
              <h2 className="font-display text-lg font-semibold text-strong">Plan vigente</h2>
              <p className="mt-1 text-sm text-muted">{detail.plan.plan?.name}</p>
              <p className="mt-3 text-sm leading-6 text-body">
                {detail.plan.visibleNotes || 'Sin indicaciones visibles.'}
              </p>
            </NutritionCard>
            <NutritionCard>
              <h2 className="font-display text-lg font-semibold text-strong">Hoy</h2>
              {/* R1 (auditoría 2026-07-29): se retiró el "K kcal restantes según el snapshot del
                  día" de acá — MacroBudget, arriba, ya muestra las restantes (y con otra fórmula:
                  dos cifras del mismo concepto podían discrepar). Queda una sola formula visible. */}
              <p className="mt-1 text-sm text-muted">
                {detail.today.consumed.entryCount} registro{detail.today.consumed.entryCount === 1 ? '' : 's'} · {detail.today.mealSlots.length} franjas
              </p>
            </NutritionCard>
          </div>

          {detail.plan.dayVariants.length > 0 ? (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold text-strong">Estructura prescrita</h2>
              <div className="space-y-4">
                {orderedVariants.map((variant) => (
                  <NutritionCard
                    className={cn(
                      // Ancla del día futuro seleccionado: se resalta la card que aplicará, sin
                      // duplicar el árbol de franjas en el panel de arriba.
                      'scroll-mt-24',
                      previewVariantId === variant.id ? 'border-primary ring-1 ring-primary/40' : null,
                    )}
                    id={variantAnchorId(variant.id)}
                    key={variant.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-strong">{variant.label}</h3>
                        {todayVariant?.id === variant.id ? (
                          <span className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:border-primary/40 dark:bg-primary/15">
                            Hoy aplica
                          </span>
                        ) : null}
                        {/* Con una sola variante el badge no aporta (aplica los 7 días), igual
                            que la tira Lu-Do de abajo: se muestra solo en planes multi-día. */}
                        {multiDayPlan && previewVariantId === variant.id && selectedCell != null ? (
                          <span className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:border-primary/40 dark:bg-primary/15">
                            Aplica el {selectedCell.longLabel.toLowerCase()}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs tabular-nums text-muted">
                        {variant.targets.calories != null
                          ? `${formatNutritionCalories(variant.targets.calories)} objetivo`
                          : 'Sin objetivo de energía'}
                      </span>
                    </div>
                    {/* Tira Lu-Do de la variante (FD3): con un solo día no aporta y no se pinta. */}
                    {multiDayPlan ? (
                      <DayVariantWeekStrip
                        variants={detail.plan.dayVariants}
                        variant={variant}
                        todayIso={today}
                      />
                    ) : null}
                    {variant.mealSlots.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">Plan flexible: sin franjas prescritas.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {variant.mealSlots.map((slot) => (
                          <li key={slot.id} className="rounded-control border border-border-subtle bg-surface-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-strong">{slot.name}</span>
                              {slot.startTime ? <span className="text-xs text-muted">{slot.startTime}</span> : null}
                            </div>
                            {slot.prescriptionItems.length > 0 ? (
                              <ul className="mt-2 space-y-2">
                                {slot.prescriptionItems.map((item) => {
                                  const itemName = item.name || 'Alimento'
                                  return (
                                    <li key={item.id} className="flex items-center gap-2 text-sm text-body">
                                      <FoodThumb
                                        alt={itemName}
                                        iconUrl={
                                          item.category
                                            ? foodCategoryIconUrl(item.category)
                                            : foodCategoryIconUrlFromName(itemName)
                                        }
                                        imageUrl={resolveFoodImageUrl(item.media ?? null, SUPABASE_BASE)}
                                      />
                                      <span className="min-w-0 flex-1 truncate">
                                        {itemName} · {item.quantity} {item.unit}
                                      </span>
                                      <span className="shrink-0 text-xs tabular-nums text-muted">
                                        {Math.round(item.macros.calories ?? 0)} kcal
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : null}
                            {/* Capa de porciones (P0-3): la franja puede prescribir SOLO porciones, o
                                porciones ademas de los alimentos fijos. Sin targets no pinta nada. */}
                            <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
                            {slot.prescriptionItems.length === 0 &&
                            (slot.exchangeTargets?.length ?? 0) === 0 ? (
                              <p className="mt-2 text-xs text-muted">Sin alimentos prescritos en esta franja.</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </NutritionCard>
                ))}
              </div>
            </section>
          ) : null}

          {/* Zona inferior discreta: archivar el plan vigente. Aislado del CTA primario del header
              para evitar clicks accidentales. Tras archivar, la ficha pasa a "Sin plan vigente". */}
          <section className="border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Archivar retira el plan de la vista del alumno. El historial registrado se conserva.
              </p>
              <ArchivePlanButton
                clientId={clientId}
                planId={detail.plan.plan.id}
                planName={detail.plan.plan.name}
              />
            </div>
          </section>
        </div>
      )}
    </NutritionPageShell>
  )
}
