/**
 * Builder V2 (RN coach) — logica PURA + PERSISTENCIA del constructor de planes de
 * nutricion. Sin react-native / expo: solo Zod + el motor compartido
 * (@eva/nutrition-engine) + el contrato del draft (@eva/nutrition-v2) + el cliente
 * supabase RN (PostgREST). Es el gemelo movil de la web:
 *   - reducer/ensamblado/validacion: PORTADOS 1:1 desde
 *     apps/web/.../builder/_lib/draft-builder.ts (mismo contrato NutritionPlanDraft),
 *   - filas de insert (buildVariantInsertRow / buildSlotInsertRow / buildItemInsertRow …):
 *     PORTADAS 1:1 y usadas por el quick-edit; el ORDEN de escritura ya no vive aqui.
 *
 * NUT-005: este modulo NO escribe. La publicacion del coach pasa por la API movil
 * (POST /api/mobile/nutrition-v2/coach/mutate, ver lib/nutrition-v2.api.ts), que re-valida
 * rollout, workspace y entitlement server-side y persiste con el cliente RLS del usuario.
 * El gate comercial que queda aqui (requiredNutritionProFeature) solo evita fricción/500 y
 * muestra un upsell suave; nunca es la barrera real.
 */

import { z } from 'zod'
import {
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  formatNutritionDayOfWeek,
  type FoodCatalogItem,
  type NutritionItemSubstitution,
  type NutritionPlanDraft,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import { calculateFoodItemMacros, type FoodMacrosRow } from '@eva/nutrition-engine'
import { foodExchangeEquivalenceShape, refineFoodExchangeEquivalence } from '@eva/schemas'
import { portionsKey, type PortionsBySlot } from './nutrition-v2-builder-portions'

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

/** Origen de las metas de una variante: heredadas del dia base o propias. */
export type BuilderTargetsMode = 'inherit' | 'custom'

/**
 * Variante de dia del wizard (multi-dia, SPEC nutrition-multiday) — espejo 1:1 de la web
 * `draft-builder.ts`. Un plan = 1 dia base ("Todos los días", `isDefault`, `dayOfWeek` null)
 * + 0..7 dias especificos, uno por `dayOfWeek` (0=domingo … 6=sabado, misma convencion que
 * el snapshot y `extract(dow)`).
 *
 * Cada variante tiene sus propias franjas/items/porciones. Sus METAS heredan las del dia base
 * (`targetsMode: 'inherit'`, el caso por defecto) salvo personalizacion explicita (`'custom'`
 * + `targets` propios). El dia base SIEMPRE hereda: sus metas son las del paso "Objetivos"
 * (`BuilderState.targets`), asi que su campo `targets` no se usa.
 */
export interface BuilderVariant {
  key: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  targetsMode: BuilderTargetsMode
  targets: BuilderTargets
  slots: BuilderSlot[]
}

export interface BuilderState {
  step: number
  strategy: NutritionStrategy | null
  planName: string
  effectiveFrom: string
  /** Metas del dia BASE (paso "Objetivos"). Las variantes `inherit` las congelan al ensamblar. */
  targets: BuilderTargets
  permissions: BuilderPermissions
  /**
   * Notas visibles para el alumno. El wizard NO las edita (se escriben en la edicion rapida):
   * viajan como CARRY-OVER del plan vigente (`rehydrateBuilderState`) para que "Rehacer con el
   * asistente" no las borre al republicar. OPCIONAL a proposito: un borrador local guardado
   * antes de este carry-over no trae la clave, y `RESTORE` conserva entonces las del plan.
   * Espejo 1:1 de la web draft-builder.ts.
   */
  visibleNotes?: string | null
  /** Dias del plan. Invariantes: exactamente una `isDefault`; `dayOfWeek` unico entre las demas. */
  variants: BuilderVariant[]
  /** Dia en edicion (chip activo de la barra de dias). Se persiste con el borrador local. */
  activeVariantKey: string
}

export const BUILDER_STEP_COUNT = 4

/** Key/label del dia base. La key viaja al draft tal cual (contrato `dayVariants[].key`). */
export const BASE_VARIANT_KEY = 'default'
export const BASE_VARIANT_LABEL = 'Todos los días'

/** Cantidad maxima de dias especificos (uno por dia de semana). */
export const MAX_DAY_VARIANTS = 7

/** Etiqueta automatica de un dia especifico ("Sábado"). Fallback defensivo para dow invalido. */
export function autoVariantLabel(dayOfWeek: number | null): string {
  return formatNutritionDayOfWeek(dayOfWeek) ?? BASE_VARIANT_LABEL
}

export function strategyUsesSlots(strategy: NutritionStrategy | null): boolean {
  return strategy === 'structured' || strategy === 'hybrid'
}

/**
 * ¿El borrador tiene contenido que valga la pena respaldar? Evita el autosave (y el aviso de
 * salida) por un wizard recién abierto o vaciado. PURA y testeable; espejo 1:1 de la web
 * PlanBuilderClient.tsx (allí vive inline). La consumen el autosave y el guard de salida.
 * Multi-dia: cuenta franjas de CUALQUIER dia (un plan con solo el sabado armado ya es contenido).
 */
export function builderHasSignificantContent(state: BuilderState): boolean {
  if (state.strategy !== null) return true
  if (state.planName.trim() !== '') return true
  if (state.variants.some((variant) => variant.slots.length > 0)) return true
  if (state.variants.length > 1) return true
  return (['calories', 'proteinG', 'carbsG', 'fatsG'] as const).some((f) => state.targets[f].trim() !== '')
}

export function defaultPermissionsFor(strategy: NutritionStrategy | null): BuilderPermissions {
  const strict = strategy === 'structured'
  return {
    canRegisterFreely: !strict,
    canAdjustPrescribedQuantity: true,
    canSubstitute: false,
  }
}

export function createEmptyTargets(): BuilderTargets {
  return { calories: '', proteinG: '', carbsG: '', fatsG: '' }
}

/** Dia base vacio: el estado inicial de todo plan nuevo (retrocompatible con el wizard de 1 dia). */
export function createBaseVariant(): BuilderVariant {
  return {
    key: BASE_VARIANT_KEY,
    label: BASE_VARIANT_LABEL,
    dayOfWeek: null,
    isDefault: true,
    targetsMode: 'inherit',
    targets: createEmptyTargets(),
    slots: [],
  }
}

/** Dia especifico nuevo (clonado o vacio segun lo que le cargue el reducer). */
export function createDayVariant(key: string, dayOfWeek: number, label?: string): BuilderVariant {
  return {
    key,
    label: (label ?? '').trim() === '' ? autoVariantLabel(dayOfWeek) : (label as string).trim(),
    dayOfWeek,
    isDefault: false,
    targetsMode: 'inherit',
    targets: createEmptyTargets(),
    slots: [],
  }
}

export function createEmptyBuilderState(effectiveFrom: string): BuilderState {
  return {
    step: 0,
    strategy: null,
    planName: '',
    effectiveFrom,
    targets: createEmptyTargets(),
    permissions: defaultPermissionsFor(null),
    // Plan nuevo: sin notas del alumno todavia (el carry-over solo aplica al rehidratar).
    visibleNotes: null,
    variants: [createBaseVariant()],
    activeVariantKey: BASE_VARIANT_KEY,
  }
}

/** Dia base del estado (siempre existe: las invariantes garantizan una variante default). */
export function baseVariantOf(state: BuilderState): BuilderVariant {
  return state.variants.find((variant) => variant.isDefault) ?? state.variants[0]
}

/** Dia en edicion. Cae al dia base si la key activa quedo huerfana (variante eliminada). */
export function activeVariantOf(state: BuilderState): BuilderVariant {
  return state.variants.find((variant) => variant.key === state.activeVariantKey) ?? baseVariantOf(state)
}

/**
 * Metas EFECTIVAS de una variante: las propias si el coach las personalizo, las del dia
 * base en cualquier otro caso (el dia base siempre usa las del paso "Objetivos").
 */
export function variantEffectiveTargets(state: BuilderState, variant: BuilderVariant): BuilderTargets {
  if (variant.isDefault || variant.targetsMode !== 'custom') return state.targets
  return variant.targets
}

/** Dias de semana ya ocupados por variantes especificas (excluye `exceptKey`). */
export function takenDayOfWeeks(state: BuilderState, exceptKey?: string): number[] {
  return state.variants
    .filter((variant) => !variant.isDefault && variant.key !== exceptKey && variant.dayOfWeek != null)
    .map((variant) => variant.dayOfWeek as number)
}

/**
 * Key derivada al CLONAR (variante nueva a partir de otra). Determinista a proposito: el
 * reducer es puro (sin `crypto` adentro) y el llamador puede recalcular las claves de
 * porciones del dia clonado sin adivinar (ver `clonePortionsForVariant`).
 */
export function clonedKey(variantKey: string, sourceKey: string): string {
  return variantKey + '~' + sourceKey
}

function cloneSlotsForVariant(variantKey: string, slots: BuilderSlot[]): BuilderSlot[] {
  return slots.map((slot) => ({
    ...slot,
    key: clonedKey(variantKey, slot.key),
    items: slot.items.map((item) => ({
      ...item,
      key: clonedKey(variantKey, item.key),
      substitutions: (item.substitutions ?? []).map((sub) => ({
        ...sub,
        key: clonedKey(variantKey, sub.key),
      })),
    })),
  }))
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
  // — Multi-dia —
  | { type: 'SET_ACTIVE_VARIANT'; variantKey: string }
  | { type: 'ADD_VARIANTS'; days: number[]; keys: string[]; origin: 'copy-base' | 'empty' }
  | { type: 'REMOVE_VARIANT'; variantKey: string }
  | { type: 'SET_VARIANT_DAY'; variantKey: string; dayOfWeek: number }
  | { type: 'SET_VARIANT_LABEL'; variantKey: string; value: string }
  | { type: 'DUPLICATE_VARIANT_AS'; sourceVariantKey: string; key: string; dayOfWeek: number }
  | { type: 'SET_VARIANT_TARGETS_MODE'; variantKey: string; mode: BuilderTargetsMode }
  | { type: 'SET_VARIANT_TARGETS'; variantKey: string; field: keyof BuilderTargets; value: string }
  // — Franjas / items (siempre dentro de UNA variante) —
  | { type: 'ADD_SLOT'; variantKey: string; key: string }
  | { type: 'REMOVE_SLOT'; variantKey: string; slotKey: string }
  | { type: 'UPDATE_SLOT'; variantKey: string; slotKey: string; patch: Partial<Pick<BuilderSlot, 'name' | 'startTime'>> }
  | { type: 'ADD_ITEM'; variantKey: string; slotKey: string; key: string; food: BuilderFood | null }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  | { type: 'UPDATE_ITEM'; variantKey: string; slotKey: string; itemKey: string; patch: Partial<Omit<BuilderItem, 'key'>> }
  | { type: 'ADD_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; key: string; food: BuilderFood }
  | { type: 'REMOVE_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; subKey: string }
  | { type: 'RESTORE'; state: unknown }

function clampStep(step: number): number {
  return Math.max(0, Math.min(BUILDER_STEP_COUNT - 1, step))
}

function mapVariant(
  state: BuilderState,
  variantKey: string,
  fn: (variant: BuilderVariant) => BuilderVariant,
): BuilderState {
  return {
    ...state,
    variants: state.variants.map((variant) => (variant.key === variantKey ? fn(variant) : variant)),
  }
}

function mapSlot(
  state: BuilderState,
  variantKey: string,
  slotKey: string,
  fn: (slot: BuilderSlot) => BuilderSlot,
): BuilderState {
  return mapVariant(state, variantKey, (variant) => ({
    ...variant,
    slots: variant.slots.map((slot) => (slot.key === slotKey ? fn(slot) : slot)),
  }))
}

function isValidDow(day: unknown): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6
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
      // La primera franja se siembra SOLO en el dia base; los dias especificos (si ya
      // existieran) conservan lo suyo. Sin franjas (flexible) se vacian todos los dias.
      const variants = state.variants.map((variant) => {
        if (!usesSlots) return variant.slots.length === 0 ? variant : { ...variant, slots: [] }
        if (!variant.isDefault || variant.slots.length > 0) return variant
        return { ...variant, slots: [createEmptySlot(action.firstSlotKey, 'Desayuno')] }
      })
      return {
        ...state,
        strategy: action.strategy,
        permissions: defaultPermissionsFor(action.strategy),
        variants,
      }
    }
    case 'SET_PLAN_NAME':
      return { ...state, planName: action.value }
    case 'SET_EFFECTIVE_FROM':
      return { ...state, effectiveFrom: action.value }
    case 'SET_TARGET':
      return { ...state, targets: { ...state.targets, [action.field]: action.value } }
    case 'SET_PERMISSION':
      return { ...state, permissions: { ...state.permissions, [action.field]: action.value } }

    case 'SET_ACTIVE_VARIANT': {
      if (!state.variants.some((variant) => variant.key === action.variantKey)) return state
      return { ...state, activeVariantKey: action.variantKey }
    }

    case 'ADD_VARIANTS': {
      // Multi-select de dias: se ignoran dias invalidos, repetidos dentro de la misma
      // accion y ya ocupados por otra variante (invariante `day_of_week` unico).
      const taken = new Set(takenDayOfWeeks(state))
      const base = baseVariantOf(state)
      const created: BuilderVariant[] = []
      action.days.forEach((day, index) => {
        const key = action.keys[index]
        if (!isValidDow(day) || typeof key !== 'string' || key.trim() === '') return
        if (taken.has(day)) return
        if (state.variants.some((variant) => variant.key === key)) return
        // `taken` YA incluye los dias creados en esta misma accion (se agregan abajo).
        if (taken.size >= MAX_DAY_VARIANTS) return
        taken.add(day)
        const variant = createDayVariant(key, day)
        created.push(
          action.origin === 'copy-base'
            ? { ...variant, slots: cloneSlotsForVariant(key, base.slots) }
            : variant,
        )
      })
      if (created.length === 0) return state
      return {
        ...state,
        variants: [...state.variants, ...created],
        activeVariantKey: created[0].key,
      }
    }

    case 'REMOVE_VARIANT': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      // El dia base no se elimina (invariante: exactamente una variante default).
      if (!target || target.isDefault) return state
      const variants = state.variants.filter((variant) => variant.key !== action.variantKey)
      const activeVariantKey =
        state.activeVariantKey === action.variantKey ? baseVariantOf({ ...state, variants }).key : state.activeVariantKey
      return { ...state, variants, activeVariantKey }
    }

    case 'SET_VARIANT_DAY': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      // El dia base no cambia de dia; un dia ocupado por otra variante se rechaza.
      if (!target || target.isDefault || !isValidDow(action.dayOfWeek)) return state
      if (takenDayOfWeeks(state, action.variantKey).includes(action.dayOfWeek)) return state
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        dayOfWeek: action.dayOfWeek,
        // La etiqueta automatica sigue al dia; una etiqueta escrita por el coach se respeta.
        label: variant.label === autoVariantLabel(variant.dayOfWeek) ? autoVariantLabel(action.dayOfWeek) : variant.label,
      }))
    }

    case 'SET_VARIANT_LABEL': {
      const value = action.value.slice(0, 120)
      return mapVariant(state, action.variantKey, (variant) => ({ ...variant, label: value }))
    }

    case 'DUPLICATE_VARIANT_AS': {
      const source = state.variants.find((variant) => variant.key === action.sourceVariantKey)
      if (!source || !isValidDow(action.dayOfWeek)) return state
      if (takenDayOfWeeks(state).includes(action.dayOfWeek)) return state
      if (state.variants.some((variant) => variant.key === action.key)) return state
      if (takenDayOfWeeks(state).length >= MAX_DAY_VARIANTS) return state
      const created: BuilderVariant = {
        ...createDayVariant(action.key, action.dayOfWeek),
        // Duplicar copia TAMBIEN la personalizacion de metas del origen (el coach duplica
        // "el finde" esperando el finde completo, no solo sus comidas).
        targetsMode: source.isDefault ? 'inherit' : source.targetsMode,
        targets: source.isDefault ? createEmptyTargets() : { ...source.targets },
        slots: cloneSlotsForVariant(action.key, source.slots),
      }
      return { ...state, variants: [...state.variants, created], activeVariantKey: created.key }
    }

    case 'SET_VARIANT_TARGETS_MODE': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      // El dia base SIEMPRE usa las metas del paso "Objetivos": no se personaliza aparte.
      if (!target || target.isDefault) return state
      if (action.mode === 'inherit') return mapVariant(state, action.variantKey, (v) => ({ ...v, targetsMode: 'inherit' }))
      // Al personalizar, se parte de las metas del dia base (edicion incremental, no en blanco).
      const seed = { ...state.targets }
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        targetsMode: 'custom',
        targets: variant.targetsMode === 'custom' ? variant.targets : seed,
      }))
    }

    case 'SET_VARIANT_TARGETS': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      if (!target || target.isDefault) return state
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        targets: { ...variant.targets, [action.field]: action.value },
      }))
    }

    case 'ADD_SLOT':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: [...variant.slots, createEmptySlot(action.key)],
      }))
    case 'REMOVE_SLOT':
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        slots: variant.slots.filter((slot) => slot.key !== action.slotKey),
      }))
    case 'UPDATE_SLOT':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, ...action.patch }))
    case 'ADD_ITEM': {
      const item: BuilderItem = {
        ...createEmptyItem(action.key),
        food: action.food,
        customName: action.food ? null : '',
        quantity: action.food ? String(action.food.servingSize || '') : '',
        unit: action.food ? toBuilderUnit(action.food.servingUnit) : 'g',
      }
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, items: [...slot.items, item] }))
    }
    case 'REMOVE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.filter((item) => item.key !== action.itemKey),
      }))
    case 'UPDATE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) => (item.key === action.itemKey ? { ...item, ...action.patch } : item)),
      }))
    case 'ADD_ITEM_SUBSTITUTION':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
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
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) =>
          item.key === action.itemKey
            ? { ...item, substitutions: (item.substitutions ?? []).filter((sub) => sub.key !== action.subKey) }
            : item,
        ),
      }))
    case 'RESTORE': {
      // Reemplazo TOTAL del arbol desde un borrador restaurado (AsyncStorage). Acepta el
      // formato NUEVO (`variants`) y el VIEJO (`slots` planos, borradores guardados antes de
      // multi-dia): `migrateBuilderState` los normaliza. Un payload corrupto se ignora — jamas
      // rompe el wizard. Espejo 1:1 de la web draft-builder.ts.
      const next = migrateBuilderState(action.state, state.effectiveFrom)
      if (next == null) return state
      // Notas visibles: son CARRY-OVER del plan vigente, no algo que el wizard edite. Un borrador
      // guardado ANTES de este carry-over no las conoce (clave ausente), asi que restaurarlo NO
      // puede borrarlas — se conservan las del estado actual (que en RN suele venir de la
      // rehidratacion del plan). Con la clave presente manda el payload restaurado.
      return next.visibleNotes === undefined ? { ...next, visibleNotes: state.visibleNotes ?? null } : next
    }
    default:
      return state
  }
}

// ── Migracion / normalizacion del arbol persistido (autosave v1 -> v2) ───────────────────────
// Espejo 1:1 de la web draft-builder.ts. El borrador RN se guarda en AsyncStorage con el MISMO
// contrato, asi que un coach que abrio el wizard antes de multi-dia recupera su plano `slots`
// como dia base en vez de perderlo.

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTargetsShape(value: unknown): BuilderTargets {
  const raw = isRecord(value) ? value : {}
  const str = (field: keyof BuilderTargets): string =>
    typeof raw[field] === 'string' ? (raw[field] as string) : ''
  return { calories: str('calories'), proteinG: str('proteinG'), carbsG: str('carbsG'), fatsG: str('fatsG') }
}

function normalizeVariantShape(value: unknown, index: number): BuilderVariant | null {
  if (!isRecord(value)) return null
  const key = typeof value.key === 'string' && value.key.trim() !== '' ? value.key : null
  if (key == null || !Array.isArray(value.slots)) return null
  const dayOfWeek = isValidDow(value.dayOfWeek) ? value.dayOfWeek : null
  const isDefault = value.isDefault === true || (index === 0 && dayOfWeek == null && value.isDefault == null)
  return {
    key,
    label: typeof value.label === 'string' && value.label.trim() !== '' ? value.label : autoVariantLabel(dayOfWeek),
    dayOfWeek: isDefault ? null : dayOfWeek,
    isDefault,
    targetsMode: value.targetsMode === 'custom' ? 'custom' : 'inherit',
    targets: normalizeTargetsShape(value.targets),
    slots: value.slots as BuilderSlot[],
  }
}

/**
 * Aplica las invariantes al arreglo de variantes: exactamente UNA default (la primera marcada,
 * o la primera del arreglo), sin `dayOfWeek` en la default, y `dayOfWeek` unico entre las
 * especificas (las repetidas o invalidas se descartan — un borrador corrupto no puede producir
 * un draft que el servidor rechace).
 */
export function normalizeBuilderVariants(variants: BuilderVariant[]): BuilderVariant[] {
  const valid = variants.filter((variant) => variant != null && typeof variant.key === 'string')
  if (valid.length === 0) return [createBaseVariant()]
  const defaultIndex = Math.max(0, valid.findIndex((variant) => variant.isDefault))
  const seenDays = new Set<number>()
  const seenKeys = new Set<string>()
  const out: BuilderVariant[] = []
  valid.forEach((variant, index) => {
    if (seenKeys.has(variant.key)) return
    if (index === defaultIndex) {
      seenKeys.add(variant.key)
      out.push({ ...variant, isDefault: true, dayOfWeek: null, targetsMode: 'inherit' })
      return
    }
    if (!isValidDow(variant.dayOfWeek) || seenDays.has(variant.dayOfWeek)) return
    seenDays.add(variant.dayOfWeek)
    seenKeys.add(variant.key)
    out.push({ ...variant, isDefault: false })
  })
  // La default queda primera: es el orden de lectura del wizard y el `orderIndex` del draft.
  return [...out.filter((variant) => variant.isDefault), ...out.filter((variant) => !variant.isDefault)]
}

/**
 * Normaliza CUALQUIER arbol persistido a un `BuilderState` valido, migrando el formato v1
 * (`{ slots: [...] }`, un solo dia) al v2 (`{ variants: [...] }`). Devuelve `null` si el payload
 * no es un estado del wizard (corrupto / de otra feature): el caller conserva el suyo.
 */
export function migrateBuilderState(raw: unknown, fallbackEffectiveFrom: string): BuilderState | null {
  if (!isRecord(raw)) return null

  const hasVariants = Array.isArray(raw.variants)
  const hasLegacySlots = Array.isArray(raw.slots)
  if (!hasVariants && !hasLegacySlots) return null

  const variants = hasVariants
    ? normalizeBuilderVariants(
        (raw.variants as unknown[]).map((variant, index) => normalizeVariantShape(variant, index)).filter(
          (variant): variant is BuilderVariant => variant != null,
        ),
      )
    : // v1: TODO el plan vivia en un solo arreglo de franjas => se convierte en el dia base.
      [{ ...createBaseVariant(), slots: raw.slots as BuilderSlot[] }]

  const strategy = raw.strategy === 'structured' || raw.strategy === 'flexible' || raw.strategy === 'hybrid'
    ? (raw.strategy as NutritionStrategy)
    : null
  const permissions = isRecord(raw.permissions)
    ? {
        canRegisterFreely: raw.permissions.canRegisterFreely === true,
        canAdjustPrescribedQuantity: raw.permissions.canAdjustPrescribedQuantity !== false,
        canSubstitute: raw.permissions.canSubstitute === true,
      }
    : defaultPermissionsFor(strategy)
  const activeKey = typeof raw.activeVariantKey === 'string' ? raw.activeVariantKey : null

  return {
    step: Number.isFinite(raw.step) ? clampStep(raw.step as number) : 0,
    strategy,
    planName: typeof raw.planName === 'string' ? raw.planName : '',
    effectiveFrom:
      typeof raw.effectiveFrom === 'string' && raw.effectiveFrom !== '' ? raw.effectiveFrom : fallbackEffectiveFrom,
    targets: normalizeTargetsShape(raw.targets),
    permissions,
    // La clave solo se emite si el payload la traia: `RESTORE` distingue "el borrador no sabe de
    // notas" (ausente => conserva las del plan) de "el borrador dice que no hay" (null).
    ...(typeof raw.visibleNotes === 'string' || raw.visibleNotes === null
      ? { visibleNotes: raw.visibleNotes as string | null }
      : {}),
    variants,
    activeVariantKey:
      activeKey != null && variants.some((variant) => variant.key === activeKey)
        ? activeKey
        : (variants.find((variant) => variant.isDefault) ?? variants[0]).key,
  }
}

/** Unidad libre (catalogo / read-model) -> unidad del wizard. Desconocida => gramos. */
export function toBuilderUnit(servingUnit: string | null | undefined): BuilderUnit {
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

/**
 * Total de items fijos de UN dia (variante). Reemplaza al viejo `dayTotals(state)`: con
 * multi-dia no existe "el total del plan", sino el de cada dia. Las porciones a eleccion se
 * suman aparte (`slotPortionTotals` / `derivePortionTotals` en `nutrition-v2-builder-portions`).
 */
export function variantTotals(variant: BuilderVariant): ItemMacros {
  return variant.slots.reduce((acc, slot) => addMacros(acc, slotSubtotal(slot)), ZERO_MACROS)
}

/**
 * Alta de alimento coach-scoped ("Guardar en mi catálogo"). Espejo EXACTO del schema del
 * servidor (`apps/web/.../nutrition-v2/_lib/coach-food.ts`), incluido el trio opcional de
 * "Equivalencia de porciones" (P-B): `exchangeGroupId` + `exchangePortionGrams` (+ medida
 * casera) viajan en el MISMO payload del alta. El servidor ademas verifica que el grupo sea
 * visible para el coach antes de escribir — esto es solo validacion de forma.
 */
export const CoachFoodInputSchema = z
  .object({
    clientId: z.string().uuid(),
    name: z.string().trim().min(1).max(180),
    brand: z.string().trim().max(180).nullable().default(null),
    unit: z.enum(['g', 'ml']).default('g'),
    calories: z.number().nonnegative().max(2000),
    proteinG: z.number().nonnegative().max(500),
    carbsG: z.number().nonnegative().max(500),
    fatsG: z.number().nonnegative().max(500),
    ...foodExchangeEquivalenceShape,
  })
  .superRefine(refineFoodExchangeEquivalence)

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
    // Se validan TODOS los dias (no solo el activo): publicar emite las N variantes, asi que
    // un dia sin franjas o con un item incompleto tiene que bloquear igual. Las claves de
    // franja/item son unicas entre dias, asi que no colisionan. Espejo 1:1 de la web.
    const activeKey = activeVariantOf(state).key
    state.variants.forEach((variant) => {
      if (variant.slots.length === 0) {
        errors['variant.' + variant.key + '.slots'] = 'Agrega al menos una franja en ' + variant.label + '.'
        if (variant.key === activeKey) errors.slots = 'Agrega al menos una franja.'
        else errors.slots = errors.slots ?? 'Agrega al menos una franja en ' + variant.label + '.'
      }
      variant.slots.forEach((slot) => {
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
   * Capa opcional de porciones a elección (4B-11): mapa `variantKey::slotKey -> targets`
   * (clave COMPUESTA, ver `portionsKey`). Solo se cuelga en franjas structured/hybrid; una
   * franja sin porciones (o su ausencia) deja el slot byte-idéntico a hoy (sin la clave
   * `exchangeTargets`). El caller la pasa desde el controlador de porciones del wizard.
   */
  portionsBySlot?: PortionsBySlot
}

/** Franjas de UNA variante -> franjas del draft. `slot-N` se numera dentro del dia. */
function assembleSlots(
  variantKey: string,
  slots: BuilderSlot[],
  usesSlots: boolean,
  portionsBySlot: PortionsBySlot | undefined,
): DraftMealSlot[] {
  return usesSlots
    ? slots.map((slot, slotIndex) => {
        // Porciones a elección de la franja (4B-11): filtra > 0 y mapea al contrato del draft.
        // Sin porciones => sin la clave (byte-idéntico a hoy); el server congela el snapshot.
        const portionTargets = (portionsBySlot?.[portionsKey(variantKey, slot.key)] ?? []).filter(
          (t) => t.portions > 0,
        )
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
}

/**
 * Construye el draft canonico (NutritionPlanDraft) desde el estado del wizard.
 *
 * Multi-dia: emite UNA variante por dia del wizard, en el orden del estado (el dia base
 * primero, `orderIndex` por posicion). Las variantes con metas heredadas (`inherit`) CONGELAN
 * aqui las metas del dia base: el contrato exige `targets` por variante y el alumno no debe
 * depender de una herencia implicita en la base de datos.
 *
 * Espejo 1:1 del web `assembleDraft` + `attachPortionsAndValidate`: mismo estado produce el
 * MISMO envelope. Un plan de un solo dia produce exactamente el mismo draft que antes de
 * multi-dia (variante `default` / "Todos los días").
 */
export function assembleDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  const strategy = state.strategy ?? 'flexible'
  const usesSlots = strategyUsesSlots(strategy)
  // Notas visibles del alumno: CARRY-OVER del plan vigente. Emitir `null` aqui BORRABA en silencio
  // las indicaciones escritas en la edicion rapida cada vez que el coach republicaba desde
  // "Rehacer con el asistente" (la publicacion reescribe la version COMPLETA y el endpoint movil
  // escribe `draft.visibleNotes` tal cual). '' se normaliza a null, paridad con la edicion rapida.
  const visibleNotes = (state.visibleNotes ?? '').trim()

  const dayVariants: DraftDayVariant[] = state.variants.map((variant, index) => ({
    key: variant.key,
    label: variant.label.trim() === '' ? autoVariantLabel(variant.dayOfWeek) : variant.label.trim(),
    dayOfWeek: variant.isDefault ? null : variant.dayOfWeek,
    default: variant.isDefault,
    targets: targetsToMacros(variantEffectiveTargets(state, variant)),
    orderIndex: index,
    mealSlots: assembleSlots(variant.key, variant.slots, usesSlots, options.portionsBySlot),
  }))

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
    visibleNotes: visibleNotes === '' ? null : visibleNotes,
    privateNotes: null,
    // `protocolNotes` NO viaja desde el cliente a proposito: es una capacidad Pro que el wizard no
    // edita. El endpoint movil (`coach/mutate`, accion `publish`) la repone leyendola de la version
    // base (carry-over server-side, igual que la edicion rapida y la web), asi el gate del addon
    // nunca ve como "nueva" una nota de protocolo que el plan ya tenia publicada.
    protocolNotes: null,
    dayVariants,
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

// NOTA (NUT-005): la PERSISTENCIA del coach ya no vive aqui. `persistAndPublishDraft`,
// `resolveReusableUnpublishedPlanIdRN` y `publishDraftRN` escribian directo contra PostgREST/RPC
// con el JWT de la sesion, saltandose el rollout y el entitlement Pro (ninguno de los dos existe en
// la RLS ni en el RPC). El unico camino de escritura del coach es ahora
// POST /api/mobile/nutrition-v2/coach/mutate (`lib/nutrition-v2.api.ts`), que reusa el MISMO codigo
// de escritura de la web. Este modulo conserva solo logica PURA (estado, ensamblado, validacion,
// filas de insert y el gate cliente anti-friccion).

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

// NOTA (NUT-005): el alta de alimento coach-scoped ("Guardar en mi catálogo" del builder) tampoco
// vive ya aquí. `createCoachFoodV2` insertaba DIRECTO en `foods` con el JWT de la sesión: la RLS
// `foods_insert_own` acotaba la fila al coach dueño, pero el rollout de Nutrición V2 no miraba ese
// camino, así que era el último write del coach móvil fuera del endpoint. Ahora es
// `createCoachFoodRN` (`lib/nutrition-v2.api.ts`) -> acción `createFood` de
// POST /api/mobile/nutrition-v2/coach/mutate, que reusa el MISMO insert de la web
// (`apps/web/src/app/coach/nutrition-v2/_lib/coach-food.ts`). `CoachFoodInputSchema` se queda aquí:
// es la validación de forma que comparten la pantalla y el cliente de la API.

// ---------------------------------------------------------------------------
// Conflicto de "fecha de vigencia" al publicar (sub-delta c) — helpers PUROS.
// Espejo de apps/web/.../builder/_lib/publish-conflict.ts. El plan vigente de un alumno solo
// puede ser reemplazado por una version cuya fecha sea POSTERIOR a la actual (barrera real =
// RPC publish_nutrition_plan_v2). Estos helpers espejan la regla del lado cliente para abrir el
// modal SIN gastar un round-trip fallido; el RPC sigue siendo la red de seguridad (fail-closed).
// ---------------------------------------------------------------------------

/**
 * True cuando la fecha elegida choca con la de la version vigente: es igual o anterior, y por
 * tanto el RPC la rechazaria. Fechas ISO YYYY-MM-DD comparan lexicograficamente = por dia. Si
 * falta cualquiera de las dos, no bloquea (deja que el servidor decida). Identica a la web.
 */
export function effectiveDateConflicts(
  chosen: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (!chosen || !current) return false
  return chosen <= current
}

/**
 * "Archivar y reemplazar" archiva el plan vigente y DESPUES publica el nuevo. Decide si, tras
 * intentar el archivado, se puede avanzar a publicar. El archivado es idempotente: el UPDATE exige
 * `lifecycle_status='active'`, asi que archivar un plan ya archivado (reintento/otra pestana/web)
 * afecta 0 filas y `archiveNutritionPlan` devuelve `PLAN_NOT_FOUND`; ese caso ya cumple el objetivo
 * (el plan viejo dejo de regir), asi que se puede continuar. Cualquier OTRO fallo bloquea el flujo.
 *
 * NOTA de divergencia con la web: el `ArchiveWriteOutcome` de RN usa `code: 'OK'` en el exito (no
 * `ok: true` como el ActionResult web), asi que aceptamos ambas formas por robustez.
 */
export function canProceedToPublishAfterArchive(result: { ok?: boolean; code?: string }): boolean {
  return result.ok === true || result.code === 'OK' || result.code === 'PLAN_NOT_FOUND'
}
