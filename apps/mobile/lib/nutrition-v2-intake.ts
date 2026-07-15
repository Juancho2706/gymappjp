/**
 * nutrition-v2-intake — logica PURA (sin react-native / supabase / red) del registro de consumo
 * V2 del alumno. Es el nucleo testeable que consumen las pantallas Hoy / Registrar y el runner de
 * red (`nutrition-v2-intake-runner.ts`). Aqui viven:
 *
 *  - la construccion validada (Zod) de los payloads `record` / `correct` con idempotency-key ESTABLE
 *    por intento (uuid conservado en la cola offline para dedup extremo-a-extremo);
 *  - la formula de totales identica al servidor (`nutrition_v2_entry_factor`), para la UI optimista;
 *  - la clasificacion de errores (que error de red se encola vs cual se muestra).
 *
 * NO importa react-native ni ./api (que arrastra supabase) para poder correr bajo Vitest.
 */
import { z } from 'zod'
import {
  NutritionCaptureMethodSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeSourceSchema,
  buildNutritionIdempotencyKey,
  type NutritionFoodRowModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
} from '@eva/nutrition-v2'

/** El paquete no exporta el tipo suelto; se deriva de la franja del read-model. */
export type NutritionPrescriptionItemRead = NutritionMealSlotRead['prescriptionItems'][number]

export type NutritionIntakeSource = z.infer<typeof NutritionIntakeSourceSchema>
export type NutritionCaptureMethod = z.infer<typeof NutritionCaptureMethodSchema>

/** Snapshot inmutable del alimento congelado en cada registro (per-serving, igual que el catalogo). */
export interface NutritionIntakeSnapshotInput {
  name: string
  brand?: string | null
  calories?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatsG?: number | null
  fiberG?: number | null
  servingSize?: number | null
  servingUnit?: string | null
}

export interface BuildIntakeInput {
  clientId: string
  /** ID de dispositivo ESTABLE (persistido) — entra en la idempotency key. */
  deviceId: string
  /** UUID generado UNA vez al crear la intencion; conservado si se reintenta/encola. */
  operationId: string
  localDate: string
  occurredAt: string
  timezone: string
  foodId: string | null
  customName?: string | null
  quantity: number
  unit: string
  mealSlot: string | null
  source: NutritionIntakeSource
  captureMethod: NutritionCaptureMethod
  planVersionId?: string | null
  prescriptionItemId?: string | null
  daySnapshotId?: string | null
  note?: string | null
  snapshot: NutritionIntakeSnapshotInput
}

/**
 * Idempotency key ESTABLE por intento. Deriva SOLO de datos estables (clientId + deviceId +
 * operationId), nunca del reloj, para que un reintento/encolado produzca EXACTAMENTE la misma key y
 * el RPC (dedup por client_id + idempotency_key) y la cola (dedup por userId + key) colapsen el
 * mismo intento a una sola escritura.
 */
export function nutritionV2IntakeIdempotencyKey(input: {
  clientId: string
  deviceId: string
  operationId: string
  kind: 'intake' | 'correction'
}): string {
  return buildNutritionIdempotencyKey({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    kind: input.kind,
  })
}

function snapshotPayload(snapshot: NutritionIntakeSnapshotInput) {
  return {
    name: snapshot.name,
    brand: snapshot.brand ?? null,
    calories: snapshot.calories ?? null,
    proteinG: snapshot.proteinG ?? null,
    carbsG: snapshot.carbsG ?? null,
    fatsG: snapshot.fatsG ?? null,
    fiberG: snapshot.fiberG ?? null,
    servingSize: snapshot.servingSize ?? null,
    servingUnit: snapshot.servingUnit ?? null,
  }
}

/** Construye y VALIDA (Zod) un payload `record`. La key es estable por `operationId`. */
export function buildRecordIntakeMutation(input: BuildIntakeInput): NutritionIntakeMutation {
  return NutritionIntakeMutationSchema.parse({
    clientId: input.clientId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: input.foodId,
    customName: input.customName ?? null,
    quantity: input.quantity,
    unit: input.unit,
    mealSlot: input.mealSlot,
    source: input.source,
    captureMethod: input.captureMethod,
    daySnapshotId: input.daySnapshotId ?? null,
    planVersionId: input.planVersionId ?? null,
    prescriptionItemId: input.prescriptionItemId ?? null,
    idempotencyKey: nutritionV2IntakeIdempotencyKey({
      clientId: input.clientId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      kind: 'intake',
    }),
    note: input.note ?? null,
    snapshot: snapshotPayload(input.snapshot),
  })
}

/** Construye y VALIDA (Zod) un payload `correct` (cadena de correccion). */
export function buildCorrectionMutation(
  input: BuildIntakeInput & { correctsEntryId: string; correctionReason: string },
): NutritionIntakeCorrection {
  return NutritionIntakeCorrectionSchema.parse({
    clientId: input.clientId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: input.foodId,
    customName: input.customName ?? null,
    quantity: input.quantity,
    unit: input.unit,
    mealSlot: input.mealSlot,
    source: input.source,
    captureMethod: input.captureMethod,
    daySnapshotId: input.daySnapshotId ?? null,
    planVersionId: input.planVersionId ?? null,
    prescriptionItemId: input.prescriptionItemId ?? null,
    idempotencyKey: nutritionV2IntakeIdempotencyKey({
      clientId: input.clientId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      kind: 'correction',
    }),
    note: input.note ?? null,
    snapshot: snapshotPayload(input.snapshot),
    correctsEntryId: input.correctsEntryId,
    correctionReason: input.correctionReason,
  })
}

/**
 * "Comi lo indicado": registra un intake que refleja un item PRESCRITO tal cual. Conserva la franja
 * (`slotCode`), el `prescriptionItemId` y la version del plan, y congela los macros mostrados del
 * item como snapshot. La cantidad/unidad prescritas se pasan tal cual; el servidor calcula los
 * totales con su factor (serving-size del snapshot, o 100 por defecto).
 */
export function buildAteAsPrescribedMutation(input: {
  clientId: string
  deviceId: string
  operationId: string
  localDate: string
  occurredAt: string
  timezone: string
  slotCode: string | null
  planVersionId: string | null
  daySnapshotId: string | null
  item: NutritionPrescriptionItemRead
}): NutritionIntakeMutation {
  return buildRecordIntakeMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: input.item.foodId,
    customName: input.item.foodId ? null : input.item.name ?? 'Alimento prescrito',
    quantity: input.item.quantity,
    unit: input.item.unit,
    mealSlot: input.slotCode,
    source: 'prescription',
    captureMethod: 'prescription',
    planVersionId: input.planVersionId,
    prescriptionItemId: input.item.id,
    daySnapshotId: input.daySnapshotId,
    snapshot: {
      name: input.item.name ?? 'Alimento prescrito',
      brand: input.item.brand,
      calories: input.item.macros.calories,
      proteinG: input.item.macros.proteinG,
      carbsG: input.item.macros.carbsG,
      fatsG: input.item.macros.fatsG,
      fiberG: input.item.macros.fiberG,
      servingSize: null,
      servingUnit: input.item.unit,
    },
  })
}

/**
 * Editar (correction) un registro consumido cambiando cantidad/unidad. Reusa el alimento y snapshot
 * originales del entry; solo cambian cantidad/unidad (y opcionalmente la franja).
 */
export function buildEditIntakeCorrection(input: {
  clientId: string
  deviceId: string
  operationId: string
  localDate: string
  occurredAt: string
  timezone: string
  entry: NutritionIntakeReadItem
  quantity: number
  unit: string
  mealSlot?: string | null
  planVersionId?: string | null
  daySnapshotId?: string | null
  reason?: string
}): NutritionIntakeCorrection {
  return buildCorrectionMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: input.entry.foodId,
    customName: input.entry.foodId ? null : input.entry.customName ?? input.entry.snapshot.name,
    quantity: input.quantity,
    unit: input.unit,
    mealSlot: input.mealSlot === undefined ? input.entry.mealSlot : input.mealSlot,
    source: 'substitution',
    captureMethod: 'manual',
    planVersionId: input.planVersionId ?? null,
    prescriptionItemId: input.entry.prescriptionItemId,
    daySnapshotId: input.daySnapshotId ?? null,
    correctsEntryId: input.entry.id,
    correctionReason: input.reason?.trim() || 'Ajuste de cantidad del alumno',
    snapshot: {
      name: input.entry.snapshot.name,
      brand: input.entry.snapshot.brand,
      calories: input.entry.snapshot.calories,
      proteinG: input.entry.snapshot.proteinG,
      carbsG: input.entry.snapshot.carbsG,
      fatsG: input.entry.snapshot.fatsG,
      fiberG: input.entry.snapshot.fiberG,
      servingSize: input.entry.snapshot.servingSize,
      servingUnit: input.entry.snapshot.servingUnit,
    },
  })
}

/**
 * Retirar (void) un registro. Sin un RPC de void expuesto a mobile, el unico mecanismo del contrato
 * es una correction: marca el original `corrected` (fuera de totales) e inserta un reemplazo de
 * contribucion CERO (macros 0), preservando la cadena de auditoria. La cantidad se mantiene positiva
 * (el schema exige quantity > 0); son los macros en 0 los que retiran el aporte del dia.
 */
export function buildVoidIntakeCorrection(input: {
  clientId: string
  deviceId: string
  operationId: string
  localDate: string
  occurredAt: string
  timezone: string
  entry: NutritionIntakeReadItem
  planVersionId?: string | null
  daySnapshotId?: string | null
  reason?: string
}): NutritionIntakeCorrection {
  return buildCorrectionMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: input.entry.foodId,
    customName: input.entry.foodId ? null : input.entry.customName ?? input.entry.snapshot.name,
    quantity: input.entry.quantity,
    unit: input.entry.unit,
    mealSlot: input.entry.mealSlot,
    source: 'manual',
    captureMethod: 'manual',
    planVersionId: input.planVersionId ?? null,
    prescriptionItemId: input.entry.prescriptionItemId,
    daySnapshotId: input.daySnapshotId ?? null,
    correctsEntryId: input.entry.id,
    correctionReason: input.reason?.trim() || 'Registro retirado por el alumno',
    note: 'Registro retirado',
    snapshot: {
      name: input.entry.snapshot.name,
      brand: input.entry.snapshot.brand,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatsG: 0,
      fiberG: 0,
      servingSize: input.entry.snapshot.servingSize,
      servingUnit: input.entry.snapshot.servingUnit,
    },
  })
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Factor de escala IDENTICO al servidor (`private.nutrition_v2_entry_factor`): para g/ml divide la
 * cantidad por el serving-size (100 por defecto); para cualquier otra unidad ('un', etc.) el factor
 * es la cantidad. Mantener 1:1 con la migracion 20260714210000.
 */
export function nutritionV2EntryFactor(
  quantity: number,
  unit: string | null | undefined,
  servingSize: number | null | undefined,
): number {
  const u = (unit ?? '').toLowerCase()
  if (u === 'g' || u === 'ml') {
    return Math.max(quantity || 0, 0) / Math.max(servingSize ?? 100, 0.0001)
  }
  return Math.max(quantity || 0, 0)
}

export interface NutritionIntakeTotals {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

/** Totales de UN registro (snapshot per-serving x factor), redondeados a 1 decimal como el servidor. */
export function computeIntakeTotals(
  quantity: number,
  unit: string,
  snapshot: Pick<
    NutritionIntakeSnapshotInput,
    'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG' | 'servingSize'
  >,
): NutritionIntakeTotals {
  const f = nutritionV2EntryFactor(quantity, unit, snapshot.servingSize ?? null)
  return {
    calories: round1((snapshot.calories ?? 0) * f),
    proteinG: round1((snapshot.proteinG ?? 0) * f),
    carbsG: round1((snapshot.carbsG ?? 0) * f),
    fatsG: round1((snapshot.fatsG ?? 0) * f),
    fiberG: round1((snapshot.fiberG ?? 0) * f),
  }
}

/**
 * Fila optimista (kit `FoodRow`) para un registro aun no confirmado por el servidor. `status`
 * 'offline' cuando quedo en la cola, 'pending' cuando esta en vuelo.
 */
export function optimisticIntakeRow(input: {
  id: string
  name: string
  brand?: string | null
  quantity: number
  unit: string
  status: 'pending' | 'offline'
  totals: NutritionIntakeTotals
}): NutritionFoodRowModel {
  return {
    id: input.id,
    name: input.name,
    detail: input.brand ?? null,
    quantityLabel: `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(input.quantity)} ${input.unit}`,
    calories: input.totals.calories,
    proteinG: input.totals.proteinG,
    carbsG: input.totals.carbsG,
    fatsG: input.totals.fatsG,
    status: input.status === 'offline' ? 'offline' : 'pending',
  }
}

function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

/**
 * Debe ENCOLARSE este error de una escritura online? Espeja la politica de reintentos de la cola
 * (`isRetryable` en nutrition-v2-offline): un error SIN status HTTP (red / desconocido) es
 * transitorio -> encolar; un `ApiError` con status se encola SOLO si es 408/429/5xx. Un 4xx
 * determinista (validacion/scope) NO se encola: se muestra y se revierte el optimismo.
 */
export function shouldQueueNutritionV2Error(error: unknown): boolean {
  const status = extractStatus(error)
  if (status === null) return true
  return status === 408 || status === 429 || status >= 500
}
