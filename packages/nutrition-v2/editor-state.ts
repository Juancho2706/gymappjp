/**
 * GRAMATICA DEL EDITOR UNICO de nutricion (superset quick-edit + capacidades wizard) —
 * modulo PURO compartido (R1 de T3.x): sin React/Next, tipos + hidratacion desde el read
 * model + reducer + macros en vivo + ensamblado del draft canonico. Nacio como el estado del
 * quick-edit web (`apps/web/.../_quick-edit/quick-edit-state.ts`) y se extrajo VERBATIM a
 * este paquete para que web y RN (T3.3) consuman UNA sola gramatica. Testeable con mocks.
 *
 * Relacion con el contrato compartido (./quick-edit):
 * - `readModelToDraft` (paquete) da el draft BASE (planId, permisos, notas, estrategia).
 * - Este modulo mantiene el arbol EDITABLE (con keys de UI y bases de macros) y lo
 *   proyecta sobre ese draft base via `applyQuickEditToDraft`. El contador de cambios
 *   (`countDraftChanges`, paquete) compara draft base proyectado vs draft actual: ambos
 *   pasan por la MISMA proyeccion, asi que cero ediciones = cero cambios garantizado.
 */

import type {
  NutritionItemSubstitution,
  NutritionMacroTargets,
  NutritionPlanDraft,
  NutritionStrategy,
  NutritionStudentPermissions,
} from './contracts'
import {
  reconstructExchangeGroups,
  type NutritionExchangeComposedPart,
  type NutritionExchangeGroupRead,
  type NutritionExchangeRef,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
} from './read-models'
import {
  NUTRITION_WEEK_ORDER,
  formatNutritionDayOfWeek,
  sortNutritionDayVariantsForDisplay,
} from './day-variants'
import { macrosForTargets, type ExchangeGroup, type ExchangeMacroTotals } from '@eva/nutrition-engine'
import {
  computeItemMacros,
  slotMergeName,
  MAX_ITEM_SUBSTITUTIONS,
  type BuilderFood,
  type BuilderFoodMacrosPatch,
  type ItemMacros,
} from './editor-food'
// Equivalencia del reemplazo (T2.4): el MISMO modulo puro que resuelve la cantidad que el
// alumno ve al sustituir. El editor lo llama para MOSTRAR ese numero, jamas para editarlo.
import {
  computeSubstitutionEquivalence,
  describeSubstitutionDelta,
} from './substitution-intake'
import {
  HOUSEHOLD_UNIT,
  defaultFoodUnit,
  foodMagnitudeUnit,
  isHouseholdUnit,
  type NutritionIntakeUnit,
} from './intake-units'
// W1.1/W1.3 («Cantidades honestas»): cambiar la unidad CONVIERTE la cantidad y el editor sabe
// decir cuando un item es poco plausible. Los dos son modulos puros del paquete para que el
// wizard web, el wizard RN y este reductor usen exactamente la misma regla.
import { convertQuantityTextOnUnitChange, formatQuantityText } from './unit-change'
import { assessItemPlausibility, type ItemPlausibility } from './plausibility'
import type { NutritionMacrosBasis } from './intake-normalize'
// Diagnostico de porciones huerfanas (defecto B4): logica pura compartida con el wizard web
// (movida aca en R1; el wizard la re-exporta desde su ruta historica).
import {
  daysMissingBasePortions,
  portionsKey,
  type PortionsBySlot,
  type PortionsDayGap,
  type PortionsDayLike,
} from './editor-portions'

export const ZERO_ITEM_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

// ---------------------------------------------------------------------------
// Tipos del arbol editable
// ---------------------------------------------------------------------------

/**
 * Reemplazo autorizado del coach, ya proyectable al draft (F-02). CARRY-OVER read-only: F1 no
 * edita reemplazos en quick-edit; solo los preserva para que republicar NO los borre (el
 * read-model no los transporta — misma clase del bug de private_notes). `orderIndex` se
 * re-deriva por posicion al proyectar. Sin display info: quick-edit no pinta la capa de
 * reemplazos, solo la conserva y reenvia al server, que vuelve a congelar el snapshot.
 */
export interface QeItemSubstitution {
  foodId: string | null
  recipeId: string | null
  customName: string | null
  quantity: number | null
  unit: string | null
  /**
   * Nombre visible del reemplazo (snapshot congelado de la version base, o del catalogo al
   * agregarlo en el editor). SOLO display: la proyeccion al draft no lo transporta — el
   * server re-deriva nombre/macros por foodId al congelar el snapshot nuevo. Ausente en
   * respaldos locales pre-W2: la UI cae a customName o "Alimento".
   */
  displayName?: string | null
  /**
   * Macros del sustituto para calcular en el editor la cantidad equivalente que el alumno
   * VA A VER (`qeSubstitutionEquivalence`). DISPLAY-ONLY, igual que `displayName`:
   * `projectItem` no la transporta y `substitutionsSignature` no la mira, asi que rellenarla
   * (o no) jamas mueve el contador de cambios ni ensucia el draft que valida el server.
   *
   * Son las macros VIGENTES del catalogo con el override del coach ya aplicado (tal como las
   * trae `BuilderFood`), NUNCA los `snapshot_*` congelados de la fila: el alumno resuelve su
   * equivalencia contra el catalogo vivo, y un coach mirando el snapshot estaria ajustando
   * contra un numero que su alumno no tiene.
   *
   * Ausente = no hay con que calcular en esta fila (respaldo local viejo, reemplazo libre o
   * hidratacion sin catalogo en mano): la UI NO pinta cantidad. Mejor vacio que mentiroso.
   */
  displayMacros?: QeSubstitutionFoodMacros | null
}

/**
 * Macros VIGENTES de un alimento sustituto, en su propia base (por 100 o por porcion). Es el
 * subconjunto de `BuilderFood` que `computeSubstitutionEquivalence` necesita — el alimento
 * entero no viaja a proposito: esto es una carga de DISPLAY dentro del arbol editable, no otra
 * copia del catalogo.
 */
export interface QeSubstitutionFoodMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
  servingSize: number
  servingUnit: string
  /** Base declarada (NUT-001). Ausente/null = formula historica por 100 g/ml. */
  macrosBasis?: NutritionMacrosBasis | null
}

/** Alimento del catalogo (macros ya mergeadas con el override) → carga de display del reemplazo. */
export function qeSubstitutionMacrosFromFood(food: BuilderFood): QeSubstitutionFoodMacros {
  return {
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatsG: food.fatsG,
    fiberG: food.fiberG,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    macrosBasis: food.macrosBasis ?? null,
  }
}

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
   * Medida casera del ITEM (W2 «Cantidades honestas», hallazgo b9/R1 de la auditoria W2.0).
   * Vive en el item y NO solo en `item.food` porque los items hidratados del read model traen
   * `food: null` (ver `hydrateItem`): sin esto, una fila rehidratada en modo `casera` no sabria
   * ni cuanto pesa su medida ni como se llama.
   *
   * Par indivisible (`null` los dos = el item no tiene medida casera). Se copia del alimento al
   * pasar a `casera` y se congela tal cual al publicar; el drift del catalogo no lo mueve.
   */
  householdGrams: number | null
  householdLabel: string | null
  /**
   * LINAJE (W3.1, «Cantidades honestas» SPEC §6.1): de que item de la version VIGENTE es copia
   * este item. Existe porque cada publicacion inserta filas NUEVAS con `crypto.randomUUID()`
   * (plan-persistence.ts:489) y los registros del alumno de HOY quedan apuntando a un id que ya
   * no esta en el snapshot: republicar sin tocar nada le borraba el «Registrado» (Causa 2).
   *
   * `null` = item sin ancestro (alta nueva, copia a otro dia/plantilla, o item CAMBIADO). La
   * regla del reductor es dura y conservadora: conserva el linaje SOLO si sigue siendo la misma
   * comida —misma franja, mismo alimento/nombre, misma cantidad y misma unidad—; cualquier
   * cambio de contenido lo anula. Un item modificado (30 un → 3 un) queda huerfano A PROPOSITO:
   * es otra comida, y W1.4 lo deja visible y retirable.
   *
   * Es una AYUDA de lectura, nunca un requisito: el servidor lo revalida (mismo plan, ≠ id) y
   * lo baja a NULL sin fallar la publicacion (`persist_and_publish_nutrition_plan_v2`).
   */
  sourceItemId: string | null
  /**
   * Base de escalado lineal para items hidratados del read model (solo traen macros de
   * la cantidad prescrita, no por-100): macros nuevas = base * (qty / base.quantity).
   * Exacto mientras la unidad no cambie — por eso la unidad queda BLOQUEADA para estos
   * items (el swap desde catalogo la desbloquea). El servidor re-deriva de foods igual.
   */
  macroBase: { quantity: number; macros: ItemMacros } | null
  /** Alimento libre (sin foodId/recipeId): el nombre es editable y las macros no aplican. */
  isCustom: boolean
  /**
   * Foto del producto e icono de categoria, SOLO para display (no viajan en la proyeccion
   * del draft: el server los re-resuelve en lectura por foodId). Hidratados del read model;
   * un swap los reemplaza por los del alimento elegido.
   */
  media: { bucket: string; objectPath: string; version: number } | null
  category: string | null
  /**
   * Reemplazos autorizados del coach (F-02) heredados de la version base. CARRY-OVER
   * read-only: quick-edit no los edita, pero deben viajar en la proyeccion del draft o
   * republicar los borraria. Vacio = item sin capa de reemplazos.
   */
  substitutions: QeItemSubstitution[]
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
  /**
   * Composicion congelada del grupo (LEG = 1P + 1C). Necesaria para que el engine expanda
   * los compuestos al sumar las porciones en los subtotales; null = grupo simple.
   */
  composedOf: NutritionExchangeComposedPart[] | null
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

/**
 * Metadatos del plan editables — SOLO el editor unico (T3.x) los usa. `undefined` = superficie
 * quick-edit clasica: la proyeccion conserva los metadatos del draft base intactos y las
 * acciones de meta son no-op, asi el par viejo queda bit-identico a como era antes del editor.
 */
export interface QeMeta {
  /** Nombre del plan (contrato `NutritionPlanDraftSchema.name`: 1-180 tras trim). */
  name: string
  strategy: NutritionStrategy
  permissions: NutritionStudentPermissions
  /**
   * Fecha de vigencia elegible (YYYY-MM-DD; null = hoy). Presente SOLO en modo CREACION:
   * en edicion el campo no existe y el server computa max(hoy, base) como siempre. No viaja
   * en la proyeccion del draft (`persistAndPublishDraft` la recibe como argumento aparte).
   */
  effectiveFrom?: string | null
}

export interface QuickEditState {
  variants: QeVariant[]
  /**
   * Notas visibles para el alumno (visible_notes de la version), editables en el
   * quick-edit. Texto plano ('' = sin notas; se normaliza a null al proyectar).
   * protocol_notes y private_notes siguen FUERA del estado (carry-over server-side).
   */
  visibleNotes: string
  /** Presente solo cuando la superficie edita metadatos (editor unico). Ver QeMeta. */
  meta?: QeMeta
}

/** Tope del contrato (`NutritionPlanDraftSchema.name`: max 180 tras trim). */
export const PLAN_NAME_MAX = 180

/** Tope del contrato (`NutritionPlanDraftSchema.visibleNotes`: max 8000 tras trim). */
export const VISIBLE_NOTES_MAX = 8000

/** Tope del contrato (`NutritionMealSlotSchema.instructions`: max 2000 tras trim). */
export const SLOT_INSTRUCTIONS_MAX = 2000

/** Tope del contrato (nota del target de porciones, `notes`: max 1000 tras trim). */
export const PORTION_NOTES_MAX = 1000

/** Normaliza el texto editable al contrato del draft: trim; '' → null. */
export function normalizeVisibleNotes(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
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

/** Mapa de reemplazos por item prescrito (para inyectar en la hidratacion). */
export type SubstitutionsByItemId = Record<string, QeItemSubstitution[]>

/** Read-model del reemplazo (snapshot congelado) -> forma proyectable al draft. */
function readSubstitutionToQe(
  read: NutritionItemSubstitutionRead,
  foodsById: Record<string, BuilderFood>,
): QeItemSubstitution {
  const isCustom = read.foodId === null && read.recipeId === null
  // `read.macros` son los `snapshot_*` CONGELADOS de la version base y se descartan a proposito:
  // el alumno resuelve la equivalencia contra el catalogo VIGENTE (mas el override del coach),
  // asi que mostrarle al coach un numero derivado del snapshot lo haria ajustar contra un valor
  // que su alumno no tiene. Sin catalogo en mano la fila queda sin cantidad, que es honesto.
  const food = read.foodId ? (foodsById[read.foodId] ?? null) : null
  return {
    foodId: read.foodId,
    recipeId: read.recipeId,
    // El server re-deriva nombre/macros del catalogo para foodId/recipeId; el nombre libre
    // solo se conserva para reemplazos custom (sin foodId ni recipeId).
    customName: isCustom ? read.name : null,
    quantity: read.quantity,
    unit: read.unit,
    // Snapshot congelado para pintar la lista editable del editor (W2). Display-only.
    displayName: read.name,
    ...(food ? { displayMacros: qeSubstitutionMacrosFromFood(food) } : {}),
  }
}

/**
 * Agrupa los reemplazos leidos directo de la tabla RLS-scoped por `prescriptionItemId`
 * conservando el orden de llegada (el fetch ordena por order_index). Puro: alimenta la
 * inyeccion del carry-over en `readModelToEditState`.
 *
 * `foodsById` (catalogo VIGENTE del coach, macros ya mergeadas con su override) es OPCIONAL y
 * solo alimenta el display: con el, la fila del sheet puede mostrar la cantidad equivalente que
 * el alumno vera; sin el, la muestra sin cantidad. Nada de esto viaja al draft.
 */
export function buildSubstitutionMap(
  reads: readonly NutritionItemSubstitutionRead[],
  foodsById: Record<string, BuilderFood> = {},
): SubstitutionsByItemId {
  const map: SubstitutionsByItemId = {}
  for (const read of reads) {
    ;(map[read.prescriptionItemId] ??= []).push(readSubstitutionToQe(read, foodsById))
  }
  return map
}

/**
 * Cuenta de medidas caseras a partir de los gramos persistidos, redondeada al medio (el paso del
 * stepper en modo casera): 122 g con `hg = 61` ⇒ «2 huevos». `null` cuando el par no alcanza o el
 * redondeo dejaria el item en cero — ahi la fila se queda en gramos, que es la verdad igual.
 */
/** ¿El item tiene una medida casera con la que traducir a gramos? Par completo y gramaje > 0. */
function hasUsableHouseholdPair(item: QeItem): boolean {
  const grams = item.householdGrams ?? item.food?.householdGrams ?? null
  const label = (item.householdLabel ?? item.food?.householdLabel ?? '').trim()
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0 && label.length > 0
}

function householdCountFromGrams(grams: number, householdGrams: number | null | undefined): number | null {
  if (typeof householdGrams !== 'number' || !Number.isFinite(householdGrams) || householdGrams <= 0) return null
  if (!Number.isFinite(grams) || grams <= 0) return null
  const count = Math.round((grams / householdGrams) * 2) / 2
  return count > 0 ? count : null
}

/**
 * Rehidratacion de la MEDIDA CASERA (W2, R1 de la auditoria W2.0). Un item publicado siempre vive
 * en gramos; si trae el par congelado, el editor lo muestra como lo escribio el coach («2 huevos»).
 *
 * ⚠️ La trampa que documenta R1: `macroBase.quantity` tiene que quedar en la MISMA unidad que
 * `quantity`. Los items hidratados no tienen `food`, asi que `qeItemMacros` escala por
 * `qty / macroBase.quantity`: con `quantity = 2` (huevos) y `macroBase.quantity = 122` (gramos)
 * el editor mostraria 1/61 de las kcal reales… y republicar congelaria ESE numero.
 */
function hydrateHouseholdItem(item: ReadItem): {
  unit: string
  quantity: string
  macroBaseQuantity: number
  householdGrams: number | null
  householdLabel: string | null
} {
  const label = (item.householdLabel ?? '').trim()
  const count = label.length === 0 ? null : householdCountFromGrams(item.quantity, item.householdGrams)
  if (count === null) {
    return {
      unit: item.unit,
      quantity: String(item.quantity),
      macroBaseQuantity: item.quantity,
      // El par se conserva aunque la fila quede en gramos: rotula igual («122 g de huevo») y el
      // coach puede volver a la medida casera desde el selector sin ir a buscar el alimento.
      householdGrams: item.householdGrams ?? null,
      householdLabel: item.householdLabel ?? null,
    }
  }
  return {
    unit: HOUSEHOLD_UNIT,
    quantity: formatQuantityText(count),
    macroBaseQuantity: count,
    householdGrams: item.householdGrams ?? null,
    householdLabel: item.householdLabel ?? null,
  }
}

function hydrateItem(item: ReadItem, subsByItemId: SubstitutionsByItemId): QeItem {
  const isCustom = item.foodId === null && item.recipeId === null
  const household = hydrateHouseholdItem(item)
  return {
    key: item.id,
    id: item.id,
    foodId: item.foodId,
    recipeId: item.recipeId,
    displayName: item.name ?? 'Alimento',
    brand: item.brand,
    quantity: household.quantity,
    unit: household.unit,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    food: null,
    householdGrams: household.householdGrams,
    householdLabel: household.householdLabel,
    // Linaje W3.1: el ancestro es el item de la version VIGENTE del que sale esta fila. Se
    // carga aca —y no al publicar— porque solo el reductor sabe si el coach lo toco.
    sourceItemId: item.id,
    macroBase:
      item.quantity > 0
        ? {
            quantity: household.macroBaseQuantity,
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
    media: item.media ?? null,
    category: item.category ?? null,
    // Carry-over F-02: los reemplazos de la version base viajan en el estado editable para que
    // republicar NO los borre. Si no hay fetch (mapa vacio) el item queda como antes.
    substitutions: subsByItemId[item.id] ?? [],
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

function hydrateSlot(slot: ReadSlot, subsByItemId: SubstitutionsByItemId): QeSlot {
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
    items: slot.prescriptionItems.map((item) => hydrateItem(item, subsByItemId)),
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
          composedOf: target.composedOf,
          macrosConfirmed: target.macrosConfirmed,
        })
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.groupCode.localeCompare(b.groupCode))
}

/** Orden del picker del creador (`PortionsGroupPicker`): sistema primero, luego los propios. */
function compareCatalogGroups(a: ExchangeGroup, b: ExchangeGroup): number {
  if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.code.localeCompare(b.code)
}

/**
 * Catalogo VIVO de grupos del coach (`loadExchangeGroupsForBuilderAction`) proyectado a la
 * forma del picker. Existe porque el quick-edit solo ofrecia los grupos que el plan YA usa:
 * el coach que queria SUMAR otro grupo a una comida se topaba con una lista donde todo decia
 * "Ya está en esta comida" y tenia que irse al creador.
 *
 * El `composedOf` del catalogo trae solo `{code, portions}` (tipo del engine) mientras el
 * read-model exige ademas el `ref` de cada base para expandir el compuesto; se resuelve por
 * codigo contra el MISMO catalogo y, si alguna base falta, el grupo viaja como SIMPLE (null):
 * el engine cae entonces al ref propio del compuesto — honesto — en vez de sumar bases en cero.
 */
export function catalogToPortionGroups(groups: readonly ExchangeGroup[]): QePortionGroup[] {
  const refByCode = new Map<string, NutritionExchangeRef>()
  for (const group of groups) {
    if (refByCode.has(group.code)) continue
    refByCode.set(group.code, {
      calories: group.refCalories,
      proteinG: group.refProteinG,
      carbsG: group.refCarbsG,
      fatsG: group.refFatsG,
    })
  }

  return [...groups].sort(compareCatalogGroups).map((group) => {
    const parts = group.composedOf ?? null
    const resolved: NutritionExchangeComposedPart[] = []
    for (const part of parts ?? []) {
      const ref = refByCode.get(part.code)
      if (!ref) {
        resolved.length = 0
        break
      }
      resolved.push({ code: part.code, portions: part.portions, ref })
    }
    return {
      exchangeGroupId: group.id,
      groupCode: group.code,
      groupName: group.name,
      color: group.color,
      ref: {
        calories: group.refCalories,
        proteinG: group.refProteinG,
        carbsG: group.refCarbsG,
        fatsG: group.refFatsG,
      },
      composedOf: resolved.length > 0 ? resolved : null,
      macrosConfirmed: group.macrosConfirmed,
    }
  })
}

/**
 * Grupos que ofrece el picker de "Agregar grupo": primero los que el plan YA usa (snapshots
 * CONGELADOS del read model) y despues el resto del catalogo vivo del coach.
 *
 * El orden importa dos veces: (1) los grupos del plan conservan su indice, que es el que
 * alimenta el color de identidad de las filas, asi que cargar el catalogo no repinta nada;
 * (2) el mismo orden se usa para reconstruir el diccionario del engine — como
 * `reconstructExchangeGroups` deduplica por id quedandose con el PRIMERO, los snapshots del
 * plan siguen ganandole al catalogo vivo en los subtotales (invariante de la capa).
 *
 * `catalog === null` (no cargo o fallo la lectura) => exactamente los grupos del plan, o sea
 * el comportamiento previo: la degradacion es invisible.
 */
export function mergePortionGroupChoices(
  planGroups: readonly QePortionGroup[],
  catalog: readonly QePortionGroup[] | null,
): QePortionGroup[] {
  if (catalog === null || catalog.length === 0) return [...planGroups]
  const inPlan = new Set(planGroups.map((group) => group.exchangeGroupId))
  return [...planGroups, ...catalog.filter((group) => !inPlan.has(group.exchangeGroupId))]
}

function targetText(value: number | null): string {
  return value === null ? '' : String(value)
}

function hydrateVariant(variant: ReadVariant, subsByItemId: SubstitutionsByItemId): QeVariant {
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
    slots: variant.mealSlots.map((slot) => hydrateSlot(slot, subsByItemId)),
  }
}

/**
 * Arbol editable hidratado desde el read model de la ficha (null si no hay plan vigente).
 * `subsByItemId` inyecta los reemplazos autorizados de la version base (carry-over F-02):
 * el read-model no los transporta, asi que se fetchean aparte (RLS-scoped) y se pasan aca.
 * Ausente = plan sin capa de reemplazos (comportamiento previo, byte-identico).
 */
export function readModelToEditState(
  planModel: NutritionPlanReadModel,
  subsByItemId: SubstitutionsByItemId = {},
  options: {
    /**
     * Hidrata tambien los metadatos editables del plan (editor unico). Default false:
     * los callers del quick-edit clasico siguen produciendo el estado de siempre.
     */
    withMeta?: boolean
  } = {},
): QuickEditState | null {
  if (planModel.plan === null) return null
  return {
    variants: planModel.dayVariants.map((variant) => hydrateVariant(variant, subsByItemId)),
    visibleNotes: planModel.visibleNotes ?? '',
    ...(options.withMeta
      ? {
          meta: {
            name: planModel.plan.name,
            strategy: planModel.plan.strategy ?? 'flexible',
            permissions: planModel.permissions,
          },
        }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Hidratacion desde un DRAFT del contrato (modo CREACION del editor unico)
// ---------------------------------------------------------------------------

/**
 * Fuentes para resolver lo que el draft del contrato NO transporta: los items solo llevan
 * foodId/cantidad (sin nombre ni macros) y los targets de porciones solo exchangeGroupId
 * (sin snapshot de codigo/nombre/color). Ausencias degradan visible, nunca rompen:
 * alimento no resuelto = fila "Alimento" sin macros en vivo (el server re-deriva igual);
 * grupo no resuelto = "Grupo no disponible" que el coach puede quitar.
 */
export interface DraftHydrationSources {
  foodsById?: Record<string, BuilderFood>
  portionGroupsById?: Record<string, QePortionGroup>
}

function draftItemToQe(
  item: DraftItem,
  foodsById: Record<string, BuilderFood>,
  key: string,
): QeItem {
  const food = item.foodId ? (foodsById[item.foodId] ?? null) : null
  const isCustom = item.foodId === null && item.recipeId === null
  // Medida casera (W2, b11): el draft puede venir de dos lados. De `projectItem` llega YA en
  // `casera` con la cuenta escrita (no hay nada que convertir); de `readModelToDraft` —o de un
  // respaldo local viejo— llega en gramos con el par congelado, y ahi se rehidrata la cuenta,
  // igual que `hydrateItem`. `macroBase` es null en este camino (el alimento resuelto manda), asi
  // que la trampa de R1 no aplica aca.
  const householdGrams = item.householdGrams ?? null
  const householdLabel = item.householdLabel ?? null
  const householdCount =
    isHouseholdUnit(item.unit) || (householdLabel ?? '').trim().length === 0
      ? null
      : householdCountFromGrams(item.quantity, householdGrams)
  return {
    key,
    id: item.id ?? null,
    foodId: item.foodId,
    recipeId: item.recipeId,
    displayName: food?.name ?? item.customName ?? (item.recipeId ? 'Receta' : 'Alimento'),
    brand: food?.brand ?? null,
    quantity: householdCount === null ? String(item.quantity) : formatQuantityText(householdCount),
    unit: householdCount === null ? item.unit : HOUSEHOLD_UNIT,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    food,
    householdGrams,
    householdLabel,
    // Linaje W3.1: viaja EN el borrador (respaldo local, ida y vuelta de `projectItem`), asi que
    // restaurar un respaldo no pierde el ancestro. Un draft viejo (pre-W3) no trae la clave => null.
    sourceItemId: item.sourceItemId ?? null,
    macroBase: null,
    isCustom,
    media: food?.media ?? null,
    category: food?.category ?? null,
    substitutions: (item.substitutions ?? []).map((sub) => {
      // Mismo catalogo que resuelve el item prescrito: si el reemplazo esta ahi, la fila del
      // sheet puede mostrar su nombre y la cantidad equivalente. Ambos DISPLAY-ONLY.
      const subFood = sub.foodId ? (foodsById[sub.foodId] ?? null) : null
      return {
        foodId: sub.foodId,
        recipeId: sub.recipeId,
        customName: sub.customName,
        quantity: sub.quantity,
        unit: sub.unit,
        ...(subFood
          ? { displayName: subFood.name, displayMacros: qeSubstitutionMacrosFromFood(subFood) }
          : {}),
      }
    }),
  }
}

function draftTargetToQe(
  target: DraftExchangeTarget,
  groupsById: Record<string, QePortionGroup>,
  key: string,
): QePortionTarget {
  const group = groupsById[target.exchangeGroupId]
  return {
    key,
    id: target.id ?? null,
    exchangeGroupId: target.exchangeGroupId,
    groupCode: group?.groupCode ?? '?',
    groupName: group?.groupName ?? 'Grupo no disponible',
    color: group?.color ?? null,
    macrosConfirmed: group?.macrosConfirmed ?? false,
    portions: String(target.portions),
    notes: target.notes,
  }
}

/**
 * Ids sinteticos ESTABLES para un draft sin identidad (T3.2b, modo plantilla en EDICION:
 * `stripDraftIdentity` quito los ids al guardar la fila). Los contadores del paquete
 * (`countDraftChanges` y los locales de encabezado/orden) aparean variantes, franjas e items
 * POR `id`: sin ids, cada fila cuenta contra si misma como baja+alta y el editor abriria
 * "con cambios" sobre una plantilla intacta. Los ids viven SOLO en la sesion de edicion —
 * el guardado (`buildTemplatePayload`) los vuelve a strippear. Targets de porciones (aparean
 * por `exchangeGroupId`) y reemplazos (firma por contenido) no los necesitan.
 *
 * `idGen` inyectable: el llamador REAL es un server component (los ids nacen una vez y viajan
 * como props — deterministas para la hidratacion); un llamador que corra en SSR+cliente (el
 * harness) DEBE pasar un generador determinista o los ids difieren entre render de servidor y
 * de cliente (la familia de bug de EVA-NEXTJS-18).
 */
/**
 * UUID v4 RFC-4122 para los ids sinteticos de fila del draft.
 *
 * El fallback viejo emitia `synthetic-<base36>`, que NO es UUID — y los tres `id` del contrato
 * (`dayVariants[].id`, `mealSlots[].id`, `items[].id`) exigen `z.string().uuid()`. En Node y en
 * el navegador nunca se notaba porque `crypto.randomUUID` existe; en Hermes NO existe
 * (`globalThis.crypto` no lo define RN 0.81 ni el winter runtime de Expo 54, y `expo-crypto`
 * vive como modulo, jamas como global), asi que la app caia SIEMPRE al fallback: abrir una
 * plantilla para editarla y guardarla moria en el gate del cliente con «La plantilla tiene datos
 * invalidos», sin decir que campo, y «Reintentar» reintentaba el mismo fallo. Bucle cerrado: el
 * coach perdia el trabajo (QA del dueno 2026-08-18, reproducido con la zod del repo).
 *
 * Formato RFC identico al `newNutritionItemId` de `apps/mobile/lib/nutrition-v2-builder.ts`;
 * se duplica a proposito — este paquete es compartido y no puede importar de `apps/*`.
 * CI no lo cazaba porque en Node/vitest `crypto.randomUUID` SI existe.
 */
export function randomDraftRowId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // cae al fallback puro
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function withSyntheticDraftIds(
  draft: NutritionPlanDraft,
  idGen?: () => string,
): NutritionPlanDraft {
  const gen = idGen ?? randomDraftRowId
  return {
    ...draft,
    dayVariants: draft.dayVariants.map((variant) => ({
      ...variant,
      id: variant.id ?? gen(),
      mealSlots: variant.mealSlots.map((slot) => ({
        ...slot,
        id: slot.id ?? gen(),
        items: slot.items.map((item) => ({ ...item, id: item.id ?? gen() })),
      })),
    })),
  }
}

/**
 * Draft del contrato (plantilla, copia de plan, o blank) → arbol editable con `meta`.
 *
 * SOLO para el modo CREACION del editor unico (W1.5): la edicion del plan vigente sigue
 * hidratando del read model (`readModelToEditState`, macros congeladas + media). Los ids
 * del draft se conservan como keys cuando existen; el resto usa un contador local
 * determinista (estable dentro de una hidratacion, irrelevante entre hidrataciones).
 */
export function draftToEditState(
  draft: NutritionPlanDraft,
  sources: DraftHydrationSources = {},
  options: {
    /**
     * Fecha de vigencia inicial elegible (YYYY-MM-DD); null = hoy. Vive en `meta`.
     * AUSENTE = la vigencia no existe en esta superficie (modo PLANTILLA, T3.2b): `meta`
     * queda sin la llave y la card no pinta el campo — una plantilla no rige desde ninguna
     * fecha. Los modos de creacion pasan `null` explicito, como siempre.
     */
    effectiveFrom?: string | null
  } = {},
): QuickEditState {
  const foodsById = sources.foodsById ?? {}
  const groupsById = sources.portionGroupsById ?? {}
  let seq = 0
  const gen = (prefix: string): string => `${prefix}-${(seq += 1)}`

  return {
    variants: draft.dayVariants.map((variant): QeVariant => ({
      key: variant.id ?? gen('variant'),
      id: variant.id ?? null,
      variantKey: variant.key,
      label: variant.label,
      dayOfWeek: variant.dayOfWeek,
      isDefault: variant.default,
      targets: {
        calories: targetText(variant.targets.calories),
        proteinG: targetText(variant.targets.proteinG),
        carbsG: targetText(variant.targets.carbsG),
        fatsG: targetText(variant.targets.fatsG),
      },
      passthroughTargets: {
        fiberG: variant.targets.fiberG ?? null,
        sodiumMg: variant.targets.sodiumMg ?? null,
        waterMl: variant.targets.waterMl ?? null,
      },
      slots: variant.mealSlots.map((slot): QeSlot => ({
        key: slot.id ?? gen('slot'),
        id: slot.id ?? null,
        code: slot.code,
        name: slot.name,
        startTime: normalizeTimeHHMM(slot.startTime),
        endTime: normalizeTimeHHMM(slot.endTime) || null,
        mode: slot.mode,
        required: slot.required,
        instructions: slot.instructions,
        targets: slot.targets,
        items: slot.items.map((item) => draftItemToQe(item, foodsById, item.id ?? gen('item'))),
        portionTargets: (slot.exchangeTargets ?? []).map((target) =>
          draftTargetToQe(target, groupsById, target.id ?? gen('target')),
        ),
      })),
    })),
    visibleNotes: draft.visibleNotes ?? '',
    meta: {
      name: draft.name,
      strategy: draft.strategy,
      permissions: draft.permissions,
      ...(options.effectiveFrom === undefined ? {} : { effectiveFrom: options.effectiveFrom }),
    },
  }
}

/**
 * ¿Que estrategias puede elegir el coach desde el estado actual? `flexible` exige que NINGUN
 * dia tenga franjas: el read model del alumno en flexible es targets-only, y publicar franjas
 * que el alumno jamas veria es una perdida silenciosa. structured↔hybrid siempre se puede
 * (misma gramatica de franjas; hybrid ademas es feature Pro — el gate real es del server,
 * la UI solo pinta el candado).
 */
export function qeAllowedStrategies(state: QuickEditState): NutritionStrategy[] {
  const hasAnySlot = state.variants.some((variant) => variant.slots.length > 0)
  return hasAnySlot ? ['structured', 'hybrid'] : ['structured', 'flexible', 'hybrid']
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type QuickEditAction =
  | { type: 'SET_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'STEP_ITEM_QUANTITY'; variantKey: string; slotKey: string; itemKey: string; direction: 1 | -1 }
  | { type: 'SET_ITEM_UNIT'; variantKey: string; slotKey: string; itemKey: string; unit: string }
  /**
   * Cambia la unidad SIN convertir la cantidad: el camino «keep the number» del aviso de
   * plausibilidad (W1.3, mockup M1). La premisa del boton «Cambiar a 30 g» es que el numero
   * estaba bien y la unidad no — convertir ahi (como hace `SET_ITEM_UNIT`) daria 0,3 g y
   * volveria a equivocarse. Solo la despacha ese aviso, nunca el selector de unidad.
   */
  | { type: 'REINTERPRET_ITEM_UNIT'; variantKey: string; slotKey: string; itemKey: string; unit: string }
  | { type: 'SET_ITEM_NAME'; variantKey: string; slotKey: string; itemKey: string; value: string }
  | { type: 'SWAP_ITEM_FOOD'; variantKey: string; slotKey: string; itemKey: string; food: BuilderFood }
  | { type: 'REMOVE_ITEM'; variantKey: string; slotKey: string; itemKey: string }
  | { type: 'RESTORE_ITEM'; variantKey: string; slotKey: string; index: number; item: QeItem }
  /**
   * Mueve un item a OTRA franja del mismo dia ("Mover a…" del menu del item), espejo exacto de
   * `MOVE_ITEM` del wizard. `toIndex` fija la posicion de aterrizaje (la UI la usa para el
   * Deshacer: mover de vuelta al indice del que salio); ausente = al final.
   *
   * El `id` del item VIAJA con el: es la misma fila prescrita cambiando de franja, y en RN es la
   * llave del carry-over de reemplazos autorizados (mismo criterio que el dia clonado). La
   * persistencia lo ignora igual — cada publicacion inserta filas nuevas.
   */
  | { type: 'MOVE_ITEM'; variantKey: string; fromSlotKey: string; toSlotKey: string; itemKey: string; toIndex?: number }
  /**
   * Reordena un item DENTRO de su franja (W3b). `MOVE_ITEM` cubre solo el cruce de franjas;
   * el orden interno es la secuencia visible del plato y el draft lo proyecta por posicion
   * (`orderIndex`). Indice fuera de rango se clampa; sin movimiento real = estado intacto.
   */
  | { type: 'REORDER_ITEM'; variantKey: string; slotKey: string; itemKey: string; toIndex: number }
  /**
   * `prefill` = porcion pegajosa (T2.6 F4): la ultima cantidad que el coach uso para este
   * alimento, resuelta server-side con su precedencia (alumno > coach > catalogo). Ausente =
   * `servingSize` del catalogo, comportamiento de siempre. Sugiere, nunca decide.
   */
  | {
      type: 'ADD_CATALOG_ITEM'
      variantKey: string
      slotKey: string
      key: string
      food: BuilderFood
      prefill?: { quantity: string; unit: string }
    }
  | { type: 'ADD_CUSTOM_ITEM'; variantKey: string; slotKey: string; key: string }
  | { type: 'UPDATE_SLOT'; variantKey: string; slotKey: string; patch: Partial<Pick<QeSlot, 'name' | 'startTime'>> }
  /**
   * Nota del coach de la franja («el globito», N-A): edita `slot.instructions`, campo que
   * `UPDATE_SLOT` NO cubre (su patch es solo nombre/hora). Guarda el texto CRUDO (textarea
   * vivo); la proyeccion normaliza ''/espacios → null — misma gramatica que
   * `SET_PORTION_NOTES`, asi tipear solo espacios no cuenta como cambio ni publica basura.
   * Limpiar la nota = despachar con ''. Deshacer = re-despachar con el valor previo (o
   * `RESTORE_DRAFT` del arbol completo).
   */
  | { type: 'SET_SLOT_INSTRUCTIONS'; variantKey: string; slotKey: string; value: string }
  | { type: 'REMOVE_SLOT'; variantKey: string; slotKey: string }
  | { type: 'RESTORE_SLOT'; variantKey: string; index: number; slot: QeSlot }
  | { type: 'ADD_SLOT'; variantKey: string; key: string; name: string; startTime: string }
  /**
   * Copia de una franja a otros dias (P0-4), espejo exacto de `COPY_SLOT_TO_VARIANTS` del
   * wizard. Deshacer: el arbol previo con `RESTORE_DRAFT` (una copia toca N dias, ningun
   * `RESTORE_*` puntual la cubre).
   */
  | { type: 'COPY_SLOT_TO_VARIANTS'; sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] }
  | { type: 'ADD_VARIANT'; days: readonly number[]; source: 'clone' | 'empty' }
  | { type: 'REMOVE_VARIANT'; variantKey: string }
  | { type: 'RESTORE_VARIANT'; index: number; variant: QeVariant }
  | { type: 'SET_VARIANT_DAY'; variantKey: string; dayOfWeek: number }
  | { type: 'SET_VARIANT_LABEL'; variantKey: string; value: string }
  | { type: 'SET_TARGET'; variantKey: string; field: keyof QeTargetsText; value: string }
  | { type: 'STEP_TARGET'; variantKey: string; field: keyof QeTargetsText; direction: 1 | -1 }
  | { type: 'SET_VISIBLE_NOTES'; value: string }
  | { type: 'SET_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string; value: string }
  /**
   * Nota del target de porciones (T3.3a): capacidad que el quick-edit RN ya tenia en su
   * reducer paralelo y el superset absorbe al converger. Guarda el texto CRUDO (TextInput
   * vivo); la proyeccion normaliza ''/espacios → null, asi que tipear solo espacios no
   * cuenta como cambio ni publica basura.
   */
  | { type: 'SET_PORTION_NOTES'; variantKey: string; slotKey: string; targetKey: string; value: string }
  | { type: 'STEP_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string; direction: 1 | -1 }
  | { type: 'REMOVE_PORTION_TARGET'; variantKey: string; slotKey: string; targetKey: string }
  | { type: 'RESTORE_PORTION_TARGET'; variantKey: string; slotKey: string; index: number; target: QePortionTarget }
  | { type: 'ADD_PORTION_TARGET'; variantKey: string; slotKey: string; key: string; group: QePortionGroup }
  /**
   * Baja las porciones del dia base a los dias que se quedaron sin ellas (defecto B4). Sin
   * payload a proposito: los huecos se recalculan del estado en el momento de aplicar, asi
   * que jamas se copia contra un diagnostico viejo. Deshacer: `RESTORE_DRAFT` con el arbol
   * previo (toca N dias, ningun `RESTORE_*` puntual la cubre).
   */
  | { type: 'APPLY_BASE_PORTIONS' }
  // ── Capacidades wizard-only migradas al editor (W2). El quick-edit clasico no las
  //    despacha (los menus que las ofrecen se gatean a `state.meta`). ──
  /**
   * Agrega un reemplazo autorizado al item (espejo del wizard): mismo tope, sin duplicar el
   * mismo alimento ni ofrecer como reemplazo el propio alimento prescrito. Sin cantidad/unidad
   * (equivalencia por alimento, como en el wizard); el server congela nombre/macros al publicar.
   */
  | { type: 'ADD_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; food: BuilderFood }
  | { type: 'REMOVE_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; index: number }
  | { type: 'RESTORE_ITEM_SUBSTITUTION'; variantKey: string; slotKey: string; itemKey: string; index: number; sub: QeItemSubstitution }
  /**
   * Ajuste de macros del alimento (coach_food_overrides, T2.1) aplicado en vivo: patchea
   * TODAS las apariciones con `food` en mano (swap/alta). Los items hidratados del read model
   * (macroBase congelado, food null) no se tocan — mismo criterio que el quick-edit RN; el
   * server re-deriva de foods al publicar igual.
   */
  | { type: 'APPLY_FOOD_OVERRIDE'; foodId: string; macros: BuilderFoodMacrosPatch }
  /**
   * Duplica un dia ESPECIFICO (con sus metas y franjas) como otro dia de la semana — espejo
   * de `DUPLICATE_VARIANT_AS` del wizard. `ADD_VARIANT` solo clona el dia base; esto permite
   * "duplicar el sabado como domingo". `variantKey` lo genera el llamador (reducer puro).
   */
  | { type: 'DUPLICATE_VARIANT_AS'; sourceVariantKey: string; dayOfWeek: number; variantKey: string }
  /**
   * Copia un dia a VARIOS dias en un gesto (T2.6 F2, decision D2) — port ATOMICO del combo del
   * wizard (`REMOVE_VARIANT`+`DUPLICATE_VARIANT_AS` / `APPEND_VARIANT_SLOTS_TO` en cola): aca
   * las porciones viven dentro del arbol, asi que una sola accion cubre todo.
   *  - `replace`: el destino queda IGUAL al origen en contenido (franjas, items, porciones y
   *    metas) pero CONSERVA su identidad (key/id/etiqueta/dia) — no rompe el diff ni pisa el
   *    nombre que el coach le puso al dia.
   *  - `append`: las franjas del origen se SUMAN a las del destino (puede duplicar nombres;
   *    la UI avisa ANTES via `copyPlanWarning`).
   *  - Dia libre: se CREA clonando el origen elegido (no el base).
   * Copiar sobre si mismo o a un dow invalido/repetido se ignora. Deshacer = `RESTORE_DRAFT`
   * del arbol previo (toca N dias; ningun RESTORE_* puntual lo cubre). `keySeed` del llamador.
   */
  | {
      type: 'COPY_VARIANT_TO_DAYS'
      sourceVariantKey: string
      days: readonly number[]
      mode: 'replace' | 'append'
      keySeed: string
    }
  // ── Metadatos del plan (solo con state.meta presente; no-op en el quick-edit clasico) ──
  | { type: 'SET_PLAN_NAME'; value: string }
  | { type: 'SET_STRATEGY'; value: NutritionStrategy }
  | { type: 'SET_PERMISSION'; patch: Partial<NutritionStudentPermissions> }
  | { type: 'SET_EFFECTIVE_FROM'; value: string | null }
  | { type: 'RESET'; state: QuickEditState }
  | { type: 'RESTORE_DRAFT'; state: QuickEditState }

/**
 * Paso del stepper de cantidad: 5 para g/ml, 0.5 para unidad/porcion y para la medida casera
 * (NN/g, nunca slider). «Medio huevo» y «media taza» existen; «+5 huevos» por tap, no (b12).
 */
export function quantityStep(unit: string): number {
  if (isHouseholdUnit(unit)) return 0.5
  return unit.toLowerCase() === 'un' ? 0.5 : 5
}

/** Paso del stepper de metas: 50 kcal, 5 g para macros. */
export function targetStep(field: keyof QeTargetsText): number {
  return field === 'calories' ? 50 : 5
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Suma `direction*step` sobre el texto actual; cantidades nunca bajan de un valor > 0.
 * El texto de salida lo formatea `formatQuantityText` (./unit-change.ts): es LA convencion de
 * cantidad del editor y el cambio de unidad tiene que escribir igual que el stepper.
 */
export function stepQuantityText(current: string, step: number, direction: 1 | -1): string {
  const n = Number(current.trim())
  const base = Number.isFinite(n) && n > 0 ? n : 0
  const next = round1(base + direction * step)
  if (next <= 0) return current
  return formatQuantityText(next)
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
  // Spread OBLIGATORIO: el estado tiene campos hermanos de `variants` (visibleNotes);
  // reconstruir solo `{ variants }` los perderia en silencio en cada edicion.
  return { ...state, variants: state.variants.map((v) => (v.key === variantKey ? fn(v) : v)) }
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
  // W2 (b13): con medida casera el alta arranca en «1 huevo», no en «61 g». Es la unidad que el
  // coach entiende y la que evita el «1 un = 100 g» que nadie leia. Sin medida, todo igual que antes.
  const unit = normalizeBuilderUnit(food)
  const isHousehold = unit === HOUSEHOLD_UNIT
  return {
    key,
    id: null,
    foodId: food.id,
    recipeId: null,
    displayName: food.name,
    brand: food.brand,
    quantity: isHousehold ? '1' : String(food.servingSize || 100),
    unit,
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food,
    householdGrams: isHousehold ? food.householdGrams : null,
    householdLabel: isHousehold ? food.householdLabel : null,
    // Item NUEVO: no es copia de nada (W3.1). El alumno no puede tener un registro sobre el.
    sourceItemId: null,
    macroBase: null,
    isCustom: false,
    media: food.media ?? null,
    category: food.category ?? null,
    // Item nuevo del quick-edit: sin reemplazos (F1 no los edita aca).
    substitutions: [],
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
    // Un alimento LIBRE no tiene catalogo del que copiar una medida casera.
    householdGrams: null,
    householdLabel: null,
    // Item NUEVO: no es copia de nada (W3.1).
    sourceItemId: null,
    macroBase: null,
    isCustom: true,
    media: null,
    category: null,
    substitutions: [],
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

// ---------------------------------------------------------------------------
// Variantes de dia (FD5): alta multi-dia, baja, cambio de dia y renombre
//
// El backend YA soporta N variantes por version (`nutrition_day_variants_v2`, contrato
// `min(1)` sin tope, snapshot que elige por fecha), pero hasta aca ninguna superficie las
// podia CREAR. El quick-edit ya editaba N variantes; lo que faltaba era el alta/baja.
//
// Invariantes que este modulo sostiene (espejo de los del builder y de la base):
//  - exactamente UNA variante default (indice unico `..._default_unique` en la DB): las
//    variantes nuevas nunca son default y la default no se elimina ni cambia de dia;
//  - `dayOfWeek` unico entre las variantes especificas (la resolucion del snapshot es
//    "match exacto gana, si no cae al default": dos variantes del mismo dia serian un
//    empate no determinista);
//  - `variantKey` unico dentro de la version (`unique (version_id, variant_key)`).
//
// Los ids de franja/item del dia CLONADO se conservan a proposito: la persistencia los
// IGNORA (cada publicacion inserta filas nuevas — ver `buildVariantInsertRow` /
// `buildPersistDraftPayload`) y en RN son la llave del carry-over de reemplazos
// autorizados, asi que el dia clonado hereda tambien esa capa. Las keys de UI si se
// re-generan (prefijadas por la key de la variante nueva) para que el reducer nunca
// confunda dos filas homonimas de dias distintos.
// ---------------------------------------------------------------------------

/** Posicion del dia en la lectura Lu→Do (para ordenar altas multiples de forma estable). */
function weekRank(dayOfWeek: number): number {
  const index = NUTRITION_WEEK_ORDER.indexOf(dayOfWeek as (typeof NUTRITION_WEEK_ORDER)[number])
  return index < 0 ? NUTRITION_WEEK_ORDER.length : index
}

function isValidDow(dayOfWeek: number): boolean {
  return Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6
}

/** Dias de semana ya reclamados por una variante especifica (la base no reclama ninguno). */
export function takenDayVariantDows(state: QuickEditState): Set<number> {
  const taken = new Set<number>()
  for (const variant of state.variants) {
    if (variant.dayOfWeek != null) taken.add(variant.dayOfWeek)
  }
  return taken
}

/** Variante base (default) del estado; null si el plan no tiene ninguna (dato invalido). */
export function defaultQeVariant(state: QuickEditState): QeVariant | null {
  return state.variants.find((variant) => variant.isDefault) ?? null
}

/** Clave de variante unica dentro de la version: 'dia-6' (y 'dia-6-2' si ya existiera). */
export function buildDayVariantKey(existingKeys: ReadonlySet<string>, dayOfWeek: number): string {
  const base = `dia-${dayOfWeek}`
  if (!existingKeys.has(base)) return base
  let suffix = 2
  while (existingKeys.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** Etiqueta automatica del dia ("Sábado"); fallback defensivo si el dow no es valido. */
export function autoDayVariantLabel(dayOfWeek: number): string {
  return formatNutritionDayOfWeek(dayOfWeek) ?? 'Día específico'
}

function cloneQeItem(item: QeItem, keyPrefix: string): QeItem {
  return {
    ...item,
    key: `${keyPrefix}:${item.key}`,
    // Linaje W3.1: una copia a OTRO dia (o a otra franja) no es el mismo item del alumno —
    // los registros de hoy cuelgan de la franja original. Copiar dia / copiar plan / plantilla
    // arrancan siempre sin ancestro.
    sourceItemId: null,
    food: item.food ? { ...item.food } : null,
    macroBase: item.macroBase ? { quantity: item.macroBase.quantity, macros: { ...item.macroBase.macros } } : null,
    substitutions: item.substitutions.map((sub) => ({ ...sub })),
  }
}

function cloneQeSlot(slot: QeSlot, keyPrefix: string): QeSlot {
  return {
    ...slot,
    key: `${keyPrefix}:${slot.key}`,
    targets: { ...slot.targets },
    items: slot.items.map((item) => cloneQeItem(item, keyPrefix)),
    portionTargets: slot.portionTargets.map((target) => ({ ...target, key: `${keyPrefix}:${target.key}` })),
  }
}

/**
 * Dia nuevo clonando el contenido del dia base (franjas, items, porciones y metas). Nunca
 * default; la etiqueta arranca con el nombre del dia y es renombrable.
 */
export function cloneQeVariantForDay(source: QeVariant, dayOfWeek: number, variantKey: string): QeVariant {
  return {
    key: variantKey,
    id: null,
    variantKey,
    label: autoDayVariantLabel(dayOfWeek),
    dayOfWeek,
    isDefault: false,
    targets: { ...source.targets },
    passthroughTargets: { ...source.passthroughTargets },
    slots: source.slots.map((slot) => cloneQeSlot(slot, variantKey)),
  }
}

/**
 * Dia nuevo VACIO (sin franjas). Las metas se heredan del dia base igual que en el clon
 * (SPEC: "metas de dia especifico heredan el base salvo personalizacion explicita").
 */
export function createEmptyQeVariantForDay(source: QeVariant, dayOfWeek: number, variantKey: string): QeVariant {
  return {
    key: variantKey,
    id: null,
    variantKey,
    label: autoDayVariantLabel(dayOfWeek),
    dayOfWeek,
    isDefault: false,
    targets: { ...source.targets },
    passthroughTargets: { ...source.passthroughTargets },
    slots: [],
  }
}

/**
 * Alta de uno o varios dias (ej. Sa+Do en un solo gesto). Ignora en silencio los dias
 * invalidos o ya ocupados: el picker los deshabilita, esto es el cinturon del reducer.
 * Sin dia base no hay de donde clonar => estado intacto.
 */
function addDayVariants(state: QuickEditState, days: readonly number[], source: 'clone' | 'empty'): QuickEditState {
  const base = defaultQeVariant(state)
  if (!base) return state
  const taken = takenDayVariantDows(state)
  const keys = new Set(state.variants.map((variant) => variant.variantKey))
  const ordered = [...new Set(days)].sort((a, b) => weekRank(a) - weekRank(b))
  const added: QeVariant[] = []
  for (const dayOfWeek of ordered) {
    if (!isValidDow(dayOfWeek) || taken.has(dayOfWeek)) continue
    const variantKey = buildDayVariantKey(keys, dayOfWeek)
    keys.add(variantKey)
    taken.add(dayOfWeek)
    added.push(
      source === 'clone'
        ? cloneQeVariantForDay(base, dayOfWeek, variantKey)
        : createEmptyQeVariantForDay(base, dayOfWeek, variantKey),
    )
  }
  if (added.length === 0) return state
  return { ...state, variants: [...state.variants, ...added] }
}

// ---------------------------------------------------------------------------
// Copia de una franja a otros dias (P0-4). Misma semantica que el wizard: clona la franja
// COMPLETA (nombre, hora, items con todos sus campos, reemplazos y porciones) y, por nombre
// normalizado (`slotMergeName`, compartido con el builder), REEMPLAZA la franja homonima del
// dia destino conservando su posicion o la AGREGA al final. El dia de origen jamas se toca y
// aplicarla dos veces deja la misma estructura.
// ---------------------------------------------------------------------------

/** Key libre dentro del dia: la deseada, o con sufijo `-2`, `-3`… si ya esta ocupada. */
function uniqueSlotKeyIn(taken: ReadonlySet<string>, desired: string): string {
  if (!taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(`${desired}-${suffix}`)) suffix += 1
  return `${desired}-${suffix}`
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
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** Item copiado a otro dia: fila NUEVA (sin `id`) con keys de UI propias. */
function copiedQeItem(item: QeItem, keyPrefix: string): QeItem {
  return { ...cloneQeItem(item, keyPrefix), id: null }
}

/**
 * Contenido de la franja origen bajado sobre una franja destino. `identity` es la identidad
 * que conserva el destino: al REEMPLAZAR viaja la de la franja pisada (misma posicion, mismo
 * `id` — el contador lo lee como franja tocada, no como baja+alta); al AGREGAR es nueva.
 * Los items y targets de porciones siempre nacen sin `id` (filas nuevas del dia destino).
 */
function copiedQeSlot(source: QeSlot, identity: { key: string; id: string | null; code: string }): QeSlot {
  return {
    ...source,
    key: identity.key,
    id: identity.id,
    code: identity.code,
    targets: { ...source.targets },
    items: source.items.map((item) => copiedQeItem(item, identity.key)),
    portionTargets: source.portionTargets.map((target) => ({
      ...target,
      key: `${identity.key}:${target.key}`,
      id: null,
    })),
  }
}

function copySlotToVariants(
  state: QuickEditState,
  params: { sourceVariantKey: string; slotKey: string; targetVariantKeys: readonly string[] },
): QuickEditState {
  const source = state.variants.find((variant) => variant.key === params.sourceVariantKey)
  const sourceSlot = source?.slots.find((slot) => slot.key === params.slotKey)
  if (!source || !sourceSlot) return state
  // Dias destino validos: sin repetidos, sin inexistentes y NUNCA el propio origen.
  const wanted = new Set(params.targetVariantKeys.filter((key) => key !== params.sourceVariantKey))
  if (wanted.size === 0) return state
  const mergeName = slotMergeName(sourceSlot.name)
  let touched = false
  const variants = state.variants.map((variant) => {
    if (!wanted.has(variant.key)) return variant
    touched = true
    const index = variant.slots.findIndex((slot) => slotMergeName(slot.name) === mergeName)
    if (index >= 0) {
      const destination = variant.slots[index]
      const slots = [...variant.slots]
      slots[index] = copiedQeSlot(sourceSlot, {
        key: destination.key,
        id: destination.id,
        code: destination.code,
      })
      return { ...variant, slots }
    }
    const key = uniqueSlotKeyIn(
      new Set(variant.slots.map((slot) => slot.key)),
      `${variant.key}:${sourceSlot.key}`,
    )
    const code = uniqueSlotCode(new Set(variant.slots.map((slot) => slot.code)), sourceSlot.code)
    return { ...variant, slots: [...variant.slots, copiedQeSlot(sourceSlot, { key, id: null, code })] }
  })
  return touched ? { ...state, variants } : state
}

/** Un dia candidato de "copiar la franja a otros dias" (fila del multi-select). */
export interface QeSlotCopyTarget {
  variantKey: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  /** Ese dia YA tiene una franja con el mismo nombre: la copia la REEMPLAZA (no duplica). */
  replaces: boolean
}

/**
 * Dias a los que se puede copiar una franja, en el MISMO orden de lectura de la pantalla
 * (base primero, luego Lu→Do) y sin el dia de origen. `replaces` se resuelve con la misma
 * regla de emparejamiento que aplicara el reducer (`slotMergeName`), calculada aca para que
 * la UI no la reimplemente y el aviso "Reemplaza" nunca mienta.
 */
export function qeSlotCopyTargets(
  state: QuickEditState,
  sourceVariantKey: string,
  slotKey: string,
): QeSlotCopyTarget[] {
  const source = state.variants.find((variant) => variant.key === sourceVariantKey)
  const sourceSlot = source?.slots.find((slot) => slot.key === slotKey)
  if (!source || !sourceSlot) return []
  const mergeName = slotMergeName(sourceSlot.name)
  return sortNutritionDayVariantsForDisplay(state.variants)
    .filter((variant) => variant.key !== sourceVariantKey)
    .map((variant) => ({
      variantKey: variant.key,
      label: variant.label,
      dayOfWeek: variant.dayOfWeek,
      isDefault: variant.isDefault,
      replaces: variant.slots.some((slot) => slotMergeName(slot.name) === mergeName),
    }))
}

// ---------------------------------------------------------------------------
// Porciones huerfanas: los dias que se quedaron SIN las porciones del dia base (defecto B4,
// 2026-08-03). Es el MISMO defecto que el builder ya avisa: las porciones pertenecen a la
// franja de UN dia, asi que cargarlas en el base y publicar deja a los dias asignados sin
// ninguna y el alumno no ve nada. El quick-edit tambien crea dias (FD5), asi que tambien lo
// puede provocar; hasta ahora era la unica superficie sin la señal.
//
// La logica de diagnostico NO se reimplementa: se proyecta el arbol editable a la forma que
// consume `daysMissingBasePortions` (mapa `variantKey::slotKey` + dias con nombres de franja).
// ---------------------------------------------------------------------------

/**
 * Proyeccion del arbol editable a la forma de porciones del builder. `map` solo lleva las
 * franjas con porciones VALIDAS (>0): una porcion vacia o mal escrita no cuenta como cargada
 * (y ya bloquea el publish por validacion), asi que jamas se reporta como "el dia si las
 * tiene".
 */
export function qePortionsProjection(variants: readonly QeVariant[]): {
  map: PortionsBySlot
  days: PortionsDayLike[]
} {
  const map: PortionsBySlot = {}
  const days: PortionsDayLike[] = []
  for (const variant of variants) {
    days.push({
      key: variant.key,
      isDefault: variant.isDefault,
      slots: variant.slots.map((slot) => ({ key: slot.key, name: slot.name })),
    })
    for (const slot of variant.slots) {
      const targets = slot.portionTargets
        .map((target) => ({
          exchangeGroupId: target.exchangeGroupId,
          portions: parsePortionsValue(target.portions) ?? 0,
        }))
        .filter((target) => target.portions > 0)
      if (targets.length === 0) continue
      map[portionsKey(variant.key, slot.key)] = targets
    }
  }
  return { map, days }
}

/** Dias del quick-edit que se quedaron sin las porciones del dia base (con sus pares copiables). */
export function qeDaysMissingBasePortions(variants: readonly QeVariant[]): PortionsDayGap[] {
  const { map, days } = qePortionsProjection(variants)
  return daysMissingBasePortions(map, days)
}

/**
 * Baja las porciones del dia base a los dias con hueco, franja homonima por franja homonima
 * (`slotKeyPairs` del diagnostico). Solo AGREGA: una franja que ya tiene porciones propias es
 * una decision del coach y no se pisa. Los targets copiados nacen como filas nuevas (`id`
 * null, keys de UI propias), igual que en `copiedQeSlot`.
 *
 * Determinista e idempotente: tras aplicarla no queda ningun hueco copiable, asi que
 * despacharla de nuevo devuelve el MISMO estado (misma referencia).
 */
function applyBasePortions(state: QuickEditState): QuickEditState {
  const base = defaultQeVariant(state)
  if (!base) return state
  const copiables = qeDaysMissingBasePortions(state.variants).filter((gap) => gap.slotKeyPairs.length > 0)
  if (copiables.length === 0) return state
  const pairsByVariant = new Map(copiables.map((gap) => [gap.variantKey, gap.slotKeyPairs]))
  const baseSlots = new Map(base.slots.map((slot) => [slot.key, slot]))
  let touched = false
  const variants = state.variants.map((variant) => {
    const pairs = pairsByVariant.get(variant.key)
    if (!pairs) return variant
    let variantTouched = false
    const slots = variant.slots.map((slot) => {
      // Cinturon: el diagnostico ya excluye las franjas con porciones propias.
      if (slot.portionTargets.length > 0) return slot
      const pair = pairs.find((candidate) => candidate.to === slot.key)
      const source = pair == null ? undefined : baseSlots.get(pair.from)
      if (!source || source.portionTargets.length === 0) return slot
      variantTouched = true
      return {
        ...slot,
        portionTargets: source.portionTargets.map((target) => ({
          ...target,
          key: `${slot.key}:${target.key}`,
          id: null,
        })),
      }
    })
    if (!variantTouched) return variant
    touched = true
    return { ...variant, slots }
  })
  return touched ? { ...state, variants } : state
}

/**
 * Unidad inicial de un alimento recien agregado (b13). Delega en `defaultFoodUnit` (paquete),
 * que prefiere la medida casera cuando existe —incluso en un alimento nativo `un` (R7)— y si no
 * cae en la unidad del alimento o su magnitud, exactamente como antes.
 */
function normalizeBuilderUnit(food: BuilderFood): string {
  return defaultFoodUnit(food)
}

/**
 * Par casero que debe quedar en el item al MOVERSE a `unit` (b14, W2).
 *
 * Al ENTRAR en `casera` se copia del alimento: es el gesto por el que el coach autoriza la
 * medida, y desde ahi la fila deja de depender del catalogo vivo.
 *
 * Al SALIR el par se CONSERVA (decision de esta implementacion, la SPEC no la fija). Dos razones:
 * el rotulo «122 g (2 huevos)» sigue siendo cierto, y volver a la medida casera desde el selector
 * no obliga a re-resolver el alimento. Lo que decide si el par se persiste NO es esto sino la
 * unidad final: `buildItemInsertRow` congela el par SOLO cuando el item se publica en `casera`.
 */
function householdPairForUnit(
  item: QeItem,
  unit: string,
): Pick<QeItem, 'householdGrams' | 'householdLabel'> {
  if (!isHouseholdUnit(unit)) {
    return { householdGrams: item.householdGrams, householdLabel: item.householdLabel }
  }
  return {
    householdGrams: item.food?.householdGrams ?? item.householdGrams,
    householdLabel: item.food?.householdLabel ?? item.householdLabel,
  }
}

/** Par casero tras un swap de alimento: el del alimento NUEVO, o baja a gramos si no tiene. */
function swapHouseholdPair(
  item: QeItem,
  food: BuilderFood,
): Pick<QeItem, 'householdGrams' | 'householdLabel' | 'unit' | 'quantity'> {
  const hasPair =
    typeof food.householdGrams === 'number' && food.householdGrams > 0 && (food.householdLabel ?? '').trim().length > 0
  if (hasPair) {
    return {
      householdGrams: food.householdGrams,
      householdLabel: food.householdLabel,
      unit: item.unit,
      // En `casera` la CUENTA se conserva («2 huevos» ⇒ «2 rebanadas»): es la misma decision
      // que toma el swap con el resto de las unidades, que tampoco recalcula la cantidad.
      quantity: item.quantity,
    }
  }
  if (!isHouseholdUnit(item.unit)) {
    return { householdGrams: null, householdLabel: null, unit: item.unit, quantity: item.quantity }
  }
  const grams = convertQuantityTextOnUnitChange({
    quantity: item.quantity,
    fromUnit: item.unit,
    toUnit: foodMagnitudeUnit(food.servingUnit),
    food: { servingSize: item.food?.servingSize ?? food.servingSize, householdGrams: item.householdGrams },
  })
  return {
    householdGrams: null,
    householdLabel: null,
    unit: foodMagnitudeUnit(food.servingUnit),
    quantity: grams,
  }
}

export function quickEditReducer(state: QuickEditState, action: QuickEditAction): QuickEditState {
  switch (action.type) {
    case 'SET_ITEM_QUANTITY':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        // W3.1: otra cantidad = otra comida => el linaje se ANULA (el registro de hoy sobre el
        // item viejo queda huerfano a proposito). Escribir el MISMO texto no es una edicion:
        // sin este guard, un re-dispatch del tap-to-edit (foco/blur) mataria el linaje en silencio.
        action.value === item.quantity
          ? item
          : { ...item, quantity: action.value, sourceItemId: null },
      )
    case 'STEP_ITEM_QUANTITY':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => {
        const quantity = stepQuantityText(item.quantity, quantityStep(item.unit), action.direction)
        // Mismo criterio que SET_ITEM_QUANTITY: el stepper topado (clamp al minimo) no cambia
        // nada, y lo que no cambia no rompe el linaje.
        return quantity === item.quantity ? item : { ...item, quantity, sourceItemId: null }
      })
    case 'SET_ITEM_UNIT':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        // El cambio de unidad solo es confiable con macros por 100 en mano (food del catalogo).
        // Con alimento, la cantidad SE CONVIERTE (W1.1): dejar "30" y pasar de g a `un` publicaba
        // 30 porciones de 100 g. Si la conversion no es representable el numero queda intacto
        // (SPEC §4.1) y el aviso de plausibilidad se ocupa.
        item.food && action.unit !== item.unit
          ? {
              ...item,
              unit: action.unit,
              // W3.1: cambiar de unidad CONVIERTE la cantidad (W1.1) => el item deja de ser el
              // mismo y pierde el linaje. Elegir la unidad que ya tenia no es un cambio: el
              // guard de arriba deja la fila intacta, linaje incluido.
              sourceItemId: null,
              quantity: convertQuantityTextOnUnitChange({
                quantity: item.quantity,
                fromUnit: item.unit,
                toUnit: action.unit,
                // El gramaje casero sale del PAR del item si ya lo tiene, y si no del alimento
                // (b14): sin el, pasar de g a `casera` dejaba el numero de gramos escrito.
                food: {
                  servingSize: item.food.servingSize,
                  householdGrams: item.householdGrams ?? item.food.householdGrams,
                },
              }),
              ...householdPairForUnit(item, action.unit),
            }
          : item,
      )
    case 'REINTERPRET_ITEM_UNIT':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        // Mismo guard que `SET_ITEM_UNIT` (sin alimento la unidad no se toca), pero la cantidad
        // se DEJA COMO ESTA: es el "quise decir 30 gramos" del aviso de plausibilidad. Con
        // destino `casera` es el «Usar huevos» de W2.5, y ahi el par SI se copia del alimento.
        // W3.1: reinterpretar es declarar que el item prescrito decia OTRA cosa (30 un que eran
        // 30 g) => el registro de hoy no describe esta fila y el linaje se anula.
        item.food && action.unit !== item.unit
          ? { ...item, unit: action.unit, sourceItemId: null, ...householdPairForUnit(item, action.unit) }
          : item,
      )
    case 'SET_ITEM_NAME':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) =>
        // W3.1: renombrar un alimento libre cambia lo que el alumno lee => otro item. Reescribir
        // el mismo texto no (mismo guard que la cantidad, por el re-dispatch del input).
        item.isCustom && action.value !== item.displayName
          ? { ...item, displayName: action.value, sourceItemId: null }
          : item,
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
        // La medida casera es del ALIMENTO: al cambiarlo, el par viejo caduca (W2). Si el item
        // estaba en `casera` y el alimento nuevo no tiene medida, la fila baja a gramos con la
        // medida VIEJA (la equivalencia que el coach ya habia aceptado) en vez de quedar en una
        // unidad que ese alimento no sabe resolver: sin esto `qeItemMacros` daria cero.
        ...swapHouseholdPair(item, action.food),
        // W3.1: otro alimento es, por definicion, otra comida => sin linaje.
        sourceItemId: null,
        macroBase: null,
        isCustom: false,
        media: action.food.media ?? null,
        category: action.food.category ?? null,
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
    case 'MOVE_ITEM': {
      if (action.fromSlotKey === action.toSlotKey) return state
      const variant = state.variants.find((candidate) => candidate.key === action.variantKey)
      if (!variant) return state
      const source = variant.slots.find((slot) => slot.key === action.fromSlotKey)
      const moved = source?.items.find((item) => item.key === action.itemKey)
      // Destino inexistente => no-op TOTAL (jamas se pierde el item).
      if (!moved || !variant.slots.some((slot) => slot.key === action.toSlotKey)) return state
      // W3.1: los registros del alumno cuelgan de la FRANJA ademas del item; mudar el item de
      // franja lo vuelve otra comida del dia => sin linaje. Reordenar DENTRO de la franja
      // (`REORDER_ITEM`) no toca nada y lo conserva.
      const movedItem: QeItem = { ...moved, sourceItemId: null }
      return mapVariant(state, action.variantKey, (current) => ({
        ...current,
        slots: current.slots.map((slot) => {
          if (slot.key === action.fromSlotKey) {
            return { ...slot, items: slot.items.filter((item) => item.key !== action.itemKey) }
          }
          if (slot.key !== action.toSlotKey) return slot
          return { ...slot, items: insertAt(slot.items, action.toIndex ?? slot.items.length, movedItem) }
        }),
      }))
    }
    case 'REORDER_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => {
        const fromIndex = slot.items.findIndex((item) => item.key === action.itemKey)
        if (fromIndex < 0) return slot
        const toIndex = Math.max(0, Math.min(slot.items.length - 1, action.toIndex))
        if (toIndex === fromIndex) return slot
        const items = [...slot.items]
        const [moved] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, moved!)
        return { ...slot, items }
      })
    case 'ADD_CATALOG_ITEM': {
      const created = createCatalogItem(action.key, action.food)
      // Porcion pegajosa (T2.6 F4): la memoria pisa la precarga del catalogo, nada mas.
      const item = action.prefill
        ? { ...created, quantity: action.prefill.quantity, unit: action.prefill.unit }
        : created
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: [...slot.items, item],
      }))
    }
    case 'ADD_CUSTOM_ITEM':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        items: [...slot.items, createCustomItem(action.key)],
      }))
    case 'UPDATE_SLOT':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({ ...slot, ...action.patch }))
    case 'SET_SLOT_INSTRUCTIONS':
      return mapSlot(state, action.variantKey, action.slotKey, (slot) => ({
        ...slot,
        instructions: action.value,
      }))
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
    case 'COPY_SLOT_TO_VARIANTS':
      return copySlotToVariants(state, action)
    case 'SET_PORTION_TARGET':
      return mapPortionTarget(state, action.variantKey, action.slotKey, action.targetKey, (target) => ({
        ...target,
        portions: action.value,
      }))
    case 'SET_PORTION_NOTES':
      return mapPortionTarget(state, action.variantKey, action.slotKey, action.targetKey, (target) => ({
        ...target,
        notes: action.value,
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
    case 'APPLY_BASE_PORTIONS':
      return applyBasePortions(state)
    case 'SET_VISIBLE_NOTES':
      return { ...state, visibleNotes: action.value }
    case 'ADD_VARIANT':
      return addDayVariants(state, action.days, action.source)
    case 'REMOVE_VARIANT':
      // La variante base es intocable (el snapshot cae a ella los dias sin plan propio).
      return {
        ...state,
        variants: state.variants.filter(
          (variant) => variant.isDefault || variant.key !== action.variantKey,
        ),
      }
    case 'RESTORE_VARIANT':
      return { ...state, variants: insertAt(state.variants, action.index, action.variant) }
    case 'SET_VARIANT_DAY': {
      const target = state.variants.find((variant) => variant.key === action.variantKey)
      if (!target || target.isDefault || !isValidDow(action.dayOfWeek)) return state
      // Unicidad de dia: el picker deshabilita los ocupados; esto es el cinturon.
      if (state.variants.some((variant) => variant.key !== action.variantKey && variant.dayOfWeek === action.dayOfWeek)) {
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
    case 'ADD_ITEM_SUBSTITUTION':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => {
        const subs = item.substitutions ?? []
        // Cinturon (espejo del wizard): tope, sin duplicar el mismo alimento, y el propio
        // alimento prescrito jamas es su reemplazo. La UI ya lo evita; esto lo garantiza.
        if (subs.length >= MAX_ITEM_SUBSTITUTIONS) return item
        if (subs.some((sub) => sub.foodId === action.food.id)) return item
        if (item.foodId === action.food.id) return item
        return {
          ...item,
          substitutions: [
            ...subs,
            {
              foodId: action.food.id,
              recipeId: null,
              customName: null,
              quantity: null,
              unit: null,
              displayName: action.food.name,
              // Macros VIGENTES (el picker ya entrega el alimento con el override aplicado):
              // es lo que deja mostrar la cantidad equivalente en la fila. Display-only.
              displayMacros: qeSubstitutionMacrosFromFood(action.food),
            },
          ],
        }
      })
    case 'REMOVE_ITEM_SUBSTITUTION':
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => ({
        ...item,
        substitutions: (item.substitutions ?? []).filter((_, index) => index !== action.index),
      }))
    case 'RESTORE_ITEM_SUBSTITUTION':
      // Deshacer del quitar (T2.6 F1): restituye en el indice original. Idempotente: si el
      // mismo reemplazo ya volvio (doble clic en Deshacer), no-op — jamas duplicar.
      return mapItem(state, action.variantKey, action.slotKey, action.itemKey, (item) => {
        const subs = item.substitutions ?? []
        if (subs.some((sub) => sameSubstitution(sub, action.sub))) return item
        return { ...item, substitutions: insertAt(subs, action.index, action.sub) }
      })
    case 'APPLY_FOOD_OVERRIDE': {
      const { foodId, macros } = action
      /**
       * El mismo alimento puede estar prescrito Y autorizado como reemplazo de otro item: si la
       * correccion no bajara tambien a la carga de display del reemplazo, la fila del sheet
       * seguiria mostrando la cantidad equivalente calculada con los macros viejos — justo el
       * numero que el coach acaba de declarar equivocado. Solo toca campos DISPLAY-ONLY
       * (`displayMacros`), asi que la proyeccion al draft y el contador de cambios no se mueven.
       */
      const patchSubstitution = (sub: QeItemSubstitution): QeItemSubstitution =>
        sub.foodId === foodId && sub.displayMacros
          ? {
              ...sub,
              displayMacros: {
                ...sub.displayMacros,
                calories: macros.calories,
                proteinG: macros.proteinG,
                carbsG: macros.carbsG,
                fatsG: macros.fatsG,
                fiberG: macros.fiberG,
                macrosBasis: macros.macrosBasis ?? null,
              },
            }
          : sub
      return {
        ...state,
        variants: state.variants.map((variant) => ({
          ...variant,
          slots: variant.slots.map((slot) => ({
            ...slot,
            items: slot.items.map((item) => {
              const food = item.food && item.food.id === foodId ? { ...item.food, ...macros } : item.food
              const subs = item.substitutions ?? []
              const nextSubs = subs.some((sub) => sub.foodId === foodId && sub.displayMacros)
                ? subs.map(patchSubstitution)
                : subs
              if (food === item.food && nextSubs === subs) return item
              return { ...item, food, substitutions: nextSubs }
            }),
          })),
        })),
      }
    }
    case 'DUPLICATE_VARIANT_AS': {
      const source = state.variants.find((variant) => variant.key === action.sourceVariantKey)
      if (!source || !isValidDow(action.dayOfWeek)) return state
      if (takenDayVariantDows(state).has(action.dayOfWeek)) return state
      if (state.variants.some((variant) => variant.key === action.variantKey || variant.variantKey === action.variantKey)) {
        return state
      }
      return {
        ...state,
        variants: [...state.variants, cloneQeVariantForDay(source, action.dayOfWeek, action.variantKey)],
      }
    }
    case 'COPY_VARIANT_TO_DAYS': {
      const source = state.variants.find((variant) => variant.key === action.sourceVariantKey)
      if (!source || action.days.length === 0) return state
      const occupantByDay = new Map<number, QeVariant>()
      for (const variant of state.variants) {
        if (!variant.isDefault && variant.dayOfWeek != null) occupantByDay.set(variant.dayOfWeek, variant)
      }
      const existingKeys = new Set(state.variants.map((variant) => variant.variantKey))
      const seen = new Set<number>()
      let variants = state.variants
      let round = 0
      for (const dayOfWeek of action.days) {
        if (!isValidDow(dayOfWeek) || seen.has(dayOfWeek)) continue
        seen.add(dayOfWeek)
        const occupant = occupantByDay.get(dayOfWeek)
        if (occupant?.key === action.sourceVariantKey) continue
        // Seed nuevo por destino: anexar el mismo origen a dos dias no puede compartir claves.
        round += 1
        const seed = `${action.keySeed}-${round}`
        if (occupant && action.mode === 'append') {
          if (source.slots.length === 0) continue
          const appendedSlots = source.slots.map((slot) => cloneQeSlot(slot, seed))
          variants = variants.map((variant) =>
            variant.key === occupant.key ? { ...variant, slots: [...variant.slots, ...appendedSlots] } : variant,
          )
          continue
        }
        if (occupant) {
          variants = variants.map((variant) =>
            variant.key === occupant.key
              ? {
                  ...variant,
                  targets: { ...source.targets },
                  passthroughTargets: { ...source.passthroughTargets },
                  slots: source.slots.map((slot) => cloneQeSlot(slot, seed)),
                }
              : variant,
          )
          continue
        }
        const variantKey = buildDayVariantKey(existingKeys, dayOfWeek)
        existingKeys.add(variantKey)
        variants = [...variants, cloneQeVariantForDay(source, dayOfWeek, variantKey)]
      }
      if (variants === state.variants) return state
      return { ...state, variants }
    }
    case 'SET_PLAN_NAME': {
      if (!state.meta) return state
      return { ...state, meta: { ...state.meta, name: action.value } }
    }
    case 'SET_STRATEGY': {
      if (!state.meta) return state
      return { ...state, meta: { ...state.meta, strategy: action.value } }
    }
    case 'SET_PERMISSION': {
      if (!state.meta) return state
      return {
        ...state,
        meta: { ...state.meta, permissions: { ...state.meta.permissions, ...action.patch } },
      }
    }
    case 'SET_EFFECTIVE_FROM': {
      // Solo aplica en creacion (meta con effectiveFrom presente): en edicion el campo no
      // existe y la fecha la computa el server.
      if (!state.meta || state.meta.effectiveFrom === undefined) return state
      return { ...state, meta: { ...state.meta, effectiveFrom: action.value } }
    }
    case 'RESET':
      return adoptRestoredState(state, action.state)
    case 'RESTORE_DRAFT': {
      // Restaura un borrador local (localStorage) reemplazando el arbol completo. Validacion
      // defensiva minima: si el payload guardado esta corrupto o es de un shape viejo (variants
      // ausente o no-array), se ignora y se conserva el estado actual — mejor no restaurar que
      // romper la pantalla. Un borrador pre-notas (sin `visibleNotes`) restaura el arbol y
      // conserva las notas actuales (hidratadas del read model): jamas un undefined en el estado.
      if (!Array.isArray(action.state?.variants)) return state
      const incoming =
        typeof action.state.visibleNotes === 'string'
          ? action.state
          : { ...action.state, visibleNotes: state.visibleNotes }
      return adoptRestoredState(state, incoming)
    }
    default:
      return state
  }
}

/** Igualdad de reemplazo por CONTENIDO proyectable (displayName es display-only y no cuenta). */
function sameSubstitution(a: QeItemSubstitution, b: QeItemSubstitution): boolean {
  return (
    a.foodId === b.foodId &&
    a.recipeId === b.recipeId &&
    (a.customName ?? null) === (b.customName ?? null) &&
    (a.quantity ?? null) === (b.quantity ?? null) &&
    (a.unit ?? null) === (b.unit ?? null)
  )
}

/**
 * Adopta un arbol restaurado (RESET / respaldo local) SIN cambiar de superficie: el quick-edit
 * clasico (sin `meta`) DESCARTA un meta que venga de un respaldo del editor unico — de lo
 * contrario publicaria un cambio de nombre/estrategia/permisos que esa superficie ni muestra —
 * y el editor conserva su meta vigente si el respaldo es de una sesion pre-meta.
 */
function adoptRestoredState(current: QuickEditState, incoming: QuickEditState): QuickEditState {
  if (current.meta === undefined) {
    if (incoming.meta === undefined) return incoming
    return { variants: incoming.variants, visibleNotes: incoming.visibleNotes }
  }
  return { ...incoming, meta: incoming.meta ?? current.meta }
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
  if (item.food) {
    // Modo casera con el par en el ITEM y no en el alimento (item hidratado al que se le hizo un
    // swap, o alimento cuyo catalogo ya no trae la medida): el par del item manda, porque es el
    // que el coach autorizo y el que se va a congelar.
    if (isHouseholdUnit(item.unit) && item.householdGrams != null) {
      return computeItemMacros({ ...item.food, householdGrams: item.householdGrams }, qty, item.unit)
    }
    return computeItemMacros(item.food, qty, item.unit)
  }
  if (item.macroBase && item.macroBase.quantity > 0) {
    // R1: `macroBase.quantity` esta rehidratado en la MISMA unidad que `quantity` (2 huevos, no
    // 122 g), asi que la razon es 1 en la carga y el escalado sigue siendo lineal y exacto.
    return scaleMacros(item.macroBase.macros, qty / item.macroBase.quantity)
  }
  return ZERO_ITEM_MACROS
}

/**
 * ¿Este item del editor tiene una cantidad poco plausible? (W1.3). Vive junto a `qeItemMacros`
 * porque usa exactamente las kcal que el editor ya muestra: si la fila dice 4.470 kcal, el
 * aviso habla de esas 4.470 y no de un numero recalculado por otro camino.
 *
 * Los gramos salen de la unidad + la porcion del catalogo. En modo casera manda el par del ITEM
 * (b15): los items hidratados no tienen `food`, y sin ese gramaje el aviso no podria decir
 * «2 huevos = 122 g».
 */
export function qeItemPlausibility(item: QeItem): ItemPlausibility {
  return assessItemPlausibility({
    quantity: Number(item.quantity.trim()),
    unit: item.unit,
    servingSize: item.food?.servingSize ?? null,
    householdGrams: item.householdGrams ?? item.food?.householdGrams ?? null,
    calories: qeItemMacros(item).calories,
  })
}

// ---------------------------------------------------------------------------
// Cantidad equivalente del reemplazo, para MOSTRARLA en el editor del coach
//
// Un reemplazo sin cantidad propia (hoy el 100% de las filas de LIVE) NO se registra "en la
// misma porcion que lo prescrito": la app calcula en vivo la cantidad que IGUALA las kcal del
// item y se la muestra al alumno ya resuelta ("Posta de vacuno · 130 g · mismas kcal"). El coach
// autorizaba ese reemplazo a ciegas — veia el nombre y nada mas. Esto le muestra el MISMO numero,
// con el MISMO modulo puro (`computeSubstitutionEquivalence`), para que no haya dos verdades.
//
// Es estrictamente de LECTURA: no hay accion del reducer que edite la cantidad del reemplazo (la
// fase de edicion quedo descartada). Todo lo que entra aca son campos display del arbol.
// ---------------------------------------------------------------------------

/** Lo que la fila del sheet de reemplazos pinta. `null` = no hay con que calcular ⇒ no pinta. */
export interface QeSubstitutionEquivalenceView {
  /** Cantidad ya redondeada al escalon de su unidad (5 en g/ml, 0,5 en unidades contadas). */
  quantity: number
  unit: NutritionIntakeUnit
  /** La cantidad la escribio el coach en la fila: se muestra sin "≈" y no se le discute. */
  explicit: boolean
  /** Supera el tope de plausibilidad ⇒ el alumno tendra que confirmarla antes de registrar. */
  requiresConfirmation: boolean
  /** "≈ 130 g" (calculada) o "130 g" (escrita por el coach). */
  label: string
  /** Una linea que explica la equivalencia; `null` cuando no hay nada honesto que decir. */
  note: string | null
  /** Aviso sobrio del caso absurdo (Pechuga 100 g → 715 g de espinaca). `null` = sin aviso. */
  warning: string | null
}

export const QE_SUBSTITUTION_SAME_CALORIES_NOTE = 'Equivale en calorías a lo prescrito'
export const QE_SUBSTITUTION_CONFIRM_WARNING =
  'Cantidad muy alta: tu alumno tendrá que confirmarla antes de registrar'

/** Numero legible es-CL: sin decimales cuando es entero, coma decimal cuando no. */
function formatQeQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}

/**
 * Cantidad equivalente que el alumno vera para este reemplazo, o `null` si no se puede resolver.
 *
 * Devuelve `null` (y la UI no pinta numero) en los dos casos en que cualquier cifra seria
 * inventada: el reemplazo no tiene macros vigentes en mano (`displayMacros` ausente: reemplazo
 * libre, receta, o hidratado sin catalogo) o el item prescrito no tiene kcal con que comparar
 * (alimento libre sin macros) y la equivalencia degrada a `unavailable`. Mejor vacio que
 * mentiroso: el numero de esta fila es el que el coach va a usar para decidir.
 */
export function qeSubstitutionEquivalence(
  item: QeItem,
  sub: QeItemSubstitution,
): QeSubstitutionEquivalenceView | null {
  const macros = sub.displayMacros
  if (!macros) return null

  const itemMacros = qeItemMacros(item)
  const equivalence = computeSubstitutionEquivalence({
    item: {
      quantity: Number(item.quantity.trim()) || 0,
      unit: item.unit,
      calories: itemMacros.calories,
      proteinG: itemMacros.proteinG,
      carbsG: itemMacros.carbsG,
      fatsG: itemMacros.fatsG,
    },
    substitute: {
      foodId: sub.foodId,
      customName: sub.customName,
      name: sub.displayName ?? sub.customName ?? 'Reemplazo',
      brand: null,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatsG: macros.fatsG,
      fiberG: macros.fiberG,
      macrosBasis: macros.macrosBasis ?? null,
      servingSize: macros.servingSize,
      servingUnit: macros.servingUnit,
      quantity: sub.quantity,
      unit: sub.unit,
    },
  })
  // `unavailable` = la cantidad devuelta es la PORCION del sustituto, no una equivalencia:
  // pintarla como "≈ 100 g · mismas kcal" seria mentir con precision.
  if (equivalence.kind === 'unavailable') return null

  const explicit = equivalence.kind === 'explicit'
  // La linea se decide por el KIND, no leyendo el texto del delta: `calorie-equivalent` y
  // `needs-confirmation` SON la rama que iguala las kcal (regla 3 de la equivalencia), asi que
  // ahi la frase es un hecho. Con cantidad escrita por el coach no hay igualdad que prometer:
  // se muestra la diferencia real, que es justo lo que el necesita ver antes de dejarla.
  const delta = explicit
    ? describeSubstitutionDelta({
        item: {
          quantity: Number(item.quantity.trim()) || 0,
          unit: item.unit,
          calories: itemMacros.calories,
          proteinG: itemMacros.proteinG,
          carbsG: itemMacros.carbsG,
          fatsG: itemMacros.fatsG,
        },
        equivalence,
      })
    : null
  const note = explicit
    ? delta === null
      ? null
      : delta === 'mismas kcal'
        ? QE_SUBSTITUTION_SAME_CALORIES_NOTE
        : `${delta} respecto de lo prescrito`
    : QE_SUBSTITUTION_SAME_CALORIES_NOTE

  return {
    quantity: equivalence.quantity,
    unit: equivalence.unit,
    explicit,
    requiresConfirmation: equivalence.requiresConfirmation,
    label: `${explicit ? '' : '≈ '}${formatQeQuantity(equivalence.quantity)} ${equivalence.unit}`,
    note,
    warning: equivalence.requiresConfirmation ? QE_SUBSTITUTION_CONFIRM_WARNING : null,
  }
}

// ---------------------------------------------------------------------------
// "Guardar en mi catalogo" desde el quick-edit (BD5)
//
// Un alimento LIBRE (custom_name + macros congeladas, sin food_id) es material perdido: sirve una
// vez y el coach lo vuelve a tipear en el proximo plan. El creador ya sabe promoverlo al catalogo
// (`FreeFoodFields` -> `createCoachFoodAction`); la edicion rapida no tenia la puerta.
//
// El servidor guarda macros POR 100 (serving_size = 100). El item hidratado del read-model NO las
// trae asi: trae las de la cantidad prescrita (`macroBase`), asi que hay que reescalarlas. Esta
// funcion es esa traduccion —pura y testeable— MAS el diagnostico de por que no se puede guardar,
// que es lo que la UI muestra como hint en la opcion deshabilitada.
// ---------------------------------------------------------------------------

/** Por que un item NO se puede promover al catalogo (alimenta el hint de la opcion apagada). */
export type QeCoachFoodBlock = 'not-custom' | 'no-name' | 'bad-unit' | 'no-macros'

/** Macros POR 100 g/ml listas para `CoachFoodInputSchema` (sin `clientId`, que lo pone la UI). */
export interface QeCoachFoodPayload {
  name: string
  unit: 'g' | 'ml'
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

export type QeCoachFoodCandidate =
  | { ok: true; payload: QeCoachFoodPayload }
  | { ok: false; reason: QeCoachFoodBlock }

/**
 * ¿Este item libre se puede guardar en el catalogo del coach, y con que macros por 100?
 *
 * Reglas, en el orden en que el coach las puede resolver: tiene que ser libre (un alimento del
 * catalogo ya esta guardado), tener nombre, medirse en g/ml (el catalogo guarda por 100 g/ml: una
 * unidad "un" no se puede convertir sin inventar el peso de la porcion) y traer macros. Un item
 * libre creado en esta misma sesion todavia no tiene macros —el quick-edit no las edita— y cae
 * legitimamente en `no-macros`.
 */
export function qeCoachFoodCandidate(item: QeItem): QeCoachFoodCandidate {
  if (!item.isCustom || item.foodId !== null || item.recipeId !== null) return { ok: false, reason: 'not-custom' }
  const name = item.displayName.trim()
  if (name === '') return { ok: false, reason: 'no-name' }
  const unit = item.unit.trim().toLowerCase()
  if (unit !== 'g' && unit !== 'ml') return { ok: false, reason: 'bad-unit' }
  const base = item.macroBase
  if (!base || !(base.quantity > 0)) return { ok: false, reason: 'no-macros' }
  const factor = 100 / base.quantity
  const payload: QeCoachFoodPayload = {
    name,
    unit,
    calories: Math.max(0, round1(base.macros.calories * factor)),
    proteinG: Math.max(0, round1(base.macros.proteinG * factor)),
    carbsG: Math.max(0, round1(base.macros.carbsG * factor)),
    fatsG: Math.max(0, round1(base.macros.fatsG * factor)),
  }
  const everything =
    payload.calories === 0 && payload.proteinG === 0 && payload.carbsG === 0 && payload.fatsG === 0
  // Todo en cero no es un alimento: guardarlo ensuciaria el catalogo con una fila inservible.
  if (everything) return { ok: false, reason: 'no-macros' }
  return { ok: true, payload }
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
// Totales CON porciones a eleccion (queja del coach: los grupos no sumaban)
//
// Las porciones a eleccion ("2 porciones de Proteina") son una capa hermana de los items
// fijos. Hasta ahora el quick-edit las editaba pero NO las sumaba: el "Subtotal franja" y el
// "Total prescrito" mostraban solo los items, dejando dos matematicas distintas en la misma
// pantalla (el builder ya combinaba el subtotal de franja). Los macros salen de los
// snapshots CONGELADOS del read model (nunca del catalogo vivo) y se expanden por el mismo
// motor que ve el alumno (`macrosForTargets`, incluye grupos compuestos tipo LEG = 1P + 1C).
// ---------------------------------------------------------------------------

/** Diccionario del engine reconstruido desde los snapshots (forma de `ExchangeGroup`). */
export type QeExchangeGroup = NutritionExchangeGroupRead

/**
 * Reconstruye el diccionario de grupos (directos + bases de compuestos) desde los grupos
 * que el plan ya usa. Sin porciones => [] (todas las lecturas degradan a "solo items").
 */
export function qeExchangeGroups(groups: readonly QePortionGroup[]): QeExchangeGroup[] {
  if (groups.length === 0) return []
  return reconstructExchangeGroups(
    groups.map((group) => ({
      exchangeGroupId: group.exchangeGroupId,
      groupCode: group.groupCode,
      groupName: group.groupName,
      color: group.color,
      ref: group.ref,
      composedOf: group.composedOf ?? null,
      macrosConfirmed: group.macrosConfirmed,
    })),
  )
}

/**
 * Macros derivados de las porciones de UNA franja. `null` cuando la franja no tiene
 * porciones validas o el diccionario esta vacio: el subtotal muestra solo los items
 * (identico a antes, jamas NaN).
 */
export function qeSlotPortionTotals(
  slot: QeSlot,
  groups: QeExchangeGroup[],
): ExchangeMacroTotals | null {
  if (groups.length === 0) return null
  const targets = slot.portionTargets
    .map((target) => ({
      exchangeGroupId: target.exchangeGroupId,
      portions: parsePortionsValue(target.portions) ?? 0,
    }))
    .filter((target) => target.portions > 0)
  if (targets.length === 0) return null
  return macrosForTargets(targets, groups)
}

/** Suma de las porciones de TODAS las franjas de la variante (null = sin porciones). */
export function qeVariantPortionTotals(
  variant: QeVariant,
  groups: QeExchangeGroup[],
): ExchangeMacroTotals | null {
  let acc: ExchangeMacroTotals | null = null
  for (const slot of variant.slots) {
    const slotTotals = qeSlotPortionTotals(slot, groups)
    if (!slotTotals) continue
    acc = acc
      ? {
          calories: acc.calories + slotTotals.calories,
          proteinG: acc.proteinG + slotTotals.proteinG,
          carbsG: acc.carbsG + slotTotals.carbsG,
          fatsG: acc.fatsG + slotTotals.fatsG,
        }
      : slotTotals
  }
  return acc
}

/**
 * Combina items fijos + derivado de porciones (redondeo a 1 decimal, espejo de `addMacros`).
 * Sin porciones devuelve EXACTAMENTE el objeto de items (misma referencia).
 */
export function qeCombineSubtotals(items: ItemMacros, portions: ExchangeMacroTotals | null): ItemMacros {
  if (portions == null) return items
  return {
    ...items,
    calories: round1(items.calories + portions.calories),
    proteinG: round1(items.proteinG + portions.proteinG),
    carbsG: round1(items.carbsG + portions.carbsG),
    fatsG: round1(items.fatsG + portions.fatsG),
  }
}

/** Subtotal de franja CON porciones (lo que el coach espera ver bajo la franja). */
export function qeSlotSubtotalWithPortions(
  slot: QeSlot,
  groups: QeExchangeGroup[],
): ItemMacros {
  return qeCombineSubtotals(qeSlotSubtotal(slot), qeSlotPortionTotals(slot, groups))
}

/** Total prescrito de la variante CON porciones (items de todas las franjas + grupos). */
export function qeVariantTotalWithPortions(
  variant: QeVariant,
  groups: QeExchangeGroup[],
): ItemMacros {
  return qeCombineSubtotals(qeVariantTotal(variant), qeVariantPortionTotals(variant, groups))
}

// ---------------------------------------------------------------------------
// Validacion local (pre-publish; el servidor re-valida con Zod)
// ---------------------------------------------------------------------------

export interface QuickEditValidation {
  ok: boolean
  errors: Record<string, string>
}

/**
 * Contexto que la validacion local no puede deducir del arbol editable. Hoy solo la
 * ESTRATEGIA, que decide si un dia sin franjas es un error o su estado normal.
 */
export interface QuickEditValidationOptions {
  /**
   * Estrategia del plan vigente. Ausente = no se evalua la regla de dia vacio (misma
   * validacion que antes, para los callers puros que no la conocen).
   */
  strategy?: NutritionStrategy | null
  /**
   * Fecha local del alumno (YYYY-MM-DD). Solo la usa la regla de vigencia del modo creacion
   * (`meta.effectiveFrom` no puede ser pasado); ausente = la regla no se evalua.
   */
  today?: string
}

/**
 * Espejo LOCAL del guard `EMPTY_DAY_VARIANT` del servidor (`plan-persistence.ts`): en un plan
 * con franjas, un dia sin ninguna comida NO se puede publicar — el alumno no ve "un dia sin
 * porciones", ve el dia entero vacio.
 *
 * Existe porque ese guard vive server-side y su mensaje se perdia: el quick-edit publicaba,
 * el servidor rechazaba y la barra decia "No se pudo publicar" sin señalar QUE dia. Un plan
 * que YA tenia dias vacios publicados (los hay en LIVE) quedaba imposible de republicar y el
 * coach no tenia forma de saber por que. Aca se corta ANTES, marcando el dia culpable.
 *
 * La UI no autoriza: el servidor sigue siendo la barrera real (este chequeo solo evita el
 * viaje y da el mensaje). `flexible` queda fuera por definicion: esa estrategia no tiene
 * franjas y un dia sin ellas es su estado correcto.
 */
export function qeEmptyDayVariants(
  state: QuickEditState,
  strategy: NutritionStrategy | null | undefined,
): QeVariant[] {
  if (strategy == null || strategy === 'flexible') return []
  return state.variants.filter((variant) => variant.slots.length === 0)
}

const MAX_KCAL = 12000
const MAX_MACRO_G = 2000
/** Tope del contrato (`NutritionDayVariantSchema.label`: max 120 tras trim). */
export const VARIANT_LABEL_MAX = 120

export function validateQuickEdit(
  state: QuickEditState,
  options: QuickEditValidationOptions = {},
): QuickEditValidation {
  const errors: Record<string, string> = {}
  // Dia sin comidas (espejo del guard server-side): se marca por dia para que el coach sepa
  // cual arreglar o eliminar, en vez de recibir un "No se pudo publicar" opaco.
  for (const variant of qeEmptyDayVariants(state, options.strategy)) {
    errors[`variant.${variant.key}.slots`] =
      'Este día no tiene ninguna comida. Agrégale una franja o elimina el día.'
  }
  // Espejo del contrato (max 8000 tras trim): corta ANTES de que el server responda un
  // VALIDATION generico sin señalar el campo.
  if ((state.visibleNotes ?? '').trim().length > VISIBLE_NOTES_MAX) {
    errors['plan.visibleNotes'] = `Las notas superan los ${VISIBLE_NOTES_MAX} caracteres.`
  }
  // Metadatos del plan (editor unico): espejo de `NutritionPlanDraftSchema.name` (1-180 tras
  // trim). Solo aplica cuando la superficie los edita; el quick-edit clasico no trae `meta`.
  if (state.meta) {
    const name = state.meta.name.trim()
    if (name.length === 0) errors['meta.name'] = 'El plan necesita un nombre.'
    else if (name.length > PLAN_NAME_MAX) {
      errors['meta.name'] = `El nombre supera los ${PLAN_NAME_MAX} caracteres.`
    }
    // Vigencia elegible (solo creacion): espejo local del guard EFFECTIVE_DATE del server.
    const effectiveFrom = state.meta.effectiveFrom
    if (typeof effectiveFrom === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
        errors['meta.effectiveFrom'] = 'Fecha de inicio inválida.'
      } else if (options.today && effectiveFrom < options.today) {
        errors['meta.effectiveFrom'] = 'La fecha de inicio no puede ser pasada.'
      }
    }
  }
  // Invariantes multi-dia (espejo de la base: default unico + dia de semana unico). El
  // reducer ya los sostiene; esto corta el publish si un respaldo local viejo o un estado
  // corrupto llegara con dos bases o dos dias iguales, en vez de dejar que el RPC falle.
  if (state.variants.filter((variant) => variant.isDefault).length !== 1) {
    errors['plan.dayVariants'] = 'El plan necesita exactamente un día base.'
  } else {
    const seenDows = new Set<number>()
    for (const variant of state.variants) {
      if (variant.dayOfWeek == null) continue
      if (seenDows.has(variant.dayOfWeek)) {
        errors['plan.dayVariants'] = 'Hay dos días del plan asignados al mismo día de la semana.'
        break
      }
      seenDows.add(variant.dayOfWeek)
    }
  }
  for (const variant of state.variants) {
    const label = variant.label.trim()
    if (label.length === 0) errors[`variant.${variant.key}.label`] = 'El día necesita un nombre.'
    else if (label.length > VARIANT_LABEL_MAX) {
      errors[`variant.${variant.key}.label`] = `El nombre no puede superar los ${VARIANT_LABEL_MAX} caracteres.`
    }
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
      // Nota del coach de la franja: espejo del contrato (max 2000 tras trim), corta ANTES
      // de que el server responda un VALIDATION generico sin señalar el campo.
      if ((slot.instructions ?? '').trim().length > SLOT_INSTRUCTIONS_MAX) {
        errors[`slot.${slot.key}.instructions`] = `La nota supera los ${SLOT_INSTRUCTIONS_MAX} caracteres.`
      }
      for (const item of slot.items) {
        const qty = Number(item.quantity.trim())
        if (!(item.quantity.trim() !== '' && Number.isFinite(qty) && qty > 0)) {
          errors[`item.${item.key}.quantity`] = 'Cantidad inválida.'
        }
        if (item.isCustom && item.displayName.trim().length === 0) {
          errors[`item.${item.key}.name`] = 'Escribe un nombre para el alimento.'
        }
        // W2: `casera` sin par no se puede traducir a gramos — `computeItemMacros` da cero y
        // `buildItemInsertRow` tira. Se corta ACA, con el item señalado, y no con un error
        // generico de publicacion.
        if (isHouseholdUnit(item.unit) && !hasUsableHouseholdPair(item)) {
          errors[`item.${item.key}.unit`] = 'Este alimento no tiene medida casera.'
        }
      }
      for (const target of slot.portionTargets) {
        if (!isValidPortionsText(target.portions)) {
          errors[`portion.${target.key}.portions`] = 'Las porciones van de 0,5 en 0,5 (mínimo 0,5).'
        }
        // Nota del grupo de porciones: espejo del contrato (max 1000 tras trim).
        if ((target.notes ?? '').trim().length > PORTION_NOTES_MAX) {
          errors[`portion.${target.key}.notes`] = `La nota supera los ${PORTION_NOTES_MAX} caracteres.`
        }
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Errores POR DIA (editor unico)
// ---------------------------------------------------------------------------
//
// Por que existe: el editor unico pinta UN dia a la vez (`visibleVariants = [activeVariant]`),
// pero `validateQuickEdit` revisa todos. Un error en un dia no activo quedaba invisible y la
// barra decia "revisa los campos marcados" sin nada marcado (reporte JP/Alan 2026-09-02: plan
// hibrido con dias agregados «vacios»). Estos helpers mapean cada clave de error a su dia para
// que los chips lo marquen, el publish salte hasta el y la barra lo nombre. Son puros y viven
// aca para que RN y web den exactamente la misma respuesta.

export type QeDayErrorKind = 'empty' | 'quantity' | 'slotName' | 'fields'

export interface QeDayErrorSummary {
  key: string
  /** Etiqueta para nombrar el dia dentro de una oracion («El día base», «Martes»). */
  label: string
  isDefault: boolean
  kind: QeDayErrorKind
  /** Cuantos errores del tipo `kind` tiene el dia (singular/plural del mensaje). */
  count: number
}

function qeDayErrorLabel(variant: QeVariant): string {
  if (variant.isDefault) return 'El día base'
  const label = variant.label.trim()
  return label.length > 0 ? label : 'Ese día'
}

/**
 * Dias con al menos un error, en el MISMO orden en que llegan `variants` (el caller pasa el
 * orden de lectura: base → Lu → Do). Un dia sin comidas es `empty` (sin franjas no hay mas
 * errores posibles); un dia con un solo tipo de error entre cantidad/nombre de franja lo
 * declara; cualquier mezcla u otro campo (metas, nombre del dia, porciones, notas) es `fields`.
 * Los errores fuera de los dias (`plan.*`, `meta.*`) no entran: ya se pintan a la vista.
 */
export function qeDayErrorSummaries(
  variants: readonly QeVariant[],
  errors: Record<string, string>,
): QeDayErrorSummary[] {
  const keys = Object.keys(errors)
  if (keys.length === 0) return []
  const summaries: QeDayErrorSummary[] = []
  for (const variant of variants) {
    const emptyKey = `variant.${variant.key}.slots`
    const variantPrefix = `variant.${variant.key}.`
    const targetPrefix = `target.${variant.key}.`
    let empty = 0
    let quantity = 0
    let slotName = 0
    let other = 0
    for (const key of keys) {
      if (key === emptyKey) empty += 1
      else if (key.startsWith(variantPrefix) || key.startsWith(targetPrefix)) other += 1
    }
    for (const slot of variant.slots) {
      if (errors[`slot.${slot.key}.name`]) slotName += 1
      if (errors[`slot.${slot.key}.instructions`]) other += 1
      for (const item of slot.items) {
        if (errors[`item.${item.key}.quantity`]) quantity += 1
        if (errors[`item.${item.key}.name`]) other += 1
        if (errors[`item.${item.key}.unit`]) other += 1
      }
      for (const target of slot.portionTargets) {
        if (errors[`portion.${target.key}.portions`]) other += 1
        if (errors[`portion.${target.key}.notes`]) other += 1
      }
    }
    const total = empty + quantity + slotName + other
    if (total === 0) continue
    let kind: QeDayErrorKind
    let count: number
    if (empty > 0) {
      kind = 'empty'
      count = 1
    } else if (quantity > 0 && slotName === 0 && other === 0) {
      kind = 'quantity'
      count = quantity
    } else if (slotName > 0 && quantity === 0 && other === 0) {
      kind = 'slotName'
      count = slotName
    } else {
      kind = 'fields'
      count = total
    }
    summaries.push({
      key: variant.key,
      label: qeDayErrorLabel(variant),
      isDefault: variant.isDefault,
      kind,
      count,
    })
  }
  return summaries
}

/** Claves de los dias con algun error (marca ambar de chips/rail). */
export function qeErrorDayKeys(
  variants: readonly QeVariant[],
  errors: Record<string, string>,
): ReadonlySet<string> {
  return new Set(qeDayErrorSummaries(variants, errors).map((summary) => summary.key))
}

/**
 * Dia al que SALTAR cuando el publish se corta por validacion: el primer dia con error en
 * orden de lectura, salvo que el dia activo ya tenga errores (se queda: sus marcas estan a la
 * vista). `null` = nada que saltar (sin errores por dia, o el activo ya los muestra).
 */
export function qeFirstErrorDayKey(
  variants: readonly QeVariant[],
  errors: Record<string, string>,
  activeKey: string | null,
): string | null {
  const summaries = qeDayErrorSummaries(variants, errors)
  if (summaries.length === 0) return null
  if (activeKey != null && summaries.some((summary) => summary.key === activeKey)) return null
  return summaries[0].key
}

export interface QePublishBlockedBar {
  message: string
  /** Dia al que lleva el boton de la barra; `null` = sin boton (los errores ya estan a la vista). */
  jumpToKey: string | null
  /** Rotulo del boton («Ir a Martes» / «Ir al día base»); `null` cuando no hay boton. */
  jumpLabel: string | null
}

function joinDayLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return labels.slice(0, -1).join(', ') + ' y ' + labels[labels.length - 1]
}

/**
 * Mensaje de la barra cuando el publish se corta por validacion. Devuelve `fallback` (el
 * generico de cada superficie) si los errores viven solo en el dia activo o fuera de los dias:
 * ahi las marcas ya estan en pantalla. Con errores en OTROS dias, nombra todos los dias con
 * error (el activo incluido) y ofrece ir al primero que no sea el activo.
 */
export function qePublishBlockedBar(
  variants: readonly QeVariant[],
  errors: Record<string, string>,
  activeKey: string | null,
  fallback: string,
): QePublishBlockedBar {
  const summaries = qeDayErrorSummaries(variants, errors)
  const others = summaries.filter((summary) => summary.key !== activeKey)
  if (others.length === 0) return { message: fallback, jumpToKey: null, jumpLabel: null }
  const jump = others[0]
  const jumpLabel = jump.isDefault ? 'Ir al día base' : `Ir a ${jump.label}`
  let message: string
  if (summaries.length === 1) {
    const only = summaries[0]
    if (only.kind === 'empty') message = `${only.label} no tiene ninguna comida.`
    else if (only.kind === 'quantity') {
      message = `${only.label} tiene ${only.count === 1 ? 'un alimento sin cantidad' : 'alimentos sin cantidad'}.`
    } else if (only.kind === 'slotName') {
      message = `${only.label} tiene ${only.count === 1 ? 'una franja sin nombre' : 'franjas sin nombre'}.`
    } else message = `${only.label} tiene campos por revisar.`
  } else {
    const list = joinDayLabels(summaries.map((summary) => summary.label))
    message = summaries.every((summary) => summary.kind === 'empty')
      ? `${list} no tienen ninguna comida.`
      : `${list} tienen campos por revisar.`
  }
  return { message, jumpToKey: jump.key, jumpLabel }
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
  // Carry-over F-02: reemplazos base heredados. Capa OPCIONAL (espeja exchangeTargets): un
  // item sin reemplazos proyecta un draft IDENTICO al de antes (sin la clave), asi baseline y
  // current (misma proyeccion) no acusan un cambio falso. `?? []` tolera un respaldo local
  // viejo (localStorage pre-deploy) cuyos items no traen el campo. `orderIndex` por posicion.
  const substitutions = item.substitutions ?? []
  return {
    ...(item.id ? { id: item.id } : {}),
    foodId: item.foodId,
    recipeId: item.recipeId,
    customName: item.isCustom ? item.displayName.trim() || null : null,
    quantity: Number(item.quantity.trim()) || 0,
    // `casera` viaja TAL CUAL en el borrador (b16): traducirla aca escondería la eleccion del
    // coach del contador de cambios y del respaldo local. La traduccion a g/ml + par congelado
    // ocurre en la ultima milla, `buildItemInsertRow` (apps/web/.../_lib/plan-draft-rows.ts).
    unit: item.unit,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    optional: item.optional,
    substitutionGroupId: item.substitutionGroupId,
    notes: item.notes,
    orderIndex,
    householdLabel: item.householdLabel,
    householdGrams: item.householdGrams,
    // Linaje W3.1: viaja SIEMPRE (clave presente, valor `null` cuando no hay ancestro) para que
    // baseline y current pasen por la misma proyeccion. `countDraftChanges` NO lo mira a
    // proposito: perder el linaje es la CONSECUENCIA de una edicion, no una edicion en si.
    sourceItemId: item.sourceItemId,
    ...(substitutions.length > 0
      ? {
          substitutions: substitutions.map((sub, subIndex): NutritionItemSubstitution => ({
            foodId: sub.foodId,
            recipeId: sub.recipeId,
            customName: sub.customName,
            quantity: sub.quantity,
            unit: sub.unit,
            orderIndex: subIndex,
          })),
        }
      : {}),
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
    // Nota editable (SET_PORTION_NOTES): el estado guarda el texto crudo del TextInput;
    // aca se normaliza (trim; '' → null). Baseline y current pasan por esta MISMA
    // proyeccion, asi que una nota intacta jamas cuenta como cambio.
    notes: target.notes == null ? null : target.notes.trim() || null,
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
    // Nota del coach de la franja (SET_SLOT_INSTRUCTIONS): el estado guarda el texto crudo
    // del textarea; aca se normaliza (trim; '' → null). Baseline y current pasan por esta
    // MISMA proyeccion, asi que una nota intacta jamas cuenta como cambio.
    instructions: slot.instructions == null ? null : slot.instructions.trim() || null,
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
    // Trim explicito (el contrato ya trimea): baseline y current pasan por esta MISMA
    // proyeccion, asi que renombrar con espacios de sobra no inventa un cambio.
    label: variant.label.trim(),
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
 * Cambios de ENCABEZADO de dia (etiqueta / dia de semana) entre dos drafts, emparejando por
 * `id` (solo variantes que ya existian en la version base).
 *
 * Se suma aparte porque `countDraftChanges` del paquete compara metas/franjas/items pero NO
 * el encabezado de la variante: sin esto, renombrar un dia o moverlo de Sabado a Domingo
 * dejaria la barra en "0 cambios" y el coach no podria publicar su propia edicion. El
 * paquete es compartido con otras superficies y queda fuera de este cluster.
 */
/** Firma orden-insensible de la lista de reemplazos de un item (contenido proyectable). */
function substitutionsSignature(subs: readonly NutritionItemSubstitution[] | undefined): string {
  return (subs ?? [])
    .map((sub) => `${sub.foodId ?? ''}|${sub.recipeId ?? ''}|${sub.customName ?? ''}|${sub.quantity ?? ''}|${sub.unit ?? ''}`)
    .sort()
    .join('~')
}

/**
 * Cambios en los REEMPLAZOS autorizados entre dos drafts, emparejando items por `id` (solo los
 * que ya existian en la version base; un item nuevo ya cuenta como alta entera).
 *
 * Se suma aparte porque `countDraftChanges` del paquete no compara `substitutions`: hasta W2
 * ninguna superficie los editaba (solo carry-over) y el contador no los necesitaba. Con el
 * editor unico editandolos, sin esto quitar o agregar un reemplazo dejaria la barra en
 * "0 cambios" y el coach no podria publicar su propia edicion. Mismo criterio (y mismo motivo
 * de vivir aca y no en el paquete) que `countVariantHeaderChanges`.
 */
export function countItemSubstitutionChanges(
  baseline: NutritionPlanDraft,
  current: NutritionPlanDraft,
): number {
  const baselineById = new Map<string, DraftItem>()
  for (const variant of baseline.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (item.id) baselineById.set(item.id, item)
      }
    }
  }
  let count = 0
  for (const variant of current.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (!item.id) continue
        const base = baselineById.get(item.id)
        if (!base) continue
        if (substitutionsSignature(base.substitutions) !== substitutionsSignature(item.substitutions)) {
          count += 1
        }
      }
    }
  }
  return count
}

/**
 * Cambios de ORDEN de items dentro de sus franjas (W3b), emparejando franjas por `id`. El
 * paquete no compara orden a proposito ("reordenar es F2"): hasta el editor unico ninguna
 * superficie reordenaba dentro de la franja, y sin esto un reorden puro dejaria la barra en
 * "0 cambios" sin poder publicar. Cuenta 1 por franja cuyo orden relativo de items (los que
 * existen en ambos lados, por id) cambio. Mismo criterio local que los otros dos contadores.
 */
export function countItemOrderChanges(
  baseline: NutritionPlanDraft,
  current: NutritionPlanDraft,
): number {
  const baselineSlotsById = new Map<string, DraftSlot>()
  for (const variant of baseline.dayVariants) {
    for (const slot of variant.mealSlots) {
      if (slot.id) baselineSlotsById.set(slot.id, slot)
    }
  }
  let count = 0
  for (const variant of current.dayVariants) {
    for (const slot of variant.mealSlots) {
      if (!slot.id) continue
      const base = baselineSlotsById.get(slot.id)
      if (!base) continue
      const currentIds = slot.items.map((item) => item.id).filter((id): id is string => Boolean(id))
      const currentSet = new Set(currentIds)
      const baseShared = base.items
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id) && currentSet.has(id as string))
      const baseSet = new Set(baseShared)
      const currentShared = currentIds.filter((id) => baseSet.has(id))
      if (baseShared.join('|') !== currentShared.join('|')) count += 1
    }
  }
  return count
}

export function countVariantHeaderChanges(
  baseline: NutritionPlanDraft,
  current: NutritionPlanDraft,
): number {
  const baselineById = new Map<string, NutritionPlanDraft['dayVariants'][number]>()
  for (const variant of baseline.dayVariants) {
    if (variant.id) baselineById.set(variant.id, variant)
  }
  let count = 0
  for (const variant of current.dayVariants) {
    if (!variant.id) continue
    const base = baselineById.get(variant.id)
    if (!base) continue
    if (base.label !== variant.label || base.dayOfWeek !== variant.dayOfWeek) count += 1
  }
  return count
}

/**
 * Proyecta el arbol editable sobre el draft base (readModelToDraft del paquete): conserva
 * planId/nombre/estrategia/permisos del base (F1 no los edita) y reemplaza dayVariants y
 * visibleNotes (editables). protocol/private notes siguen siendo carry-over server-side.
 * Usar tambien para derivar el BASELINE de comparacion (proyectar el estado hidratado sin
 * tocar) de modo que el contador de cambios nunca acuse diferencias de normalizacion.
 */
export function applyQuickEditToDraft(base: NutritionPlanDraft, state: QuickEditState): NutritionPlanDraft {
  return {
    ...base,
    // Metadatos editables (editor unico): sin `meta` la proyeccion conserva los del base,
    // exactamente como siempre. Baseline y current pasan por esta MISMA rama, asi que
    // hidratar meta sin editarlo sigue dando cero cambios (trim de un valor ya trimmed).
    ...(state.meta
      ? {
          name: state.meta.name.trim(),
          strategy: state.meta.strategy,
          permissions: state.meta.permissions,
        }
      : {}),
    visibleNotes: normalizeVisibleNotes(state.visibleNotes),
    dayVariants: state.variants.map(projectVariant),
  }
}

// ---------------------------------------------------------------------------
// Guard de identificadores vacios (diagnostico, no barrera)
// ---------------------------------------------------------------------------

/** Claves del draft que la base almacena como `uuid`: un '' aca es 22P02 garantizado. */
const DRAFT_UUID_KEYS = new Set([
  'id',
  'planId',
  'versionId',
  'clientId',
  'foodId',
  'recipeId',
  'substitutionGroupId',
  'exchangeGroupId',
])

/**
 * Rutas del draft donde un campo de identidad llego como STRING VACIO.
 *
 * `NutritionPlanDraftSchema` ya rechaza esos valores (`z.string().uuid()` / `z.guid()`), pero
 * su fallo llega al coach como un "datos inválidos" generico y al log como un issue de Zod sin
 * contexto de negocio. Este barrido corre ANTES y nombra el campo exacto, de modo que un ''
 * futuro —de un adaptador del picker, de un respaldo local viejo o de RN— se diagnostique en un
 * vistazo en vez de terminar en `invalid input syntax for type uuid: ""` (22P02) opaco.
 *
 * Puro y sin dependencias: se usa desde la server action y desde los tests de regresion.
 */
export function collectBlankUuidPaths(value: unknown, path = 'draft'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectBlankUuidPaths(entry, `${path}[${index}]`))
  }
  if (value === null || typeof value !== 'object') return []
  const out: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`
    if (DRAFT_UUID_KEYS.has(key) && typeof child === 'string' && child.trim() === '') {
      out.push(childPath)
      continue
    }
    out.push(...collectBlankUuidPaths(child, childPath))
  }
  return out
}
