/**
 * Quick-edit V2 (RN coach) — logica PURA + PERSISTENCIA del modo edicion in-place del
 * plan vigente (espejo del diseno QE §1.3/§2). Sin react-native / expo: solo Zod + el
 * contrato del draft (@eva/nutrition-v2) + helpers del builder RN + el cliente
 * supabase RN (PostgREST).
 *
 * Contratos que espeja (qe-design.md §5):
 *  - Contrato 1 (`packages/nutrition-v2/quick-edit.ts`, @eva/nutrition-v2): los
 *    `QUICK_EDIT_ERROR_CODES` / `QuickEditErrorCode` se IMPORTAN del paquete (contrato
 *    unico compartido web/RN; se re-exportan mas abajo para conservar la superficie del
 *    modulo). En cambio la hidratacion (`planModelToQuickEditState`) y el contador
 *    (`countQuickEditChanges`) se quedan LOCALES a proposito: operan sobre el
 *    `QuickEditState` editable de la UI RN (cantidades/metas como string para TextInput,
 *    `key` por fila para el reducer, `baseMacros`/`baseQuantity` para el preview de
 *    macros en vivo, slots de `food` hidratado), NO sobre el `NutritionPlanDraft`
 *    canonico. El `readModelToDraft(planModel, clientId)` del paquete produce el draft
 *    numerico canonico en UN paso; la ruta RN es de DOS pasos (read model -> estado
 *    editable -> draft via `quickEditStateToDraft`) y con distinta semantica de diff
 *    (empareja por `key`, no por `id`; cuenta los items de una franja nueva). Ver la
 *    nota de divergencia en cada funcion.
 *  - Contrato 3 (RPC): `publish_nutrition_plan_v2(p_version_id, p_effective_from,
 *    p_idempotency_key, p_expected_current_version_id?)`. El 4to parametro es el
 *    guard optimista (compare-and-swap contra la version base de la edicion); errores
 *    nuevos: `nutrition_v2_publish_stale_base` → STALE_BASE.
 *
 * Regla de oro (heredada del builder): el gate comercial y el scope los RE-VALIDA el
 * servidor (RLS + RPC). El delta-gate Pro de aca es best-effort UI (qe-design §2.4):
 *  el quick-edit solo gatea features Pro NUEVAS; contenido Pro ya presente en la
 *  version base (hybrid / notas heredadas de la conversion V1→V2) se preserva para no
 *  atrapar al coach sin addon.
 */

import { z } from 'zod'
import {
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionPlanReadModel,
  type NutritionStrategy,
  type NutritionStudentPermissions,
  type QuickEditErrorCode,
} from '@eva/nutrition-v2'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  computeItemMacros,
  mapWriteError,
  publishFail,
  requiredNutritionProFeature,
  strategyUsesSlots,
  type BuilderFood,
  type DraftDayVariant,
  type DraftMealSlot,
  type DraftPrescriptionItem,
  type ItemMacros,
  type NutritionProFeature,
  type NutritionV2WriteClient,
  type PublishFailure,
  type PublishResult,
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
// Estado editable (draft local). Cantidades y metas como string (TextInput).
// ---------------------------------------------------------------------------

export interface QuickEditItem {
  key: string
  /** id del prescription item en la version base (identidad para el diff); null = agregado. */
  id: string | null
  foodId: string | null
  recipeId: string | null
  /** Nombre visible (snapshot del read model o del catalogo tras swap). */
  displayName: string
  brand: string | null
  /** Editable solo para items libres (sin foodId/recipeId). */
  customName: string | null
  quantity: string
  unit: string
  minimumQuantity: number | null
  maximumQuantity: number | null
  optional: boolean
  substitutionGroupId: string | null
  notes: string | null
  /** Cantidad original del read model — base de la escala lineal de macros sin food hidratado. */
  baseQuantity: number | null
  baseMacros: {
    calories: number | null
    proteinG: number | null
    carbsG: number | null
    fatsG: number | null
    fiberG: number | null
  } | null
  /** Hidratado al swap/agregar desde el catalogo; para items base se usa el mapa de foods. */
  food: BuilderFood | null
}

export interface QuickEditSlot {
  key: string
  /** id del slot en la version base; null = franja agregada en esta edicion. */
  id: string | null
  code: string
  name: string
  /** '' = sin hora. */
  startTime: string
  endTime: string | null
  mode: 'anchor' | 'flexible'
  required: boolean
  targets: Partial<NutritionMacroTargets>
  instructions: string | null
  items: QuickEditItem[]
}

export interface QuickEditTargetsText {
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

export interface QuickEditVariant {
  key: string
  id: string | null
  label: string
  dayOfWeek: number | null
  default: boolean
  targets: QuickEditTargetsText
  /** Metas fuera del quick-edit F1 (se preservan tal cual en la republicacion). */
  fixedTargets: { fiberG: number | null; sodiumMg: number | null; waterMl: number | null }
  slots: QuickEditSlot[]
}

export interface QuickEditState {
  variants: QuickEditVariant[]
}

function numToStr(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

/**
 * Hidratacion del ESTADO EDITABLE (`QuickEditState`) desde el read model de la ficha.
 * NO es el `readModelToDraft(planModel, clientId)` del paquete: ese produce el
 * `NutritionPlanDraft` canonico (numerico) en un paso, mientras que aca la salida es el
 * estado de UI RN — cantidades/metas como string para los TextInput, `key` por fila
 * para el reducer, `baseMacros`/`baseQuantity` para el preview de macros en vivo,
 * `displayName`/`brand`/`food`. Por eso se queda LOCAL (la ruta al draft canonico se
 * cierra despues con `quickEditStateToDraft`). El read model YA trae la prescripcion
 * completa de la version vigente; no hay read nuevo.
 */
export function planModelToQuickEditState(
  planModel: NutritionPlanReadModel,
  genKey: (prefix: string) => string,
): QuickEditState {
  return {
    variants: planModel.dayVariants.map((variant) => ({
      key: variant.key,
      id: variant.id,
      label: variant.label,
      dayOfWeek: variant.dayOfWeek,
      default: variant.isDefault,
      targets: {
        calories: numToStr(variant.targets.calories),
        proteinG: numToStr(variant.targets.proteinG),
        carbsG: numToStr(variant.targets.carbsG),
        fatsG: numToStr(variant.targets.fatsG),
      },
      fixedTargets: {
        fiberG: variant.targets.fiberG,
        sodiumMg: variant.targets.sodiumMg,
        waterMl: variant.targets.waterMl,
      },
      slots: variant.mealSlots.map((slot) => ({
        key: genKey('slot'),
        id: slot.id,
        code: slot.code,
        name: slot.name,
        startTime: slot.startTime ?? '',
        endTime: slot.endTime,
        mode: slot.mode,
        required: slot.required,
        targets: slot.targets,
        instructions: slot.instructions,
        items: slot.prescriptionItems.map((item) => ({
          key: genKey('item'),
          id: item.id,
          foodId: item.foodId,
          recipeId: item.recipeId,
          displayName: item.name ?? 'Alimento',
          brand: item.brand,
          customName: item.foodId || item.recipeId ? null : (item.name ?? ''),
          quantity: String(item.quantity),
          unit: item.unit,
          minimumQuantity: item.minimumQuantity,
          maximumQuantity: item.maximumQuantity,
          optional: item.optional,
          substitutionGroupId: item.substitutionGroupId,
          notes: item.notes,
          baseQuantity: item.quantity,
          baseMacros: item.macros,
          food: null,
        })),
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Reducer del modo edicion
// ---------------------------------------------------------------------------

export type QuickEditTargetField = keyof QuickEditTargetsText

export type QuickEditAction =
  | { type: 'SET_TARGET'; variantKey: string; field: QuickEditTargetField; value: string }
  | { type: 'SET_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SET_ITEM_UNIT'; variantKey: string; slotKey: string; itemKey: string; unit: string }
  | { type: 'SET_ITEM_NAME'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SWAP_ITEM'; variantKey: string; slotKey: string; itemKey: string; food: BuilderFood }
  | { type: 'ADD_ITEM'; variantKey: string; slotKey: string; key: string; food: BuilderFood | null }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  | { type: 'RESTORE_ITEM'; variantKey: string; slotKey: string; index: number; item: QuickEditItem }
  | { type: 'UPDATE_SLOT'; variantKey: string; slotKey: string; patch: { name?: string; startTime?: string } }
  | { type: 'ADD_SLOT'; variantKey: string; key: string }
  | { type: 'REMOVE_SLOT'; variantKey: string; slotKey: string }
  | { type: 'RESTORE_SLOT'; variantKey: string; index: number; slot: QuickEditSlot }

function mapVariant(
  state: QuickEditState,
  variantKey: string,
  fn: (variant: QuickEditVariant) => QuickEditVariant,
): QuickEditState {
  return {
    variants: state.variants.map((variant) => (variant.key === variantKey ? fn(variant) : variant)),
  }
}

function mapSlot(
  state: QuickEditState,
  variantKey: string,
  slotKey: string,
  fn: (slot: QuickEditSlot) => QuickEditSlot,
): QuickEditState {
  return mapVariant(state, variantKey, (variant) => ({
    ...variant,
    slots: variant.slots.map((slot) => (slot.key === slotKey ? fn(slot) : slot)),
  }))
}

function mapItem(
  state: QuickEditState,
  variantKey: string,
  slotKey: string,
  itemKey: string,
  fn: (item: QuickEditItem) => QuickEditItem,
): QuickEditState {
  return mapSlot(state, variantKey, slotKey, (slot) => ({
    ...slot,
    items: slot.items.map((item) => (item.key === itemKey ? fn(item) : item)),
  }))
}

/** Espejo local del normalizeUnit privado de nutrition-v2-builder (nota de origen). */
function normalizeQuickUnit(servingUnit: string | null | undefined): string {
  const u = String(servingUnit ?? '').toLowerCase()
  if (u === 'ml') return 'ml'
  if (u === 'un' || u === 'unit' || u === 'unidad') return 'un'
  return 'g'
}

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const bounded = Math.max(0, Math.min(list.length, index))
  return [...list.slice(0, bounded), value, ...list.slice(bounded)]
}

export function quickEditReducer(state: QuickEditState, action: QuickEditAction): QuickEditState {
  switch (action.type) {
    case 'SET_TARGET':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        targets: { ...variant.targets, [action.field]: action.value },
      }))
    case 'SET_ITEM_QUANTITY':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        quantity: action.value,
      }))
    case 'SET_ITEM_UNIT':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        unit: action.unit,
      }))
    case 'SET_ITEM_NAME':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        customName: action.value,
        displayName: action.value,
      }))
    case 'SWAP_ITEM':
      // Reemplaza el alimento CONSERVANDO cantidad y unidad (qe-design §1.2.B.1).
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        foodId: action.food.id,
        recipeId: null,
        customName: null,
        displayName: action.food.name,
        brand: action.food.brand,
        baseQuantity: null,
        baseMacros: null,
        food: action.food,
      }))
    case 'ADD_ITEM': {
      const item: QuickEditItem = {
        key: action.key,
        id: null,
        foodId: action.food ? action.food.id : null,
        recipeId: null,
        displayName: action.food ? action.food.name : '',
        brand: action.food ? action.food.brand : null,
        customName: action.food ? null : '',
        quantity: action.food ? String(action.food.servingSize || '') : '',
        unit: action.food ? normalizeQuickUnit(action.food.servingUnit) : 'g',
        minimumQuantity: null,
        maximumQuantity: null,
        optional: false,
        substitutionGroupId: null,
        notes: null,
        baseQuantity: null,
        baseMacros: null,
        food: action.food,
      }
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: [...slot.items, item],
      }))
    }
    case 'REMOVE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.filter((item) => item.key !== action.itemKey),
      }))
    case 'RESTORE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: insertAt(slot.items, action.index, action.item),
      }))
    case 'UPDATE_SLOT':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, ...action.patch }))
    case 'ADD_SLOT': {
      const slot: QuickEditSlot = {
        key: action.key,
        id: null,
        // Codigo interno unico dentro de la version nueva (los base conservan el suyo).
        code: ('qe-' + action.key).slice(0, 64),
        name: '',
        startTime: '',
        endTime: null,
        mode: 'anchor',
        required: false,
        targets: {},
        instructions: null,
        items: [],
      }
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: [...variant.slots, slot],
      }))
    }
    case 'REMOVE_SLOT':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: variant.slots.filter((slot) => slot.key !== action.slotKey),
      }))
    case 'RESTORE_SLOT':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: insertAt(variant.slots, action.index, action.slot),
      }))
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Contador de cambios — LOCAL (no es countDraftChanges del paquete): opera sobre el
// QuickEditState de la UI y empareja por `key`, no por `id`. Ver nota en la funcion.
// ---------------------------------------------------------------------------

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function itemChanged(a: QuickEditItem, b: QuickEditItem): boolean {
  return (
    a.foodId !== b.foodId ||
    a.recipeId !== b.recipeId ||
    (a.customName ?? '').trim() !== (b.customName ?? '').trim() ||
    toNullableNumber(a.quantity) !== toNullableNumber(b.quantity) ||
    a.unit !== b.unit
  )
}

function slotHeaderChanged(a: QuickEditSlot, b: QuickEditSlot): boolean {
  return a.name.trim() !== b.name.trim() || a.startTime.trim() !== b.startTime.trim()
}

const TARGET_FIELDS: QuickEditTargetField[] = ['calories', 'proteinG', 'carbsG', 'fatsG']

function targetsChanged(a: QuickEditVariant, b: QuickEditVariant): boolean {
  return TARGET_FIELDS.some((field) => toNullableNumber(a.targets[field]) !== toNullableNumber(b.targets[field]))
}

/**
 * Cuenta OPERACIONES (no campos): cantidad/unidad/nombre cambiado = 1 por item; item
 * agregado/quitado/swapeado = 1; franja tocada/agregada/quitada = 1; metas de una
 * variante tocadas = 1. Es el numero de la barra "N cambios sin publicar".
 *
 * DIVERGE a proposito del `countDraftChanges` del paquete (por eso queda LOCAL):
 *  - empareja por `key` de la UI (no por `id`), porque las filas nuevas del reducer no
 *    tienen id y las hidratadas reciben `key` fresca;
 *  - una franja nueva suma `1 + items.length` (el paquete solo suma 1 por el alta);
 *  - `itemChanged` compara solo foodId/recipeId/customName/quantity/unit (lo editable en
 *    el quick-edit RN), no optional/notes/min/max/substitutionGroupId como el paquete.
 */
export function countQuickEditChanges(baseline: QuickEditState, current: QuickEditState): number {
  let count = 0
  for (const curVariant of current.variants) {
    const baseVariant = baseline.variants.find((v) => v.key === curVariant.key)
    if (!baseVariant) {
      count += 1
      continue
    }
    if (targetsChanged(baseVariant, curVariant)) count += 1

    const baseSlotsByKey = new Map(baseVariant.slots.map((slot) => [slot.key, slot]))
    const currentSlotKeys = new Set(curVariant.slots.map((slot) => slot.key))
    for (const curSlot of curVariant.slots) {
      const baseSlot = baseSlotsByKey.get(curSlot.key)
      if (!baseSlot) {
        // Franja nueva = 1 operacion (sus items nuevos cuentan aparte al agregarse).
        count += 1 + curSlot.items.length
        continue
      }
      if (slotHeaderChanged(baseSlot, curSlot)) count += 1
      const baseItemsByKey = new Map(baseSlot.items.map((item) => [item.key, item]))
      const currentItemKeys = new Set(curSlot.items.map((item) => item.key))
      for (const curItem of curSlot.items) {
        const baseItem = baseItemsByKey.get(curItem.key)
        if (!baseItem) count += 1
        else if (itemChanged(baseItem, curItem)) count += 1
      }
      for (const key of baseItemsByKey.keys()) {
        if (!currentItemKeys.has(key)) count += 1
      }
    }
    for (const key of baseSlotsByKey.keys()) {
      if (!currentSlotKeys.has(key)) count += 1
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// Validacion inline del estado (previa al Zod del publish)
// ---------------------------------------------------------------------------

export interface QuickEditValidation {
  ok: boolean
  errors: Record<string, string>
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateQuickEditState(state: QuickEditState): QuickEditValidation {
  const errors: Record<string, string> = {}
  for (const variant of state.variants) {
    let anyTarget = false
    for (const field of TARGET_FIELDS) {
      const raw = variant.targets[field].trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        errors['targets.' + variant.key + '.' + field] = 'Ingresa un número válido.'
      } else {
        anyTarget = true
      }
    }
    if (!anyTarget) {
      errors['targets.' + variant.key + '.calories'] =
        errors['targets.' + variant.key + '.calories'] ?? 'Define al menos una meta (kcal o un macro).'
    }
    for (const slot of variant.slots) {
      if (slot.name.trim().length === 0) {
        errors['slot.' + slot.key + '.name'] = 'La franja necesita un nombre.'
      }
      if (slot.startTime.trim() !== '' && !TIME_RE.test(slot.startTime.trim())) {
        errors['slot.' + slot.key + '.startTime'] = 'Hora inválida (usa HH:MM).'
      }
      for (const item of slot.items) {
        const isCustom = !item.foodId && !item.recipeId
        if (isCustom && (item.customName ?? '').trim().length === 0) {
          errors['item.' + item.key + '.name'] = 'Escribe un nombre para el alimento.'
        }
        const q = Number(item.quantity)
        if (!(item.quantity.trim() !== '' && Number.isFinite(q) && q > 0)) {
          errors['item.' + item.key + '.quantity'] = 'Cantidad inválida.'
        }
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Macros en vivo (feedback optimista)
// ---------------------------------------------------------------------------

const ZERO_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

/**
 * Macros de una fila editada: con food hidratado (mapa de foods o swap del catalogo)
 * usa el motor compartido (paridad exacta alumno/web); sin food (item libre o food no
 * legible) escala LINEALMENTE los macros del read model por cantidad — preview honesto
 * sin inventar datos.
 */
export function quickEditItemMacros(
  item: QuickEditItem,
  foodsById: ReadonlyMap<string, BuilderFood>,
): ItemMacros {
  const food = item.food ?? (item.foodId ? foodsById.get(item.foodId) ?? null : null)
  const quantity = Number(item.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_MACROS
  if (food) return computeItemMacros(food, quantity, item.unit)
  if (!item.baseMacros || !item.baseQuantity || item.baseQuantity <= 0) return ZERO_MACROS
  const factor = quantity / item.baseQuantity
  const scale = (value: number | null) => (value == null ? 0 : Math.round(value * factor * 10) / 10)
  return {
    calories: scale(item.baseMacros.calories),
    proteinG: scale(item.baseMacros.proteinG),
    carbsG: scale(item.baseMacros.carbsG),
    fatsG: scale(item.baseMacros.fatsG),
    fiberG: scale(item.baseMacros.fiberG),
  }
}

function addMacros(a: ItemMacros, b: ItemMacros): ItemMacros {
  return {
    calories: Math.round((a.calories + b.calories) * 10) / 10,
    proteinG: Math.round((a.proteinG + b.proteinG) * 10) / 10,
    carbsG: Math.round((a.carbsG + b.carbsG) * 10) / 10,
    fatsG: Math.round((a.fatsG + b.fatsG) * 10) / 10,
    fiberG: Math.round((a.fiberG + b.fiberG) * 10) / 10,
  }
}

export function quickEditSlotSubtotal(
  slot: QuickEditSlot,
  foodsById: ReadonlyMap<string, BuilderFood>,
): ItemMacros {
  return slot.items.reduce((acc, item) => addMacros(acc, quickEditItemMacros(item, foodsById)), ZERO_MACROS)
}

/** Paso del stepper por unidad: 5 para g/ml, 0.5 para unidad/porcion (qe-design §1.2). */
export function stepForUnit(unit: string): number {
  const u = (unit || '').toLowerCase()
  return u === 'g' || u === 'ml' ? 5 : 0.5
}

/** Paso del stepper de metas: 50 kcal, 5 g para macros. */
export function stepForTargetField(field: QuickEditTargetField): number {
  return field === 'calories' ? 50 : 5
}

// ---------------------------------------------------------------------------
// Hidratacion de foods (macros en vivo + snapshots correctos al persistir)
// ---------------------------------------------------------------------------

export function collectQuickEditFoodIds(state: QuickEditState): string[] {
  const ids = new Set<string>()
  for (const variant of state.variants) {
    for (const slot of variant.slots) {
      for (const item of slot.items) {
        if (item.foodId) ids.add(item.foodId)
      }
    }
  }
  return [...ids]
}

/** Espejo local de FoodRow/toBuilderFood privados de nutrition-v2-builder (nota de origen). */
interface FoodRow {
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
}

function toBuilderFood(row: FoodRow): BuilderFood {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatsG: row.fats_g,
    fiberG: row.fiber_g,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit ?? 'g',
    category: null,
    media: null,
  }
}

/**
 * Carga best-effort de los foods referenciados (RLS de coach). Un food no legible o un
 * error de red NO bloquea el modo edicion: la fila cae al fallback de escala lineal.
 */
export async function loadQuickEditFoods(
  db: NutritionV2WriteClient,
  foodIds: readonly string[],
): Promise<Map<string, BuilderFood>> {
  const map = new Map<string, BuilderFood>()
  for (const id of foodIds) {
    try {
      const res = await db
        .from('foods')
        .select('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit')
        .eq('id', id)
        .maybeSingle()
      if (!res.error && res.data) map.set(id, toBuilderFood(res.data as FoodRow))
    } catch {
      // best-effort: sin food el preview escala linealmente
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Ensamblado del draft canonico (estado editable → NutritionPlanDraft)
// ---------------------------------------------------------------------------

/**
 * Ensambla el draft canonico SIN validar (la validacion Zod corre en el publish).
 * Las notas van con los valores del baseline como placeholder: el publish las PISA
 * con el carry-over leido de la version base (regla F1: quick-edit nunca toca notas).
 */
export function quickEditStateToDraft(input: {
  state: QuickEditState
  baseline: QuickEditBaseline
  clientId: string
  effectiveFrom: string
}): NutritionPlanDraft {
  const { state, baseline, clientId, effectiveFrom } = input
  const dayVariants: DraftDayVariant[] = state.variants.map((variant, variantIndex) => ({
    ...(variant.id ? { id: variant.id } : {}),
    key: variant.key,
    label: variant.label,
    dayOfWeek: variant.dayOfWeek,
    default: variant.default,
    targets: {
      calories: toNullableNumber(variant.targets.calories),
      proteinG: toNullableNumber(variant.targets.proteinG),
      carbsG: toNullableNumber(variant.targets.carbsG),
      fatsG: toNullableNumber(variant.targets.fatsG),
      fiberG: variant.fixedTargets.fiberG,
      sodiumMg: variant.fixedTargets.sodiumMg,
      waterMl: variant.fixedTargets.waterMl,
    },
    orderIndex: variantIndex,
    mealSlots: variant.slots.map((slot, slotIndex): DraftMealSlot => ({
      ...(slot.id ? { id: slot.id } : {}),
      code: slot.code,
      name: slot.name.trim(),
      startTime: slot.startTime.trim() === '' ? null : slot.startTime.trim(),
      endTime: slot.endTime,
      mode: slot.mode,
      required: slot.required,
      targets: slot.targets,
      instructions: slot.instructions,
      orderIndex: slotIndex,
      items: slot.items.map((item, itemIndex): DraftPrescriptionItem => ({
        ...(item.id ? { id: item.id } : {}),
        foodId: item.foodId,
        recipeId: item.recipeId,
        customName:
          item.foodId || item.recipeId ? null : ((item.customName ?? '').trim() || null),
        quantity: Number(item.quantity) || 0,
        unit: item.unit,
        minimumQuantity: item.minimumQuantity,
        maximumQuantity: item.maximumQuantity,
        optional: item.optional,
        substitutionGroupId: item.substitutionGroupId,
        notes: item.notes && item.notes.trim() !== '' ? item.notes.trim() : null,
        orderIndex: itemIndex,
      })),
    })),
  }))

  return {
    planId: baseline.planId,
    clientId,
    name: baseline.name,
    strategy: baseline.strategy,
    effectiveFrom,
    timezone: baseline.timezone,
    permissions: baseline.permissions,
    visibleNotes: baseline.visibleNotes,
    privateNotes: null,
    protocolNotes: baseline.protocolNotes,
    dayVariants,
  }
}

// ---------------------------------------------------------------------------
// Capa de porciones — tipos + inyeccion en el draft + filas de insert con snapshot
// congelado. CONSOLIDADO (follow-up PR #129/#131) desde el espejo
// `components/nutrition-v2/quick-edit/portions-publish.ts` (eliminado): la persistencia
// de targets vive junto al pipeline que la usa. El estado/reducer de UI sigue en
// `components/nutrition-v2/quick-edit/portions-state.ts`, que RE-EXPORTA estos tipos
// para conservar su superficie publica (los tests importan desde alla).
// ---------------------------------------------------------------------------

type PortionDraftSlot = NutritionPlanDraft['dayVariants'][number]['mealSlots'][number]
export type DraftExchangeTarget = NonNullable<PortionDraftSlot['exchangeTargets']>[number]

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
 * Grupo elegible para el picker de altas. F1: derivado de los targets que el plan YA
 * tiene (snapshots congelados del read model) — nunca el catalogo vivo (hallazgo F3).
 * `ref`/`composedOf` se conservan para re-congelar el snapshot al publicar.
 */
export interface QuickEditPortionGroup {
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  ref: PortionGroupRef
  composedOf: PortionComposedPart[] | null
  macrosConfirmed: boolean
  /** Posicion estable en el dict del plan → fallback deterministico de color. */
  sortOrder: number
}

/** Target editable de una franja (espejo movil de `QePortionTarget` web). */
export interface QuickEditPortionTarget {
  key: string
  /** Id de la fila en la version base; null = alta de esta edicion. */
  id: string | null
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  macrosConfirmed: boolean
  /** Multiplo de 0,5 en [0,5..99] SIEMPRE (stepper de botones; sin estado invalido). */
  portions: number
  /** '' = sin nota (TextInput). Se normaliza a null al proyectar. */
  notes: string
}

/**
 * Targets por `slot.key` del QuickEditState. Sin entrada (o []) = franja sin porciones.
 * Los slots eliminados del estado principal conservan su entrada (el RESTORE_SLOT del
 * undo recupera tambien sus porciones); al publicar solo se miran los slots VIVOS.
 */
export interface QuickEditPortionsState {
  bySlot: Record<string, QuickEditPortionTarget[]>
}

function normalizePortionNotes(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Cuelga `exchangeTargets` en los slots del draft que `quickEditStateToDraft` ensamblo,
 * caminando draft y estado EN PARALELO (el mapeo de variantes/franjas es por indice en
 * el mismo orden). Franja sin targets => slot IDENTICO al de antes (sin la clave): un
 * plan sin porciones publica un draft byte-identico al actual.
 */
export function injectExchangeTargetsIntoDraft(
  draft: NutritionPlanDraft,
  editState: QuickEditState,
  portions: QuickEditPortionsState,
): NutritionPlanDraft {
  return {
    ...draft,
    dayVariants: draft.dayVariants.map((variant, variantIndex) => {
      const stateVariant = editState.variants[variantIndex]
      if (!stateVariant) return variant
      return {
        ...variant,
        mealSlots: variant.mealSlots.map((slot, slotIndex) => {
          const stateSlot = stateVariant.slots[slotIndex]
          if (!stateSlot) return slot
          const targets = portions.bySlot[stateSlot.key] ?? []
          if (targets.length === 0) return slot
          return {
            ...slot,
            exchangeTargets: targets.map(
              (target, orderIndex): DraftExchangeTarget => ({
                ...(target.id ? { id: target.id } : {}),
                exchangeGroupId: target.exchangeGroupId,
                portions: target.portions,
                notes: normalizePortionNotes(target.notes),
                orderIndex,
              }),
            ),
          }
        }),
      }
    }),
  }
}

/**
 * Fila de `nutrition_slot_exchange_targets_v2` (espejo del `ExchangeTargetInsertRow`
 * del draft-builder web). En RN el cliente ES el escritor (PostgREST directo, igual que
 * items/slots del quick-edit): el snapshot se RE-CONGELA por valor desde el snapshot del
 * read model (que a su vez fue congelado server-side al persistirse la version base) —
 * nunca desde el catalogo vivo. `snapshot_composed_of` ya viene ENRIQUECIDO (A2).
 */
export type PortionTargetInsertRow = {
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
  snapshot_composed_of: PortionComposedPart[] | null
  snapshot_macros_confirmed: boolean
}

/**
 * Emite las filas de una franja resolviendo cada grupo contra el dict congelado del
 * plan. Devuelve `null` si algun grupo no es resolvible (jamas una fila con
 * `snapshot_*` NULL — SPEC R2/B5): el caller corta el publish con error explicito.
 * En F1 esto no deberia ocurrir (las altas salen del mismo dict), es cinturon.
 */
export function buildPortionTargetInsertRows(input: {
  versionId: string
  mealSlotId: string
  targets: readonly DraftExchangeTarget[]
  groupsById: ReadonlyMap<string, QuickEditPortionGroup>
}): PortionTargetInsertRow[] | null {
  const { versionId, mealSlotId, targets, groupsById } = input
  const rows: PortionTargetInsertRow[] = []
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]
    const group = groupsById.get(target.exchangeGroupId)
    if (!group) return null
    rows.push({
      version_id: versionId,
      meal_slot_id: mealSlotId,
      exchange_group_id: group.exchangeGroupId,
      portions: target.portions,
      notes: target.notes ?? null,
      order_index: index,
      snapshot_group_code: group.groupCode,
      snapshot_group_name: group.groupName,
      snapshot_ref_calories: group.ref.calories,
      snapshot_ref_protein_g: group.ref.proteinG,
      snapshot_ref_carbs_g: group.ref.carbsG,
      snapshot_ref_fats_g: group.ref.fatsG,
      snapshot_composed_of:
        group.composedOf === null
          ? null
          : group.composedOf.map((part) => ({
              code: part.code,
              portions: part.portions,
              ref: { ...part.ref },
            })),
      snapshot_macros_confirmed: group.macrosConfirmed,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Publicacion (Contrato 3): carry-over de notas + delta-gate + guard optimista
// ---------------------------------------------------------------------------

/**
 * Vigencia de la republicacion: hoy en la tz del plan, salvo que la version base
 * arranque en el futuro (el edit no puede "adelantar" el plan) — qe-design §2.3.5.
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

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function mapPublishFailureCode(failure: PublishFailure): QuickEditErrorCode {
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

interface BaseVersionNotesRow {
  id: string
  plan_id: string
  visible_notes: string | null
  private_notes: string | null
  protocol_notes: string | null
}

/**
 * Publica el quick-edit desde el movil (espejo del quickEditPublishAction web, §2.3):
 *  1. Lee las notas de la version base (RLS coach) y valida que pertenece al plan del
 *     draft (anti-confusion de ids; fail-closed si no es legible).
 *  2. Carry-over: pisa visible/private/protocol con los valores de la base — cero
 *     perdida de private_notes (el read model no las expone) y cero forja.
 *  3. Valida el draft con NutritionPlanDraftSchema.
 *  4. Delta-gate Pro: solo gatea features NUEVAS (contenido grandfathered pasa).
 *  5. Persiste y publica con p_expected_current_version_id = version base (CAS).
 *
 * Capa de porciones (opcional): con `portions` se inyectan los `exchangeTargets` en el
 * draft (paso 2b; el Zod del paquete valida multiplos de 0,5) y se persisten sus filas
 * con snapshot congelado antes del publish RPC (paso 5). SIN `portions` el flujo es
 * byte-identico al original (el draft nunca trae `exchangeTargets` y el insert de
 * targets no corre). El delta-gate Pro no cambia: las porciones no son feature Pro.
 */
export async function publishQuickEditRN(input: {
  db: NutritionV2WriteClient
  userId: string
  clientId: string
  baseline: QuickEditBaseline
  state: QuickEditState
  /** Estado de porciones + dict congelado de grupos del plan (omitir = sin porciones). */
  portions?: {
    state: QuickEditPortionsState
    groupsById: ReadonlyMap<string, QuickEditPortionGroup>
  }
  idempotencyKey: string
  todayIso: string
  hasNutritionPro: boolean
}): Promise<QuickEditPublishResult> {
  const { db, userId, clientId, baseline, state, portions, idempotencyKey, todayIso, hasNutritionPro } = input

  // 1. Version base: notas + pertenencia al plan (fail-closed).
  const baseRes = await db
    .from('nutrition_plan_versions_v2')
    .select('id, plan_id, visible_notes, private_notes, protocol_notes')
    .eq('id', baseline.baseVersionId)
    .maybeSingle()
  if (baseRes.error) {
    const mapped = mapWriteError(baseRes.error, 'version base')
    return { ok: false, code: mapPublishFailureCode(mapped), message: mapped.error }
  }
  const baseRow = baseRes.data as BaseVersionNotesRow | null
  if (!baseRow || baseRow.plan_id !== baseline.planId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'No se encontró la versión vigente de este plan. Recarga la ficha e intenta de nuevo.',
    }
  }

  // 2-3. Draft (+ porciones si vienen) + carry-over de notas + validacion canonica.
  const effectiveFrom = quickEditEffectiveFrom(todayIso, baseline.effectiveFrom)
  const baseDraft = quickEditStateToDraft({ state, baseline, clientId, effectiveFrom })
  const rawDraft = portions
    ? injectExchangeTargetsIntoDraft(baseDraft, state, portions.state)
    : baseDraft
  rawDraft.visibleNotes = baseRow.visible_notes
  rawDraft.privateNotes = baseRow.private_notes
  rawDraft.protocolNotes = baseRow.protocol_notes
  const parsed = NutritionPlanDraftSchema.safeParse(rawDraft)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'El plan tiene datos inválidos y no se pudo publicar. Revisa las cantidades y nombres.',
    }
  }
  const draft = parsed.data

  // 4. Delta-gate Pro (qe-design §2.4): preservar contenido Pro existente ≠ crear.
  const newFeature = requiredNutritionProFeature(draft)
  if (newFeature && !hasNutritionPro) {
    const baseFeatures = new Set<NutritionProFeature>()
    if (baseline.strategy === 'hybrid') baseFeatures.add('hybrid_strategy')
    if (draft.dayVariants.length > 1) baseFeatures.add('multi_variant') // F1 no crea variantes
    if (hasContent(baseRow.private_notes)) baseFeatures.add('private_notes')
    if (hasContent(baseRow.protocol_notes)) baseFeatures.add('protocol_notes')
    if (!baseFeatures.has(newFeature)) {
      return {
        ok: false,
        code: 'UPGRADE_REQUIRED',
        feature: newFeature,
        message: `Activa Nutrición Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[newFeature]}.`,
      }
    }
  }

  // 5. Persistencia (+ targets de porciones congelados si aplican) + publish con CAS.
  const res = await persistAndPublishQuickEdit({
    db,
    userId,
    draft,
    portionGroupsById: portions?.groupsById,
    idempotencyKey,
    effectiveFrom,
    expectedCurrentVersionId: baseline.baseVersionId,
  })
  if (res.ok) return { ok: true, versionId: res.versionId }
  return { ok: false, code: mapPublishFailureCode(res), message: res.error }
}

interface PlanRow {
  id: string
  client_id: string
}

/**
 * Espejo MINIMO de persistAndPublishDraft (lib/nutrition-v2-builder.ts — nota de
 * origen) con dos diferencias deliberadas:
 *  - exige `draft.planId` (el quick-edit SIEMPRE republica un plan existente), y
 *  - pasa `p_expected_current_version_id` al RPC (guard optimista del Contrato 3) y
 *    mapea `nutrition_v2_publish_stale_base` → STALE_BASE.
 * No se edita el builder (regla de reparticion §5, archivos disjuntos).
 *
 * Porciones: tras los items de cada franja inserta sus filas de
 * `nutrition_slot_exchange_targets_v2` con snapshot congelado (espejo del insert de
 * `plan-persistence` web), gateado por `slot.exchangeTargets?.length` — un draft sin
 * porciones jamas toca la tabla nueva.
 */
async function persistAndPublishQuickEdit(input: {
  db: NutritionV2WriteClient
  userId: string
  draft: NutritionPlanDraft
  /** Dict congelado de grupos del plan (requerido solo si el draft trae exchangeTargets). */
  portionGroupsById?: ReadonlyMap<string, QuickEditPortionGroup>
  idempotencyKey: string
  effectiveFrom: string
  expectedCurrentVersionId: string
}): Promise<PublishResult> {
  const { db, userId, draft, portionGroupsById, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = input

  if (!draft.planId) {
    return publishFail('PLAN_NOT_FOUND', 'El quick-edit requiere un plan vigente.')
  }

  // Retry idempotente: si la clave ya publico, devolvemos la version existente.
  const existing = await db
    .from('nutrition_plan_versions_v2')
    .select('id, plan_id')
    .eq('publish_idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing.error) return mapWriteError(existing.error, 'idempotencia')
  if (existing.data) {
    const row = existing.data as { id: string; plan_id: string }
    return { ok: true, versionId: row.id, planId: row.plan_id }
  }

  const planRes = await db
    .from('nutrition_plans_v2')
    .select('id, client_id')
    .eq('id', draft.planId)
    .maybeSingle()
  if (planRes.error) return mapWriteError(planRes.error, 'plan')
  const planRow = planRes.data as PlanRow | null
  if (!planRow || planRow.client_id !== draft.clientId) {
    return publishFail('PLAN_NOT_FOUND', 'El plan indicado no pertenece a este alumno.')
  }

  const maxRes = await db
    .from('nutrition_plan_versions_v2')
    .select('version_number')
    .eq('plan_id', planRow.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxRes.error) return mapWriteError(maxRes.error, 'version')
  const maxRow = maxRes.data as { version_number: number } | null
  const nextVersion = (maxRow?.version_number ?? 0) + 1

  const versionIns = await db
    .from('nutrition_plan_versions_v2')
    .insert({
      plan_id: planRow.id,
      version_number: nextVersion,
      status: 'draft',
      strategy: draft.strategy,
      timezone: draft.timezone,
      student_permissions: draft.permissions,
      visible_notes: draft.visibleNotes,
      private_notes: draft.privateNotes,
      protocol_notes: draft.protocolNotes,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()
  if (versionIns.error || !versionIns.data) {
    return mapWriteError(versionIns.error ?? { message: 'no version' }, 'version')
  }
  const versionId = versionIns.data.id

  // Foods para snapshots (mismo camino que el builder).
  const foodIds: string[] = []
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (item.foodId && !foodIds.includes(item.foodId)) foodIds.push(item.foodId)
      }
    }
  }
  const foodMap = new Map<string, BuilderFood>()
  for (const id of foodIds) {
    const foodRes = await db
      .from('foods')
      .select('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit')
      .eq('id', id)
      .maybeSingle()
    if (foodRes.error) return mapWriteError(foodRes.error, 'alimentos')
    if (foodRes.data) foodMap.set(id, toBuilderFood(foodRes.data as FoodRow))
  }

  for (const variant of draft.dayVariants) {
    const variantIns = await db
      .from('nutrition_day_variants_v2')
      .insert(buildVariantInsertRow(versionId, variant))
      .select('id')
      .single()
    if (variantIns.error || !variantIns.data) {
      return mapWriteError(variantIns.error ?? { message: 'no variant' }, 'dia')
    }
    const variantId = variantIns.data.id

    for (const slot of variant.mealSlots) {
      const slotIns = await db
        .from('nutrition_meal_slots_v2')
        .insert(buildSlotInsertRow(versionId, variantId, slot))
        .select('id')
        .single()
      if (slotIns.error || !slotIns.data) {
        return mapWriteError(slotIns.error ?? { message: 'no slot' }, 'franja')
      }
      const mealSlotId = slotIns.data.id

      if (slot.items.length > 0) {
        const itemRows = slot.items.map((item, index) =>
          buildItemInsertRow({
            versionId,
            mealSlotId,
            orderIndex: index,
            item,
            food: item.foodId ? foodMap.get(item.foodId) ?? null : null,
          }),
        )
        const itemsIns = await db.from('nutrition_prescription_items_v2').insert(itemRows)
        if (itemsIns.error) return mapWriteError(itemsIns.error, 'items')
      }

      // Targets de porciones de la franja, congelados desde el dict del plan (jamas
      // snapshot NULL — si un grupo no resuelve, se corta el publish en voz alta).
      const exchangeTargets = slot.exchangeTargets ?? []
      if (exchangeTargets.length > 0) {
        const targetRows = buildPortionTargetInsertRows({
          versionId,
          mealSlotId,
          targets: exchangeTargets,
          groupsById: portionGroupsById ?? new Map(),
        })
        if (!targetRows) {
          return publishFail(
            'WRITE_FAILED',
            'No se pudo preparar un grupo de porciones. Recarga la ficha e intenta de nuevo.',
          )
        }
        const targetsIns = await db
          .from('nutrition_slot_exchange_targets_v2')
          .insert(targetRows as unknown as Record<string, unknown>[])
        if (targetsIns.error) return mapWriteError(targetsIns.error, 'porciones')
      }
    }
  }

  const publishRes = await db.rpc('publish_nutrition_plan_v2', {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_idempotency_key: idempotencyKey,
    p_expected_current_version_id: expectedCurrentVersionId,
  })
  if (publishRes.error) {
    if ((publishRes.error.message ?? '').includes('publish_stale_base')) {
      return publishFail('STALE_BASE', 'Este plan cambió en otra sesión.')
    }
    return mapWriteError(publishRes.error, 'publicación')
  }

  const publishedId = z.string().uuid().safeParse(publishRes.data)
  if (!publishedId.success) {
    return publishFail('INVALID_RESPONSE', 'La publicación devolvió una respuesta inesperada.')
  }
  return { ok: true, versionId: publishedId.data, planId: planRow.id }
}

/** ¿El modo edicion muestra franjas? (flexible sin franjas → quick-edit solo de metas). */
export function quickEditUsesSlots(baseline: QuickEditBaseline, state: QuickEditState): boolean {
  return strategyUsesSlots(baseline.strategy) || state.variants.some((v) => v.slots.length > 0)
}
