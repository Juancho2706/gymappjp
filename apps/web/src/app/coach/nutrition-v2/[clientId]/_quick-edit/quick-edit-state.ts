/**
 * Estado PURO del modo edicion in-place (quick-edit) del plan V2 — web coach.
 * Sin React/Next: tipos + hidratacion desde el read model + reducer + macros en vivo +
 * ensamblado del draft canonico. Testeable con mocks.
 *
 * Relacion con el contrato compartido (@eva/nutrition-v2/quick-edit):
 * - `readModelToDraft` (paquete) da el draft BASE (planId, permisos, notas, estrategia).
 * - Este modulo mantiene el arbol EDITABLE (con keys de UI y bases de macros) y lo
 *   proyecta sobre ese draft base via `applyQuickEditToDraft`. El contador de cambios
 *   (`countDraftChanges`, paquete) compara draft base proyectado vs draft actual: ambos
 *   pasan por la MISMA proyeccion, asi que cero ediciones = cero cambios garantizado.
 */

import type {
  NutritionMacroTargets,
  NutritionPlanDraft,
  NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import {
  computeItemMacros,
  type BuilderFood,
  type ItemMacros,
} from '../builder/_lib/draft-builder'

export const ZERO_ITEM_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

// ---------------------------------------------------------------------------
// Tipos del arbol editable
// ---------------------------------------------------------------------------

export interface QeItem {
  /** Key estable de UI (id del read model para items hidratados; generada para nuevos). */
  key: string
  /** Id del item prescrito en la version base (se conserva en el draft para paridad). */
  id: string | null
  foodId: string | null
  recipeId: string | null
  /** Nombre visible (snapshot del catalogo, o editable si es alimento libre). */
  displayName: string
  brand: string | null
  /** Cantidad editable como texto (tap-to-edit / steppers). */
  quantity: string
  unit: string
  minimumQuantity: number | null
  maximumQuantity: number | null
  optional: boolean
  substitutionGroupId: string | null
  notes: string | null
  /**
   * Alimento del catalogo con macros por 100 (swap o alta nueva): habilita recomputo
   * exacto (computeItemMacros) y el cambio de unidad completo (BUILDER_UNITS).
   */
  food: BuilderFood | null
  /**
   * Base de escalado lineal para items hidratados del read model (solo traen macros de
   * la cantidad prescrita, no por-100): macros nuevas = base * (qty / base.quantity).
   * Exacto mientras la unidad no cambie — por eso la unidad queda BLOQUEADA para estos
   * items (el swap desde catalogo la desbloquea). El servidor re-deriva de foods igual.
   */
  macroBase: { quantity: number; macros: ItemMacros } | null
  /** Alimento libre (sin foodId/recipeId): el nombre es editable y las macros no aplican. */
  isCustom: boolean
}

/**
 * Target de porciones editable de la franja (capa opcional SPEC R1/R2). Conserva el
 * snapshot de identidad del grupo (codigo/nombre/color) para pintar la fila SIN pegarle
 * al catalogo vivo; `portions` es texto editable (stepper 0,5 / tap-to-edit).
 */
export interface QePortionTarget {
  key: string
  /** Id de la fila del target en la version base (null = alta nueva de la UI). */
  id: string | null
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  macrosConfirmed: boolean
  /** Porciones como texto ("2", "1.5"); multiplos de 0,5, minimo 0,5, maximo 99. */
  portions: string
  notes: string | null
}

/**
 * Grupo elegible para agregar porciones en el quick-edit. F1: sale de los targets que el
 * plan YA tiene (snapshots congelados del read model) — el quick-edit no tiene canal
 * server-side de catalogo de grupos; el alta de grupos NUEVOS al plan vive en el builder.
 */
export interface QePortionGroup {
  exchangeGroupId: string
  groupCode: string
  groupName: string
  color: string | null
  ref: { calories: number; proteinG: number; carbsG: number; fatsG: number }
  macrosConfirmed: boolean
}

export interface QeSlot {
  key: string
  id: string | null
  code: string
  name: string
  /** 'HH:MM' o '' (sin hora). */
  startTime: string
  endTime: string | null
  mode: 'anchor' | 'flexible'
  required: boolean
  instructions: string | null
  targets: Partial<NutritionMacroTargets>
  items: QeItem[]
  /** Porciones a eleccion de la franja (capa opcional; [] = franja sin porciones). */
  portionTargets: QePortionTarget[]
}

export interface QeTargetsText {
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

export interface QeVariant {
  key: string
  id: string | null
  variantKey: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  targets: QeTargetsText
  /** Metas que la UI no edita en F1: pasan intactas al draft. */
  passthroughTargets: { fiberG: number | null; sodiumMg: number | null; waterMl: number | null }
  slots: QeSlot[]
}

export interface QuickEditState {
  variants: QeVariant[]
}

// ---------------------------------------------------------------------------
// Hidratacion desde el read model
// ---------------------------------------------------------------------------

/** 'HH:MM[:SS]' (o null) → 'HH:MM' | ''. El draft exige HH:MM estricto. */
export function normalizeTimeHHMM(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  return match ? `${match[1]}:${match[2]}` : ''
}

type ReadVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadSlot = ReadVariant['mealSlots'][number]
type ReadItem = ReadSlot['prescriptionItems'][number]

function hydrateItem(item: ReadItem): QeItem {
  const isCustom = item.foodId === null && item.recipeId === null
  return {
    key: item.id,
    id: item.id,
    foodId: item.foodId,
    recipeId: item.recipeId,
    displayName: item.name ?? 'Alimento',
    brand: item.brand,
    quantity: String(item.quantity),
    unit: item.unit,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    food: null,
    macroBase:
      item.quantity > 0
        ? {
            quantity: item.quantity,
            macros: {
              calories: item.macros.calories ?? 0,
              proteinG: item.macros.proteinG ?? 0,
              carbsG: item.macros.carbsG ?? 0,
              fatsG: item.macros.fatsG ?? 0,
              fiberG: item.macros.fiberG ?? 0,
            },
          }
        : null,
    isCustom,
  }
}

type ReadExchangeTarget = NonNullable<ReadSlot['exchangeTargets']>[number]

function hydratePortionTarget(target: ReadExchangeTarget): QePortionTarget {
  return {
    key: target.id,
    id: target.id,
    exchangeGroupId: target.exchangeGroupId,
    groupCode: target.groupCode,
    groupName: target.groupName,
    color: target.color,
    macrosConfirmed: target.macrosConfirmed,
    portions: String(target.portions),
    notes: target.notes,
  }
}

function hydrateSlot(slot: ReadSlot): QeSlot {
  return {
    key: slot.id,
    id: slot.id,
    code: slot.code,
    name: slot.name,
    startTime: normalizeTimeHHMM(slot.startTime),
    endTime: normalizeTimeHHMM(slot.endTime) || null,
    mode: slot.mode,
    required: slot.required,
    instructions: slot.instructions,
    targets: slot.targets,
    items: slot.prescriptionItems.map(hydrateItem),
    portionTargets: (slot.exchangeTargets ?? []).map(hydratePortionTarget),
  }
}

/**
 * Grupos elegibles para el picker de porciones del quick-edit: los que el plan YA usa
 * (dict reconstruible desde los snapshots congelados de los targets), unicos por id y
 * ordenados por codigo. Puro y sin catalogo vivo (hallazgo F3).
 */
export function collectPortionGroups(planModel: NutritionPlanReadModel): QePortionGroup[] {
  const byId = new Map<string, QePortionGroup>()
  for (const variant of planModel.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const target of slot.exchangeTargets ?? []) {
        if (byId.has(target.exchangeGroupId)) continue
        byId.set(target.exchangeGroupId, {
          exchangeGroupId: target.exchangeGroupId,
          groupCode: target.groupCode,
          groupName: target.groupName,
          color: target.color,
          ref: target.ref,
          macrosConfirmed: target.macrosConfirmed,
        })
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.groupCode.localeCompare(b.groupCode))
}

function targetText(value: number | null): string {
  return value === null ? '' : String(value)
}

function hydrateVariant(variant: ReadVariant): QeVariant {
  return {
    key: variant.id,
    id: variant.id,
    variantKey: variant.key,
    label: variant.label,
    dayOfWeek: variant.dayOfWeek,
    isDefault: variant.isDefault,
    targets: {
      calories: targetText(variant.targets.calories),
      proteinG: targetText(variant.targets.proteinG),
      carbsG: targetText(variant.targets.carbsG),
      fatsG: targetText(variant.targets.fatsG),
    },
    passthroughTargets: {
      fiberG: variant.targets.fiberG,
      sodiumMg: variant.targets.sodiumMg,
      waterMl: variant.targets.waterMl,
    },
    slots: variant.mealSlots.map(hydrateSlot),
  }
}

/** Arbol editable hidratado desde el read model de la ficha (null si no hay plan vigente). */
export function readModelToEditState(planModel: NutritionPlanReadModel): QuickEditState | null {
  if (planModel.plan === null) return null
  return { variants: planModel.dayVariants.map(hydrateVariant) }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type QuickEditAction =
  | { type: 'SET_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'STEP_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; direction: 1 | -1 }
  | { type: 'SET_ITEM_UNIT'; variantKey: string; slotKey: string; itemKey: string; unit: string }
  | { type: 'SET_ITEM_NAME'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SWAP_ITEM_FOOD'; variantKey: string; slotKey: string; itemKey: string; food: BuilderFood }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  | { type: 'RESTORE_ITEM'; variantKey: string; slotKey: string; index: number; item: QeItem }
  | { type: 'ADD_CATALOG_ITEM'; variantKey: string; slotKey: string; key: string; food: BuilderFood }
  | { type: 'ADD_CUSTOM_ITEM'; variantKey: string; slotKey: string; key: string }
  | { type: 'UPDATE_SLOT'; variantKey: string; slotKey: string; patch: Partial<Pick<QeSlot, 'name' | 'startTime'>> }
  | { type: 'REMOVE_SLOT'; variantKey: string; slotKey: string }
  | { type: 'RESTORE_SLOT'; variantKey: string; index: number; slot: QeSlot }
  | { type: 'ADD_SLOT'; variantKey: string; key: string; name: string; startTime: string }
  | { type: 'SET_TARGET'; variantKey: string; field: keyof QeTargetsText; value: string }
  | { type: 'STEP_TARGET'; variantKey: string; field: keyof QeTargetsText; direction: 1 | -1 }
  | { type: 'SET_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string; value: string }
  | { type: 'STEP_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string; direction: 1 | -1 }
  | { type: 'REMOVE_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string }
  | { type: 'RESTORE_PORTION_TARGET'; variantKey: string; slotKey: string; index: number; target: QePortionTarget }
  | { type: 'ADD_PORTION_TARGET'; variantKey: string; slotKey: string; key: string; group: QePortionGroup }
  | { type: 'RESET'; state: QuickEditState }

/** Paso del stepper de cantidad: 5 para g/ml, 0.5 para unidad/porcion (NN/g, nunca slider). */
export function quantityStep(unit: string): number {
  return unit.toLowerCase() === 'un' ? 0.5 : 5
}

/** Paso del stepper de metas: 50 kcal, 5 g para macros. */
export function targetStep(field: keyof QeTargetsText): number {
  return field === 'calories' ? 50 : 5
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Suma `direction*step` sobre el texto actual; cantidades nunca bajan de un valor > 0. */
export function stepQuantityText(current: string, step: number, direction: 1 | -1): string {
  const n = Number(current.trim())
  const base = Number.isFinite(n) && n > 0 ? n : 0
  const next = round1(base + direction * step)
  if (next <= 0) return current
  return String(next)
}

export function stepTargetText(current: string, step: number, direction: 1 | -1): string {
  const n = Number(current.trim())
  const base = Number.isFinite(n) && n >= 0 ? n : 0
  const next = Math.max(0, round1(base + direction * step))
  return String(next)
}

// ── Porciones: paso 0,5 / minimo 0,5 / maximo 99 (SPEC R2, CHECK de la tabla) ──

export const PORTION_STEP = 0.5
export const PORTION_MIN = 0.5
export const PORTION_MAX = 99

/** Numero desde el texto de porciones (acepta coma decimal es-CL); null si no parsea. */
export function parsePortionsValue(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** ¿Valor valido segun el contrato? (multiplos de 0,5 entre 0,5 y 99). */
export function isValidPortionsText(value: string): boolean {
  const n = parsePortionsValue(value)
  return n !== null && n >= PORTION_MIN && n <= PORTION_MAX && Number.isInteger(n * 2)
}

/**
 * Paso del stepper de porciones: ±0,5 con snap a medios; nunca baja de 0,5 (la baja del
 * grupo es el boton eliminar, no el stepper) ni sube de 99.
 */
export function stepPortionsText(current: string, direction: 1 | -1): string {
  const n = parsePortionsValue(current)
  const base = n !== null && n > 0 ? n : 0
  const next = Math.round((base + direction * PORTION_STEP) * 2) / 2
  if (next < PORTION_MIN) return current
  return String(Math.min(next, PORTION_MAX))
}

function mapVariant(state: QuickEditState, variantKey: string, fn: (v: QeVariant) => QeVariant): QuickEditState {
  return { variants: state.variants.map((v) => (v.key === variantKey ? fn(v) : v)) }
}

function mapSlot(
  state: QuickEditState,
  variantKey: string,
  slotKey: string,
  fn: (s: QeSlot) => QeSlot,
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
  fn: (item: QeItem) => QeItem,
): QuickEditState {
  return mapSlot(state, variantKey, slotKey, (slot) => ({
    ...slot,
    items: slot.items.map((item) => (item.key === itemKey ? fn(item) : item)),
  }))
}

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const clamped = Math.max(0, Math.min(list.length, index))
  return [...list.slice(0, clamped), value, ...list.slice(clamped)]
}

export function createCatalogItem(key: string, food: BuilderFood): QeItem {
  return {
    key,
    id: null,
    foodId: food.id,
    recipeId: null,
    displayName: food.name,
    brand: food.brand,
    quantity: String(food.servingSize || 100),
    unit: normalizeBuilderUnit(food.servingUnit),
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food,
    macroBase: null,
    isCustom: false,
  }
}

export function createCustomItem(key: string): QeItem {
  return {
    key,
    id: null,
    foodId: null,
    recipeId: null,
    displayName: '',
    brand: null,
    quantity: '100',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food: null,
    macroBase: null,
    isCustom: true,
  }
}

/** Alta de porciones desde el picker: arranca en 1 porcion (ajustable con el stepper). */
export function createPortionTarget(key: string, group: QePortionGroup): QePortionTarget {
  return {
    key,
    id: null,
    exchangeGroupId: group.exchangeGroupId,
    groupCode: group.groupCode,
    groupName: group.groupName,
    color: group.color,
    macrosConfirmed: group.macrosConfirmed,
    portions: '1',
    notes: null,
  }
}

function mapPortionTarget(
  state: QuickEditState,
  variantKey: string,
  slotKey: string,
  targetKey: string,
  fn: (target: QePortionTarget) => QePortionTarget,
): QuickEditState {
  return mapSlot(state, variantKey, slotKey, (slot) => ({
    ...slot,
    portionTargets: slot.portionTargets.map((target) => (target.key === targetKey ? fn(target) : target)),
  }))
}

function normalizeBuilderUnit(servingUnit: string | null | undefined): string {
  const u = String(servingUnit ?? '').toLowerCase()
  if (u === 'ml') return 'ml'
  if (u === 'un' || u === 'unit' || u === 'unidad') return 'un'
  return 'g'
}

export function quickEditReducer(state: QuickEditState, action: QuickEditAction): QuickEditState {
  switch (action.type) {
    case 'SET_ITEM_QUANTITY':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        quantity: action.value,
      }))
    case 'STEP_ITEM_QUANTITY':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        quantity: stepQuantityText(item.quantity, quantityStep(item.unit), action.direction),
      }))
    case 'SET_ITEM_UNIT':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        // El cambio de unidad solo es confiable con macros por 100 en mano (food del catalogo).
        item.food ? { ...item, unit: action.unit } : item,
      )
    case 'SET_ITEM_NAME':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        item.isCustom ? { ...item, displayName: action.value } : item,
      )
    case 'SWAP_ITEM_FOOD':
      // Swap conserva cantidad y unidad (diseno §1.2.B.1); reemplaza foodId/nombre/macros.
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        foodId: action.food.id,
        recipeId: null,
        displayName: action.food.name,
        brand: action.food.brand,
        food: action.food,
        macroBase: null,
        isCustom: false,
      }))
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
    case 'ADD_CATALOG_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: [...slot.items, createCatalogItem(action.key, action.food)],
      }))
    case 'ADD_CUSTOM_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: [...slot.items, createCustomItem(action.key)],
      }))
    case 'UPDATE_SLOT':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, ...action.patch }))
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
    case 'ADD_SLOT':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: [
          ...variant.slots,
          {
            key: action.key,
            id: null,
            code: 'slot-' + action.key.replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase(),
            name: action.name,
            startTime: normalizeTimeHHMM(action.startTime),
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            items: [],
            portionTargets: [],
          },
        ],
      }))
    case 'SET_PORTION_TARGET':
      return mapPortionTarget(state, action.variantKey, action.slotKey, action.targetKey, (target) => ({
        ...target,
        portions: action.value,
      }))
    case 'STEP_PORTION_TARGET':
      return mapPortionTarget(state, action.variantKey, action.slotKey, action.targetKey, (target) => ({
        ...target,
        portions: stepPortionsText(target.portions, action.direction),
      }))
    case 'REMOVE_PORTION_TARGET':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        portionTargets: slot.portionTargets.filter((target) => target.key !== action.targetKey),
      }))
    case 'RESTORE_PORTION_TARGET':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        portionTargets: insertAt(slot.portionTargets, action.index, action.target),
      }))
    case 'ADD_PORTION_TARGET':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) =>
        // Guard de unicidad (CHECK unique(meal_slot_id, exchange_group_id)): un grupo ya
        // presente en la franja no se duplica (el picker lo deshabilita, esto es cinturon).
        slot.portionTargets.some((target) => target.exchangeGroupId === action.group.exchangeGroupId)
          ? slot
          : { ...slot, portionTargets: [...slot.portionTargets, createPortionTarget(action.key, action.group)] },
      )
    case 'SET_TARGET':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        targets: { ...variant.targets, [action.field]: action.value },
      }))
    case 'STEP_TARGET':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        targets: {
          ...variant.targets,
          [action.field]: stepTargetText(variant.targets[action.field], targetStep(action.field), action.direction),
        },
      }))
    case 'RESET':
      return action.state
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Macros en vivo (feedback optimista; el servidor re-deriva de foods al publicar)
// ---------------------------------------------------------------------------

function scaleMacros(macros: ItemMacros, factor: number): ItemMacros {
  return {
    calories: round1(macros.calories * factor),
    proteinG: round1(macros.proteinG * factor),
    carbsG: round1(macros.carbsG * factor),
    fatsG: round1(macros.fatsG * factor),
    fiberG: round1(macros.fiberG * factor),
  }
}

export function qeItemMacros(item: QeItem): ItemMacros {
  const qty = Number(item.quantity.trim())
  if (!Number.isFinite(qty) || qty <= 0) return ZERO_ITEM_MACROS
  if (item.food) return computeItemMacros(item.food, qty, item.unit)
  if (item.macroBase && item.macroBase.quantity > 0) {
    return scaleMacros(item.macroBase.macros, qty / item.macroBase.quantity)
  }
  return ZERO_ITEM_MACROS
}

function addMacros(a: ItemMacros, b: ItemMacros): ItemMacros {
  return {
    calories: round1(a.calories + b.calories),
    proteinG: round1(a.proteinG + b.proteinG),
    carbsG: round1(a.carbsG + b.carbsG),
    fatsG: round1(a.fatsG + b.fatsG),
    fiberG: round1(a.fiberG + b.fiberG),
  }
}

export function qeSlotSubtotal(slot: QeSlot): ItemMacros {
  return slot.items.reduce((acc, item) => addMacros(acc, qeItemMacros(item)), ZERO_ITEM_MACROS)
}

export function qeVariantTotal(variant: QeVariant): ItemMacros {
  return variant.slots.reduce((acc, slot) => addMacros(acc, qeSlotSubtotal(slot)), ZERO_ITEM_MACROS)
}

// ---------------------------------------------------------------------------
// Validacion local (pre-publish; el servidor re-valida con Zod)
// ---------------------------------------------------------------------------

export interface QuickEditValidation {
  ok: boolean
  errors: Record<string, string>
}

const MAX_KCAL = 12000
const MAX_MACRO_G = 2000

export function validateQuickEdit(state: QuickEditState): QuickEditValidation {
  const errors: Record<string, string> = {}
  for (const variant of state.variants) {
    for (const [field, max] of [
      ['calories', MAX_KCAL],
      ['proteinG', MAX_MACRO_G],
      ['carbsG', MAX_MACRO_G],
      ['fatsG', MAX_MACRO_G],
    ] as const) {
      const raw = variant.targets[field].trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) errors[`target.${variant.key}.${field}`] = 'Valor inválido.'
      else if (n > max) errors[`target.${variant.key}.${field}`] = 'Ese valor no es razonable.'
    }
    for (const slot of variant.slots) {
      if (slot.name.trim().length === 0) errors[`slot.${slot.key}.name`] = 'La franja necesita un nombre.'
      for (const item of slot.items) {
        const qty = Number(item.quantity.trim())
        if (!(item.quantity.trim() !== '' && Number.isFinite(qty) && qty > 0)) {
          errors[`item.${item.key}.quantity`] = 'Cantidad inválida.'
        }
        if (item.isCustom && item.displayName.trim().length === 0) {
          errors[`item.${item.key}.name`] = 'Escribe un nombre para el alimento.'
        }
      }
      for (const target of slot.portionTargets) {
        if (!isValidPortionsText(target.portions)) {
          errors[`portion.${target.key}.portions`] = 'Las porciones van de 0,5 en 0,5 (mínimo 0,5).'
        }
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Proyeccion al draft canonico
// ---------------------------------------------------------------------------

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

type DraftVariant = NutritionPlanDraft['dayVariants'][number]
type DraftSlot = DraftVariant['mealSlots'][number]
type DraftItem = DraftSlot['items'][number]

function projectItem(item: QeItem, orderIndex: number): DraftItem {
  return {
    ...(item.id ? { id: item.id } : {}),
    foodId: item.foodId,
    recipeId: item.recipeId,
    customName: item.isCustom ? item.displayName.trim() || null : null,
    quantity: Number(item.quantity.trim()) || 0,
    unit: item.unit,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    orderIndex,
  }
}

type DraftExchangeTarget = NonNullable<DraftSlot['exchangeTargets']>[number]

function projectPortionTarget(target: QePortionTarget, orderIndex: number): DraftExchangeTarget {
  return {
    ...(target.id ? { id: target.id } : {}),
    exchangeGroupId: target.exchangeGroupId,
    // Texto invalido proyecta 0: la validacion local bloquea el publish antes de que el
    // server vea un draft con porciones fuera del contrato (mismo patron que quantity).
    portions: parsePortionsValue(target.portions) ?? 0,
    notes: target.notes,
    orderIndex,
  }
}

function projectSlot(slot: QeSlot, orderIndex: number): DraftSlot {
  return {
    ...(slot.id ? { id: slot.id } : {}),
    code: slot.code,
    name: slot.name.trim(),
    startTime: slot.startTime === '' ? null : slot.startTime,
    endTime: slot.endTime,
    mode: slot.mode,
    required: slot.required,
    targets: slot.targets,
    instructions: slot.instructions,
    orderIndex,
    items: slot.items.map(projectItem),
    // Capa opcional: una franja sin porciones proyecta un slot IDENTICO al de antes (sin
    // la clave), y baseline/current pasan por esta MISMA proyeccion (cero falsos cambios).
    ...(slot.portionTargets.length > 0
      ? { exchangeTargets: slot.portionTargets.map(projectPortionTarget) }
      : {}),
  }
}

function projectVariant(variant: QeVariant, orderIndex: number): DraftVariant {
  return {
    ...(variant.id ? { id: variant.id } : {}),
    key: variant.variantKey,
    label: variant.label,
    dayOfWeek: variant.dayOfWeek,
    default: variant.isDefault,
    targets: {
      calories: toNullableNumber(variant.targets.calories),
      proteinG: toNullableNumber(variant.targets.proteinG),
      carbsG: toNullableNumber(variant.targets.carbsG),
      fatsG: toNullableNumber(variant.targets.fatsG),
      fiberG: variant.passthroughTargets.fiberG,
      sodiumMg: variant.passthroughTargets.sodiumMg,
      waterMl: variant.passthroughTargets.waterMl,
    },
    orderIndex,
    mealSlots: variant.slots.map(projectSlot),
  }
}

/**
 * Proyecta el arbol editable sobre el draft base (readModelToDraft del paquete): conserva
 * planId/nombre/estrategia/permisos/notas del base (F1 no los edita) y reemplaza dayVariants.
 * Usar tambien para derivar el BASELINE de comparacion (proyectar el estado hidratado sin
 * tocar) de modo que el contador de cambios nunca acuse diferencias de normalizacion.
 */
export function applyQuickEditToDraft(base: NutritionPlanDraft, state: QuickEditState): NutritionPlanDraft {
  return { ...base, dayVariants: state.variants.map(projectVariant) }
}
