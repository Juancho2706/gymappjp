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
  coachFoodOverrideValuesFromRow,
  draftToEditState,
  readModelToDraft,
  readModelToEditState,
  resolveFoodMacros,
  withSyntheticDraftIds,
  type BuilderFood,
  type CoachFoodOverrideRow,
  type CoachFoodOverrideValues,
  type NutritionItemSubstitutionRead,
  type NutritionMacrosBasis,
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
import { newNutritionItemId, type NutritionV2WriteClient } from './nutrition-v2-builder'

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

/**
 * Modo PLANTILLA del editor (T3.3b, espejo de T3.2b en web): el mismo lienzo sin alumno ni
 * vigencia. El arbol nace del draft guardado (o en blanco) y "publicar" se vuelve GUARDAR.
 */
export interface EditorTemplateInput {
  /** Plantilla en edicion; null = nueva (guardar CREA una fila, jamas pisa). */
  templateId: string | null
  initialState: QuickEditState
  baseDraft: NutritionPlanDraft
  /** Descripcion de la FILA (editable en la cabecera; viaja junto al draft al guardar). */
  description: string | null
}

/**
 * `clientId` de relleno del modo plantilla: no autoriza NADA y el guardado
 * (`buildTemplatePayload`, server-side) lo strippea antes de escribir. Mismo valor que el web.
 */
export const TEMPLATE_MODE_CLIENT_ID = '00000000-0000-0000-0000-000000000000'

/** Todo lo que la pantalla del editor necesita resuelto ANTES de montar el arbol editable. */
export interface EditorSession {
  /** Reemplazos autorizados de la version base (o de la fuente copiada), forma read-model. */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /**
   * Catalogo VIGENTE de los alimentos de esos reemplazos, por `foodId`. Solo DISPLAY: alimenta la
   * cantidad equivalente que el alumno va a ver («≈ 130 g») en la fila del reemplazo. Vacio =
   * la fila no pinta numero (nunca uno falso) y nada mas: no bloquea el publish ni viaja al draft.
   */
  substitutionFoodsById: Record<string, BuilderFood>
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

// ---------------------------------------------------------------------------
// Catalogo de los alimentos SUSTITUTOS (display de la equivalencia)
// ---------------------------------------------------------------------------

/** Fila del catalogo que necesita el display del reemplazo. Espejo del select de la web. */
interface SubstitutionFoodRow {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  serving_size: number
  serving_unit: string | null
  category: string | null
  macros_basis: string | null
}

const SUBSTITUTION_FOOD_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, category, macros_basis'

/** Override del coach sobre el alimento (T2.1). La RLS `cfo_*` ya acota las filas al actor. */
const SUBSTITUTION_OVERRIDE_SELECT =
  'food_id, calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams'

// `NutritionV2WriteClient` no expone `.in()` (su cadena de lectura solo tiene eq/order/limit):
// misma tactica que la web con su server client — interfaz MINIMA tipada y un cast, en vez de
// ensanchar el contrato de escritura por una lectura de display.
interface FoodsInReadChain<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  in(column: string, values: readonly string[]): FoodsInReadChain<T>
}
interface SubstitutionFoodsDb {
  from(table: 'foods'): { select(columns: string): FoodsInReadChain<SubstitutionFoodRow> }
  from(table: 'coach_food_overrides'): {
    select(columns: string): FoodsInReadChain<CoachFoodOverrideRow>
  }
}

function toMacrosBasis(value: string | null | undefined): NutritionMacrosBasis | null {
  return value === 'per_100' || value === 'per_serving' ? value : null
}

/**
 * Alimentos VIGENTES (macros ya mergeadas con el override del coach) de los reemplazos leidos.
 *
 * Existe SOLO para el display: con este catalogo la fila del reemplazo muestra la cantidad
 * equivalente que el alumno va a ver («≈ 130 g»); sin el, no muestra nada. Por eso es fail-soft
 * absoluto —cualquier fallo devuelve `{}`— y jamas toca `substitutionsLoadFailed` (NUT-008),
 * que es la lectura de los REEMPLAZOS y esa si bloquea el publish.
 *
 * Los `snapshot_*` congelados del read-model NO sirven de respaldo: darian la porcion del
 * sustituto en vez de la equivalencia (decision documentada en `readSubstitutionToQe`).
 */
async function loadSubstitutionFoodsById(
  db: NutritionV2WriteClient,
  reads: readonly NutritionItemSubstitutionRead[],
): Promise<Record<string, BuilderFood>> {
  const ids = [...new Set(reads.map((read) => read.foodId).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return {}
  try {
    const reader = db as unknown as SubstitutionFoodsDb
    const res = await reader.from('foods').select(SUBSTITUTION_FOOD_SELECT).in('id', ids)
    if (res.error || !res.data) return {}

    // Overrides en UNA lectura, fail-soft aparte: sin ellos el display cae al catalogo crudo,
    // que es exactamente lo que ve un coach que no corrigio nada.
    const overrides = new Map<string, CoachFoodOverrideValues>()
    try {
      const overridesRes = await reader
        .from('coach_food_overrides')
        .select(SUBSTITUTION_OVERRIDE_SELECT)
        .in('food_id', ids)
      if (!overridesRes.error) {
        for (const row of overridesRes.data ?? []) {
          overrides.set(row.food_id, coachFoodOverrideValuesFromRow(row))
        }
      }
    } catch {
      /* fail-soft */
    }

    const foods: Record<string, BuilderFood> = {}
    for (const row of res.data) {
      const macros = resolveFoodMacros(
        {
          calories: row.calories,
          proteinG: row.protein_g,
          carbsG: row.carbs_g,
          fatsG: row.fats_g,
          fiberG: row.fiber_g,
          macrosBasis: toMacrosBasis(row.macros_basis),
        },
        overrides.get(row.id) ?? null,
      )
      foods[row.id] = {
        id: row.id,
        name: row.name,
        brand: row.brand,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatsG: macros.fatsG,
        fiberG: macros.fiberG,
        macrosBasis: macros.macrosBasis,
        hasOverride: macros.hasOverride,
        originalMacros: macros.original,
        servingSize: row.serving_size,
        servingUnit: row.serving_unit ?? 'g',
        category: row.category ?? null,
        media: null,
      }
    }
    return foods
  } catch {
    // Red/parse caidos: la fila se queda sin numero, que es la degradacion honesta.
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
      substitutionFoodsById: await loadSubstitutionFoodsById(input.db, subs.rows),
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
        // El catalogo de los sustitutos viaja solo para el display de la equivalencia (desde
        // plantilla lo trae `collectTemplateFoodIds`; aca el arbol nace del read-model, que no
        // lo transporta). Fail-soft: sin el, la fila no pinta numero.
        const hydrated = readModelToEditState(
          sourceDetail.plan,
          buildSubstitutionMap(
            sourceSubs.rows,
            await loadSubstitutionFoodsById(input.db, sourceSubs.rows),
          ),
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
        substitutionFoodsById: await loadSubstitutionFoodsById(input.db, subs.rows),
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
    // En creacion los reemplazos ya vienen HIDRATADOS dentro de `initialState` (con su catalogo
    // resuelto arriba), asi que no hay nada que resolver aparte.
    substitutionFoodsById: {},
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

/** Plantilla en blanco: un dia base vacio y nombre vacio (la validacion lo exige al guardar). */
function blankTemplateDraft(): NutritionPlanDraft {
  return {
    clientId: TEMPLATE_MODE_CLIENT_ID,
    name: '',
    strategy: 'structured',
    effectiveFrom: null,
    timezone: 'America/Santiago',
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
 * Read model NEUTRO para el modo plantilla: el arbol no sale de aca (nace del draft guardado),
 * pero la pantalla necesita un `NutritionPlanReadModel` para sus lecturas laterales. `plan: null`
 * es la señal honesta de que no hay version publicada detras.
 */
export function buildTemplatePlanModel(todayIso: string): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: `${todayIso}T00:00:00.000Z`,
    asOfDate: todayIso,
    timezone: 'America/Santiago',
    plan: null,
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [],
    syncToken: 'template-editor',
  }
}

/**
 * Resuelve la sesion del editor en modo PLANTILLA. Una plantilla ilegible (o de otro coach, via
 * RLS) degrada a editor en blanco CON AVISO y con `templateId` null: guardar ahi CREA una
 * plantilla nueva y jamas pisa a ciegas la que no se pudo abrir (leccion JP 2026-08-11).
 *
 * Abrir para EDITAR no cuenta como uso (`purpose: 'edit'`): el contador ordena la biblioteca por
 * uso real — mismo criterio que el editor web.
 */
export async function loadTemplateEditorSession(input: {
  scope: NutritionV2CoachScope
  templateId: string | null
}): Promise<{ template: EditorTemplateInput; templateUnavailable: boolean }> {
  if (input.templateId) {
    try {
      const loaded = await fetchNutritionV2PlanTemplate(input.templateId, {
        scope: input.scope,
        purpose: 'edit',
      })
      if (loaded && loaded.foodsComplete) {
        const portionGroupsById = await loadPortionGroupsById(input.scope)
        // Ids sinteticos: el draft guardado no trae ids y los contadores aparean POR id — sin
        // esto una plantilla intacta abriria "con cambios" (el guardado los vuelve a strippear).
        // `newNutritionItemId` explicito (cinturon y tirantes): el paquete ya emite UUID RFC en su
        // fallback, pero este es el camino que se rompio el 18-08 — en Hermes no hay
        // `globalThis.crypto` y los ids salian `synthetic-...`, que el contrato rechaza con
        // `z.string().uuid()`. Pasarlo aca deja el guardado de plantillas sin depender de que el
        // runtime tenga crypto.
        const baseDraft = withSyntheticDraftIds(
          {
            ...loaded.draft,
            clientId: TEMPLATE_MODE_CLIENT_ID,
            effectiveFrom: null,
            name: loaded.name,
          },
          newNutritionItemId,
        )
        return {
          template: {
            templateId: input.templateId,
            // Sin `effectiveFrom` en las opciones: una plantilla no rige desde ninguna fecha,
            // asi que la llave no existe en `meta` y la cabecera no pinta el campo.
            initialState: draftToEditState(
              baseDraft,
              { foodsById: loaded.foods, portionGroupsById },
              {},
            ),
            baseDraft,
            description: loaded.description,
          },
          templateUnavailable: false,
        }
      }
    } catch {
      // Cae a blanco CON aviso (abajo).
    }
    const baseDraft = blankTemplateDraft()
    return {
      template: {
        templateId: null,
        initialState: draftToEditState(baseDraft, {}, {}),
        baseDraft,
        description: null,
      },
      templateUnavailable: true,
    }
  }

  const baseDraft = blankTemplateDraft()
  return {
    template: {
      templateId: null,
      initialState: draftToEditState(baseDraft, {}, {}),
      baseDraft,
      description: null,
    },
    templateUnavailable: false,
  }
}
