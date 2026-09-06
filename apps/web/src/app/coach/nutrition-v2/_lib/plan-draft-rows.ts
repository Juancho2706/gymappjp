/**
 * Draft del contrato → FILAS de la base (web coach). Capa PURA de persistencia: recibe el draft
 * ya validado y emite las filas de `nutrition_*_v2`, congelando por VALOR lo que no debe moverse
 * despues (macros del item y snapshot del grupo de intercambio).
 *
 * RETIRO DEL PAR VIEJO (2026-08-16): vivia dentro de `[clientId]/builder/_lib/draft-builder.ts`,
 * la carpeta que muere con el wizard, aunque no tiene NADA de wizard: la usa
 * `_actions/plan-persistence` — el camino de escritura que comparten el editor, el quick-edit,
 * la asignacion a otros alumnos y el endpoint movil. Movido VERBATIM; `draft-builder` lo
 * re-exporta para que los importadores historicos del wizard no cambien de ruta.
 */

import {
  HOUSEHOLD_GRAMS_MAX,
  HOUSEHOLD_GRAMS_MIN,
  computeItemMacros,
  foodMagnitudeUnit,
  isHouseholdUnit,
  type BuilderFood,
  type NutritionExchangeTarget,
  type NutritionItemSubstitution,
  type NutritionPlanDraft,
} from '@eva/nutrition-v2'

export type DraftDayVariant = NutritionPlanDraft['dayVariants'][number]
export type DraftMealSlot = DraftDayVariant['mealSlots'][number]
export type DraftPrescriptionItem = DraftMealSlot['items'][number]
export type DraftExchangeTarget = NutritionExchangeTarget
export type DraftItemSubstitution = NutritionItemSubstitution

export function buildVariantInsertRow(versionId: string, variant: DraftDayVariant) {
  return {
    version_id: versionId,
    variant_key: variant.key,
    label: variant.label,
    day_of_week: variant.dayOfWeek,
    is_default: variant.default,
    target_calories: variant.targets.calories,
    target_protein_g: variant.targets.proteinG,
    target_carbs_g: variant.targets.carbsG,
    target_fats_g: variant.targets.fatsG,
    target_fiber_g: variant.targets.fiberG,
    target_sodium_mg: variant.targets.sodiumMg,
    target_water_ml: variant.targets.waterMl,
    order_index: variant.orderIndex,
  }
}

export function buildSlotInsertRow(versionId: string, dayVariantId: string, slot: DraftMealSlot) {
  return {
    version_id: versionId,
    day_variant_id: dayVariantId,
    slot_code: slot.code,
    name: slot.name,
    start_time: slot.startTime,
    end_time: slot.endTime,
    slot_mode: slot.mode,
    is_required: slot.required,
    target_calories: slot.targets.calories ?? null,
    target_protein_g: slot.targets.proteinG ?? null,
    target_carbs_g: slot.targets.carbsG ?? null,
    target_fats_g: slot.targets.fatsG ?? null,
    instructions: slot.instructions,
    order_index: slot.orderIndex,
  }
}

/**
 * Código del `throw` cuando un ítem llega en medida casera sin gramaje utilizable. Se corta ACÁ
 * y no en la base: el CHECK `nutrition_prescription_items_v2_household_grams_range` haría fallar
 * la publicación ENTERA con un `23514` que no dice qué ítem fue (R13).
 */
export const HOUSEHOLD_GRAMS_ERROR = 'nutrition_v2_household_grams_invalid'

/**
 * Traducción de la MEDIDA CASERA a lo que acepta la tabla (W2, b18 de la auditoría W2.0).
 * «Gramos como verdad, medida casera como interfaz» (SPEC §5.1): la unidad `casera` vive en el
 * editor y en el borrador, y muere acá — la fila se escribe en g/ml y el par viaja congelado en
 * sus dos columnas. El CHECK `unit <> 'casera'` de la tabla es el cierre real de esa regla.
 *
 * Un ítem NO casero escribe el par en `null` a propósito: la medida se congela sólo cuando el
 * coach la eligió, no porque el alimento la tenga.
 */
function translateHouseholdUnit(item: DraftPrescriptionItem, food: BuilderFood | null) {
  if (!isHouseholdUnit(item.unit)) {
    return { quantity: item.quantity, unit: item.unit, householdLabel: null, householdGrams: null }
  }
  const householdGrams = item.householdGrams ?? food?.householdGrams ?? null
  const householdLabel = (item.householdLabel ?? food?.householdLabel ?? '').trim()
  if (
    typeof householdGrams !== 'number' ||
    !Number.isFinite(householdGrams) ||
    householdGrams < HOUSEHOLD_GRAMS_MIN ||
    householdGrams > HOUSEHOLD_GRAMS_MAX ||
    householdLabel.length === 0
  ) {
    throw new Error(HOUSEHOLD_GRAMS_ERROR)
  }
  return {
    quantity: item.quantity * householdGrams,
    unit: foodMagnitudeUnit(food?.servingUnit),
    householdLabel,
    householdGrams,
  }
}

/**
 * Fila de item prescrito. Las macros de snapshot se re-derivan del alimento resuelto
 * en el servidor (leido de foods), no del cliente. Para items custom (sin foodId)
 * quedan en null y el snapshot_name usa el nombre libre.
 */
export function buildItemInsertRow(input: {
  versionId: string
  mealSlotId: string
  orderIndex: number
  item: DraftPrescriptionItem
  food: BuilderFood | null
  /** Id explícito del item (F-02): permite colgar reemplazos referenciándolo antes del insert.
   *  Omitido = la DB genera el id (comportamiento previo, byte-idéntico). */
  id?: string
}) {
  const { versionId, mealSlotId, orderIndex, item, food, id } = input
  // Las macros se congelan con la unidad del BORRADOR, ANTES de traducir: en `casera`
  // `computeItemMacros` ya recursa a gramos, así que el número es el mismo por los dos caminos
  // y el snapshot no depende del orden de estas dos líneas.
  const macros = food ? computeItemMacros(food, item.quantity, item.unit) : null
  const household = translateHouseholdUnit(item, food)
  return {
    ...(id ? { id } : {}),
    version_id: versionId,
    meal_slot_id: mealSlotId,
    food_id: item.foodId,
    recipe_id: item.recipeId,
    custom_name: item.customName,
    quantity: household.quantity,
    unit: household.unit,
    minimum_quantity: item.minimumQuantity,
    maximum_quantity: item.maximumQuantity,
    is_optional: item.optional,
    substitution_group_id: item.substitutionGroupId,
    notes: item.notes,
    order_index: orderIndex,
    snapshot_name: food ? food.name : item.customName,
    snapshot_brand: food ? food.brand : null,
    snapshot_calories: macros ? macros.calories : null,
    snapshot_protein_g: macros ? macros.proteinG : null,
    snapshot_carbs_g: macros ? macros.carbsG : null,
    snapshot_fats_g: macros ? macros.fatsG : null,
    snapshot_fiber_g: macros ? macros.fiberG : null,
    household_label: household.householdLabel,
    household_grams: household.householdGrams,
    // Linaje W3.1 («Cantidades honestas», SPEC §6.1): de que item de la version anterior es copia
    // esta fila. El `id` sigue siendo nuevo por publicacion (plan-persistence.ts:489) — eso NO
    // cambia; lo que cambia es que ahora la fila declara su ancestro y la lectura puede
    // reasignarle los registros del alumno. `persist_and_publish_nutrition_plan_v2` lo REVALIDA
    // (mismo plan, ≠ id) y lo baja a NULL sin fallar la publicacion.
    source_item_id: item.sourceItemId ?? null,
  }
}

// -- Reemplazos autorizados por el coach (F-02): FREEZE del snapshot al persistir --
//
// Espeja `buildItemInsertRow`: el alimento de reemplazo se resuelve server-side (foods) y sus
// macros de referencia se CONGELAN (decisión CEO). Cantidad de referencia = `quantity` del
// reemplazo, o el `servingSize` del alimento si es null ("misma porción que el prescrito"). Item
// libre (sin foodId) => snapshot solo con el nombre, macros null.

export type ItemSubstitutionInsertRow = {
  version_id: string
  prescription_item_id: string
  food_id: string | null
  recipe_id: string | null
  custom_name: string | null
  quantity: number | null
  unit: string | null
  order_index: number
  snapshot_name: string | null
  snapshot_brand: string | null
  snapshot_calories: number | null
  snapshot_protein_g: number | null
  snapshot_carbs_g: number | null
  snapshot_fats_g: number | null
  snapshot_fiber_g: number | null
}

export function buildItemSubstitutionInsertRow(input: {
  versionId: string
  prescriptionItemId: string
  orderIndex: number
  sub: DraftItemSubstitution
  food: BuilderFood | null
}): ItemSubstitutionInsertRow {
  const { versionId, prescriptionItemId, orderIndex, sub, food } = input
  const refQty = sub.quantity ?? (food ? food.servingSize : null)
  const refUnit = sub.unit ?? (food ? food.servingUnit : 'g')
  const macros = food && refQty && refQty > 0 ? computeItemMacros(food, refQty, refUnit) : null
  return {
    version_id: versionId,
    prescription_item_id: prescriptionItemId,
    food_id: sub.foodId,
    recipe_id: sub.recipeId,
    custom_name: sub.customName,
    quantity: sub.quantity,
    unit: sub.unit,
    order_index: orderIndex,
    snapshot_name: food ? food.name : sub.customName,
    snapshot_brand: food ? food.brand : null,
    snapshot_calories: macros ? macros.calories : null,
    snapshot_protein_g: macros ? macros.proteinG : null,
    snapshot_carbs_g: macros ? macros.carbsG : null,
    snapshot_fats_g: macros ? macros.fatsG : null,
    snapshot_fiber_g: macros ? macros.fiberG : null,
  }
}

/** Ids de alimentos referenciados por los reemplazos de todos los items del draft (dedupe). */
export function collectSubstitutionFoodIds(draft: NutritionPlanDraft): string[] {
  const ids = new Set<string>()
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        for (const sub of item.substitutions ?? []) {
          if (sub.foodId) ids.add(sub.foodId)
        }
      }
    }
  }
  return [...ids]
}

// -- Porciones (intercambios): FREEZE del snapshot al persistir el draft (T0.3) --
//
// Igual que `buildItemInsertRow` congela las macros del item resolviendo `foods`
// server-side (draft-builder.ts:555+), esta capa congela el snapshot del GRUPO de
// intercambio: `exchange_groups` NO esta versionado (riesgo #1 del SPEC R2), asi que
// editar/soft-borrar un grupo despues de publicar NO debe mover el read-model ni los
// macros derivados. El grupo se resuelve server-side (en plan-persistence) y llega a
// esta funcion PURA ya resuelto; aqui solo se copian valores primitivos a la fila
// (congelacion por valor). `snapshot_composed_of` va ENRIQUECIDO (SPEC R2/A2): cada
// parte base (LEG -> P + C) lleva sus `ref_*` congelados en el mismo momento, para que
// el read-model reconstruya el diccionario contra valores congelados sin tocar el motor.

/**
 * Grupo de intercambio resuelto server-side para el freeze (subset de `exchange_groups`).
 * La persistencia lo resuelve por `id` (incluso soft-borrado, en la medida en que la RLS
 * lo permita — ver nota en plan-persistence). `composedOf` es la forma CRUDA del catalogo
 * (`[{code, portions}]`, SIN `ref`); el enriquecimiento con `ref` ocurre aqui al emitir.
 */
export interface BuilderExchangeGroup {
  id: string
  code: string
  name: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  composedOf: Array<{ code: string; portions: number }> | null
  macrosConfirmed: boolean
}

/** Parte base ENRIQUECIDA del `snapshot_composed_of` (SPEC R2/A2). */
export interface ExchangeComposedPartSnapshot {
  code: string
  portions: number
  ref: { calories: number; proteinG: number; carbsG: number; fatsG: number }
}

/**
 * Fila de `nutrition_slot_exchange_targets_v2` con el snapshot congelado. `type` (no
 * `interface`) a proposito: asi conserva la firma de indice implicita y es asignable al
 * `insert(Record<string, unknown>[])` del cliente (igual que el row inferido de items).
 */
export type ExchangeTargetInsertRow = {
  version_id: string
  meal_slot_id: string
  exchange_group_id: string
  portions: number
  notes: string | null
  order_index: number
  snapshot_group_code: string
  snapshot_group_name: string
  snapshot_ref_calories: number
  snapshot_ref_protein_g: number
  snapshot_ref_carbs_g: number
  snapshot_ref_fats_g: number
  snapshot_composed_of: ExchangeComposedPartSnapshot[] | null
  snapshot_macros_confirmed: boolean
}

export type ExchangeGroupSnapshotErrorReason = 'GROUP_NOT_FOUND' | 'BASE_GROUP_NOT_FOUND'

/**
 * Falla explicita del freeze: un target referencia un grupo que no se pudo resolver
 * (o una parte base de un compuesto). NUNCA se emite una fila con `snapshot_*` NULL
 * (SPEC R2/B5): antes de eso, se rompe en voz alta. La persistencia la traduce a un
 * `ActionFailure` limpio.
 */
export class ExchangeGroupSnapshotError extends Error {
  readonly reason: ExchangeGroupSnapshotErrorReason
  readonly exchangeGroupId: string | null
  readonly baseCode: string | null
  constructor(
    reason: ExchangeGroupSnapshotErrorReason,
    detail: { exchangeGroupId?: string | null; baseCode?: string | null },
  ) {
    super(
      reason === 'GROUP_NOT_FOUND'
        ? `Exchange group not resolvable: ${detail.exchangeGroupId ?? '?'}`
        : `Composed base group not resolvable: ${detail.baseCode ?? '?'}`,
    )
    this.name = 'ExchangeGroupSnapshotError'
    this.reason = reason
    this.exchangeGroupId = detail.exchangeGroupId ?? null
    this.baseCode = detail.baseCode ?? null
  }
}

/**
 * Fila de target de porciones con `snapshot_*` congelado. Espeja `buildItemInsertRow`.
 * PURA: recibe el grupo ya resuelto (`group`) y un resolutor de grupos base por codigo
 * (`resolveBaseGroup`, para enriquecer `composed_of`). Lanza `ExchangeGroupSnapshotError`
 * si el grupo o una parte base no existen — jamas produce snapshot NULL.
 */
export function buildExchangeTargetInsertRow(input: {
  versionId: string
  mealSlotId: string
  orderIndex: number
  target: DraftExchangeTarget
  group: BuilderExchangeGroup | null
  resolveBaseGroup: (code: string) => BuilderExchangeGroup | null
}): ExchangeTargetInsertRow {
  const { versionId, mealSlotId, orderIndex, target, group, resolveBaseGroup } = input
  if (!group) {
    throw new ExchangeGroupSnapshotError('GROUP_NOT_FOUND', { exchangeGroupId: target.exchangeGroupId })
  }

  const composedOf: ExchangeComposedPartSnapshot[] | null =
    group.composedOf == null
      ? null
      : group.composedOf.map((part) => {
          const base = resolveBaseGroup(part.code)
          if (!base) {
            throw new ExchangeGroupSnapshotError('BASE_GROUP_NOT_FOUND', { baseCode: part.code })
          }
          // Congela por VALOR el ref del grupo base AL EMITIR (SPEC R2/A2): editar
          // los ref_* de P/C despues NO mueve este objeto (test de freeze Q6).
          return {
            code: part.code,
            portions: part.portions,
            ref: {
              calories: base.refCalories,
              proteinG: base.refProteinG,
              carbsG: base.refCarbsG,
              fatsG: base.refFatsG,
            },
          }
        })

  return {
    version_id: versionId,
    meal_slot_id: mealSlotId,
    exchange_group_id: group.id,
    portions: target.portions,
    notes: target.notes ?? null,
    order_index: orderIndex,
    snapshot_group_code: group.code,
    snapshot_group_name: group.name,
    snapshot_ref_calories: group.refCalories,
    snapshot_ref_protein_g: group.refProteinG,
    snapshot_ref_carbs_g: group.refCarbsG,
    snapshot_ref_fats_g: group.refFatsG,
    snapshot_composed_of: composedOf,
    snapshot_macros_confirmed: group.macrosConfirmed,
  }
}

/** Ids de grupo referenciados por todos los targets de porciones del draft (dedupe). */
export function collectExchangeGroupIds(draft: NutritionPlanDraft): string[] {
  const ids = new Set<string>()
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const target of slot.exchangeTargets ?? []) {
        ids.add(target.exchangeGroupId)
      }
    }
  }
  return [...ids]
}
