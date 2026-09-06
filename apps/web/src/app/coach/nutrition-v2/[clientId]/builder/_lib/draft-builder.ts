/**
 * Builder V2 - logica PURA del constructor de planes de nutricion (web coach).
 * Sin Next.js / Supabase / React: solo Zod + el motor compartido
 * (@eva/nutrition-engine) + el contrato del draft (@eva/nutrition-v2). Permite
 * testear "paso del wizard -> payload del draft", el calculo de macros (el MISMO
 * que vera el alumno) y la construccion de filas de insercion con mocks.
 */

import { z } from 'zod'
import {
  BUILDER_UNITS,
  HOUSEHOLD_UNIT,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_WEEK_ORDER,
  NutritionPlanDraftSchema,
  assessItemPlausibility,
  computeItemMacros,
  convertQuantityTextOnUnitChange,
  defaultFoodUnit,
  formatNutritionDayOfWeek,
  isHouseholdUnit,
  slotMergeName,
  nutritionDayOfWeekFromIso,
  resolveNutritionDayVariantForDow,
  type BuilderFood,
  type BuilderFoodMacrosPatch,
  type ItemMacros,
  type ItemPlausibility,
  type NutritionPlanDowCell,
  type NutritionPlanDraft,
  type NutritionStrategy,
  type NutritionExchangeTarget,
  type NutritionItemSubstitution,
} from '@eva/nutrition-v2'
import {
  foodExchangeEquivalenceShape,
  refineFoodExchangeEquivalence,
} from '@eva/schemas/nutrition-exchanges'

// R1 (T3.x editor unico): `BuilderFood`, `computeItemMacros`, `slotMergeName` y compania
// viven ahora en `@eva/nutrition-v2` (la gramatica del editor los necesita y un paquete no
// importa de apps/web). Movidos VERBATIM; se re-exportan aca para que los importadores
// historicos del wizard no cambien de ruta.
export {
  BUILDER_UNITS,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  computeItemMacros,
  slotMergeName,
  type BuilderFood,
  type BuilderFoodMacrosPatch,
  type ItemMacros,
}

export type DraftDayVariant = NutritionPlanDraft['dayVariants'][number]
export type DraftMealSlot = DraftDayVariant['mealSlots'][number]
export type DraftPrescriptionItem = DraftMealSlot['items'][number]
export type DraftExchangeTarget = NutritionExchangeTarget
export type DraftItemSubstitution = NutritionItemSubstitution

// `BUILDER_UNITS` y `MAX_DAY_VARIANTS` se mudaron al paquete (retiro del par viejo).
// `casera` (W2 «Cantidades honestas») es del dominio del EDITOR, no del persistible: nunca se
// escribe en `unit` — `buildItemInsertRow` la traduce a g/ml con la medida congelada aparte.
export type BuilderUnit = (typeof BUILDER_UNITS)[number] | typeof HOUSEHOLD_UNIT

/**
 * Tope del contrato (`NutritionPlanDraftSchema.visibleNotes`: max 8000 tras trim). Mismo valor
 * que `VISIBLE_NOTES_MAX` de la edicion rapida; se duplica aca porque el builder no importa de
 * `_quick-edit` (boundary del modulo).
 */
export const VISIBLE_NOTES_MAX = 8000

/**
 * Reemplazo autorizado por el coach dentro del builder (F-02). La afordancia agrega SOLO
 * alimentos del catalogo (buscador), asi que el reemplazo siempre lleva un `food`. `key` es
 * la key estable de UI (chip removible). `assembleDraft` lo mapea al draft con foodId +
 * quantity/unit null ("misma porcion que el prescrito"); el server congela el snapshot.
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
 * Variante de dia del wizard (multi-dia, SPEC nutrition-multiday). Un plan = 1 dia base
 * ("Todos los dias", `isDefault`, `dayOfWeek` null) + 0..7 dias especificos, uno por
 * `dayOfWeek` (0=domingo … 6=sabado, misma convencion que el snapshot y `extract(dow)`).
 *
 * Cada variante tiene sus propias franjas/items/porciones. Sus METAS heredan las del dia
 * base (`targetsMode: 'inherit'`, el caso por defecto) salvo personalizacion explicita
 * (`'custom'` + `targets` propios). El dia base SIEMPRE hereda: sus metas son las del paso
 * "Objetivos" (`BuilderState.targets`), asi que su campo `targets` no se usa.
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
   * asistente" no las borre al republicar, y desde T2.6 F5 tambien se EDITAN en el paso del plan
   * (`SET_VISIBLE_NOTES`, espejo del campo de la edicion rapida). OPCIONAL a proposito: un
   * borrador local guardado antes de este carry-over no trae la clave, y `RESTORE` conserva
   * entonces las del plan.
   */
  visibleNotes?: string | null
  /** Dias del plan. Invariantes: exactamente una `isDefault`; `dayOfWeek` unico entre las demas. */
  variants: BuilderVariant[]
  /** Dia en edicion (chip activo de la barra de dias). Se persiste con el borrador local. */
  activeVariantKey: string
}

/**
 * Wizard de DOS pasos (SPEC nutrition-ui-poda, punto 11):
 *  - `BUILDER_STEP_PLAN` "El plan": estrategia, nombre, metas del dia base, permisos reales y
 *    la fecha de vigencia (que antes vivia en el paso "Revisar").
 *  - `BUILDER_STEP_DAYS` "Los dias": el selector de dia + las franjas de cada dia. Publicar
 *    vive aca.
 * El paso "Revisar" se elimino: su unico control editable era `Vigente desde` y todo lo demas
 * era lectura de lo que el paso de dias ya muestra en vivo.
 */
export const BUILDER_STEP_PLAN = 0
export const BUILDER_STEP_DAYS = 1
export const BUILDER_STEP_COUNT = 2

/** Key/label del dia base. La key viaja al draft tal cual (contrato `dayVariants[].key`). */
export const BASE_VARIANT_KEY = 'default'
export const BASE_VARIANT_LABEL = 'Todos los días'

/** Cantidad maxima de dias especificos (uno por dia de semana). */


/** Etiqueta automatica de un dia especifico ("Sábado"). Fallback defensivo para dow invalido. */
export function autoVariantLabel(dayOfWeek: number | null): string {
  return formatNutritionDayOfWeek(dayOfWeek) ?? BASE_VARIANT_LABEL
}

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

/**
 * Permisos tras un cambio de estrategia (fix bug 2.3.5 de la auditoria: `SET_STRATEGY`
 * pisaba `permissions` con `defaultPermissionsFor(nueva)` INCONDICIONALMENTE, incluso los
 * campos que el coach ya habia editado a mano). Semantica elegida — la mas simple de testear
 * sin agregar un flag de "tocado" al estado: un campo se considera SIN TOCAR si su valor
 * actual coincide con el default de la estrategia ANTERIOR; ahi se re-aplica el default
 * nuevo. Si el coach lo cambio (valor distinto del default anterior — incluye el caso
 * rehidratado desde un plan publicado), se CONSERVA tal cual.
 */
export function nextPermissionsForStrategyChange(
  previousStrategy: NutritionStrategy | null,
  nextStrategy: NutritionStrategy,
  current: BuilderPermissions,
): BuilderPermissions {
  const previousDefaults = defaultPermissionsFor(previousStrategy)
  const nextDefaults = defaultPermissionsFor(nextStrategy)
  const merged = { ...current }
  ;(Object.keys(nextDefaults) as Array<keyof BuilderPermissions>).forEach((field) => {
    if (current[field] === previousDefaults[field]) merged[field] = nextDefaults[field]
  })
  return merged
}

/**
 * Franjas (de TODAS las variantes) que `SET_STRATEGY` hacia `'flexible'` borraria. Pura: la UI
 * la usa para decidir si pide confirmacion ANTES de despachar (bug 2.3.5 — hoy borra sin avisar
 * ni permitir deshacer). El reducer NUNCA pregunta, solo ejecuta; 0 = nada que perder.
 */
export function slotsLostIfFlexible(state: BuilderState): number {
  return state.variants.reduce((total, variant) => total + variant.slots.length, 0)
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

// ── Selector "tocas el dia, no la variante" (SPEC nutrition-ui-poda, punto 10) ────────────────
// El coach piensa en DIAS. Estos helpers traducen dia -> variante con la MISMA regla del
// snapshot (`resolveNutritionDayVariantForDow` del paquete, que espeja el `where day_of_week =
// extract(dow) or is_default` del RPC): aca no se decide nada nuevo, solo se EXPONE para poder
// pintarlo. El MODELO no cambia: sigue siendo dia base + 0..7 dias propios.
//
// Gemelos: `apps/mobile/lib/nutrition-v2-builder.ts` (mismos nombres) y el selector compartido
// `PlanDowSelector` / `buildNutritionPlanDowStrip` del paquete, cuyo tipo de celda se reusa tal
// cual para que creador, ficha y RN hablen del mismo objeto.

/**
 * Variante del strip proyectada a la forma minima del selector compartido. El creador no tiene
 * read-model, asi que traduce su `BuilderVariant`; `id` es la key de la variante, que es como el
 * helper compartido reconoce que dos dias reciben exactamente la misma estructura.
 */
export interface BuilderDayCellVariant {
  id: string
  dayOfWeek: number | null
  isDefault: boolean
  label: string
  targets: { calories: number | null }
}

/**
 * Celda del strip Lu-Do del creador. Tipo COMPARTIDO con la ficha y RN, con `variant` estrechado
 * a no-nulo: en el creador SIEMPRE hay dia base, asi que todo dia recibe algo.
 */
export type BuilderDayCell = NutritionPlanDowCell<BuilderDayCellVariant> & {
  variant: BuilderDayCellVariant
}

/**
 * Variante que RECIBE un dia de semana: la propia de ese dia si existe, si no el dia base.
 * `dayOfWeek` null = el dia base explicito (la unica forma de alcanzarlo cuando los siete dias
 * ya tienen contenido propio y ninguna celda lo representa). Nunca devuelve `null`.
 */
export function builderVariantForDayOfWeek(state: BuilderState, dayOfWeek: number | null): BuilderVariant {
  if (dayOfWeek == null) return baseVariantOf(state)
  return resolveNutritionDayVariantForDow(state.variants, dayOfWeek) ?? baseVariantOf(state)
}

/**
 * Las 7 celdas del strip en orden de lectura Lu→Do. Las kcal NO se recalculan aca: llegan ya
 * combinadas desde la pantalla (`kcalByVariantKey` = items fijos + porciones a eleccion, el MISMO
 * criterio del subtotal de cada franja y del total del dia), asi que el strip nunca contradice al
 * editor. `caloriesSource` es 'prescribed' cuando el dia tiene contenido —lo que el alumno
 * realmente recibe— y cae al objetivo del dia cuando esta vacio (mejor que un 0 inventado).
 */
export function builderDayCells(
  state: BuilderState,
  options: {
    kcalByVariantKey: Record<string, number>
    /** Σ de porciones a eleccion por dia (viven fuera del reducer). */
    portionsByVariantKey?: Record<string, number>
    todayIso?: string | null
  },
): BuilderDayCell[] {
  const todayDow = nutritionDayOfWeekFromIso(options.todayIso)
  return NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
    const variant = builderVariantForDayOfWeek(state, dayOfWeek)
    const isOwnDay = !variant.isDefault
    const itemCount = variant.slots.reduce((total, slot) => total + slot.items.length, 0)
    const portionCount = options.portionsByVariantKey?.[variant.key] ?? 0
    const targetCalories = toNullableNumber(variantEffectiveTargets(state, variant).calories)
    const hasContent = itemCount > 0 || portionCount > 0
    const prescribedCalories = hasContent ? (options.kcalByVariantKey[variant.key] ?? 0) : null
    const displayCalories = prescribedCalories ?? targetCalories
    return {
      dayOfWeek,
      shortLabel: NUTRITION_DAY_SHORT_LABELS[dayOfWeek],
      longLabel: NUTRITION_DAY_LABELS[dayOfWeek],
      variant: {
        id: variant.key,
        dayOfWeek: variant.dayOfWeek,
        isDefault: variant.isDefault,
        label: variant.label,
        targets: { calories: targetCalories },
      },
      isOwnDay,
      inheritsBase: !isOwnDay,
      isToday: dayOfWeek === todayDow,
      slotCount: variant.slots.length,
      itemCount,
      portionCount,
      prescribedCalories,
      targetCalories,
      displayCalories,
      caloriesSource: prescribedCalories != null ? 'prescribed' : targetCalories != null ? 'target' : null,
    }
  })
}

/**
 * Dias que HEREDAN el dia base, en orden de lectura. Es el "se aplica a Lu · Ma · Mi · Ju · Vi"
 * de la barra de contexto: vacio = el dia base ya no rige ningun dia (los 7 son propios).
 */
export function inheritedDayOfWeeks(state: BuilderState): number[] {
  return NUTRITION_WEEK_ORDER.filter((dayOfWeek) => builderVariantForDayOfWeek(state, dayOfWeek).isDefault)
}

/**
 * Dia del strip que representa a una variante (para mover la seleccion cuando el gesto no nace
 * de una celda: aviso de errores por dia, restauracion de un borrador). Un dia propio se
 * representa con SU dia; el dia base con `preferredDow` si lo hereda, si no con el primero que lo
 * herede. `null` = el dia base no rige ningun dia (se selecciona aparte).
 */
export function builderDowForVariant(
  state: BuilderState,
  variantKey: string,
  preferredDow: number | null,
): number | null {
  const variant = state.variants.find((candidate) => candidate.key === variantKey)
  if (variant != null && !variant.isDefault) return variant.dayOfWeek
  const inherited = inheritedDayOfWeeks(state)
  if (preferredDow != null && inherited.includes(preferredDow)) return preferredDow
  return inherited.length > 0 ? inherited[0] : null
}

/**
 * Dia seleccionado al ABRIR el creador: el del dia en edicion si es propio, si no el dia de
 * HOY cuando el dia base lo cubre (el coach entra viendo lo que su alumno come hoy).
 */
export function initialBuilderDow(state: BuilderState, todayIso: string | null | undefined): number | null {
  return builderDowForVariant(state, state.activeVariantKey, nutritionDayOfWeekFromIso(todayIso))
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


/**
 * Clon de UNA franja con la key destino ya resuelta (copia entre dias). Las keys de items
 * y reemplazos derivan de la key de la franja destino, asi que son estables y no chocan con
 * las de otra franja del mismo dia. No comparte objetos con el origen (editar el destino
 * jamas toca el dia de origen); el `food` es inmutable en el reducer y se reusa por
 * referencia, igual que en `cloneSlotsForVariant`.
 */
function cloneSlotAs(slotKey: string, slot: BuilderSlot): BuilderSlot {
  return {
    ...slot,
    key: slotKey,
    items: slot.items.map((item) => ({
      ...item,
      key: clonedKey(slotKey, item.key),
      substitutions: (item.substitutions ?? []).map((sub) => ({
        ...sub,
        key: clonedKey(slotKey, sub.key),
      })),
    })),
  }
}

/** Key libre dentro de un dia: la deseada, o con sufijo `~2`, `~3`… si ya esta ocupada. */
function uniqueSlotKey(taken: ReadonlySet<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(desired + '~' + suffix)) suffix += 1
  return desired + '~' + suffix
}

/** Destino resuelto de una copia de franja: donde aterriza y si pisa una franja existente. */
export interface SlotCopyTarget {
  variantKey: string
  /** Key de la franja destino: la EXISTENTE si hubo match por nombre, la clonada si se agrega. */
  slotKey: string
  /** true = reemplaza el contenido de una franja homonima (conserva su posicion). */
  replaced: boolean
}

/**
 * Resuelve a que franja de cada dia destino aterriza la copia (P0-4: copiar una franja a
 * otros dias sin retipear). PURA y determinista: el reducer la usa para mover el arbol y la
 * UI la usa —con el MISMO estado previo— para re-etiquetar el mapa de porciones, que vive
 * fuera del reducer (ver `copySlotPortionsToVariants` en `_components/portions-state.ts`).
 *
 * Reglas: se ignoran dias inexistentes, repetidos y el propio dia de origen (el origen jamas
 * se toca); match por `slotMergeName` (primera coincidencia) => reemplazo en su posicion;
 * sin match => franja nueva al final con key derivada (y sufijo si esa key ya existiera en
 * el dia, caso real cuando el dia se clono del base y luego renombro la franja).
 */
export function resolveSlotCopyTargets(
  state: BuilderState,
  params: { sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] },
): SlotCopyTarget[] {
  const source = state.variants.find((variant) => variant.key === params.sourceVariantKey)
  const sourceSlot = source?.slots.find((slot) => slot.key === params.slotKey)
  if (!source || !sourceSlot) return []
  const mergeName = slotMergeName(sourceSlot.name)
  const seen = new Set<string>()
  const targets: SlotCopyTarget[] = []
  for (const variantKey of params.targetVariantKeys) {
    if (variantKey === params.sourceVariantKey || seen.has(variantKey)) continue
    const variant = state.variants.find((candidate) => candidate.key === variantKey)
    if (!variant) continue
    seen.add(variantKey)
    const match = variant.slots.find((slot) => slotMergeName(slot.name) === mergeName)
    if (match) {
      targets.push({ variantKey, slotKey: match.key, replaced: true })
      continue
    }
    const taken = new Set(variant.slots.map((slot) => slot.key))
    targets.push({
      variantKey,
      slotKey: uniqueSlotKey(taken, clonedKey(variantKey, sourceSlot.key)),
      replaced: false,
    })
  }
  return targets
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
  | { type: 'SET_VISIBLE_NOTES'; value: string }
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
  | { type: 'COPY_SLOT_TO_VARIANTS'; sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] }
  | { type: 'APPEND_VARIANT_SLOTS_TO'; sourceVariantKey: string; targetVariantKey: string; keySeed: string }
  | {
      type: 'ADD_ITEM'
      variantKey: string
      slotKey: string
      key: string
      food: BuilderFood | null
      /** Porcion pegajosa ya resuelta por precedencia (alumno → coach). Sin ella manda el catalogo. */
      prefill?: { quantity: string; unit: BuilderUnit }
    }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  /**
   * Reinserta un item en su POSICION original (Deshacer del toast al quitarlo). La UI captura
   * el item y su indice ANTES de despachar `REMOVE_ITEM`; aca solo se vuelve a meter donde
   * estaba. Idempotencia barata: si la key ya volviera a existir en la franja, no se duplica.
   */
  | { type: 'RESTORE_ITEM'; variantKey: string; slotKey: string; index: number; item: BuilderItem }
  | { type: 'RESTORE_SLOT'; variantKey: string; index: number; slot: BuilderSlot }
  /**
   * Mueve un item de una franja a OTRA del mismo dia ("Mover a…" del menu del item). `toIndex`
   * fija la posicion de aterrizaje: la UI lo usa para el Deshacer (mover de vuelta al indice
   * exacto del que salio); ausente = al final de la franja destino.
   */
  | { type: 'MOVE_ITEM'; variantKey: string; fromSlotKey: string; toSlotKey: string; itemKey: string; toIndex?: number }
  | { type: 'UPDATE_ITEM'; variantKey: string; slotKey: string; itemKey: string; patch: Partial<Omit<BuilderItem, 'key'>> }
  | { type: 'ADD_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; key: string; food: BuilderFood }
  /**
   * El coach corrigió (o restauró) los macros de un alimento del catálogo (T2.2). Toca TODAS
   * sus apariciones del borrador —items y reemplazos, en cualquier día y franja— porque la
   * corrección es del alimento, no de la fila: dejar una sola actualizada sería mostrarle al
   * coach dos verdades para el mismo alimento en la misma pantalla.
   */
  | { type: 'APPLY_FOOD_OVERRIDE'; foodId: string; macros: BuilderFoodMacrosPatch }
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

/** Inserta en una posicion acotada al arreglo (indice negativo => al inicio; pasado => al final). */
function insertItemAt(items: BuilderItem[], index: number, item: BuilderItem): BuilderItem[] {
  const safe = Number.isFinite(index) ? Math.max(0, Math.min(items.length, Math.trunc(index))) : items.length
  return [...items.slice(0, safe), item, ...items.slice(safe)]
}

/** Igual que `insertItemAt`, para franjas (`RESTORE_SLOT`). Misma acotacion del indice. */
function insertSlotAt(slots: BuilderSlot[], index: number, slot: BuilderSlot): BuilderSlot[] {
  const safe = Number.isFinite(index) ? Math.max(0, Math.min(slots.length, Math.trunc(index))) : slots.length
  return [...slots.slice(0, safe), slot, ...slots.slice(safe)]
}

/**
 * Aplica el patch de `UPDATE_ITEM`. Cuando lo que cambia es la UNIDAD y el item tiene alimento
 * del catalogo, la cantidad SE CONVIERTE con el mismo helper puro que usan el editor unico
 * (`quickEditReducer` `SET_ITEM_UNIT`) y el wizard RN: dejar "30" y pasar de g a `un` publicaba
 * 30 porciones de 100 g (W1.1 del tren «Cantidades honestas»).
 *
 * Un patch que trae `quantity` propia manda: ahi el coach escribio el numero a mano.
 */
function applyItemPatch(item: BuilderItem, patch: Partial<Omit<BuilderItem, 'key'>>): BuilderItem {
  const next = { ...item, ...patch }
  if (patch.unit === undefined || patch.quantity !== undefined) return next
  if (patch.unit === item.unit || !item.food) return next
  return {
    ...next,
    quantity: convertQuantityTextOnUnitChange({
      quantity: item.quantity,
      fromUnit: item.unit,
      toUnit: patch.unit,
      // W2 (b8/b14): el gramaje casero es lo que permite convertir «122 g» en «2 huevos». Sin
      // el, el salto a `casera` dejaba los gramos escritos y la fila decia 122 huevos.
      food: { servingSize: item.food.servingSize, householdGrams: item.food.householdGrams },
    }),
  }
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
      // No-op TOTAL con la MISMA estrategia (bug 2.3.5 de la auditoria): re-tocar la tarjeta ya
      // elegida no debe resetear permisos ni tocar franjas. La UI (StrategyStep) ya evita
      // despachar esta accion sin cambio real; este corte es el cinturon del reducer.
      if (action.strategy === state.strategy) return state
      const usesSlots = strategyUsesSlots(action.strategy)
      // La primera franja se siembra SOLO en el dia base; los dias especificos (si ya
      // existieran) conservan lo suyo. Sin franjas (flexible) se vacian todos los dias — la UI
      // pide confirmacion ANTES de despachar esto cuando hay franjas con contenido
      // (`slotsLostIfFlexible`); el reducer no pregunta, solo ejecuta.
      const variants = state.variants.map((variant) => {
        if (!usesSlots) return variant.slots.length === 0 ? variant : { ...variant, slots: [] }
        if (!variant.isDefault || variant.slots.length > 0) return variant
        return { ...variant, slots: [createEmptySlot(action.firstSlotKey, 'Desayuno')] }
      })
      return {
        ...state,
        strategy: action.strategy,
        permissions: nextPermissionsForStrategyChange(state.strategy, action.strategy, state.permissions),
        variants,
      }
    }
    case 'SET_PLAN_NAME':
      return { ...state, planName: action.value }
    case 'SET_VISIBLE_NOTES':
      // Editar (aunque sea a '') deja la clave PRESENTE: a partir de aca el borrador "sabe" de
      // notas y un RESTORE posterior respeta lo que el coach escribio, incluso el vaciado.
      return { ...state, visibleNotes: action.value }
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

    /**
     * ANEXAR un dia sobre otro (T2.6 F2, decision del dueño D2): las franjas del origen se SUMAN a
     * las que el destino ya tiene, sin pisar ninguna. Es el modo hermano de la copia historica, que
     * reemplaza el dia entero (`REMOVE_VARIANT` + `DUPLICATE_VARIANT_AS` en el mismo gesto).
     *
     * A diferencia de `COPY_SLOT_TO_VARIANTS`, que empareja por NOMBRE y reemplaza la franja
     * homonima, aca no se empareja nada: si el destino ya tiene "Desayuno", queda con dos. Eso es
     * lo pedido, y la UI lo avisa ANTES nombrando los duplicados (`copyPlanWarning`).
     *
     * `keySeed` lo genera el llamador (el reducer es puro y no inventa ids). Es lo que hace que
     * anexar dos veces produzca claves distintas —con el `variantKey` como semilla las dos rondas
     * colisionarian— y ademas permite al llamador recalcular las claves de porciones sin adivinar.
     */
    case 'APPEND_VARIANT_SLOTS_TO': {
      if (action.sourceVariantKey === action.targetVariantKey) return state
      const source = state.variants.find((variant) => variant.key === action.sourceVariantKey)
      const target = state.variants.find((variant) => variant.key === action.targetVariantKey)
      if (!source || !target || source.slots.length === 0) return state
      const appended = cloneSlotsForVariant(action.keySeed, source.slots)
      // Cinturon: una key repetida en el destino romperia el render y las porciones. No deberia
      // pasar (el seed es nuevo por ronda), pero si pasara, no anexar es mejor que corromper.
      const taken = new Set(target.slots.map((slot) => slot.key))
      if (appended.some((slot) => taken.has(slot.key))) return state
      return mapVariant(state, action.targetVariantKey, (variant) => ({
        ...variant,
        slots: [...variant.slots, ...appended],
      }))
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
    /**
     * Deshacer el borrado de una franja (T2.6 F1). Espejo EXACTO de `RESTORE_ITEM`: idempotente
     * —si la franja ya volvio, no-op, para que un doble clic en Deshacer no la duplique— y con
     * indice, porque una franja que vuelve al final de la lista se lee como otro bug: el orden de
     * las franjas es la secuencia del dia (desayuno antes que cena) y el coach lo nota al instante.
     */
    case 'RESTORE_SLOT':
      return mapVariant(state, action.variantKey, (variant) =>
        variant.slots.some((slot) => slot.key === action.slot.key)
          ? variant
          : { ...variant, slots: insertSlotAt(variant.slots, action.index, action.slot) },
      )
    case 'UPDATE_SLOT':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, ...action.patch }))

    case 'COPY_SLOT_TO_VARIANTS': {
      // Copia de UNA franja a otros dias (P0-4). Clona todo lo de la franja —nombre, hora,
      // items con sus campos y reemplazos— y, por nombre, REEMPLAZA la franja homonima del
      // destino conservando su posicion o la AGREGA al final. Idempotente: aplicarla dos
      // veces deja la misma estructura (la segunda vez ya hay match por nombre).
      // Las PORCIONES viajan aparte (viven fuera del reducer): la UI llama a
      // `copySlotPortionsToVariants` con estos MISMOS destinos en el mismo gesto.
      const source = state.variants.find((variant) => variant.key === action.sourceVariantKey)
      const sourceSlot = source?.slots.find((slot) => slot.key === action.slotKey)
      if (!source || !sourceSlot) return state
      const targets = resolveSlotCopyTargets(state, action)
      if (targets.length === 0) return state
      const byVariantKey = new Map(targets.map((target) => [target.variantKey, target]))
      return {
        ...state,
        variants: state.variants.map((variant) => {
          const target = byVariantKey.get(variant.key)
          if (!target) return variant
          const clone = cloneSlotAs(target.slotKey, sourceSlot)
          return {
            ...variant,
            slots: target.replaced
              ? variant.slots.map((slot) => (slot.key === target.slotKey ? clone : slot))
              : [...variant.slots, clone],
          }
        }),
      }
    }

    case 'ADD_ITEM': {
      // Porcion pegajosa (T2.6 F4): si el coach ya fijo una cantidad para ESTE alimento —para este
      // alumno, o en general— se precarga esa. Sin memoria se cae al `servingSize` del catalogo,
      // que es el comportamiento de siempre. El reducer no decide la precedencia: le llega ya
      // resuelta, porque quien la sabe es la lectura SQL.
      const remembered = action.food ? action.prefill : undefined
      const item: BuilderItem = {
        ...createEmptyItem(action.key),
        food: action.food,
        customName: action.food ? null : '',
        // W2 (b13): con medida casera el alta arranca en «1 huevo» y no en «61 g». La memoria de
        // cantidad del coach (que vive en g/ml/un) sigue teniendo prioridad cuando existe.
        quantity:
          remembered?.quantity ??
          (action.food
            ? defaultFoodUnit(action.food) === HOUSEHOLD_UNIT
              ? '1'
              : String(action.food.servingSize || '')
            : ''),
        unit: remembered?.unit ?? (action.food ? (defaultFoodUnit(action.food) as BuilderUnit) : 'g'),
      }
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, items: [...slot.items, item] }))
    }
    case 'REMOVE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.filter((item) => item.key !== action.itemKey),
      }))
    case 'RESTORE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) =>
        slot.items.some((item) => item.key === action.item.key)
          ? slot
          : { ...slot, items: insertItemAt(slot.items, action.index, action.item) },
      )
    case 'MOVE_ITEM': {
      if (action.fromSlotKey === action.toSlotKey) return state
      const variant = state.variants.find((candidate) => candidate.key === action.variantKey)
      if (!variant) return state
      const source = variant.slots.find((slot) => slot.key === action.fromSlotKey)
      const moved = source?.items.find((item) => item.key === action.itemKey)
      // Destino inexistente => no-op TOTAL: perder el item seria peor que no mover nada.
      if (!moved || !variant.slots.some((slot) => slot.key === action.toSlotKey)) return state
      return mapVariant(state, action.variantKey, (current) => ({
        ...current,
        slots: current.slots.map((slot) => {
          if (slot.key === action.fromSlotKey) {
            return { ...slot, items: slot.items.filter((item) => item.key !== action.itemKey) }
          }
          if (slot.key !== action.toSlotKey) return slot
          const index = action.toIndex ?? slot.items.length
          return { ...slot, items: insertItemAt(slot.items, index, moved) }
        }),
      }))
    }
    case 'APPLY_FOOD_OVERRIDE': {
      const { foodId, macros } = action
      const patch = (food: BuilderFood): BuilderFood =>
        food.id === foodId ? { ...food, ...macros } : food
      return {
        ...state,
        variants: state.variants.map((variant) => ({
          ...variant,
          slots: variant.slots.map((slot) => ({
            ...slot,
            items: slot.items.map((item) => ({
              ...item,
              food: item.food ? patch(item.food) : item.food,
              substitutions: (item.substitutions ?? []).map((sub) => ({ ...sub, food: patch(sub.food) })),
            })),
          })),
        })),
      }
    }
    case 'UPDATE_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: slot.items.map((item) => (item.key === action.itemKey ? applyItemPatch(item, action.patch) : item)),
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
      // Reemplazo TOTAL del arbol desde un borrador restaurado (localStorage). Acepta el
      // formato NUEVO (`variants`) y el VIEJO (`slots` planos, borradores guardados antes
      // de multi-dia): `migrateBuilderState` los normaliza. Un payload corrupto se ignora —
      // jamas rompe el wizard.
      const next = migrateBuilderState(action.state, state.effectiveFrom)
      if (next == null) return state
      // Notas visibles: son CARRY-OVER del plan vigente, no algo que el wizard edite. Un borrador
      // guardado ANTES de este carry-over no las conoce (clave ausente), asi que restaurarlo NO
      // puede borrarlas — se conservan las del estado actual (mismo criterio que el borrador
      // pre-notas de la edicion rapida). Con la clave presente manda el borrador.
      return next.visibleNotes === undefined ? { ...next, visibleNotes: state.visibleNotes ?? null } : next
    }
    default:
      return state
  }
}

// ── Migracion / normalizacion del arbol persistido (autosave v1 -> v2) ────────────────────────

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
 * Aplica las invariantes al arreglo de variantes: exactamente UNA default (la primera
 * marcada, o la primera del arreglo), sin `dayOfWeek` en la default, y `dayOfWeek` unico
 * entre las especificas (las repetidas o invalidas se descartan — un borrador corrupto no
 * puede producir un draft que el servidor rechace).
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
 * (`{ slots: [...] }`, un solo dia) al v2 (`{ variants: [...] }`). Devuelve `null` si el
 * payload no es un estado del wizard (corrupto / de otra feature): el caller conserva el suyo.
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
    effectiveFrom: typeof raw.effectiveFrom === 'string' && raw.effectiveFrom !== '' ? raw.effectiveFrom : fallbackEffectiveFrom,
    targets: normalizeTargetsShape(raw.targets),
    permissions,
    // La clave solo se emite si el borrador la traia: `RESTORE` distingue "el borrador no sabe
    // de notas" (ausente => conserva las del plan) de "el borrador dice que no hay" (null).
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

const ZERO_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

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

/**
 * ¿La cantidad de este item del wizard es plausible? (W1.3 «Cantidades honestas»). Espejo de
 * `qeItemPlausibility` del editor unico: mismas kcal que la fila YA muestra (`itemMacros`) y
 * misma porcion del catalogo y misma medida casera (W2), para que las dos superficies avisen
 * por lo mismo.
 */
export function builderItemPlausibility(item: BuilderItem): ItemPlausibility {
  return assessItemPlausibility({
    quantity: Number(item.quantity),
    unit: item.unit,
    servingSize: item.food?.servingSize ?? null,
    householdGrams: item.food?.householdGrams ?? null,
    calories: itemMacros(item).calories,
  })
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
 * suman aparte (`slotPortionTotals` / `derivePortionTotals` en `portions-state`).
 */
export function variantTotals(variant: BuilderVariant): ItemMacros {
  return variant.slots.reduce((acc, slot) => addMacros(acc, slotSubtotal(slot)), ZERO_MACROS)
}

// -- Alimento libre con macros (contrato de la accion "Guardar en mi catalogo") --

/**
 * Macros por 100 g/ml de un alimento libre. No-negativos y con topes razonables.
 * Reusado por el cliente (validacion de formulario) y el servidor (server action).
 *
 * Incluye el trio opcional de "Equivalencia de porciones" (P-B): el bloque colapsado del
 * builder manda `exchangeGroupId` + `exchangePortionGrams` (+ medida casera) en el MISMO
 * payload. Espejo EXACTO de `_lib/coach-food.ts` (el schema del servidor, que ademas
 * verifica que el grupo sea visible para el coach antes de escribir).
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

/**
 * Validacion por paso del wizard de DOS pasos:
 *  - paso 0 "El plan": estrategia + nombre + metas (antes eran dos pasos, y elegir estrategia
 *    era un "gesto de navegacion" repetible que reseteaba permisos — ver `SET_STRATEGY`).
 *  - paso 1 "Los dias": franjas/items de TODOS los dias (solo con estrategia que usa franjas).
 */
export function validateStep(state: BuilderState, step: number): StepValidation {
  const errors: Record<string, string> = {}

  if (step === BUILDER_STEP_PLAN) {
    if (!state.strategy) errors.strategy = 'Elige una estrategia para continuar.'

    if (state.planName.trim().length === 0) errors.planName = 'Ponle un nombre al plan.'
    else if (state.planName.trim().length > 180) errors.planName = 'El nombre es demasiado largo.'

    // Espejo del contrato (`NutritionPlanDraftSchema.visibleNotes`: max 8000 tras trim), mismo
    // corte y copy que la edicion rapida: corta ANTES del VALIDATION generico del server.
    if ((state.visibleNotes ?? '').trim().length > VISIBLE_NOTES_MAX) {
      errors.visibleNotes = `Las notas superan los ${VISIBLE_NOTES_MAX} caracteres.`
    }

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

  if (step === BUILDER_STEP_DAYS && strategyUsesSlots(state.strategy)) {
    // Se validan TODOS los dias (no solo el activo): publicar emite las N variantes, asi que
    // un dia sin franjas o con un item incompleto tiene que bloquear igual. Las claves de
    // franja/item son unicas entre dias, asi que no colisionan.
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

/** Franjas de UNA variante -> franjas del draft. `slot-N` se numera dentro del dia. */
function assembleSlots(slots: BuilderSlot[], usesSlots: boolean): DraftMealSlot[] {
  return usesSlots
    ? slots.map((slot, slotIndex) => ({
        code: 'slot-' + (slotIndex + 1),
        name: slot.name.trim(),
        startTime: slot.startTime.trim() === '' ? null : slot.startTime.trim(),
        endTime: null,
        mode: 'anchor' as const,
        required: false,
        targets: {},
        instructions: null,
        orderIndex: slotIndex,
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
            // Medida casera (W2): el par se congela SOLO cuando el coach publica el item EN
            // `casera` — es el gesto con el que la autoriza. En cualquier otra unidad viaja en
            // null y la fila queda en gramos honestos, sin rotulo que nadie eligio.
            householdLabel: isHouseholdUnit(item.unit) ? (item.food?.householdLabel ?? null) : null,
            householdGrams: isHouseholdUnit(item.unit) ? (item.food?.householdGrams ?? null) : null,
            // Linaje W3.1: el WIZARD no lo emite (SPEC §6.1). Arma un plan desde cero, no una
            // copia de la version vigente: no hay ancestro del que colgar los registros de hoy.
            sourceItemId: null,
            ...(substitutions.length > 0
              ? {
                  substitutions: substitutions.map((sub, subIndex): DraftItemSubstitution => ({
                    foodId: sub.food.id,
                    recipeId: null,
                    customName: null,
                    quantity: null,
                    unit: null,
                    orderIndex: subIndex,
                  })),
                }
              : {}),
          }
        }),
      }))
    : []
}

/**
 * Construye el draft canonico (NutritionPlanDraft) desde el estado del wizard.
 *
 * Multi-dia: emite UNA variante por dia del wizard, en el orden del estado (el dia base
 * primero, `orderIndex` por posicion). Las variantes con metas heredadas (`inherit`)
 * CONGELAN aqui las metas del dia base: el contrato exige `targets` por variante y el
 * alumno no debe depender de una herencia implicita en la base de datos.
 *
 * NO incluye macros de snapshot: el servidor las re-deriva desde foods (autoritativo).
 * Un plan de un solo dia produce exactamente el mismo draft que antes de multi-dia
 * (variante `default` / "Todos los días").
 */
export function assembleDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  const strategy = state.strategy ?? 'flexible'
  const usesSlots = strategyUsesSlots(strategy)
  // Notas visibles del alumno: CARRY-OVER del plan vigente. Emitir `null` aqui BORRABA en
  // silencio las indicaciones escritas en la edicion rapida cada vez que el coach republicaba
  // desde "Rehacer con el asistente" (`plan-persistence` escribe `draft.visibleNotes` tal cual,
  // sin merge server-side). '' se normaliza a null, paridad con la edicion rapida.
  const visibleNotes = (state.visibleNotes ?? '').trim()

  const dayVariants: DraftDayVariant[] = state.variants.map((variant, index) => ({
    key: variant.key,
    label: variant.label.trim() === '' ? autoVariantLabel(variant.dayOfWeek) : variant.label.trim(),
    dayOfWeek: variant.isDefault ? null : variant.dayOfWeek,
    default: variant.isDefault,
    targets: targetsToMacros(variantEffectiveTargets(state, variant)),
    orderIndex: index,
    mealSlots: assembleSlots(variant.slots, usesSlots),
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
    // `protocolNotes` NO viaja desde el cliente a proposito: es una capacidad Pro que el wizard
    // no edita. `publishPlanAction` la repone leyendola de la version base (carry-over
    // server-side, igual que la edicion rapida y el coach movil), asi el gate del addon nunca
    // ve como "nueva" una nota de protocolo que el plan ya tenia publicada.
    protocolNotes: null,
    dayVariants,
  }
}

/** Ensambla y valida el draft contra el contrato. Lanza si es invalido. */
export function assembleAndValidateDraft(state: BuilderState, options: AssembleOptions): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse(assembleDraft(state, options))
}

// RETIRO DEL PAR VIEJO (2026-08-16): la capa "draft -> filas de la base" se mudo a
// `_lib/plan-draft-rows.ts` (no tenia nada de wizard: la usa el camino de escritura
// compartido). Se re-exporta para que los importadores historicos no cambien de ruta.
export {
  buildExchangeTargetInsertRow,
  buildItemInsertRow,
  buildItemSubstitutionInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  collectExchangeGroupIds,
  collectSubstitutionFoodIds,
  ExchangeGroupSnapshotError,
  type BuilderExchangeGroup,
  type ExchangeComposedPartSnapshot,
  type ExchangeGroupSnapshotErrorReason,
  type ExchangeTargetInsertRow,
  type ItemSubstitutionInsertRow,
} from '@/app/coach/nutrition-v2/_lib/plan-draft-rows'
