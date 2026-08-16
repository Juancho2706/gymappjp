import { redirect } from 'next/navigation'
import {
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
  type QePortionGroup,
  type QuickEditState,
} from '@eva/nutrition-v2'
import type { EditorCreationInput } from '../_quick-edit/QuickEditProvider'
import { EditorClient } from './EditorClient'

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

  const sharedProps = {
    clientId,
    clientName: detail.client.fullName,
    planModel: detail.plan,
    today,
    hasNutritionPro: nutritionProEnabled,
    viewerCoachId: user.id,
    foodRestrictions: foodPrefs.restrictions,
    favoriteFoodIds: foodPrefs.favoriteIds,
    rememberedQuantities,
  }

  // ── MODO EDICION (W1): sin origen y con plan vigente ────────────────────────────────────
  if (!origin && existing) {
    // Carry-over F-02 + NUT-008: identico a la ficha — un fallo de lectura NO degrada a [],
    // viaja como flag y el provider bloquea "Publicar".
    const substitutionsLoad: ItemSubstitutionsLoad = await fetchItemSubstitutionsForVersion(
      existing.versionId,
    )
    return (
      <EditorClient
        {...sharedProps}
        itemSubstitutions={substitutionsLoad.ok ? substitutionsLoad.rows : []}
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
        const hydrated = readModelToEditState(
          sourceDetail.plan,
          buildSubstitutionMap(sourceSubs.ok ? sourceSubs.rows : []),
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
      return (
        <EditorClient
          {...sharedProps}
          itemSubstitutions={substitutionsLoad.ok ? substitutionsLoad.rows : []}
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
