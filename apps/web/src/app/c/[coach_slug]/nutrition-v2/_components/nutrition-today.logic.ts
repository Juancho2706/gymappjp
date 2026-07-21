import type {
  FoodCatalogItem,
  NutritionFoodRowModel,
  NutritionIntakeCorrection,
  NutritionIntakeMutation,
  NutritionIntakeReadItem,
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

/** Divide preservando null (macros por unidad prescrita). */
function perUnit(value: number | null, quantity: number): number | null {
  if (value === null || !Number.isFinite(value) || quantity <= 0) return value === null ? null : value
  return value / quantity
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
 * cualquiera sea la unidad (g/ml o unidades discretas).
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
      calories: perUnit(item.macros.calories, item.quantity),
      proteinG: perUnit(item.macros.proteinG, item.quantity),
      carbsG: perUnit(item.macros.carbsG, item.quantity),
      fatsG: perUnit(item.macros.fatsG, item.quantity),
      fiberG: perUnit(item.macros.fiberG, item.quantity),
      servingSize: 1,
      servingUnit: item.unit,
    },
  }
}

/**
 * Alimento libre del catalogo. Los macros del catalogo son por-porcion
 * (servingSize/servingUnit); el RPC escala segun la cantidad y unidad elegidas.
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
    unit: input.unit,
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
    },
    correctsEntryId: entry.id,
    correctionReason: input.reason,
  }
}

/**
 * "Retirar" un registro. Sin un RPC de void dedicado, el único mecanismo del contrato es una
 * corrección de contribución CERO: conserva cantidad/unidad/franja/alimento del original, marca
 * source/captureMethod 'manual' y pone los macros del snapshot en 0. Así el original queda
 * `corrected` (fuera de totales) y el reemplazo activo no aporta al día, preservando la cadena de
 * auditoría (correctsEntryId). Paridad 1:1 con RN (buildVoidIntakeCorrection).
 */
export function buildVoidPayload(input: {
  context: Context
  entry: NutritionIntakeReadItem
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
    customName: entry.foodId ? null : entry.customName ?? entry.snapshot.name,
    quantity: entry.quantity,
    unit: entry.unit,
    mealSlot: entry.mealSlot,
    source: 'manual',
    captureMethod: 'manual',
    daySnapshotId: context.snapshotId,
    planVersionId: context.planVersionId,
    prescriptionItemId: entry.prescriptionItemId,
    idempotencyKey: input.idempotencyKey,
    note: 'Registro retirado',
    snapshot: {
      name: entry.snapshot.name,
      brand: entry.snapshot.brand,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatsG: 0,
      fiberG: 0,
      servingSize: entry.snapshot.servingSize,
      servingUnit: entry.snapshot.servingUnit,
    },
    correctsEntryId: entry.id,
    correctionReason: input.reason.trim() || 'Registro retirado por el alumno',
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
 * Payloads de "deshacer" para los registros recién creados por el bulk: una corrección de
 * contribución CERO por cada id creado (mismo mecanismo que "Retirar registro"), reusando el
 * payload original enviado (mismo alimento/cantidad/franja) para no depender del read-model
 * refrescado. Empareja por índice payloads[i] ↔ createdIds[i].
 */
export function buildBulkUndoPayloads(
  payloads: NutritionIntakeMutation[],
  createdIds: string[],
): NutritionIntakeCorrection[] {
  const n = Math.min(payloads.length, createdIds.length)
  const out: NutritionIntakeCorrection[] = []
  for (let i = 0; i < n; i += 1) {
    const p = payloads[i]
    out.push({
      ...p,
      source: 'manual',
      captureMethod: 'manual',
      note: 'Registro retirado',
      idempotencyKey: newIdempotencyKey('void'),
      snapshot: { ...p.snapshot, calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
      correctsEntryId: createdIds[i],
      correctionReason: 'Deshacer registro de la comida',
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
