/**
 * EDITOR UNICO de nutricion — capa de datos RN (T3.3b).
 *
 * Espejo del server component `apps/web/src/app/coach/nutrition-v2/[clientId]/editor/page.tsx`:
 * resuelve QUE arbol se edita antes de montar la pantalla, con las mismas reglas.
 *
 * - EDICION: sin `?from=` y con plan vigente → arbol del read model (macros congeladas) con los
 *   reemplazos F-02 HIDRATADOS (el editor los edita; el quick-edit clasico solo los arrastraba).
 * - CREACION: `?from=template:<id>` / `?from=plan:<clientId-fuente>` / en blanco → arbol de
 *   `draftToEditState` (plantilla) o del read model fuente (copia), sobre un draft base cuyo
 *   `clientId`/`timezone` son SIEMPRE los del alumno destino. El `planId` de la fuente jamas
 *   viaja: solo el del destino, y solo si ya tenia plan (reemplazo con CAS).
 * - Un origen que no abre DEGRADA CON AVISO (leccion JP 2026-08-11: plantilla soft-deleted que
 *   abria el plan vigente en silencio). Con plan vigente degrada a EDICION, jamas a un plan
 *   nuevo encima.
 *
 * La autorizacion real vive donde siempre: RLS del scope en cada lectura y el endpoint movil de
 * mutaciones al publicar. Aca no se decide permiso alguno.
 */

import {
  PLAN_NAME_MAX,
  buildSubstitutionMap,
  catalogToPortionGroups,
  draftToEditState,
  readModelToDraft,
  readModelToEditState,
  type NutritionItemSubstitutionRead,
  type NutritionPlanDraft,
  type NutritionPlanReadModel,
  type NutritionV2CoachScope,
  type PlanBuilderOrigin,
  type QePortionGroup,
  type QuickEditState,
} from '@eva/nutrition-v2'
import { getNutritionClientDetailV2 } from './nutrition-v2.api'
import { fetchNutritionV2ExchangeGroups } from './nutrition-v2-exchange-groups.api'
import { fetchNutritionV2PlanTemplate } from './nutrition-v2-plan-templates.api'
import { loadItemSubstitutionReads } from './nutrition-v2-quick-edit'
import { fetchRememberedQuantities, type RememberedQuantities } from './nutrition-v2-last-quantity'
import type { NutritionV2WriteClient } from './nutrition-v2-builder'

/**
 * Modo CREACION del editor: el arbol NO nace del read model del alumno sino de un draft del
 * contrato (plantilla, copia de plan, o blank). El publish viaja por `publishDraftRN` (el mismo
 * del wizard RN): sin CAS para plan nuevo, con CAS si el alumno ya tenia plan vigente.
 */
export interface EditorCreationInput {
  initialState: QuickEditState
  baseDraft: NutritionPlanDraft
  /** Version vigente del alumno destino si ya tenia plan (CAS del reemplazo); null = plan nuevo. */
  expectedCurrentVersionId: string | null
}

/** Todo lo que la pantalla del editor necesita resuelto ANTES de montar el arbol editable. */
export interface EditorSession {
  /** Reemplazos autorizados de la version base (o de la fuente copiada), forma read-model. */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /** NUT-008: la lectura fallo. Publicar los borraria ⇒ la pantalla bloquea el publish. */
  substitutionsLoadFailed: boolean
  /** null = modo EDICION del plan vigente. */
  creation: EditorCreationInput | null
  /** El `?from=` pedido no se pudo abrir: se degrado y HAY que decirlo. */
  originUnavailable: boolean
  /** Porcion pegajosa (T2.6 F4): ultima cantidad por alimento, precedencia resuelta en SQL. */
  rememberedQuantities: RememberedQuantities
}

/** Dia base vacio + metadatos por defecto: espejo literal del blank del editor web. */
export function blankEditorDraft(input: {
  clientId: string
  clientName: string
  timezone: string
  /** Plan vigente del alumno (reemplazo); ausente = primera raiz. */
  planId?: string | null
}): NutritionPlanDraft {
  return {
    clientId: input.clientId,
    timezone: input.timezone,
    effectiveFrom: null,
    ...(input.planId ? { planId: input.planId } : {}),
    name: `Plan de ${input.clientName}`.slice(0, PLAN_NAME_MAX),
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
}

/**
 * Snapshots de grupos de porciones (codigo/nombre/color) para hidratar los targets de un draft:
 * el draft solo trae ids. Fail-soft: sin catalogo el target degrada VISIBLE a "Grupo no
 * disponible" (`draftToEditState`), que el coach puede quitar — nunca se inventa un grupo.
 */
async function loadPortionGroupsById(
  scope: NutritionV2CoachScope,
): Promise<Record<string, QePortionGroup>> {
  try {
    const { groups } = await fetchNutritionV2ExchangeGroups(scope)
    return Object.fromEntries(
      catalogToPortionGroups(groups).map((group) => [group.exchangeGroupId, group]),
    )
  } catch {
    return {}
  }
}

/**
 * Resuelve la sesion del editor para un alumno. `planModel` es el read model YA cargado por la
 * pantalla (misma lectura que pinta la ficha): aca solo se agregan las lecturas propias del
 * editor (reemplazos, origen).
 */
export async function loadEditorSession(input: {
  db: NutritionV2WriteClient
  scope: NutritionV2CoachScope
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  origin: PlanBuilderOrigin
  todayIso: string
}): Promise<EditorSession> {
  const existing = input.planModel.plan
  // Porcion pegajosa: una sola lectura por sesion de editor (fail-soft, mapa vacio si falla).
  const rememberedQuantities = await fetchRememberedQuantities(input.db, input.clientId)

  // ── EDICION: sin origen y con plan vigente ───────────────────────────────────────────────
  if (!input.origin && existing) {
    const subs = await loadItemSubstitutionReads(input.db, existing.versionId)
    return {
      itemSubstitutions: subs.rows,
      substitutionsLoadFailed: subs.status === 'error',
      creation: null,
      originUnavailable: false,
      rememberedQuantities,
    }
  }

  // ── CREACION ─────────────────────────────────────────────────────────────────────────────
  // Draft base del alumno DESTINO: su clientId y su timezone SIEMPRE mandan (una plantilla o un
  // plan fuente traen los suyos y heredarlos publicaria contra el alumno o la zona equivocada).
  const targetBase = {
    clientId: input.clientId,
    timezone: input.planModel.timezone,
    effectiveFrom: null,
    ...(existing ? { planId: existing.id } : {}),
  }

  let initialState: QuickEditState | null = null
  let baseDraft: NutritionPlanDraft | null = null
  let substitutionsLoadFailed = false
  let originUnavailable = false

  if (input.origin?.kind === 'template') {
    try {
      const template = await fetchNutritionV2PlanTemplate(input.origin.id, { scope: input.scope })
      if (!template) {
        originUnavailable = true
      } else if (!template.foodsComplete) {
        // El endpoint no pudo resolver el catalogo: aplicar el draft daria filas sin macros.
        // Mismo criterio que el web (`fetchBuilderFoodsByIds` no-ok ⇒ origen no disponible).
        originUnavailable = true
      } else {
        const portionGroupsById = await loadPortionGroupsById(input.scope)
        baseDraft = { ...template.draft, ...targetBase }
        initialState = draftToEditState(
          baseDraft,
          { foodsById: template.foods, portionGroupsById },
          { effectiveFrom: null },
        )
      }
    } catch {
      originUnavailable = true
    }
  } else if (input.origin?.kind === 'plan' && input.origin.id !== input.clientId) {
    // "Reutilizar el plan de otro alumno": el id es el del ALUMNO fuente; se copia su plan
    // VIGENTE via read model (macros congeladas, sin fetch de catalogo). El scope se re-aplica
    // en la lectura, asi que fuera del pool la fuente simplemente no abre.
    try {
      const sourceDetail = await getNutritionClientDetailV2({
        clientId: input.origin.id,
        scope: input.scope,
        date: input.todayIso,
      })
      const sourcePlan = sourceDetail.plan.plan
      if (!sourcePlan) {
        originUnavailable = true
      } else {
        const sourceSubs = await loadItemSubstitutionReads(input.db, sourcePlan.versionId)
        // NUT-008 en la copia: sin los reemplazos de la fuente, publicarla los perderia.
        substitutionsLoadFailed = sourceSubs.status === 'error'
        const hydrated = readModelToEditState(
          sourceDetail.plan,
          buildSubstitutionMap(sourceSubs.rows),
          { withMeta: true },
        )
        const sourceBase = readModelToDraft(sourceDetail.plan, input.clientId)
        if (!hydrated || !sourceBase || !hydrated.meta) {
          originUnavailable = true
        } else {
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

  if (!initialState || !baseDraft) {
    // El origen pedido no abrio pero el alumno TIENE plan vigente: degradar a EDICION con aviso
    // (espejo del wizard) — jamas abrir un "plan nuevo" en silencio sobre el vigente.
    if (originUnavailable && existing) {
      const subs = await loadItemSubstitutionReads(input.db, existing.versionId)
      return {
        itemSubstitutions: subs.rows,
        substitutionsLoadFailed: subs.status === 'error',
        creation: null,
        originUnavailable: true,
        rememberedQuantities,
      }
    }
    baseDraft = blankEditorDraft({
      clientId: input.clientId,
      clientName: input.clientName,
      timezone: input.planModel.timezone,
      planId: existing?.id ?? null,
    })
    initialState = draftToEditState(baseDraft, {}, { effectiveFrom: null })
  }

  return {
    itemSubstitutions: [],
    substitutionsLoadFailed,
    creation: {
      initialState,
      baseDraft,
      expectedCurrentVersionId: existing?.versionId ?? null,
    },
    originUnavailable,
    rememberedQuantities,
  }
}
