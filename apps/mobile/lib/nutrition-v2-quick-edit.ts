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

import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  NUTRITION_WEEK_ORDER,
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  formatNutritionDayOfWeek,
  mapNutritionItemSubstitutionRow,
  type NutritionItemSubstitution,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionPlanReadModel,
  type NutritionStrategy,
  type NutritionStudentPermissions,
  type QuickEditErrorCode,
} from '@eva/nutrition-v2'
import {
  computeItemMacros,
  slotMergeName,
  strategyUsesSlots,
  type BuilderFood,
  type DraftDayVariant,
  type DraftMealSlot,
  type DraftPrescriptionItem,
  type ItemMacros,
  type NutritionProFeature,
  type NutritionV2WriteClient,
  type PublishFailure,
} from './nutrition-v2-builder'
import type { FoodMediaLike } from './nutrition-v2-food-media'

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
  /**
   * QA2-B3a: categoria/media del catalogo resueltas EN LECTURA por el read model
   * (`get_nutrition_plan_read_v2` → `category` + `media` por item). Alimentan el
   * thumbnail de la fila igual que el builder web (`PlanBuilderClient.tsx:619-626`).
   * Item libre (sin foodId) => ambas null y el icono cae por nombre.
   */
  category: string | null
  media: FoodMediaLike | null
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
  /**
   * Notas visibles para el alumno (visible_notes de la version), EDITABLES en el
   * quick-edit (paridad web). '' = sin notas; se normaliza a null al proyectar.
   * protocol_notes y private_notes siguen fuera del estado (carry-over en el publish).
   */
  visibleNotes: string
}

/** Tope del contrato (`NutritionPlanDraftSchema.visibleNotes`: max 8000 tras trim). */
export const VISIBLE_NOTES_MAX = 8000

/** Normaliza el texto editable al contrato del draft: trim; '' → null. */
export function normalizeVisibleNotes(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
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
    visibleNotes: planModel.visibleNotes ?? '',
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
          category: item.category ?? null,
          media: item.media ?? null,
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
  | { type: 'SET_VISIBLE_NOTES'; value: string }
  | { type: 'SET_TARGET'; variantKey: string; field: QuickEditTargetField; value: string }
  | { type: 'SET_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SET_ITEM_UNIT'; variantKey: string; slotKey: string; itemKey: string; unit: string }
  | { type: 'SET_ITEM_NAME'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SWAP_ITEM'; variantKey: string; slotKey: string; itemKey: string; food: BuilderFood }
  | { type: 'ADD_ITEM'; variantKey: string; slotKey: string; key: string; food: BuilderFood | null }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  | { type: 'RESTORE_ITEM'; variantKey: string; slotKey: string; index: number; item: QuickEditItem }
  | { type: 'UPDATE_SLOT'; variantKey: string; slotKey: string; patch: { name?: string; startTime?: string } }
  /**
   * Copia de una franja a otros dias (CE-5), espejo exacto de `COPY_SLOT_TO_VARIANTS` del
   * wizard. Deshacer: el arbol previo con `RESTORE_DRAFT` (una copia toca N dias, ningun
   * `RESTORE_*` puntual la cubre).
   */
  | { type: 'COPY_SLOT_TO_VARIANTS'; sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] }
  | { type: 'ADD_SLOT'; variantKey: string; key: string }
  | { type: 'REMOVE_SLOT'; variantKey: string; slotKey: string }
  | { type: 'RESTORE_SLOT'; variantKey: string; index: number; slot: QuickEditSlot }
  | { type: 'ADD_VARIANT'; days: readonly number[]; source: 'clone' | 'empty' }
  | { type: 'REMOVE_VARIANT'; variantKey: string }
  | { type: 'RESTORE_VARIANT'; index: number; variant: QuickEditVariant }
  | { type: 'SET_VARIANT_DAY'; variantKey: string; dayOfWeek: number }
  | { type: 'SET_VARIANT_LABEL'; variantKey: string; value: string }
  | { type: 'RESTORE_DRAFT'; state: QuickEditState }

function mapVariant(
  state: QuickEditState,
  variantKey: string,
  fn: (variant: QuickEditVariant) => QuickEditVariant,
): QuickEditState {
  // Spread OBLIGATORIO: el estado tiene campos hermanos de `variants` (visibleNotes);
  // reconstruir solo `{ variants }` los perderia en silencio en cada edicion.
  return {
    ...state,
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

// ---------------------------------------------------------------------------
// Variantes de dia (FD5) — espejo EXACTO del quick-edit web
// (`_quick-edit/quick-edit-state.ts`): alta multi-dia clonando el dia base (o vacia),
// baja, cambio de dia y renombre.
//
// Invariantes sostenidos (los mismos de la base y del builder):
//  - exactamente UNA variante default (`nutrition_day_variants_v2_default_unique`): las
//    nuevas nunca son default, y la base no se elimina ni cambia de dia;
//  - `dayOfWeek` unico entre las especificas (el snapshot resuelve "match exacto gana, si
//    no cae al default": dos variantes del mismo dia serian un empate no determinista);
//  - `key` de variante unica dentro de la version (`unique (version_id, variant_key)`).
//
// Los ids de franja/item del dia clonado se CONSERVAN a proposito: la persistencia los
// ignora (cada publicacion inserta filas nuevas) y en RN son la llave del carry-over de
// reemplazos autorizados (`injectSubstitutionsIntoDraft` empareja por `item.id`), asi que
// el dia clonado hereda tambien esa capa. Las `key` de UI si se re-generan, prefijadas por
// la key de la variante nueva, para que el reducer nunca confunda dos filas homonimas.
// ---------------------------------------------------------------------------

function weekRank(dayOfWeek: number): number {
  const index = NUTRITION_WEEK_ORDER.indexOf(dayOfWeek as (typeof NUTRITION_WEEK_ORDER)[number])
  return index < 0 ? NUTRITION_WEEK_ORDER.length : index
}

function isValidDow(dayOfWeek: number): boolean {
  return Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6
}

/** Dias de semana ya reclamados por una variante especifica (la base no reclama ninguno). */
export function takenDayVariantDows(state: QuickEditState): number[] {
  const taken: number[] = []
  for (const variant of state.variants) {
    if (variant.dayOfWeek != null && !taken.includes(variant.dayOfWeek)) taken.push(variant.dayOfWeek)
  }
  return taken
}

/** Variante base (default); null si el estado no tiene ninguna (dato invalido). */
export function defaultQuickEditVariant(state: QuickEditState): QuickEditVariant | null {
  return state.variants.find((variant) => variant.default) ?? null
}

/** Clave de variante unica dentro de la version: 'dia-6' (y 'dia-6-2' si ya existiera). */
export function buildDayVariantKey(existingKeys: readonly string[], dayOfWeek: number): string {
  const base = 'dia-' + dayOfWeek
  if (!existingKeys.includes(base)) return base
  let suffix = 2
  while (existingKeys.includes(base + '-' + suffix)) suffix += 1
  return base + '-' + suffix
}

/** Etiqueta automatica del dia ("Sábado"); fallback defensivo si el dow no es valido. */
export function autoDayVariantLabel(dayOfWeek: number): string {
  return formatNutritionDayOfWeek(dayOfWeek) ?? 'Día específico'
}

/**
 * Orden de lectura del multi-dia: dia base primero y despues los especificos Lu→Do.
 * Espejo del `sortNutritionDayVariantsForDisplay` del paquete, que pide `isDefault` y no
 * calza con la forma RN (`default`); la regla es identica.
 */
export function sortQuickEditVariantsForDisplay(
  variants: readonly QuickEditVariant[],
): QuickEditVariant[] {
  const rank = (variant: QuickEditVariant): number => {
    if (variant.default) return -1
    if (variant.dayOfWeek == null) return NUTRITION_WEEK_ORDER.length + 1
    return weekRank(variant.dayOfWeek)
  }
  return variants
    .map((variant, index) => ({ variant, index }))
    .sort((a, b) => rank(a.variant) - rank(b.variant) || a.index - b.index)
    .map((entry) => entry.variant)
}

function cloneQuickEditItem(item: QuickEditItem, keyPrefix: string): QuickEditItem {
  return {
    ...item,
    key: keyPrefix + ':' + item.key,
    baseMacros: item.baseMacros ? { ...item.baseMacros } : null,
    food: item.food ? { ...item.food } : null,
  }
}

function cloneQuickEditSlot(slot: QuickEditSlot, keyPrefix: string): QuickEditSlot {
  return {
    ...slot,
    key: keyPrefix + ':' + slot.key,
    targets: { ...slot.targets },
    items: slot.items.map((item) => cloneQuickEditItem(item, keyPrefix)),
  }
}

/**
 * Dias nuevos que produciria un alta, SIN aplicarla. Se expone para que la pantalla pueda
 * clonar tambien la capa de porciones (que en RN vive en un reducer aparte, keyed por
 * `slot.key`): con el mapeo `from -> to` de franjas puede duplicar los targets del dia
 * base en el dia nuevo. Determinista: el reducer llama a esta MISMA funcion, asi que la
 * pantalla y el estado no pueden divergir.
 *
 * Ignora en silencio los dias invalidos o ya ocupados (el picker los deshabilita).
 */
export function planDayVariantAdditions(
  state: QuickEditState,
  days: readonly number[],
  source: 'clone' | 'empty',
): { variants: QuickEditVariant[]; slotKeyClones: Array<{ from: string; to: string }> } {
  const base = defaultQuickEditVariant(state)
  if (!base) return { variants: [], slotKeyClones: [] }
  const taken = takenDayVariantDows(state)
  const keys = state.variants.map((variant) => variant.key)
  const ordered = [...new Set(days)].sort((a, b) => weekRank(a) - weekRank(b))
  const variants: QuickEditVariant[] = []
  const slotKeyClones: Array<{ from: string; to: string }> = []
  for (const dayOfWeek of ordered) {
    if (!isValidDow(dayOfWeek) || taken.includes(dayOfWeek)) continue
    const key = buildDayVariantKey(keys, dayOfWeek)
    keys.push(key)
    taken.push(dayOfWeek)
    const slots = source === 'clone' ? base.slots.map((slot) => cloneQuickEditSlot(slot, key)) : []
    if (source === 'clone') {
      base.slots.forEach((slot, index) => {
        slotKeyClones.push({ from: slot.key, to: slots[index].key })
      })
    }
    variants.push({
      key,
      id: null,
      label: autoDayVariantLabel(dayOfWeek),
      dayOfWeek,
      default: false,
      // Metas heredadas del dia base (SPEC: se personalizan despues si el coach quiere).
      targets: { ...base.targets },
      fixedTargets: { ...base.fixedTargets },
      slots,
    })
  }
  return { variants, slotKeyClones }
}

// ---------------------------------------------------------------------------
// Copia de UNA franja a otros dias (CE-5 / P0-4) — MISMA semantica que el wizard y que las
// dos superficies web: clona la franja COMPLETA (nombre, hora, items con todos sus campos y
// sus reemplazos autorizados) y, por nombre normalizado (`slotMergeName`, compartido con el
// builder), REEMPLAZA la franja homonima del dia destino conservando su posicion o la AGREGA
// al final. El dia de origen jamas se toca y aplicarla dos veces deja la misma estructura.
//
// Las PORCIONES viajan aparte: en RN viven en un reducer hermano keyed por `slot.key`, asi
// que la pantalla combina `resolveQuickEditSlotCopyTargets` + `copyPortionsToSlots` en el
// mismo gesto (igual que en el alta de dias clonados).
// ---------------------------------------------------------------------------

/** Destino resuelto de una copia de franja: donde aterriza y si pisa una franja existente. */
export interface QuickEditSlotCopyTarget {
  variantKey: string
  /** Key de la franja destino: la EXISTENTE si hubo match por nombre, la clonada si se agrega. */
  slotKey: string
  /** true = reemplaza el contenido de una franja homonima (conserva su posicion). */
  replaced: boolean
}

/** Key libre dentro del dia: la deseada, o con sufijo `-2`, `-3`… si ya esta ocupada. */
function uniqueSlotKeyIn(taken: ReadonlySet<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(desired + '-' + suffix)) suffix += 1
  return desired + '-' + suffix
}

/**
 * Codigo de franja libre dentro del dia. Es un requisito de la BASE, no cosmetico:
 * `unique (day_variant_id, slot_code)` — copiar una franja a un dia que ya heredo su codigo
 * (dia clonado y despues renombrado) reventaria el publish. Tope de 64 del contrato.
 */
function uniqueSlotCode(taken: ReadonlySet<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  const base = desired.slice(0, 60)
  let suffix = 2
  while (taken.has(base + '-' + suffix)) suffix += 1
  return base + '-' + suffix
}

/**
 * Contenido de la franja origen bajado sobre una franja destino. `identity` es la identidad
 * que conserva el destino: al REEMPLAZAR viaja la de la franja pisada (misma posicion, mismo
 * `id`/`code` — el contador lo lee como franja tocada, no como baja+alta); al AGREGAR es nueva.
 *
 * Los `id` de los ITEMS se conservan a proposito (divergencia deliberada con la web, donde los
 * reemplazos viven dentro del item del estado): en RN son la llave del carry-over de reemplazos
 * autorizados — `injectSubstitutionsIntoDraft` empareja por `item.id` — asi que sin ellos la
 * franja copiada llegaria al dia destino SIN sus reemplazos. Es la misma decision del alta de
 * dias clonados (`planDayVariantAdditions`); la persistencia ignora esos ids e inserta filas
 * nuevas. Las `key` de UI si se re-generan, prefijadas por la franja destino.
 */
function copiedQuickEditSlot(
  source: QuickEditSlot,
  identity: { key: string; id: string | null; code: string },
): QuickEditSlot {
  return {
    ...cloneQuickEditSlot(source, identity.key),
    key: identity.key,
    id: identity.id,
    code: identity.code,
  }
}

/**
 * Resuelve a que franja de cada dia destino aterriza la copia. PURA y determinista: el reducer
 * la usa para mover el arbol y la pantalla la usa —con el MISMO estado previo— para mover la
 * capa de porciones (ver `copyPortionsToSlots`).
 *
 * Reglas: se ignoran dias inexistentes, repetidos y el propio dia de origen; match por
 * `slotMergeName` (primera coincidencia) => reemplazo en su posicion; sin match => franja nueva
 * al final con key derivada (y sufijo si esa key ya existiera en el dia).
 */
export function resolveQuickEditSlotCopyTargets(
  state: QuickEditState,
  params: { sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] },
): QuickEditSlotCopyTarget[] {
  const source = state.variants.find((variant) => variant.key === params.sourceVariantKey)
  const sourceSlot = source?.slots.find((slot) => slot.key === params.slotKey)
  if (!source || !sourceSlot) return []
  const mergeName = slotMergeName(sourceSlot.name)
  const seen = new Set<string>()
  const targets: QuickEditSlotCopyTarget[] = []
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
      slotKey: uniqueSlotKeyIn(taken, variantKey + ':' + sourceSlot.key),
      replaced: false,
    })
  }
  return targets
}

function copySlotToVariants(
  state: QuickEditState,
  params: { sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] },
): QuickEditState {
  const source = state.variants.find((variant) => variant.key === params.sourceVariantKey)
  const sourceSlot = source?.slots.find((slot) => slot.key === params.slotKey)
  if (!source || !sourceSlot) return state
  const targets = resolveQuickEditSlotCopyTargets(state, params)
  if (targets.length === 0) return state
  const byVariantKey = new Map(targets.map((target) => [target.variantKey, target]))
  return {
    ...state,
    variants: state.variants.map((variant) => {
      const target = byVariantKey.get(variant.key)
      if (!target) return variant
      if (target.replaced) {
        const index = variant.slots.findIndex((slot) => slot.key === target.slotKey)
        const destination = variant.slots[index]
        const slots = [...variant.slots]
        slots[index] = copiedQuickEditSlot(sourceSlot, {
          key: destination.key,
          id: destination.id,
          code: destination.code,
        })
        return { ...variant, slots }
      }
      const code = uniqueSlotCode(new Set(variant.slots.map((slot) => slot.code)), sourceSlot.code)
      return {
        ...variant,
        slots: [...variant.slots, copiedQuickEditSlot(sourceSlot, { key: target.slotKey, id: null, code })],
      }
    }),
  }
}

/** Los demas dias del plan: el argumento de "Aplicar a todos los días". */
export function otherQuickEditVariantKeys(state: QuickEditState, variantKey: string): string[] {
  return state.variants.filter((variant) => variant.key !== variantKey).map((variant) => variant.key)
}

export function quickEditReducer(state: QuickEditState, action: QuickEditAction): QuickEditState {
  switch (action.type) {
    case 'SET_VISIBLE_NOTES':
      return { ...state, visibleNotes: action.value }
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
        category: action.food.category,
        media: action.food.media,
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
        category: action.food ? action.food.category : null,
        media: action.food ? action.food.media : null,
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
    case 'COPY_SLOT_TO_VARIANTS':
      // Las porciones viven en el reducer hermano: la pantalla despacha esto y aplica
      // `copyPortionsToSlots` con los destinos de `resolveQuickEditSlotCopyTargets`.
      return copySlotToVariants(state, action)
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
    case 'ADD_VARIANT': {
      const { variants } = planDayVariantAdditions(state, action.days, action.source)
      if (variants.length === 0) return state
      return { ...state, variants: [...state.variants, ...variants] }
    }
    case 'REMOVE_VARIANT':
      // El dia base es intocable (el snapshot cae a el los dias sin plan propio).
      return {
        ...state,
        variants: state.variants.filter((variant) => variant.default || variant.key !== action.variantKey),
      }
    case 'RESTORE_VARIANT':
      return { ...state, variants: insertAt(state.variants, action.index, action.variant) }
    case 'SET_VARIANT_DAY': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      if (!target || target.default || !isValidDow(action.dayOfWeek)) return state
      // Unicidad de dia: el picker deshabilita los ocupados; esto es el cinturon.
      if (
        state.variants.some(
          (variant) => variant.key !== action.variantKey && variant.dayOfWeek === action.dayOfWeek,
        )
      ) {
        return state
      }
      const previousAutoLabel = target.dayOfWeek == null ? null : autoDayVariantLabel(target.dayOfWeek)
      return mapVariant(state, action.variantKey, (variant) => ({
        ...variant,
        dayOfWeek: action.dayOfWeek,
        // El renombre manual manda: solo se re-etiqueta si la etiqueta seguia siendo la
        // automatica del dia anterior.
        label:
          previousAutoLabel !== null && variant.label.trim() === previousAutoLabel
            ? autoDayVariantLabel(action.dayOfWeek)
            : variant.label,
      }))
    }
    case 'SET_VARIANT_LABEL':
      return mapVariant(state, action.variantKey, (variant) => ({ ...variant, label: action.value }))
    case 'RESTORE_DRAFT':
      // Rehidrata el arbol COMPLETO desde un respaldo local (AsyncStorage) — a diferencia de
      // RESTORE_ITEM/RESTORE_SLOT (undo puntual), reemplaza todo el estado. Guarda defensiva:
      // si el payload esta corrupto o es de un shape viejo (variants ausente o no-array) se
      // conserva el estado actual — mejor no restaurar que romper la pantalla. Un borrador
      // pre-notas (sin `visibleNotes`) restaura el arbol y conserva las notas actuales
      // (hidratadas del read model): jamas un undefined en el estado.
      if (!Array.isArray(action.state?.variants)) return state
      if (typeof action.state.visibleNotes === 'string') return action.state
      return { ...action.state, visibleNotes: state.visibleNotes }
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
  // Notas visibles editadas = 1 operacion (comparacion normalizada: espacios/'' no cuentan).
  if (normalizeVisibleNotes(baseline.visibleNotes) !== normalizeVisibleNotes(current.visibleNotes)) {
    count += 1
  }
  for (const curVariant of current.variants) {
    const baseVariant = baseline.variants.find((v) => v.key === curVariant.key)
    if (!baseVariant) {
      count += 1
      continue
    }
    if (targetsChanged(baseVariant, curVariant)) count += 1
    // Encabezado del dia (FD5): renombrar o mover un dia especifico ES una edicion
    // publicable; sin esto la barra quedaria en 0 y el coach no podria publicarla.
    if (
      baseVariant.label.trim() !== curVariant.label.trim() ||
      baseVariant.dayOfWeek !== curVariant.dayOfWeek
    ) {
      count += 1
    }

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

/** Tope del contrato (`NutritionDayVariantSchema.label`: max 120 tras trim). */
export const VARIANT_LABEL_MAX = 120

export function validateQuickEditState(state: QuickEditState): QuickEditValidation {
  const errors: Record<string, string> = {}
  // Espejo del contrato (max 8000 tras trim): corta ANTES del VALIDATION generico del publish.
  if ((state.visibleNotes ?? '').trim().length > VISIBLE_NOTES_MAX) {
    errors['plan.visibleNotes'] = `Las notas superan los ${VISIBLE_NOTES_MAX} caracteres.`
  }
  // Invariantes multi-dia (FD5, espejo web): default unico + dia de semana unico. El
  // reducer ya los sostiene; esto corta el publish si un respaldo local viejo o un estado
  // corrupto llegara con dos bases o dos dias iguales, en vez de dejar fallar al RPC.
  if (state.variants.filter((variant) => variant.default).length !== 1) {
    errors['plan.dayVariants'] = 'El plan necesita exactamente un día base.'
  } else {
    const seenDows: number[] = []
    for (const variant of state.variants) {
      if (variant.dayOfWeek == null) continue
      if (seenDows.includes(variant.dayOfWeek)) {
        errors['plan.dayVariants'] = 'Hay dos días del plan asignados al mismo día de la semana.'
        break
      }
      seenDows.push(variant.dayOfWeek)
    }
  }
  for (const variant of state.variants) {
    const label = variant.label.trim()
    if (label.length === 0) errors['variant.' + variant.key + '.label'] = 'El día necesita un nombre.'
    else if (label.length > VARIANT_LABEL_MAX) {
      errors['variant.' + variant.key + '.label'] =
        'El nombre no puede superar los ' + VARIANT_LABEL_MAX + ' caracteres.'
    }
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
 * `visibleNotes` sale EDITADO del estado (normalizado trim/''→null). protocol_notes va
 * con el valor del baseline como placeholder: el publish lo PISA con el carry-over
 * leido fresco de la version base (F1 no lo edita).
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
    // Trim explicito (el contrato ya trimea): baseline y draft pasan por la misma
    // proyeccion, asi que renombrar con espacios de sobra no inventa un cambio.
    label: variant.label.trim(),
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
    visibleNotes: normalizeVisibleNotes(state.visibleNotes),
    privateNotes: null,
    protocolNotes: baseline.protocolNotes,
    dayVariants,
  }
}

// ---------------------------------------------------------------------------
// Reemplazos autorizados (F-02): CARRY-OVER obligatorio. El read-model NO trae los reemplazos
// (misma clase del bug private_notes): al republicar desde el quick-edit se perderian. Por eso al
// abrir la edicion se fetchean por lectura RLS-directa de la version base y, al publicar, se
// re-inyectan en el draft (que los re-congela e inserta). Los reemplazos NO son editables en el
// quick-edit F1 (van fuera del QuickEditState para no ensuciar el diff): son carry-over puro.
// ---------------------------------------------------------------------------

/** Resultado del fetch de reemplazos: `error` NO es "sin reemplazos" (ver abajo). */
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
  try {
    const res = await db
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .eq('version_id', versionId)
      .order('order_index', { ascending: true })
    if (res.error || !res.data) return { status: 'error', byItem }
    const rows = res.data as Parameters<typeof mapNutritionItemSubstitutionRow>[0][]
    for (const row of rows) {
      const mapped = mapNutritionItemSubstitutionRow(row)
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
  } catch {
    // Red/parse caidos: NO es "sin reemplazos". Publicar con el mapa vacio los borraria del
    // plan del alumno, asi que el estado viaja como 'error' y la UI bloquea el publish.
    return { status: 'error', byItem: new Map() }
  }
  return { status: 'loaded', byItem }
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

export type QuickEditDraftResult =
  | { ok: true; draft: NutritionPlanDraft; effectiveFrom: string }
  | { ok: false; code: QuickEditErrorCode; message: string }

/**
 * PURA: arma el draft canonico del quick-edit listo para publicar (paso previo al POST de
 * `publishQuickEditRN`, lib/nutrition-v2.api.ts).
 *
 * NUT-005: la publicacion del quick-edit ya NO escribe desde el dispositivo. Lo que antes hacia
 * esta lib (leer la version base, delta-gate Pro, insertar version/variantes/franjas/items/
 * reemplazos/porciones y llamar `publish_nutrition_plan_v2`) vive ahora en
 * POST /api/mobile/nutrition-v2/coach/mutate, que re-valida rollout/workspace/entitlement y
 * persiste con el cliente RLS del propio coach reusando el codigo de escritura de la web.
 *
 * Aqui queda solo el ensamblado:
 *  1. fecha de vigencia (nunca anterior a la vigente),
 *  2. estado -> draft (`visibleNotes` es EDITABLE y sale del estado, ya normalizada),
 *  3. porciones a eleccion (targets; el snapshot de grupos lo congela el servidor),
 *  4. reemplazos autorizados carry-over (F-02): sin ellos el republish los BORRARIA,
 *  5. validacion contra el contrato.
 * `privateNotes`/`protocolNotes` quedan en null: el servidor pisa `protocol_notes` con el
 * carry-over de la version base (el quick-edit F1 no lo edita) y la columna same-row de notas
 * privadas esta deprecada.
 */
export function buildQuickEditPublishDraft(input: {
  clientId: string
  baseline: QuickEditBaseline
  state: QuickEditState
  /** Estado de porciones (omitir = sin porciones: el draft queda byte-identico al original). */
  portions?: { state: QuickEditPortionsState }
  /** Reemplazos autorizados (F-02) de la version base, por prescriptionItemId. */
  carryOverSubstitutions?: ReadonlyMap<string, NutritionItemSubstitution[]>
  todayIso: string
}): QuickEditDraftResult {
  const { clientId, baseline, state, portions, carryOverSubstitutions, todayIso } = input

  const effectiveFrom = quickEditEffectiveFrom(todayIso, baseline.effectiveFrom)
  const baseDraft = quickEditStateToDraft({ state, baseline, clientId, effectiveFrom })
  const withTargets = portions
    ? injectExchangeTargetsIntoDraft(baseDraft, state, portions.state)
    : baseDraft
  // Reemplazos F-02 (campo disjunto de exchangeTargets): se cuelgan al final; sin mapa = no-op.
  const rawDraft = carryOverSubstitutions
    ? injectSubstitutionsIntoDraft(withTargets, carryOverSubstitutions)
    : withTargets
  rawDraft.privateNotes = null
  rawDraft.protocolNotes = null

  const parsed = NutritionPlanDraftSchema.safeParse(rawDraft)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'El plan tiene datos inválidos y no se pudo publicar. Revisa las cantidades y nombres.',
    }
  }
  if (!parsed.data.planId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'No se encontró la versión vigente de este plan. Recarga la ficha e intenta de nuevo.',
    }
  }
  return { ok: true, draft: parsed.data, effectiveFrom }
}

/** ¿El modo edicion muestra franjas? (flexible sin franjas → quick-edit solo de metas). */
export function quickEditUsesSlots(baseline: QuickEditBaseline, state: QuickEditState): boolean {
  return strategyUsesSlots(baseline.strategy) || state.variants.some((v) => v.slots.length > 0)
}
