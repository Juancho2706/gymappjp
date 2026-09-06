import { redirect } from 'next/navigation'
import {
  buildCoachDayIntakeSummary,
  parsePlanBuilderOrigin,
  readModelToDraft,
  type NutritionPlanDraft,
} from '@eva/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { createClient } from '@/lib/supabase/server'
import { loadPlanTemplate, markPlanTemplateUsed } from '@/services/nutrition-v2/plan-templates.service'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  fetchItemSubstitutionsForVersion,
  type ItemSubstitutionsLoad,
} from '../../_data/item-substitutions.data'
import {
  EMPTY_CLIENT_FOOD_PREFS,
  fetchClientFoodPrefsForPicker,
} from '../../_data/client-food-prefs.data'
import { collectTemplateFoodIds } from '@eva/nutrition-v2'
import { fetchBuilderFoodsByIds } from '../../_data/plan-foods.data'
import { fetchRememberedQuantities } from '../../_data/last-quantity.data'
import { loadExchangeGroupsForBuilderAction } from '../../_actions/portions-groups.actions'
import {
  buildSubstitutionMap,
  catalogToPortionGroups,
  draftToEditState,
  readModelToEditState,
  type BuilderFood,
  type QePortionGroup,
  type QuickEditState,
} from '@eva/nutrition-v2'
import type { EditorCreationInput } from '../_quick-edit/QuickEditProvider'
import { getCoachOnboardingEmptyContext } from '@/app/coach/_data/onboarding-empty.queries'
import { activePlanClashCopy } from '@/services/onboarding/templates'
import { firstName, resolveNutritionPrimeraEntry } from '../../_lib/primera-pauta'
import type { PrimeraPautaConfig } from './PrimeraPauta'
import { EditorClient } from './EditorClient'

/**
 * Catalogo VIGENTE de los alimentos referenciados por los REEMPLAZOS leidos, para que la fila de
 * cada reemplazo pueda mostrar la cantidad equivalente que el alumno va a ver («≈ 130 g»).
 *
 * DISPLAY-ONLY y fail-soft TOTAL, a diferencia de la lectura de reemplazos: sin esto la fila
 * simplemente no pinta numero (nunca uno falso), asi que un fallo aca devuelve `undefined` y
 * NO toca `substitutionsLoadFailed` (NUT-008), que es lo que bloquea el publish. Los
 * `snapshot_*` congelados del read-model no sirven de reemplazo: darian la porcion del
 * sustituto, no la equivalencia (ver `readSubstitutionToQe`).
 */
async function loadSubstitutionFoodsById(
  load: ItemSubstitutionsLoad,
): Promise<Record<string, BuilderFood> | undefined> {
  if (!load.ok) return undefined
  const foodIds = load.rows.map((row) => row.foodId).filter((id): id is string => Boolean(id))
  if (foodIds.length === 0) return undefined
  const foodsLoad = await fetchBuilderFoodsByIds(foodIds)
  return foodsLoad.ok ? foodsLoad.foods : undefined
}

/**
 * EDITOR UNICO de nutricion (T3.x) — ruta propia, SIN CTA publica todavia: se llega solo por
 * URL directa mientras dura el QA de la ola (el corte de la CTA de la ficha es W4).
 *
 * Modos (SPEC `docs/specs/nutrition-unified-editor/`):
 * - EDICION (W1): sin `?from=` y con plan vigente — arbol del read model, publish CAS del
 *   quick-edit, metadatos editables.
 * - CREACION (W1.5): `?from=template:<id>` / `?from=plan:<clientId-fuente>` / en blanco (sin
 *   plan vigente) — arbol de `draftToEditState`/read-model fuente, publish `publishPlanAction`
 *   (CAS solo si el alumno ya tenia plan: reemplazo).
 *
 * Un origen que no se puede abrir DEGRADA con aviso, jamas en silencio (leccion del reporte
 * de JP 2026-08-11: plantilla soft-deleted que abria el plan vigente sin una palabra).
 *
 * Mismo perimetro fail-closed que la ficha: sesion coach + workspace no-enterprise + scope V2
 * del workspace (el RPC de lectura deniega 42501 fuera del pool); entitlement Pro server-side
 * solo como afordancia.
 */
export default async function NutritionUnifiedEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { clientId } = await params
  const query = await searchParams
  const origin = parsePlanBuilderOrigin(typeof query.from === 'string' ? query.from : null)
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })
  const existing = detail.plan.plan

  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )
  // Señales dietarias del alumno para el picker (fail-soft: ayudas visuales, no autorizacion).
  const foodPrefs = await fetchClientFoodPrefsForPicker(clientId).catch(() => EMPTY_CLIENT_FOOD_PREFS)
  // Porcion pegajosa (T2.6 F4): precedencia alumno > coach resuelta en SQL. Fail-soft: sin
  // memoria manda el catalogo, como siempre.
  const rememberedQuantities = await fetchRememberedQuantities(clientId).catch(() => ({}))

  // ── Entrada guiada «Arma su primera pauta» (W4 F4.3) ────────────────────────────────────
  // `?primera=1` la enciende. La decision (editar la pauta vigente vs armar una nueva) es
  // SERVER-SIDE: el indice `nutrition_plans_v2_active_root_per_client_uniq` hace que solo pueda
  // haber una vigente, asi que aplicar una plantilla encima moriria con 23505 y el coach veria un
  // error de Postgres por algo que no es un error.
  const primeraEntry = resolveNutritionPrimeraEntry({
    primera: query.primera === '1',
    hasActivePlan: existing != null,
    hasRequestedOrigin: origin != null,
  })
  let primera: Omit<PrimeraPautaConfig, 'onWantsViveTuApp'> | null = null
  if (primeraEntry) {
    const onboarding = await getCoachOnboardingEmptyContext()
    const name = firstName(detail.client.fullName)
    primera = {
      coachId: user.id,
      hasActivePlan: existing != null,
      name,
      notice: primeraEntry.notice === 'plan_activo' ? activePlanClashCopy(detail.client.fullName) : null,
      // «Ver como Ana» abre el magic link del alumno de EJEMPLO: ofrecerlo sobre un alumno real
      // seria mentir (ese link no existe para el).
      isDemo: onboarding.demoClientId != null && onboarding.demoClientId === clientId,
    }
  }

  const sharedProps = {
    clientId,
    clientName: detail.client.fullName,
    primera,
    planModel: detail.plan,
    today,
    hasNutritionPro: nutritionProEnabled,
    viewerCoachId: user.id,
    foodRestrictions: foodPrefs.restrictions,
    favoriteFoodIds: foodPrefs.favoriteIds,
    rememberedQuantities,
    // W3.2/W4.1: qué hay REGISTRADO hoy, para avisar antes de republicar con vigencia HOY (los
    // registros del día quedan apuntando a ítems de la versión anterior). Cero lectura nueva:
    // `detail.today` ya viajó, y el conteo sale del mismo builder que el panel de la ficha.
    todayIntakeSummary: buildCoachDayIntakeSummary(detail.today),
  }

  // ── MODO EDICION (W1): sin origen y con plan vigente ────────────────────────────────────
  if (!origin && existing) {
    // Carry-over F-02 + NUT-008: identico a la ficha — un fallo de lectura NO degrada a [],
    // viaja como flag y el provider bloquea "Publicar".
    const substitutionsLoad: ItemSubstitutionsLoad = await fetchItemSubstitutionsForVersion(
      existing.versionId,
    )
    const substitutionFoodsById = await loadSubstitutionFoodsById(substitutionsLoad)
    return (
      <EditorClient
        {...sharedProps}
        itemSubstitutions={substitutionsLoad.ok ? substitutionsLoad.rows : []}
        substitutionFoodsById={substitutionFoodsById}
        substitutionsLoadFailed={!substitutionsLoad.ok}
        creation={null}
        originUnavailable={false}
      />
    )
  }

  // ── MODO CREACION (W1.5) ────────────────────────────────────────────────────────────────
  // Draft base comun del alumno DESTINO: clientId/timezone de aca SIEMPRE mandan (una
  // plantilla o un plan fuente traen los suyos y heredarlos publicaria contra el alumno o la
  // zona horaria equivocada). `planId` solo si ya hay plan vigente (reemplazo).
  const targetBase = {
    clientId,
    timezone: detail.plan.timezone,
    effectiveFrom: null,
    ...(existing ? { planId: existing.id } : {}),
  }

  let initialState: QuickEditState | null = null
  let baseDraft: NutritionPlanDraft | null = null
  let substitutionsLoadFailed = false
  let originUnavailable = false

  if (origin?.kind === 'template') {
    const template = await loadPlanTemplate(supabase as never, origin.id)
    if (!template) {
      originUnavailable = true
    } else {
      const foodsLoad = await fetchBuilderFoodsByIds(collectTemplateFoodIds(template.draft as never))
      if (!foodsLoad.ok) {
        originUnavailable = true
      } else {
        // Snapshots de grupos para los targets de porciones de la plantilla: el draft solo
        // trae ids; el catalogo vivo del coach pone codigo/nombre/color. Fail-soft: sin
        // catalogo, el target degrada visible a "Grupo no disponible".
        let portionGroupsById: Record<string, QePortionGroup> = {}
        try {
          const groupsRes = await loadExchangeGroupsForBuilderAction({ clientId })
          if (groupsRes.ok) {
            portionGroupsById = Object.fromEntries(
              catalogToPortionGroups(groupsRes.groups).map((group) => [group.exchangeGroupId, group]),
            )
          }
        } catch {
          /* fail-soft */
        }
        baseDraft = { ...template.draft, ...targetBase }
        initialState = draftToEditState(
          baseDraft,
          { foodsById: foodsLoad.foods, portionGroupsById },
          { effectiveFrom: null },
        )
        await markPlanTemplateUsed(supabase as never, template)
      }
    }
  } else if (origin?.kind === 'plan' && origin.id !== clientId) {
    // "Reutilizar el plan de otro alumno": el id es el del ALUMNO fuente; se copia su plan
    // VIGENTE via el read model (macros congeladas + media, sin fetch de foods). El scope del
    // workspace se re-aplica en la lectura (42501 fuera del pool).
    try {
      const sourceDetail = await getNutritionClientDetailV2ForWeb({
        clientId: origin.id,
        scope,
        date: today,
      })
      const sourcePlan = sourceDetail.plan.plan
      if (!sourcePlan) {
        originUnavailable = true
      } else {
        const sourceSubs = await fetchItemSubstitutionsForVersion(sourcePlan.versionId)
        // NUT-008 en la copia: sin los reemplazos de la fuente, publicar la copia los
        // perderia — se bloquea el publish en vez de copiar a medias.
        substitutionsLoadFailed = !sourceSubs.ok
        // El catalogo de los sustitutos viaja solo para el display de la equivalencia (la copia
        // desde plantilla lo consigue via `collectTemplateFoodIds`; aca el arbol nace del
        // read-model, que no lo transporta). Fail-soft: sin el, la fila no pinta numero.
        const sourceSubFoodsById = await loadSubstitutionFoodsById(sourceSubs)
        const hydrated = readModelToEditState(
          sourceDetail.plan,
          buildSubstitutionMap(sourceSubs.ok ? sourceSubs.rows : [], sourceSubFoodsById),
          { withMeta: true },
        )
        const sourceBase = readModelToDraft(sourceDetail.plan, clientId)
        if (!hydrated || !sourceBase || !hydrated.meta) {
          originUnavailable = true
        } else {
          // El planId de la FUENTE jamas viaja: `targetBase` pone el del alumno destino (si
          // tiene plan vigente) o lo deja ausente (plan nuevo).
          const sourceRest: NutritionPlanDraft = { ...sourceBase }
          delete sourceRest.planId
          baseDraft = { ...sourceRest, ...targetBase }
          initialState = { ...hydrated, meta: { ...hydrated.meta, effectiveFrom: null } }
        }
      }
    } catch {
      originUnavailable = true
    }
  }

  // En blanco (sin plan vigente y sin origen, o degradacion de un origen caido SIN plan
  // vigente): un dia base vacio; el coach construye desde cero.
  if (!initialState || !baseDraft) {
    if (originUnavailable && existing) {
      // El origen pedido no abrio pero el alumno TIENE plan vigente: degradar a EDICION con
      // aviso (espejo del wizard) — jamas abrir un "plan nuevo" en silencio sobre el vigente.
      const substitutionsLoad = await fetchItemSubstitutionsForVersion(existing.versionId)
      const substitutionFoodsById = await loadSubstitutionFoodsById(substitutionsLoad)
      return (
        <EditorClient
          {...sharedProps}
          itemSubstitutions={substitutionsLoad.ok ? substitutionsLoad.rows : []}
          substitutionFoodsById={substitutionFoodsById}
          substitutionsLoadFailed={!substitutionsLoad.ok}
          creation={null}
          originUnavailable
        />
      )
    }
    baseDraft = {
      ...targetBase,
      name: `Plan de ${detail.client.fullName}`.slice(0, 180),
      strategy: 'structured',
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      visibleNotes: null,
      privateNotes: null,
      protocolNotes: null,
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los días',
          dayOfWeek: null,
          default: true,
          targets: {
            calories: null,
            proteinG: null,
            carbsG: null,
            fatsG: null,
            fiberG: null,
            sodiumMg: null,
            waterMl: null,
          },
          orderIndex: 0,
          mealSlots: [],
        },
      ],
    }
    initialState = draftToEditState(baseDraft, {}, { effectiveFrom: null })
  }

  const creation: EditorCreationInput = {
    initialState,
    baseDraft,
    expectedCurrentVersionId: existing?.versionId ?? null,
  }

  return (
    <EditorClient
      {...sharedProps}
      itemSubstitutions={[]}
      substitutionsLoadFailed={substitutionsLoadFailed}
      creation={creation}
      originUnavailable={originUnavailable}
    />
  )
}
