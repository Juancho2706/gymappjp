/**
 * Builder V2 (RN coach) — logica PURA + PERSISTENCIA del constructor de planes de
 * nutricion. Sin react-native / expo: solo Zod + el motor compartido
 * (@eva/nutrition-engine) + el contrato del draft (@eva/nutrition-v2) + el cliente
 * supabase RN (PostgREST). Es el gemelo movil de la web:
 *   - reducer/ensamblado/validacion: PORTADOS 1:1 desde
 *     apps/web/.../builder/_lib/draft-builder.ts (mismo contrato NutritionPlanDraft),
 *   - persistencia: MISMO orden de escritura que
 *     apps/web/.../_actions/plan-persistence.ts
 *     (plan -> version -> variantes -> franjas -> items -> publish RPC), pero via el
 *     cliente supabase-js del movil. La RLS del servidor es la MISMA barrera: un 42501
 *     aca == SCOPE_DENIED. El RPC publish_nutrition_plan_v2 publica transaccionalmente.
 *
 * Regla de oro (heredada de la web): el gate comercial (Nutricion Pro) y el scope los
 * RE-VALIDA el servidor (RLS + RPC). El gate cliente de aca solo evita fricción/500 y
 * muestra un upsell suave; nunca es la barrera real.
 */

import { z } from 'zod'
import {
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  type FoodCatalogItem,
  type NutritionItemSubstitution,
  type NutritionPlanDraft,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import { calculateFoodItemMacros, type ExchangeGroup, type FoodMacrosRow } from '@eva/nutrition-engine'
import { buildFrozenPortionGroups, type PortionsBySlot } from './nutrition-v2-builder-portions'
// Reuso de la persistencia congelada del quick-edit (afirmación 8 de la spec 4B-11): NO se
// duplica `buildPortionTargetInsertRows`. La lib del quick-edit vive en `lib/` (no en
// `components/quick-edit/**`, territorio vetado), y ya exporta estas piezas.
import { buildPortionTargetInsertRows } from './nutrition-v2-quick-edit'

// ---------------------------------------------------------------------------
// Estado del wizard (PORTADO 1:1 desde la web draft-builder.ts)
// ---------------------------------------------------------------------------

export type DraftDayVariant = NutritionPlanDraft['dayVariants'][number]
export type DraftMealSlot = DraftDayVariant['mealSlots'][number]
export type DraftPrescriptionItem = DraftMealSlot['items'][number]

export const BUILDER_UNITS = ['g', 'ml', 'un'] as const
export type BuilderUnit = (typeof BUILDER_UNITS)[number]

export interface BuilderFood {
  id: string
  name: string
  brand: string | null
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
  servingSize: number
  servingUnit: string
  category: string | null
  media: { bucket: string; objectPath: string; version: number } | null
}

/**
 * Reemplazo autorizado por el coach dentro del builder (F-02). La afordancia agrega SOLO
 * alimentos del catalogo (buscador), asi que el reemplazo siempre lleva un `food`. `key` es
 * la key estable de UI (chip removible). `assembleDraft` lo mapea al draft con foodId +
 * quantity/unit null ("misma porcion que el prescrito"); el server congela el snapshot.
 * Espejo 1:1 de la web draft-builder.ts.
 */
export interface BuilderItemSubstitution {
  key: string
  food: BuilderFood
}

export interface BuilderItem {
  key: string
  food: BuilderFood | null
  customName: string | null
  quantity: string
  unit: BuilderUnit
  optional: boolean
  notes: string | null
  customCalories: string
  customProteinG: string
  customCarbsG: string
  customFatsG: string
  /** Reemplazos autorizados por el coach (F-02). Vacio = item sin capa de reemplazos. */
  substitutions: BuilderItemSubstitution[]
}

/** Tope de reemplazos por item (limite legado V1 = 8). El contrato lo refuerza con
 *  NutritionItemSubstitutionSchema array `.max(8)`. No hardcodear el 8 en reducer/UI. */
export const MAX_ITEM_SUBSTITUTIONS = 8

export interface BuilderSlot {
  key: string
  name: string
  startTime: string
  items: BuilderItem[]
}

export interface BuilderTargets {
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

export interface BuilderPermissions {
  canRegisterFreely: boolean
  canAdjustPrescribedQuantity: boolean
  canSubstitute: boolean
}

export interface BuilderState {
  step: number
  strategy: NutritionStrategy | null
  planName: string
  effectiveFrom: string
  targets: BuilderTargets
  permissions: BuilderPermissions
  slots: BuilderSlot[]
}

export const BUILDER_STEP_COUNT = 4

export function strategyUsesSlots(strategy: NutritionStrategy | null): boolean {
  return strategy === 'structured' || strategy === 'hybrid'
}

export function defaultPermissionsFor(strategy: NutritionStrategy | null): BuilderPermissions {
  const strict = strategy === 'structured'
  return {
    canRegisterFreely: !strict,
    canAdjustPrescribedQuantity: true,
    canSubstitute: false,
  }
}

export function createEmptyBuilderState(effectiveFrom: string): BuilderState {
  return {
    step: 0,
    strategy: null,
    planName: '',
    effectiveFrom,
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    permissions: defaultPermissionsFor(null),
    slots: [],
  }
}

export function createEmptyItem(key: string): BuilderItem {
  return {
    key,
    food: null,
    customName: null,
    quantity: '',
    unit: 'g',
    optional: false,
    notes: null,
    customCalories: '',
    customProteinG: '',
    customCarbsG: '',
    customFatsG: '',
    substitutions: [],
  }
}

export function createEmptySlot(key: string, name = ''): BuilderSlot {
  return { key, name, startTime: '', items: [] }
}

export type BuilderAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_STRATEGY'; strategy: NutritionStrategy; firstSlotKey: string }
  | { type: 'SET_PLAN_NAME'; value: string }
  | { type: 'SET_EFFECTIVE_FROM'; value: string }
  | { type: 'SET_TARGET'; field: keyof BuilderTargets; value: string }
  | { type: 'SET_PERMISSION'; field: keyof BuilderPermissions; value: boolean }
  | { type: 'ADD_SLOT'; key: string }
  | { type: 'REMOVE_SLOT'; slotKey: string }
  | { type: 'UPDATE_SLOT'; slotKey: string; patch: Partial<Pick<BuilderSlot, 'name' | 'startTime'>> }
  | { type: 'ADD_ITEM'; slotKey: string; key: string; food: BuilderFood | null }
  | { type: 'REMOVE_ITEM'; slotKey: string; itemKey: string }
  | { type: 'UPDATE_ITEM'; slotKey: string; itemKey: string; patch: Partial<Omit<BuilderItem, 'key'>> }
  | { type: 'ADD_ITEM_SUBSTITUTION'; slotKey: string; itemKey: string; key: string; food: BuilderFood }
  | { type: 'REMOVE_ITEM_SUBSTITUTION'; slotKey: string; itemKey: string; subKey: string }

function clampStep(step: number): number {
  return Math.max(0, Math.min(BUILDER_STEP_COUNT - 1, step))
}

function mapSlot(state: BuilderState, slotKey: string, fn: (slot: BuilderSlot) => BuilderSlot): BuilderState {
  return { ...state, slots: state.slots.map((slot) => (slot.key === slotKey ? fn(slot) : slot)) }
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: clampStep(action.step) }
    case 'NEXT_STEP':
      return { ...state, step: clampStep(state.step + 1) }
    case 'PREV_STEP':
      return { ...state, step: clampStep(state.step - 1) }
    case 'SET_STRATEGY': {
      const usesSlots = strategyUsesSlots(action.strategy)
      const slots = usesSlots
        ? state.slots.length > 0
          ? state.slots
          : [createEmptySlot(action.firstSlotKey, 'Desayuno')]
        : []
      return { ...state, strategy: action.strategy, permissions: defaultPermissionsFor(action.strategy), slots }
    }
    case 'SET_PLAN_NAME':
      return { ...state, planName: action.value }
    case 'SET_EFFECTIVE_FROM':
      return { ...state, effectiveFrom: action.value }
    case 'SET_TARGET':
      return { ...state, targets: { ...state.targets, [action.field]: action.value } }
    case 'SET_PERMISSION':
      return { ...state, permissions: { ...state.permissions, [action.field]: action.value } }
    case 'ADD_SLOT':
      return { ...state, slots: [...state.slots, createEmptySlot(action.key)] }
    case 'REMOVE_SLOT':
      return { ...state, slots: state.slots.filter((slot) => slot.key !== action.slotKey) }
    case 'UPDATE_SLOT':
      return mapSlot(state, action.slotKey, (slot) => ({ ...slot, ...action.patch }))
    case 'ADD_ITEM': {
      const item: BuilderItem = {
        ...createEmptyItem(action.key),
        food: action.food,
        customName: action.food ? null : '',
        quantity: action.food ? String(action.food.servingSize || '') : '',
        unit: action.food ? normalizeUnit(action.food.servingUnit) : 'g',
      }
      return mapSlot(state, action.slotKey, (slot) => ({ ...slot, items: [...slot.items, item] }))
    }
    case 'REMOVE_ITEM':
      return mapSlot(state, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.filter((item) => item.key !== action.itemKey),
      }))
    case 'UPDATE_ITEM':
      return mapSlot(state, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) => (item.key === action.itemKey ? { ...item, ...action.patch } : item)),
      }))
    case 'ADD_ITEM_SUBSTITUTION':
      return mapSlot(state, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) => {
          if (item.key !== action.itemKey) return item
          const subs = item.substitutions ?? []
          // Cinturon: no pasar del tope, no duplicar el mismo alimento como reemplazo, ni
          // ofrecer como reemplazo el propio alimento prescrito (la UI ya lo evita).
          if (subs.length >= MAX_ITEM_SUBSTITUTIONS) return item
          if (subs.some((sub) => sub.food.id === action.food.id)) return item
          if (item.food && item.food.id === action.food.id) return item
          return { ...item, substitutions: [...subs, { key: action.key, food: action.food }] }
        }),
      }))
    case 'REMOVE_ITEM_SUBSTITUTION':
      return mapSlot(state, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) =>
          item.key === action.itemKey
            ? { ...item, substitutions: (item.substitutions ?? []).filter((sub) => sub.key !== action.subKey) }
            : item,
        ),
      }))
    default:
      return state
  }
}

function normalizeUnit(servingUnit: string | null | undefined): BuilderUnit {
  const u = String(servingUnit ?? '').toLowerCase()
  if (u === 'ml') return 'ml'
  if (u === 'un' || u === 'unit' || u === 'unidad') return 'un'
  return 'g'
}

// ---------------------------------------------------------------------------
// Macros de preview (motor compartido — paridad exacta con el alumno)
// ---------------------------------------------------------------------------

export interface ItemMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

const ZERO_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

export function computeItemMacros(food: BuilderFood, quantity: number, unit: string): ItemMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_MACROS
  const foodsRow: FoodMacrosRow = {
    name: food.name,
    calories: food.calories,
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fats_g: food.fatsG,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
  }
  const m = calculateFoodItemMacros({ quantity, unit, foods: foodsRow })
  const unitLower = (unit || 'g').toLowerCase()
  const isDirect = unitLower === 'g' || unitLower === 'ml'
  const factor = isDirect ? quantity / 100 : (quantity * (food.servingSize || 0)) / 100
  const fiber = food.fiberG == null ? 0 : Math.round(food.fiberG * factor * 10) / 10
  return { calories: m.calories, proteinG: m.protein, carbsG: m.carbs, fatsG: m.fats, fiberG: fiber }
}

function toNonNegNumber(value: string): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function computeCustomItemMacros(item: BuilderItem, quantity: number): ItemMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_MACROS
  const factor = quantity / 100
  return {
    calories: Math.round(toNonNegNumber(item.customCalories) * factor * 10) / 10,
    proteinG: Math.round(toNonNegNumber(item.customProteinG) * factor * 10) / 10,
    carbsG: Math.round(toNonNegNumber(item.customCarbsG) * factor * 10) / 10,
    fatsG: Math.round(toNonNegNumber(item.customFatsG) * factor * 10) / 10,
    fiberG: 0,
  }
}

export function itemMacros(item: BuilderItem): ItemMacros {
  if (item.food) return computeItemMacros(item.food, Number(item.quantity), item.unit)
  return computeCustomItemMacros(item, Number(item.quantity))
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

export function slotSubtotal(slot: BuilderSlot): ItemMacros {
  return slot.items.reduce((acc, item) => addMacros(acc, itemMacros(item)), ZERO_MACROS)
}

export function dayTotals(state: BuilderState): ItemMacros {
  return state.slots.reduce((acc, slot) => addMacros(acc, slotSubtotal(slot)), ZERO_MACROS)
}

export const CoachFoodInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().max(180).nullable().default(null),
  unit: z.enum(['g', 'ml']).default('g'),
  calories: z.number().nonnegative().max(2000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(500),
  fatsG: z.number().nonnegative().max(500),
})

export type CoachFoodInput = z.infer<typeof CoachFoodInputSchema>

export function macroEnergyMismatch(m: {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}): boolean {
  const atwater = 4 * m.proteinG + 4 * m.carbsG + 9 * m.fatsG
  if (atwater <= 0 && m.calories <= 0) return false
  const base = atwater > 0 ? atwater : m.calories
  return Math.abs(m.calories - atwater) > 0.4 * base
}

export function customMacrosOf(item: BuilderItem): {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
} {
  return {
    calories: toNonNegNumber(item.customCalories),
    proteinG: toNonNegNumber(item.customProteinG),
    carbsG: toNonNegNumber(item.customCarbsG),
    fatsG: toNonNegNumber(item.customFatsG),
  }
}

// ---------------------------------------------------------------------------
// Validacion por paso
// ---------------------------------------------------------------------------

export interface StepValidation {
  ok: boolean
  errors: Record<string, string>
}

function parseTarget(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN
}

const MAX_KCAL = 12000
const MAX_MACRO_G = 2000

export function validateStep(state: BuilderState, step: number): StepValidation {
  const errors: Record<string, string> = {}

  if (step === 0) {
    if (!state.strategy) errors.strategy = 'Elige una estrategia para continuar.'
  }

  if (step === 1) {
    if (state.planName.trim().length === 0) errors.planName = 'Ponle un nombre al plan.'
    else if (state.planName.trim().length > 180) errors.planName = 'El nombre es demasiado largo.'

    const kcal = parseTarget(state.targets.calories)
    if (Number.isNaN(kcal)) errors.calories = 'Ingresa un numero valido de kcal.'
    else if (kcal !== null && kcal > MAX_KCAL) errors.calories = 'Ese valor de kcal no es razonable.'

    for (const field of ['proteinG', 'carbsG', 'fatsG'] as const) {
      const v = parseTarget(state.targets[field])
      if (Number.isNaN(v)) errors[field] = 'Ingresa un numero valido.'
      else if (v !== null && v > MAX_MACRO_G) errors[field] = 'Ese valor no es razonable.'
    }

    const anyTarget = (['calories', 'proteinG', 'carbsG', 'fatsG'] as const).some((f) => {
      const parsed = parseTarget(state.targets[f])
      return parsed !== null && !Number.isNaN(parsed)
    })
    if (!anyTarget) errors.calories = errors.calories ?? 'Define al menos una meta (kcal o un macro).'
  }

  if (step === 2 && strategyUsesSlots(state.strategy)) {
    if (state.slots.length === 0) {
      errors.slots = 'Agrega al menos una franja.'
    }
    state.slots.forEach((slot) => {
      if (slot.name.trim().length === 0) errors['slot.' + slot.key + '.name'] = 'La franja necesita un nombre.'
      if (slot.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime)) {
        errors['slot.' + slot.key + '.startTime'] = 'Hora invalida (usa HH:MM).'
      }
      slot.items.forEach((item) => {
        const hasSource = Boolean(item.food) || (item.customName ?? '').trim().length > 0
        if (!hasSource) errors['item.' + item.key + '.food'] = 'Selecciona un alimento o escribe un nombre.'
        const q = Number(item.quantity)
        if (!(item.quantity.trim() !== '' && Number.isFinite(q) && q > 0)) {
          errors['item.' + item.key + '.quantity'] = 'Cantidad invalida.'
        }
      })
    })
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

export function canAdvance(state: BuilderState): boolean {
  return validateStep(state, state.step).ok
}

// ---------------------------------------------------------------------------
// Ensamblado del draft canonico
// ---------------------------------------------------------------------------

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function targetsToMacros(targets: BuilderTargets) {
  return {
    calories: toNullableNumber(targets.calories),
    proteinG: toNullableNumber(targets.proteinG),
    carbsG: toNullableNumber(targets.carbsG),
    fatsG: toNullableNumber(targets.fatsG),
    fiberG: null,
    sodiumMg: null,
    waterMl: null,
  }
}

export interface AssembleOptions {
  clientId: string
  planId?: string | null
  timezone?: string
  /**
   * Capa opcional de porciones a elección (4B-11): mapa `slot.key -> targets`. Solo se
   * cuelga en franjas structured/hybrid; una franja sin porciones (o su ausencia) deja el
   * slot byte-idéntico a hoy (sin la clave `exchangeTargets`). El caller la pasa desde el
   * controlador de porciones del wizard.
   */
  portionsBySlot?: PortionsBySlot
}

export function assembleDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  const strategy = state.strategy ?? 'flexible'
  const usesSlots = strategyUsesSlots(strategy)

  const mealSlots: DraftMealSlot[] = usesSlots
    ? state.slots.map((slot, slotIndex) => {
        // Porciones a elección de la franja (4B-11): filtra > 0 y mapea al contrato del draft.
        // Sin porciones => sin la clave (byte-idéntico a hoy); el server/insert congela el snapshot.
        const portionTargets = (options.portionsBySlot?.[slot.key] ?? []).filter((t) => t.portions > 0)
        return {
        code: 'slot-' + (slotIndex + 1),
        name: slot.name.trim(),
        startTime: slot.startTime.trim() === '' ? null : slot.startTime.trim(),
        endTime: null,
        mode: 'anchor' as const,
        required: false,
        targets: {},
        instructions: null,
        orderIndex: slotIndex,
        ...(portionTargets.length > 0
          ? {
              exchangeTargets: portionTargets.map((t, orderIndex) => ({
                exchangeGroupId: t.exchangeGroupId,
                portions: t.portions,
                notes: null,
                orderIndex,
              })),
            }
          : {}),
        items: slot.items.map((item, itemIndex): DraftPrescriptionItem => {
          // Reemplazos autorizados (F-02): catalogo -> foodId; quantity/unit null = "misma
          // porcion que el prescrito". Capa opcional: sin reemplazos el item queda identico
          // a hoy (sin la clave), y el server congela el snapshot de cada uno al persistir.
          const substitutions = item.substitutions ?? []
          return {
            foodId: item.food ? item.food.id : null,
            recipeId: null,
            customName: item.food ? null : ((item.customName ?? '').trim() || null),
            quantity: Number(item.quantity) || 0,
            unit: item.unit,
            minimumQuantity: null,
            maximumQuantity: null,
            optional: item.optional,
            substitutionGroupId: null,
            notes: item.notes && item.notes.trim() !== '' ? item.notes.trim() : null,
            orderIndex: itemIndex,
            ...(substitutions.length > 0
              ? {
                  substitutions: substitutions.map(
                    (sub, subIndex): NutritionItemSubstitution => ({
                      foodId: sub.food.id,
                      recipeId: null,
                      customName: null,
                      quantity: null,
                      unit: null,
                      orderIndex: subIndex,
                    }),
                  ),
                }
              : {}),
          }
        }),
        }
      })
    : []

  const variant: DraftDayVariant = {
    key: 'default',
    label: 'Todos los dias',
    dayOfWeek: null,
    default: true,
    targets: targetsToMacros(state.targets),
    orderIndex: 0,
    mealSlots,
  }

  return {
    ...(options.planId ? { planId: options.planId } : {}),
    clientId: options.clientId,
    name: state.planName.trim(),
    strategy,
    effectiveFrom: state.effectiveFrom.trim() === '' ? null : state.effectiveFrom.trim(),
    timezone: options.timezone ?? 'America/Santiago',
    permissions: {
      canRegisterFreely: state.permissions.canRegisterFreely,
      canAdjustPrescribedQuantity: state.permissions.canAdjustPrescribedQuantity,
      quantityAdjustmentPercent: null,
      canSubstitute: state.permissions.canSubstitute,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visibleNotes: null,
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [variant],
  }
}

export function assembleAndValidateDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse(assembleDraft(state, options))
}

// ---------------------------------------------------------------------------
// Filas de insercion (mismas columnas de BD que la web)
// ---------------------------------------------------------------------------

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

export function buildItemInsertRow(input: {
  versionId: string
  mealSlotId: string
  orderIndex: number
  item: DraftPrescriptionItem
  food: BuilderFood | null
  /** Id explicito del item (F-02): permite colgar reemplazos referenciandolo antes del insert.
   *  Omitido = la DB genera el id (comportamiento previo, byte-identico). Espejo de la web. */
  id?: string
}) {
  const { versionId, mealSlotId, orderIndex, item, food, id } = input
  const macros = food ? computeItemMacros(food, item.quantity, item.unit) : null
  return {
    ...(id ? { id } : {}),
    version_id: versionId,
    meal_slot_id: mealSlotId,
    food_id: item.foodId,
    recipe_id: item.recipeId,
    custom_name: item.customName,
    quantity: item.quantity,
    unit: item.unit,
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
  }
}

// ---------------------------------------------------------------------------
// Reemplazos autorizados por el coach (F-02): FREEZE del snapshot al persistir.
// Espejo 1:1 de apps/web/.../builder/_lib/draft-builder.ts (buildItemSubstitutionInsertRow /
// collectSubstitutionFoodIds / ItemSubstitutionInsertRow). El alimento de reemplazo se resuelve
// server-side (foods) y sus macros de referencia se CONGELAN (decision CEO). Cantidad de referencia
// = `quantity` del reemplazo, o el `servingSize` del alimento si es null ("misma porcion que el
// prescrito"). Item libre (sin foodId) => snapshot solo con el nombre, macros null.
// ---------------------------------------------------------------------------

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
  sub: NutritionItemSubstitution
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

/**
 * UUID v4 para ids explicitos de item (F-02): necesitamos el id ANTES del insert para colgar los
 * reemplazos referenciandolo (la persistencia RN no usa RETURNING). Prefiere `crypto.randomUUID`
 * (Node en tests, Hermes si esta polyfilleado) y cae a un generador puro Math.random en formato
 * RFC 4122 valido — basta para un PK generado por el cliente. Modulo PURO: sin importar expo.
 */
export function newNutritionItemId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // cae al fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Catalogo -> BuilderFood
// ---------------------------------------------------------------------------

/**
 * Convierte un item del catalogo (searchFoodCatalogV2) al BuilderFood que consume el
 * reducer (ADD_ITEM) y el preview de macros. Las macros del catalogo estan POR 100 g/ml
 * (serving_size del alimento); computeItemMacros usa el mismo motor compartido, asi que
 * el preview del coach == lo que vera el alumno.
 */
export function mapFoodCatalogItemToBuilderFood(item: FoodCatalogItem): BuilderFood {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatsG: item.fatsG,
    fiberG: item.fiberG,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    category: item.category,
    media: item.media,
  }
}

// ---------------------------------------------------------------------------
// Gate comercial del addon "Nutricion Pro" (espejo de web _lib/nutrition-pro.ts)
// ---------------------------------------------------------------------------

/** El addon Pro es el MISMO module key que V1 (nutrition_exchanges). */
export const NUTRITION_PRO_MODULE_KEY = 'nutrition_exchanges' as const

/** Ruta de compra/activacion del addon (deep-link a Modulos del coach). */
export const NUTRITION_PRO_UPGRADE_HREF = '/coach/modules' as const

/** Capacidad Pro que dispara el gate de un draft. */
export type NutritionProFeature = 'hybrid_strategy' | 'multi_variant' | 'private_notes' | 'protocol_notes'

/** Copy corto por capacidad (sin precio, anti-hostigamiento). */
export const NUTRITION_PRO_FEATURE_LABEL: Record<NutritionProFeature, string> = {
  hybrid_strategy: 'la estrategia hibrida',
  multi_variant: 'multiples variantes de dia',
  private_notes: 'las notas privadas',
  protocol_notes: 'el protocolo profesional',
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * PURA: primera capacidad Pro que un draft requiere, o null si cae por completo dentro
 * de BASE. Contrato IDENTICO al web requiredNutritionProFeature (frontera CEO 2026-07-15):
 * BASE puede publicar structured/flexible con UNA variante y sin notas privadas/protocolo.
 */
export function requiredNutritionProFeature(draft: NutritionPlanDraft): NutritionProFeature | null {
  if (draft.strategy === 'hybrid') return 'hybrid_strategy'
  if (draft.dayVariants.length > 1) return 'multi_variant'
  if (hasContent(draft.privateNotes)) return 'private_notes'
  if (hasContent(draft.protocolNotes)) return 'protocol_notes'
  return null
}

// ---------------------------------------------------------------------------
// Persistencia RN (mismo orden que la web plan-persistence.ts, via supabase-js)
// ---------------------------------------------------------------------------

export type DbError = { message: string; code?: string }
export type DbResult<T> = { data: T | null; error: DbError | null }

interface SelectAfterInsert {
  single(): Promise<DbResult<{ id: string }>>
}
interface InsertResult extends PromiseLike<DbResult<null>> {
  select(columns: string): SelectAfterInsert
}
interface ReadChain<T> extends PromiseLike<DbResult<T[]>> {
  eq(column: string, value: unknown): ReadChain<T>
  order(column: string, options: { ascending: boolean }): ReadChain<T>
  limit(count: number): ReadChain<T>
  maybeSingle(): Promise<DbResult<T>>
}
interface TableApi {
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): InsertResult
  select(columns: string): ReadChain<unknown>
}

/**
 * Subconjunto del cliente supabase-js que consume la persistencia. El cliente real del
 * movil (lib/supabase.ts) es estructuralmente compatible: se pasa con
 * `supabase as unknown as NutritionV2WriteClient` (igual que la web castea su server client).
 */
export interface NutritionV2WriteClient {
  from(table: string): TableApi
  rpc(name: string, args?: Record<string, unknown>): Promise<DbResult<unknown>>
}

export type PublishFailure = {
  ok: false
  code: string
  error: string
  feature?: NutritionProFeature
  fields?: Array<{ path: string; message: string }>
}
export type PublishSuccess = { ok: true; versionId: string; planId: string }
export type PublishResult = PublishSuccess | PublishFailure

export function publishFail(
  code: string,
  error: string,
  fields?: PublishFailure['fields'],
): PublishFailure {
  return { ok: false, code, error, ...(fields ? { fields } : {}) }
}

export function zodFields(error: z.ZodError): PublishFailure['fields'] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

/** Mapea un error de escritura de PostgREST/RPC a un fallo tipado (espejo del web mapWriteError). */
export function mapWriteError(error: DbError, phase: string): PublishFailure {
  const code = error.code ?? 'DB_ERROR'
  const message = error.message ?? ''
  if (code === '42501') {
    return publishFail('SCOPE_DENIED', 'No tienes permiso para editar el plan de este alumno.')
  }
  if (message.includes('effective_date_must_follow_current_version')) {
    return publishFail('EFFECTIVE_DATE', 'La fecha de vigencia debe ser posterior a la de la version vigente.')
  }
  if (message.includes('requires_meal_slot')) {
    return publishFail('NEEDS_SLOT', 'El plan estructurado necesita al menos una franja.')
  }
  if (message.includes('requires_variant')) {
    return publishFail('NEEDS_VARIANT', 'El plan necesita al menos un dia definido.')
  }
  if (code === '22023') {
    return publishFail('INVALID_DRAFT', 'El plan tiene datos invalidos y no se pudo publicar.')
  }
  return publishFail('WRITE_FAILED', 'No se pudo guardar el plan (' + phase + '). Intenta nuevamente.')
}

interface ClientScopeRow {
  coach_id: string
  org_id: string | null
  team_id: string | null
}

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

function collectFoodIds(draft: NutritionPlanDraft): string[] {
  const ids = new Set<string>()
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (item.foodId) ids.add(item.foodId)
      }
    }
  }
  return [...ids]
}

/**
 * Persiste un draft (plan/version/variantes/franjas/items) via las tablas versionadas
 * RLS-scoped y publica transaccionalmente con publish_nutrition_plan_v2 (idempotente por
 * clave estable). MISMO camino de escritura que el web persistAndPublishDraft. NO hace el
 * gate comercial (Pro): eso lo hace publishDraftRN antes. Idempotente: si la clave ya
 * existe, devuelve la version publicada existente sin re-escribir.
 */
export async function persistAndPublishDraft(input: {
  db: NutritionV2WriteClient
  userId: string
  draft: NutritionPlanDraft
  idempotencyKey: string
  effectiveFrom: string
  /**
   * Catálogo de grupos de intercambio para CONGELAR el snapshot de las porciones a elección
   * (4B-11). Opcional: un draft sin porciones no lo necesita y publica byte-idéntico a hoy.
   * Si el draft trae `exchangeTargets` pero un grupo no resuelve contra este catálogo, el
   * publish corta con `EXCHANGE_GROUP_UNRESOLVED` (jamás una fila con snapshot NULL).
   */
  portionGroups?: ExchangeGroup[]
}): Promise<PublishResult> {
  const { db, userId, draft, idempotencyKey, effectiveFrom, portionGroups } = input
  // Dict congelado del catálogo (por valor): alimenta el mismo `buildPortionTargetInsertRows`
  // del quick-edit. Vacío si no se pasó catálogo (un draft sin porciones nunca lo consulta).
  const frozenPortionGroups = buildFrozenPortionGroups(portionGroups ?? [])

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

  const clientRes = await db
    .from('clients')
    .select('coach_id, org_id, team_id')
    .eq('id', draft.clientId)
    .maybeSingle()
  if (clientRes.error) return mapWriteError(clientRes.error, 'alumno')
  if (!clientRes.data) return publishFail('CLIENT_NOT_FOUND', 'No se encontro el alumno en tu espacio.')
  const clientScope = clientRes.data as ClientScopeRow

  let planId: string
  let nextVersion = 1
  if (draft.planId) {
    const planRes = await db
      .from('nutrition_plans_v2')
      .select('id, client_id')
      .eq('id', draft.planId)
      .maybeSingle()
    if (planRes.error) return mapWriteError(planRes.error, 'plan')
    const planRow = planRes.data as { id: string; client_id: string } | null
    if (!planRow || planRow.client_id !== draft.clientId) {
      return publishFail('PLAN_NOT_FOUND', 'El plan indicado no pertenece a este alumno.')
    }
    planId = planRow.id
    const maxRes = await db
      .from('nutrition_plan_versions_v2')
      .select('version_number')
      .eq('plan_id', planId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxRes.error) return mapWriteError(maxRes.error, 'version')
    const maxRow = maxRes.data as { version_number: number } | null
    nextVersion = (maxRow?.version_number ?? 0) + 1
  } else {
    const planIns = await db
      .from('nutrition_plans_v2')
      .insert({
        client_id: draft.clientId,
        coach_id: clientScope.coach_id,
        org_id: clientScope.org_id,
        team_id: clientScope.team_id,
        name: draft.name,
        strategy: draft.strategy,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (planIns.error || !planIns.data) return mapWriteError(planIns.error ?? { message: 'no plan' }, 'plan')
    planId = planIns.data.id
  }

  const versionIns = await db
    .from('nutrition_plan_versions_v2')
    .insert({
      plan_id: planId,
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

  // Foods de los items MAS los referenciados por los reemplazos autorizados (F-02): un solo set
  // para resolver/congelar todo en una pasada (espejo de la web plan-persistence.ts).
  const foodIds = [...new Set([...collectFoodIds(draft), ...collectSubstitutionFoodIds(draft)])]
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
        // Id explicito por item (F-02): lo generamos aqui para poder colgar los reemplazos
        // referenciandolo, sin un round-trip extra de RETURNING (espejo de la web).
        const itemsWithIds = slot.items.map((item) => ({ item, id: newNutritionItemId() }))
        const itemRows = itemsWithIds.map(({ item, id }, index) =>
          buildItemInsertRow({
            versionId,
            mealSlotId,
            orderIndex: index,
            item,
            food: item.foodId ? foodMap.get(item.foodId) ?? null : null,
            id,
          }),
        )
        const itemsIns = await db.from('nutrition_prescription_items_v2').insert(itemRows)
        if (itemsIns.error) return mapWriteError(itemsIns.error, 'items')

        // Reemplazos autorizados del coach (F-02), congelados por item. Solo structured/hybrid
        // tienen items. Un item sin reemplazos no toca la tabla nueva (byte-identico a hoy).
        const substitutionRows = itemsWithIds.flatMap(({ item, id }) =>
          (item.substitutions ?? []).map((sub, subIndex) =>
            buildItemSubstitutionInsertRow({
              versionId,
              prescriptionItemId: id,
              orderIndex: subIndex,
              sub,
              food: sub.foodId ? foodMap.get(sub.foodId) ?? null : null,
            }),
          ),
        )
        if (substitutionRows.length > 0) {
          const subsIns = await db
            .from('nutrition_item_substitutions_v2')
            .insert(substitutionRows as unknown as Record<string, unknown>[])
          if (subsIns.error) return mapWriteError(subsIns.error, 'reemplazos')
        }
      }

      // Porciones a elección (4B-11): inserta las filas de la franja con snapshot congelado.
      // Gateado por `slot.exchangeTargets?.length`: una franja sin porciones no toca la tabla
      // (byte-idéntico a hoy). Reusa `buildPortionTargetInsertRows` del quick-edit; si un grupo
      // no resuelve contra el catálogo congelado, corta en voz alta (jamás snapshot NULL).
      const exchangeTargets = slot.exchangeTargets ?? []
      if (exchangeTargets.length > 0) {
        const targetRows = buildPortionTargetInsertRows({
          versionId,
          mealSlotId,
          targets: exchangeTargets,
          groupsById: frozenPortionGroups,
        })
        if (targetRows == null) {
          return publishFail(
            'EXCHANGE_GROUP_UNRESOLVED',
            'No se pudieron congelar los grupos de porciones del plan. Recarga el catálogo e intenta de nuevo.',
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
  })
  if (publishRes.error) return mapWriteError(publishRes.error, 'publicacion')

  const publishedId = z.string().uuid().safeParse(publishRes.data)
  if (!publishedId.success) {
    return publishFail('INVALID_RESPONSE', 'La publicacion devolvio una respuesta inesperada.')
  }
  return { ok: true, versionId: publishedId.data, planId }
}

const PublishInputSchema = z.object({
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
})

/**
 * Genera la clave de idempotencia estable de una publicacion. operationId debe ser
 * estable por intento (un useRef(genId()) en la pantalla), para que reintentos de red
 * no dupliquen la version. deviceId distingue el origen (paridad con 'web-builder').
 */
export function buildPublishIdempotencyKey(input: {
  clientId: string
  operationId: string
  deviceId?: string
}): string {
  return buildNutritionIdempotencyKey({
    clientId: input.clientId,
    deviceId: input.deviceId ?? 'rn-builder',
    operationId: input.operationId,
    kind: 'publish',
  })
}

/**
 * Publica un draft desde el movil: valida el payload, aplica el gate comercial del addon
 * Nutricion Pro (fail-closed: si el draft exige Pro y el coach NO lo tiene habilitado,
 * devuelve UPGRADE_REQUIRED sin tocar la BD) y delega la persistencia+publicacion en
 * persistAndPublishDraft. El servidor (RLS + RPC) RE-VALIDA el gate y el scope: este
 * chequeo cliente solo evita fricción y un 500, nunca es la barrera.
 */
export async function publishDraftRN(input: {
  db: NutritionV2WriteClient
  userId: string
  draft: unknown
  idempotencyKey: string
  effectiveFrom: string
  hasNutritionPro: boolean
  /** Catálogo de grupos para congelar las porciones a elección (4B-11); ver persistAndPublishDraft. */
  portionGroups?: ExchangeGroup[]
}): Promise<PublishResult> {
  const parsed = PublishInputSchema.safeParse({
    draft: input.draft,
    idempotencyKey: input.idempotencyKey,
    effectiveFrom: input.effectiveFrom,
  })
  if (!parsed.success) {
    return publishFail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }
  const { draft, idempotencyKey, effectiveFrom } = parsed.data

  const proFeature = requiredNutritionProFeature(draft)
  if (proFeature && !input.hasNutritionPro) {
    return {
      ok: false,
      code: 'UPGRADE_REQUIRED',
      feature: proFeature,
      error: `Activa Nutricion Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
    }
  }

  return persistAndPublishDraft({
    db: input.db,
    userId: input.userId,
    draft,
    idempotencyKey,
    effectiveFrom,
    portionGroups: input.portionGroups,
  })
}
