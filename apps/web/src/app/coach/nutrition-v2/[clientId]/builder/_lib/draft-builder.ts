/**
 * Builder V2 - logica PURA del constructor de planes de nutricion (web coach).
 * Sin Next.js / Supabase / React: solo Zod + el motor compartido
 * (@eva/nutrition-engine) + el contrato del draft (@eva/nutrition-v2). Permite
 * testear "paso del wizard -> payload del draft", el calculo de macros (el MISMO
 * que vera el alumno) y la construccion de filas de insercion con mocks.
 */

import { z } from 'zod'
import {
  NutritionPlanDraftSchema,
  type NutritionPlanDraft,
  type NutritionStrategy,
  type NutritionExchangeTarget,
} from '@eva/nutrition-v2'
import { calculateFoodItemMacros, type FoodMacrosRow } from '@eva/nutrition-engine'

export type DraftDayVariant = NutritionPlanDraft['dayVariants'][number]
export type DraftMealSlot = DraftDayVariant['mealSlots'][number]
export type DraftPrescriptionItem = DraftMealSlot['items'][number]
export type DraftExchangeTarget = NutritionExchangeTarget

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
}

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
  | { type: 'RESTORE'; state: BuilderState }

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
    case 'RESTORE': {
      // Reemplazo TOTAL del arbol desde un borrador restaurado (localStorage). Validacion
      // minima defensiva: un payload corrupto (sin `slots` array) se ignora — jamas rompe el
      // wizard. El `step` se re-clampa a [0, BUILDER_STEP_COUNT-1] por si el JSON persistido
      // trae un indice fuera de rango o no finito (cae a 0).
      const next = action.state
      if (next == null || typeof next !== 'object' || !Array.isArray(next.slots)) return state
      const step = Number.isFinite(next.step) ? clampStep(next.step) : 0
      return { ...next, step }
    }
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

export interface ItemMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

const ZERO_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

/**
 * Macros de un item prescrito para una cantidad/unidad. Reutiliza EXACTAMENTE el
 * motor compartido (calculateFoodItemMacros): el mismo calculo que vera el alumno.
 */
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

/**
 * Macros de un alimento libre con macros declaradas por 100 g/ml, escaladas por la
 * cantidad prescrita. Da paridad de preview con el alumno sin depender del catalogo.
 */
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

// -- Alimento libre con macros (contrato de la accion "Guardar en mi catalogo") --

/**
 * Macros por 100 g/ml de un alimento libre. No-negativos y con topes razonables.
 * Reusado por el cliente (validacion de formulario) y el servidor (server action).
 */
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

/**
 * Warning NO bloqueante: las kcal declaradas se alejan >40% del valor de Atwater
 * (4P + 4C + 9G). Guarda contra division por cero (todo en cero => sin warning).
 */
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

/** Extrae las macros por 100 del item libre como numeros (para el schema/preview/warning). */
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
}

/**
 * Construye el draft canonico (NutritionPlanDraft) desde el estado del wizard.
 * MVP: una unica variante por defecto ("todos los dias") con las metas del paso 2;
 * estructurado/hibrido cuelga las franjas + items prescritos de esa variante.
 * NO incluye macros de snapshot: el servidor las re-deriva desde foods (autoritativo).
 */
export function assembleDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  const strategy = state.strategy ?? 'flexible'
  const usesSlots = strategyUsesSlots(strategy)

  const mealSlots: DraftMealSlot[] = usesSlots
    ? state.slots.map((slot, slotIndex) => ({
        code: 'slot-' + (slotIndex + 1),
        name: slot.name.trim(),
        startTime: slot.startTime.trim() === '' ? null : slot.startTime.trim(),
        endTime: null,
        mode: 'anchor' as const,
        required: false,
        targets: {},
        instructions: null,
        orderIndex: slotIndex,
        items: slot.items.map((item, itemIndex): DraftPrescriptionItem => ({
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
        })),
      }))
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

/** Ensambla y valida el draft contra el contrato. Lanza si es invalido. */
export function assembleAndValidateDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse(assembleDraft(state, options))
}

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
}) {
  const { versionId, mealSlotId, orderIndex, item, food } = input
  const macros = food ? computeItemMacros(food, item.quantity, item.unit) : null
  return {
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
