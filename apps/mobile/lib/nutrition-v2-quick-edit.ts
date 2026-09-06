/**
 * Quick-edit V2 (RN coach) — piezas de PERSISTENCIA y transporte que RN conserva tras la
 * convergencia T3.3a. El ESTADO EDITABLE, el reducer, la hidratacion, el contador y la
 * validacion ya NO viven aca: son la gramatica COMPARTIDA de `@eva/nutrition-v2`
 * (`editor-state`, R1) — la misma copia que usa el editor web. La 4ta copia del reducer
 * (este archivo, 1.600 LOC) murio ahi.
 *
 * Queda lo que es genuinamente RN o transporte:
 *  - Baseline inmutable de la version editada (`buildQuickEditBaseline`).
 *  - Carry-over de reemplazos F-02 (`loadQuickEditSubstitutions` + `injectSubstitutionsIntoDraft`):
 *    lectura RLS directa + re-inyeccion al draft en el publish (NUT-008 gatea en la UI).
 *  - Vigencia (`quickEditEffectiveFrom`), clave de idempotencia y mapeo de fallos del endpoint.
 *  - Tipos del grupo de porciones que el builder RN sigue consumiendo (snapshot congelado).
 *
 * Regla de oro intacta: el gate comercial y el scope los RE-VALIDA el servidor (RLS + RPC).
 */

import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  buildNutritionIdempotencyKey,
  mapNutritionItemSubstitutionRow,
  type NutritionItemSubstitution,
  type NutritionItemSubstitutionRead,
  type NutritionPlanDraft,
  type NutritionPlanReadModel,
  type NutritionStrategy,
  type NutritionStudentPermissions,
  type QuickEditErrorCode,
} from '@eva/nutrition-v2'
import type {
  NutritionProFeature,
  NutritionV2WriteClient,
  PublishFailure,
} from './nutrition-v2-builder'

// ---------------------------------------------------------------------------
// Codigos de error del quick-edit — CONSOLIDADO: contrato unico en @eva/nutrition-v2
// (Contrato 1). Se re-exporta aca para conservar la superficie publica del modulo RN.
// ---------------------------------------------------------------------------

export { QUICK_EDIT_ERROR_CODES } from '@eva/nutrition-v2'
export type { QuickEditErrorCode } from '@eva/nutrition-v2'

// ---------------------------------------------------------------------------
// Baseline: metadatos inmutables (F1) de la version desde la que se edita
// ---------------------------------------------------------------------------

export interface QuickEditBaseline {
  planId: string
  /** Version sobre la que se hidrato la edicion → guard optimista del publish. */
  baseVersionId: string
  versionNumber: number
  name: string
  strategy: NutritionStrategy
  timezone: string
  effectiveFrom: string
  permissions: NutritionStudentPermissions
  visibleNotes: string | null
  protocolNotes: string | null
}

/** null si el read model no trae plan vigente (sin plan → no hay quick-edit). */
export function buildQuickEditBaseline(planModel: NutritionPlanReadModel): QuickEditBaseline | null {
  const plan = planModel.plan
  if (!plan) return null
  return {
    planId: plan.id,
    baseVersionId: plan.versionId,
    versionNumber: plan.versionNumber,
    name: plan.name,
    strategy: plan.strategy,
    timezone: planModel.timezone,
    effectiveFrom: plan.effectiveFrom,
    permissions: planModel.permissions,
    visibleNotes: planModel.visibleNotes,
    protocolNotes: planModel.protocolNotes,
  }
}

// ---------------------------------------------------------------------------
// Carry-over de reemplazos autorizados (F-02)
// ---------------------------------------------------------------------------

export interface QuickEditSubstitutionsLoad {
  status: 'loaded' | 'error'
  byItem: Map<string, NutritionItemSubstitution[]>
}

/**
 * Fetch de los reemplazos de la version base, agrupados por `prescriptionItemId` y convertidos
 * a la forma de draft (`NutritionItemSubstitution`). Lectura directa RLS-scoped
 * (`can_read_version`) con `NUTRITION_ITEM_SUBSTITUTION_SELECT` + `mapNutritionItemSubstitutionRow`
 * del paquete.
 *
 * El resultado es DISCRIMINADO a proposito (NUT-008): un fallo de lectura NO puede degradarse a
 * mapa vacio, porque el publish reescribe el arbol COMPLETO y publicar sin carry-over BORRA los
 * reemplazos que no se pudieron leer. `status: 'error'` obliga a la UI a bloquear el publish;
 * un plan sin reemplazos es `status: 'loaded'` con el mapa vacio.
 */
export async function loadQuickEditSubstitutions(
  db: NutritionV2WriteClient,
  versionId: string,
): Promise<QuickEditSubstitutionsLoad> {
  const byItem = new Map<string, NutritionItemSubstitution[]>()
  const load = await loadItemSubstitutionReads(db, versionId)
  if (load.status === 'error') return { status: 'error', byItem: new Map() }
  for (const mapped of load.rows) {
    const bucket = byItem.get(mapped.prescriptionItemId) ?? []
    bucket.push({
      // Sin `id`: la republicacion crea filas NUEVAS (la DB genera el id); reusar el id de la
      // version base violaria el PK. `customName` solo si es reemplazo libre (sin food/recipe).
      foodId: mapped.foodId,
      recipeId: mapped.recipeId,
      customName: mapped.foodId || mapped.recipeId ? null : mapped.name,
      quantity: mapped.quantity,
      unit: mapped.unit,
      orderIndex: bucket.length,
    })
    byItem.set(mapped.prescriptionItemId, bucket)
  }
  return { status: 'loaded', byItem }
}

/**
 * Lectura CRUDA de los reemplazos de una version (forma read-model, con nombre congelado).
 *
 * La necesita el EDITOR UNICO (T3.3b): alli los reemplazos se HIDRATAN en el arbol
 * (`buildSubstitutionMap` + `readModelToEditState`) para poder editarlos y mostrar su nombre,
 * en vez de viajar aparte y re-inyectarse al publicar como en el quick-edit clasico. Misma
 * regla NUT-008: un fallo de lectura NO se degrada a lista vacia.
 */
export async function loadItemSubstitutionReads(
  db: NutritionV2WriteClient,
  versionId: string,
): Promise<{ status: 'loaded' | 'error'; rows: NutritionItemSubstitutionRead[] }> {
  try {
    const res = await db
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .eq('version_id', versionId)
      .order('order_index', { ascending: true })
    if (res.error || !res.data) return { status: 'error', rows: [] }
    const raw = res.data as Parameters<typeof mapNutritionItemSubstitutionRow>[0][]
    return { status: 'loaded', rows: raw.map(mapNutritionItemSubstitutionRow) }
  } catch {
    // Red/parse caidos: NO es "sin reemplazos" (ver NUT-008 arriba).
    return { status: 'error', rows: [] }
  }
}

/**
 * Cuelga los reemplazos carry-over en los items del draft cuyo `id` (de la version base) tiene
 * entrada en el mapa. Items agregados en esta edicion (sin id) y swapeados que perdieron su
 * identidad no reciben reemplazos. Sin entradas => draft byte-identico (no toca `substitutions`).
 */
export function injectSubstitutionsIntoDraft(
  draft: NutritionPlanDraft,
  subsByItemId: ReadonlyMap<string, NutritionItemSubstitution[]>,
): NutritionPlanDraft {
  if (subsByItemId.size === 0) return draft
  return {
    ...draft,
    dayVariants: draft.dayVariants.map((variant) => ({
      ...variant,
      mealSlots: variant.mealSlots.map((slot) => ({
        ...slot,
        items: slot.items.map((item) => {
          const subs = item.id ? subsByItemId.get(item.id) : undefined
          if (!subs || subs.length === 0) return item
          return { ...item, substitutions: subs }
        }),
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Tipos del grupo de porciones (snapshot congelado del read model). El builder RN los
// sigue consumiendo (`nutrition-v2-builder-portions.ts`); el estado del quick-edit ya
// lleva las porciones EN el arbol compartido (`QePortionTarget`/`QePortionGroup`).
// ---------------------------------------------------------------------------

export interface PortionGroupRef {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

/** Parte base ENRIQUECIDA del `composed_of` (SPEC R2/A2), tal cual viaja en el read model. */
export interface PortionComposedPart {
  code: string
  portions: number
  ref: PortionGroupRef
}

/**
 * Grupo con snapshot congelado para el picker/persistencia del builder RN. Estructuralmente
 * compatible con `QePortionGroup` del paquete (mismo nucleo + `sortOrder` para el color
 * fallback del circulito).
 */
export interface QuickEditPortionGroup {
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  ref: PortionGroupRef
  composedOf: PortionComposedPart[] | null
  macrosConfirmed: boolean
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Publish: vigencia, idempotencia y mapeo de fallos del endpoint
// ---------------------------------------------------------------------------

/**
 * W3.2 «Cantidades honestas» (SPEC §6.2): que hacer con el DIA del alumno al republicar cuando ya
 * registro algo hoy. Union literal identica a la del sheet (`PublishTodaySheet`) y al enum del
 * endpoint; vive aca —en la lib PURA— para que `nutrition-v2.api.ts` no tenga que importar un
 * componente de React solo por un tipo.
 */
export type PublishEffectiveFromChoice = 'today' | 'tomorrow'

/**
 * Vigencia de la republicacion: hoy en la tz del plan, salvo que la version base
 * arranque en el futuro (el edit no puede "adelantar" el plan) — qe-design §2.3.5.
 *
 * Solo cubre «Aplicar hoy». «Aplicar desde manana» (W3.2) la calcula el SERVIDOR en la tz del
 * alumno: el reloj del telefono del coach no puede decidir en que dia entra el plan de otro.
 */
export function quickEditEffectiveFrom(todayIso: string, baseEffectiveFrom: string): string {
  return baseEffectiveFrom > todayIso ? baseEffectiveFrom : todayIso
}

/**
 * Clave de idempotencia FRESCA por intencion de publicar (se genera al abrir el sheet
 * de confirmacion) y REUTILIZADA en todos los reintentos de esa intencion.
 */
export function buildQuickEditIdempotencyKey(input: { clientId: string; operationId: string }): string {
  return buildNutritionIdempotencyKey({
    clientId: input.clientId,
    deviceId: 'rn-quick-edit',
    operationId: input.operationId,
    kind: 'publish',
  })
}

export type QuickEditPublishResult =
  | { ok: true; versionId: string }
  | { ok: false; code: QuickEditErrorCode; message: string; feature?: NutritionProFeature }

/** Mapea el fallo tipado del endpoint de mutaciones al codigo de error del quick-edit. */
export function mapPublishFailureCode(failure: PublishFailure): QuickEditErrorCode {
  switch (failure.code) {
    case 'STALE_BASE':
      return 'STALE_BASE'
    case 'EFFECTIVE_DATE':
      return 'EFFECTIVE_DATE'
    case 'SCOPE_DENIED':
      return 'FORBIDDEN'
    case 'UPGRADE_REQUIRED':
      return 'UPGRADE_REQUIRED'
    case 'INVALID_DRAFT':
    case 'INVALID_PAYLOAD':
    case 'NEEDS_SLOT':
    case 'NEEDS_VARIANT':
      return 'VALIDATION'
    default:
      return 'UNKNOWN'
  }
}
