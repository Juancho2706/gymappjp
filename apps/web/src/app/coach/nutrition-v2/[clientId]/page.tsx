import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Info, Plus } from 'lucide-react'
import {
  MacroBudget,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  StrategyBadge,
} from '@/components/nutrition-v2'
import {
  buildNutritionWeek,
  createNutritionMacroValue,
  nutritionDayOfWeekFromIso,
} from '@eva/nutrition-v2'
import { formatDateDdMmYyyySantiago, getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  getNutritionCoachRosterV2ForWeb,
  getNutritionConversionLinkForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { createClient } from '@/lib/supabase/server'
import {
  filterHistoryDaysToBaseWindow,
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
  NUTRITION_PRO_HISTORY_DAYS_BASE,
  NUTRITION_PRO_UPGRADE_HREF,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  formatAdherenceWeekSummaryText,
  formatAdherenceWeekSummaryTitle,
  summarizeWeek,
  toAdherenceWeekDays,
} from '@/components/nutrition/adherence-week'
import { AssignPlanToClientsDialog, type AssignRosterEntry } from '../_components/AssignPlanToClientsDialog'
import { ArchivePlanButton } from '../_components/ArchivePlanButton'
import { ConvertedPlanBanner } from '../_components/ConvertedPlanBanner'
import { canAssignSourcePlan } from '../_lib/assign-plan'
import {
  fetchItemSubstitutionsForVersion,
  type ItemSubstitutionsLoad,
} from '../_data/item-substitutions.data'
import {
  fetchCoachPrivateNotes,
  type CoachPrivateNotesLoad,
} from '../_data/coach-private-notes.data'
import {
  EMPTY_CLIENT_FOOD_PREFS,
  fetchClientFoodPrefsForPicker,
} from '../_data/client-food-prefs.data'
import { QuickEditEntry } from './_quick-edit/QuickEditEntry'
import { CoachPrivateNotesPanel } from './CoachPrivateNotesPanel'
import { PortionDayCoverageCard } from './PortionDayCoverageCard'
import { CoachWeekDayNav } from './CoachWeekDayNav'
import { PrescribedStructureSection } from './PrescribedStructureSection'
import { SelectedDayPanel } from './SelectedDayPanel'
import { resolveCoachWeekSelection } from './_lib/week-nav'

// Regla transversal (owner, 2026-07-29): toda lista de alimentos muestra su miniatura — foto
// real del catálogo vía `item.media` si existe, icono estático por categoría si no. La base se
// resuelve acá (server) y se le pasa a `PrescribedStructureSection`, que es el cliente que pinta
// las miniaturas del día elegido.
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
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

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

  // Lectura textual de la semana pintada, con la MISMA definicion que el hub y el perfil del
  // alumno ("registrado" = el dia tiene ingestas; "en meta" = banda 0.9-1.1 de la meta congelada
  // de ese dia). Se deriva de las mismas filas que la tira Lu-Do (`recentDays`, ya recortado por
  // el gate Pro) mas HOY, que nunca viaja en el historial: vive en el read separado
  // `detail.today` y sin inyectarlo un alumno que ya registro hoy contaria como "sin registro".
  // Con `?date=` de una semana pasada, hoy queda fuera de la ventana y no se inyecta.
  const weekAdherenceSummary = summarizeWeek(
    toAdherenceWeekDays({
      historyDays: recentDays,
      window: weekCells.map((cell) => cell.isoDate),
      today: {
        date: today,
        entryCount: detail.today.consumed.entryCount,
        consumedCalories: detail.today.consumed.calories,
        targetCalories: detail.today.targets.calories,
      },
    }),
  )
  // Solo el FUTURO se ancla a "Estructura prescrita": proyectar es legitimo porque replica la regla
  // que el snapshot congelara. Para un dia pasado manda la fila del historial (pudo congelar otra
  // version del plan), asi que la seccion no se preselecciona con la estructura de hoy.
  const structureAnchorId = 'estructura-prescrita'
  const previewDow =
    selectedCell?.state === 'future' && selectedCell.variant != null
      ? nutritionDayOfWeekFromIso(selectedCell.isoDate)
      : null

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

  // Nota privada del coach (decision owner 2026-07-29 punto 4): se lee solo cuando hay plan
  // vigente, porque es ahi donde la card se monta (zona de notas, bajo la nota visible al
  // alumno). Sin plan la ficha es un empty-state de "crea un plan" y no hay nada que anotar.
  const privateNotesLoad: CoachPrivateNotesLoad = hasPlan
    ? await fetchCoachPrivateNotes(clientId)
    : { ok: true, notes: [] }

  // Señales dietarias del alumno para el picker de alimentos del modo edición (alergias,
  // intolerancias, disgustos y favoritos). Server-side y solo con plan vigente: el picker vive
  // dentro del quick-edit, que únicamente se monta ahí. Fail-soft (ver el data-loader): son
  // ayudas visuales, no la barrera de autorización.
  const foodPrefs = hasPlan ? await fetchClientFoodPrefsForPicker(clientId) : EMPTY_CLIENT_FOOD_PREFS

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
            viewerCoachId={user.id}
            foodRestrictions={foodPrefs.restrictions}
            favoriteFoodIds={foodPrefs.favoriteIds}
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
      // Reponer una nota clinica POR VERSION exige SPEC + UI de escritura + copy-forward al
      // republicar (opcion B).
      //
      // La nota privada POR ALUMNO (`nutrition_private_notes`) si vive en esta ficha: card
      // colapsable `CoachPrivateNotesPanel` en la zona de notas, mas abajo — repuesta por
      // decision del owner 2026-07-29 (punto 4) cuando la poda del tab V1 la dejo inalcanzable.
    >
      {published ? (
        <div className="mb-5 flex items-center gap-2 rounded-control border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          Plan publicado. Ya está vigente para el alumno.
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
              {/* Misma frase y misma formula que el hub y el tab Nutricion de la ficha del
                  alumno: el copy sale del primitivo compartido, no se reescribe por superficie. */}
              <p
                className="text-xs text-muted"
                title={formatAdherenceWeekSummaryTitle(weekAdherenceSummary)}
              >
                {formatAdherenceWeekSummaryText(weekAdherenceSummary)}
              </p>
              <CoachWeekDayNav
                basePath={fichaHref}
                cells={weekCells}
                selectedIso={weekSelection.selectedIso}
                todayIso={today}
              />
              {/* QW10 — ventana honesta: sin el addon, `recentDays` viene recortado a la ventana
                  BASE, asi que la tira no puede retroceder mas alla. Se dice en una linea al pie,
                  sin banner ni urgencia; el link lleva a planes (los modulos vienen incluidos). */}
              {!nutritionProEnabled ? (
                <p className="text-xs text-subtle">
                  Mostrando {NUTRITION_PRO_HISTORY_DAYS_BASE} días de historial · con un{' '}
                  <Link
                    className="font-medium text-primary transition-colors hover:text-primary/80"
                    href={NUTRITION_PRO_UPGRADE_HREF}
                  >
                    plan pago
                  </Link>{' '}
                  ves todo el historial
                </p>
              ) : null}
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
              variantAnchorId={previewDow != null ? structureAnchorId : null}
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

          {/* Zona de notas: arriba las indicaciones VISIBLES para el alumno (card "Plan vigente");
              aca la nota PRIVADA del coach sobre este alumno (`nutrition_private_notes`, sin
              policy de lectura para el alumno). Colapsada por defecto: el encabezado adelanta
              fecha y primera linea, y solo se expande para escribir. */}
          <CoachPrivateNotesPanel clientId={clientId} load={privateNotesLoad} />

          {/* SPEC 12 — "Tocas el dia, no la variante": strip Lu-Do del PLAN (kcal por celda,
              punto lleno = dia propio, hueco = hereda el base) + UNA card del dia elegido. Muere
              la pila de cards por variante y su DayVariantWeekStrip repetida. Read-only: el unico
              camino de edicion sigue siendo el lapiz global del quick-edit en el header.
              `key` = dia futuro anclado desde la tira de seguimiento: si el coach mira un dia que
              todavia no ocurre, la seccion abre en ESE dia. */}
          <PrescribedStructureSection
            anchorId={structureAnchorId}
            initialDow={previewDow}
            key={previewDow ?? 'hoy'}
            supabaseBaseUrl={SUPABASE_BASE}
            todayIso={today}
            variants={detail.plan.dayVariants}
          />

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
