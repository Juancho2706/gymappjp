import {
  CATALOG_MACROS_BASIS,
  normalizeIntakeUnit,
  prescribedSnapshotMacros,
  scaleSnapshotMacros,
  type NutritionMacroTotalsLike,
} from '@eva/nutrition-v2'
import type {
  FoodCatalogItem,
  NutritionFoodRowModel,
  NutritionIntakeCorrection,
  NutritionIntakeMutation,
  NutritionIntakeReadItem,
  NutritionIntakeVoid,
  NutritionItemSubstitutionRead,
  NutritionMealSlotRead,
  NutritionTodayReadModel,
} from '@eva/nutrition-v2'

/** El item prescrito no se exporta como tipo nominal; lo derivamos del slot. */
type PrescriptionItemRead = NutritionMealSlotRead['prescriptionItems'][number]

/**
 * Logica pura (framework-neutral) del Today del alumno.
 * Construye los payloads de intake/correccion que las server actions validan de
 * nuevo con Zod. Aislada del componente para poder testearla sin React.
 */

const INTAKE_SOURCES = ['offplan', 'prescription', 'substitution', 'recipe', 'manual', 'legacy'] as const
const CAPTURE_METHODS = ['search', 'barcode', 'recent', 'favorite', 'recipe', 'prescription', 'manual', 'legacy'] as const

type IntakeSource = (typeof INTAKE_SOURCES)[number]
type CaptureMethod = (typeof CAPTURE_METHODS)[number]

function coerceSource(value: string | null | undefined): IntakeSource {
  return (INTAKE_SOURCES as readonly string[]).includes(value ?? '') ? (value as IntakeSource) : 'offplan'
}

function coerceCapture(value: string | null | undefined): CaptureMethod {
  return (CAPTURE_METHODS as readonly string[]).includes(value ?? '') ? (value as CaptureMethod) : 'manual'
}

/** Clave de idempotencia estable por gesto (uuid client-side, propagada tal cual al RPC). */
export function newIdempotencyKey(prefix: 'intake' | 'correction' | 'void' | 'close'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${uuid}`
}

/** Todas las franjas del dia como opciones {code,label} (sin franjas hardcodeadas). */
export function mealSlotOptions(today: NutritionTodayReadModel): Array<{ code: string; label: string }> {
  return today.mealSlots.map((slot) => ({ code: slot.code, label: slot.name }))
}

/** Registros de consumo activos del dia (franjas + sin franja), ordenados por hora. */
export function consumedEntries(today: NutritionTodayReadModel): NutritionIntakeReadItem[] {
  const fromSlots = today.mealSlots.flatMap((slot) => slot.intakeItems)
  const all = [...fromSlots, ...today.unassignedIntake]
  return all.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

/** True si un item prescrito ya tiene un registro de consumo asociado. */
export function isPrescriptionConsumed(today: NutritionTodayReadModel, prescriptionItemId: string): boolean {
  return consumedEntries(today).some((entry) => entry.prescriptionItemId === prescriptionItemId)
}

/** Modelo de fila para el kit a partir de un registro de consumo. */
export function entryToFoodRow(entry: NutritionIntakeReadItem): NutritionFoodRowModel {
  return {
    id: entry.id,
    name: entry.snapshot.name,
    detail: entry.snapshot.brand,
    quantityLabel: `${entry.quantity} ${entry.unit}`,
    calories: entry.totals.calories,
    proteinG: entry.totals.proteinG,
    carbsG: entry.totals.carbsG,
    fatsG: entry.totals.fatsG,
    status: entry.status === 'corrected' ? 'corrected' : 'default',
  }
}

interface Context {
  clientId: string
  date: string
  timezone: string
  planVersionId: string | null
  snapshotId: string | null
}

export function contextFromToday(today: NutritionTodayReadModel, clientId: string): Context {
  return {
    clientId,
    date: today.localDate,
    timezone: today.timezone,
    planVersionId: today.plan?.versionId ?? null,
    snapshotId: today.snapshotId,
  }
}

/**
 * "Lo comi": registra exactamente lo prescrito. Normaliza los macros a por-unidad
 * con servingSize=1 para que el total recomputado por el RPC == macros mostrados,
 * cualquiera sea la unidad (g/ml o unidades discretas). La normalizacion vive en
 * `@eva/nutrition-v2/intake-normalize`, compartida byte a byte con RN.
 */
export function buildPrescribedIntakePayload(input: {
  context: Context
  slot: NutritionMealSlotRead
  item: PrescriptionItemRead
  idempotencyKey: string
  occurredAt?: string
}): NutritionIntakeMutation {
  const { context, slot, item } = input
  const name = item.name ?? 'Alimento prescrito'
  return {
    clientId: context.clientId,
    localDate: context.date,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    timezone: context.timezone,
    foodId: item.foodId,
    customName: item.foodId ? null : name,
    quantity: item.quantity,
    unit: item.unit,
    mealSlot: slot.code,
    source: 'prescription',
    captureMethod: 'prescription',
    daySnapshotId: context.snapshotId,
    planVersionId: context.planVersionId,
    prescriptionItemId: item.id,
    idempotencyKey: input.idempotencyKey,
    note: null,
    snapshot: {
      name,
      brand: item.brand,
      ...prescribedSnapshotMacros(item.macros, item.quantity),
      servingUnit: item.unit,
    },
  }
}

/**
 * Total ESTIMADO de un alimento del catalogo para la cantidad/unidad elegidas. Usa la MISMA
 * funcion pura que el servidor (`scaleSnapshotMacros` ⇒ `intakeEntryFactor`) con la base
 * declarada del catalogo, de modo que el numero del formulario y el que persiste el RPC son el
 * mismo. Es lo que vuelve OBVIO un cambio de unidad mal hecho antes de guardar (NUT-017).
 */
export function estimateCatalogIntakeTotals(input: {
  food: Pick<FoodCatalogItem, 'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG' | 'servingSize'>
  quantity: number
  unit: string
}): NutritionMacroTotalsLike {
  return scaleSnapshotMacros(input.food, {
    quantity: input.quantity,
    unit: normalizeIntakeUnit(input.unit) ?? input.unit,
    servingSize: input.food.servingSize,
    basis: CATALOG_MACROS_BASIS,
  })
}

/**
 * Alimento libre del catalogo. Los macros del catalogo son POR 100 g/ml (contrato del importador,
 * `docs/operations/FOOD_CATALOG_CL_IMPORT.md:89`) y `servingSize` solo describe la porcion; por eso
 * el payload DECLARA `macrosBasis: 'per_100'` y el servidor escala con esa base en vez de la
 * legada (que dividia por `servingSize` e inflaba 100 g del alimento ejemplo a 258,3 kcal —
 * NUT-001). La unidad se manda ya normalizada al codigo canonico (g|ml|un).
 */
export function buildCatalogIntakePayload(input: {
  context: Context
  food: FoodCatalogItem
  quantity: number
  unit: string
  mealSlotCode: string | null
  idempotencyKey: string
  occurredAt?: string
}): NutritionIntakeMutation {
  const { context, food } = input
  return {
    clientId: context.clientId,
    localDate: context.date,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    timezone: context.timezone,
    foodId: food.id,
    customName: null,
    quantity: input.quantity,
    unit: normalizeIntakeUnit(input.unit) ?? input.unit,
    mealSlot: input.mealSlotCode,
    source: 'offplan',
    captureMethod: 'search',
    daySnapshotId: context.snapshotId,
    planVersionId: context.planVersionId,
    prescriptionItemId: null,
    idempotencyKey: input.idempotencyKey,
    note: null,
    snapshot: {
      name: food.name,
      brand: food.brand,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatsG: food.fatsG,
      fiberG: food.fiberG,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      macrosBasis: CATALOG_MACROS_BASIS,
    },
  }
}

/**
 * Correccion de cantidad de un registro existente. Reusa el snapshot inmutable del
 * original (mismo alimento, misma unidad) cambiando solo la cantidad; crea la
 * cadena de correccion (el original queda como corrected).
 */
export function buildCorrectionPayload(input: {
  context: Context
  entry: NutritionIntakeReadItem
  newQuantity: number
  reason: string
  idempotencyKey: string
}): NutritionIntakeCorrection {
  const { context, entry } = input
  return {
    clientId: context.clientId,
    localDate: context.date,
    occurredAt: entry.occurredAt,
    timezone: context.timezone,
    foodId: entry.foodId,
    customName: entry.customName,
    quantity: input.newQuantity,
    unit: entry.unit,
    mealSlot: entry.mealSlot,
    source: coerceSource(entry.source),
    captureMethod: coerceCapture(entry.captureMethod),
    daySnapshotId: context.snapshotId,
    planVersionId: context.planVersionId,
    prescriptionItemId: entry.prescriptionItemId,
    idempotencyKey: input.idempotencyKey,
    note: null,
    snapshot: {
      name: entry.snapshot.name,
      brand: entry.snapshot.brand,
      calories: entry.snapshot.calories,
      proteinG: entry.snapshot.proteinG,
      carbsG: entry.snapshot.carbsG,
      fatsG: entry.snapshot.fatsG,
      fiberG: entry.snapshot.fiberG,
      servingSize: entry.snapshot.servingSize,
      servingUnit: entry.snapshot.servingUnit,
      // La base viaja con el snapshot: sin esto la correccion caeria a la formula LEGADA y el
      // mismo alimento cambiaria de calorias solo por editar la cantidad (NUT-001).
      ...(entry.snapshot.macrosBasis ? { macrosBasis: entry.snapshot.macrosBasis } : {}),
    },
    correctsEntryId: entry.id,
    correctionReason: input.reason,
  }
}

/**
 * "Retirar" un registro (NUT-010, opción A: estado TERMINAL `voided`).
 *
 * Antes esto construía una corrección de contribución CERO que conservaba cantidad, unidad, franja
 * y `prescriptionItemId` del original. Esa entry correctora nacía ACTIVA, así que el item prescrito
 * seguía contando como "consumido" (sin botón "Lo comí" de vuelta), el medidor de la franja seguía
 * "completo", la cobertura de porciones DERIVADA no bajaba, `entryCount` quedaba inflado para el
 * coach y la propia correctora era retirable — generando otra correctora, sin estado terminal.
 *
 * Ahora el retiro es un gesto propio contra `void_nutrition_intake_v2`: payload MÍNIMO, y toda la
 * reversión ocurre porque los read models ya filtran `entry_status = 'active'`.
 */
export function buildVoidPayload(input: {
  context: Context
  entry: NutritionIntakeReadItem
  reason: string
  idempotencyKey: string
}): NutritionIntakeVoid {
  return {
    clientId: input.context.clientId,
    entryId: input.entry.id,
    reason: input.reason.trim() || 'Registro retirado por el alumno',
    idempotencyKey: input.idempotencyKey,
  }
}

// ── Bulk-mark de franja ("Comí toda esta comida") ────────────────────────────────
// Reusa 1:1 el camino del "Lo comí" individual (mismo buildPrescribedIntakePayload por item,
// key fresca por item) para que el snapshot congelado y los totales sean idénticos. El
// "qué es elegible" lo decide el helper puro compartido (bulkMarkSlotState).

/** Payloads de registro para N items prescritos de una franja (uno por item, key propia). */
export function buildBulkPrescribedPayloads(input: {
  context: Context
  slot: NutritionMealSlotRead
  items: PrescriptionItemRead[]
}): NutritionIntakeMutation[] {
  return input.items.map((item) =>
    buildPrescribedIntakePayload({
      context: input.context,
      slot: input.slot,
      item,
      idempotencyKey: newIdempotencyKey('intake'),
    }),
  )
}

/**
 * Payloads de "deshacer" para los registros recién creados por el bulk: un retiro TERMINAL por
 * cada id creado (mismo mecanismo que "Retirar registro"). Solo hace falta el id devuelto por el
 * servidor, así que no depende del read-model refrescado. Empareja por índice
 * payloads[i] ↔ createdIds[i] (los payloads solo aportan el clientId y el largo de la tanda).
 */
export function buildBulkUndoPayloads(
  payloads: NutritionIntakeMutation[],
  createdIds: string[],
): NutritionIntakeVoid[] {
  const n = Math.min(payloads.length, createdIds.length)
  const out: NutritionIntakeVoid[] = []
  for (let i = 0; i < n; i += 1) {
    out.push({
      clientId: payloads[i].clientId,
      entryId: createdIds[i],
      reason: 'Deshacer registro de la comida',
      idempotencyKey: newIdempotencyKey('void'),
    })
  }
  return out
}

// ── Reemplazos autorizados por el coach (F-02) ───────────────────────────────────
// Los reemplazos estructurados llegan como filas ya mapeadas (mapNutritionItemSubstitutionRow),
// leídas RLS-scoped de nutrition_item_substitutions_v2 por la versión vigente. Estas dos funciones
// puras deciden CÓMO se muestran bajo cada item: el agrupado por item y el reemplazo del texto
// legado "Alternativas: …" cuando ya hay estructura.

/** Prefijo del texto legado "Alternativas: …" que la conversión V1→V2 congeló en `notes`. */
const LEGACY_ALTERNATIVES_NOTE_PREFIX = 'Alternativas:'

/**
 * Agrupa los reemplazos autorizados por `prescriptionItemId`, preservando el orden de llegada
 * (el select ya viene ordenado por `order_index`). Un plan sin reemplazos ⇒ `{}`; nunca lanza.
 */
export function groupSubstitutionsByPrescriptionItem(
  rows: readonly NutritionItemSubstitutionRead[],
): Record<string, NutritionItemSubstitutionRead[]> {
  const map: Record<string, NutritionItemSubstitutionRead[]> = {}
  for (const row of rows) {
    const key = row.prescriptionItemId
    if (!map[key]) map[key] = []
    map[key].push(row)
  }
  return map
}

/**
 * Nota a mostrar bajo un item prescrito. Cuando el item YA tiene reemplazos estructurados (F-02),
 * la fila estructurada reemplaza al texto legado "Alternativas: …" congelado en `notes` (evita el
 * doble render). Cualquier otra nota del coach se conserva tal cual; sin estructura, cae al `notes`
 * legado completo (fallback, no rompe planes viejos).
 */
export function resolveItemDisplayNote(
  notes: string | null | undefined,
  hasStructuredSubstitutions: boolean,
): string | null {
  const trimmed = notes?.trim() ?? ''
  if (trimmed.length === 0) return null
  if (hasStructuredSubstitutions && trimmed.startsWith(LEGACY_ALTERNATIVES_NOTE_PREFIX)) return null
  return notes ?? null
}
