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
  intakeEntryFactor,
  prescribedSnapshotMacros,
  scaleSnapshotMacros,
  type NutritionMacrosBasis,
  type NutritionFoodRowModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionIntakeReadItem,
  type NutritionIntakeVoid,
  type SubstitutionIntakeRequest,
  type NutritionMealSlotRead,
} from '@eva/nutrition-v2'

/** El paquete no exporta el tipo suelto; se deriva de la franja del read-model. */
export type NutritionPrescriptionItemRead = NutritionMealSlotRead['prescriptionItems'][number]

export type NutritionIntakeSource = z.infer<typeof NutritionIntakeSourceSchema>
export type NutritionCaptureMethod = z.infer<typeof NutritionCaptureMethodSchema>

function coerceIntakeSource(value: string | null | undefined): NutritionIntakeSource {
  const parsed = NutritionIntakeSourceSchema.safeParse(value)
  return parsed.success ? parsed.data : 'offplan'
}

function coerceCaptureMethod(value: string | null | undefined): NutritionCaptureMethod {
  const parsed = NutritionCaptureMethodSchema.safeParse(value)
  return parsed.success ? parsed.data : 'manual'
}

/**
 * Snapshot inmutable del alimento congelado en cada registro.
 *
 * `macrosBasis` (NUT-001) DECLARA la base de esos macros: 'per_100' es la del catalogo
 * (`public.foods` guarda por 100 g/ml y `serving_size` solo describe la porcion). Ausente =
 * LEGADO: el servidor conserva la formula historica, que es lo correcto para las entries ya
 * persistidas. Viaja dentro del snapshot (transporte doble con `p_snapshot_macros_basis`), asi
 * que un binario RN viejo contra el RPC nuevo — o al reves — sigue funcionando.
 */
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
  macrosBasis?: NutritionMacrosBasis | null
  exchangeGroupCode?: string
  exchangePortions?: number
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

/**
 * `operationId` DETERMINISTA de la intencion "me comí ESTE item prescrito ESTE día".
 *
 * `newNutritionV2OperationId()` emite un UUID por GESTO, de modo que dos toques de "Lo comí" sobre
 * el mismo item producen dos keys distintas: ni la cola offline (dedup por `userId + key`) ni el
 * RPC (dedup por `client_id + idempotency_key`) pueden colapsarlas, y el día termina con el aporte
 * duplicado (NUT-003). El camino prescrito SÍ tiene identidad lógica natural — (alumno, día, item) —
 * y esta funcion la materializa: misma intencion ⇒ misma key ⇒ una sola escritura.
 *
 * `attempt` (>= 1, default 1) existe para el caso legitimo de repetir el mismo plato: la UI debe
 * pedir confirmacion EXPLICITA y recien entonces incrementarlo; nunca se mueve por un doble toque.
 *
 * Solo aplica al camino prescrito. El "Registrar alimento" libre y las correcciones siguen usando
 * `newNutritionV2OperationId()` (registrar dos veces el mismo alimento libre es una intencion valida).
 *
 * No recibe `clientId`: la key final ya lo incorpora (`buildNutritionIdempotencyKey`), asi que
 * repetirlo aqui solo alargaria la key sin agregar identidad.
 */
export function prescribedIntentOperationId(input: {
  localDate: string
  prescriptionItemId: string
  attempt?: number
}): string {
  const attempt = input.attempt ?? 1
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('prescribedIntentOperationId: attempt debe ser entero >= 1')
  }
  return `presc-${input.localDate}-${input.prescriptionItemId}-a${attempt}`
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
    // Ausente queda AUSENTE (no `null`): un payload sin base declarada conserva la formula
    // legada en el servidor y un re-parse del mutation no debe inventarla.
    ...(snapshot.macrosBasis ? { macrosBasis: snapshot.macrosBasis } : {}),
    ...(snapshot.exchangeGroupCode ? { exchangeGroupCode: snapshot.exchangeGroupCode } : {}),
    ...(snapshot.exchangePortions != null ? { exchangePortions: snapshot.exchangePortions } : {}),
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
 * Snapshot de macros normalizado del item prescrito: POR UNIDAD y con `servingSize = 1`
 * (helper compartido con la web, `@eva/nutrition-v2/intake-normalize`). Lo usa tanto el payload
 * como la UI optimista, para que el numero que ve el alumno y el que persiste el RPC coincidan.
 */
export function prescribedIntakeSnapshotMacros(
  item: Pick<NutritionPrescriptionItemRead, 'macros' | 'quantity'>,
) {
  return prescribedSnapshotMacros(item.macros, item.quantity)
}

/** Totales optimistas de un "Lo comí" prescrito: identicos a los que reconstruira el servidor. */
export function prescribedIntakeTotals(
  item: Pick<NutritionPrescriptionItemRead, 'macros' | 'quantity' | 'unit'>,
): NutritionIntakeTotals {
  return computeIntakeTotals(item.quantity, item.unit, prescribedIntakeSnapshotMacros(item))
}

/**
 * "Comi lo indicado": registra un intake que refleja un item PRESCRITO tal cual. Conserva la franja
 * (`slotCode`), el `prescriptionItemId` y la version del plan.
 *
 * Los macros del item prescrito son TOTALES de la cantidad prescrita, y el RPC SIEMPRE reescala el
 * snapshot por su factor. Mandarlos crudos con `servingSize: null` hacia que 200 g / 330 kcal se
 * persistieran como 660 kcal y que 50 g se subregistraran a la mitad (NUT-002). Por eso el snapshot
 * se normaliza a POR UNIDAD con `servingSize = 1` — el mismo helper compartido que usa la web —, de
 * modo que el total reconstruido `(macros/quantity) x quantity` vuelva a ser exactamente los macros
 * mostrados, con g/ml o con unidades contables.
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
      ...prescribedIntakeSnapshotMacros(input.item),
      servingUnit: input.item.unit,
    },
  })
}

/**
 * Editar (correction) un registro consumido cambiando SOLO la cantidad. Igual que la web,
 * conserva unidad, franja, instante, fuente/captura validas y snapshot del registro original.
 */
export function buildEditIntakeCorrection(input: {
  clientId: string
  deviceId: string
  operationId: string
  localDate: string
  timezone: string
  entry: NutritionIntakeReadItem
  quantity: number
  planVersionId?: string | null
  daySnapshotId?: string | null
  reason: string
}): NutritionIntakeCorrection {
  return buildCorrectionMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: input.localDate,
    occurredAt: input.entry.occurredAt,
    timezone: input.timezone,
    foodId: input.entry.foodId,
    customName: input.entry.foodId ? null : input.entry.customName ?? input.entry.snapshot.name,
    quantity: input.quantity,
    unit: input.entry.unit,
    mealSlot: input.entry.mealSlot,
    source: coerceIntakeSource(input.entry.source),
    captureMethod: coerceCaptureMethod(input.entry.captureMethod),
    planVersionId: input.planVersionId ?? null,
    prescriptionItemId: input.entry.prescriptionItemId,
    daySnapshotId: input.daySnapshotId ?? null,
    correctsEntryId: input.entry.id,
    correctionReason: input.reason.trim(),
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
      exchangeGroupCode: input.entry.exchangeGroupCode ?? undefined,
      exchangePortions: input.entry.exchangePortions ?? undefined,
    },
  })
}

/**
 * Retirar (void) un registro — NUT-010, opcion A: estado TERMINAL `voided`.
 *
 * Payload MINIMO: el servidor no necesita snapshot ni cantidad para retirar. Reemplaza a
 * `buildVoidIntakeCorrection`, que construia una correction de contribucion CERO cuyo reemplazo
 * quedaba ACTIVO — y por eso el item prescrito seguia "consumido" (sin boton "Lo comi" de vuelta),
 * la cobertura de porciones DERIVADA no bajaba y el propio fantasma era retirable de nuevo.
 * Paridad 1:1 con la web (`buildVoidPayload`).
 */
export function buildVoidIntakeRequest(input: {
  clientId: string
  deviceId: string
  operationId: string
  entry: Pick<NutritionIntakeReadItem, 'id'>
  reason: string
}): NutritionIntakeVoid {
  return {
    clientId: input.clientId,
    entryId: input.entry.id,
    reason: input.reason.trim() || 'Registro retirado por el alumno',
    idempotencyKey: buildNutritionIdempotencyKey({
      kind: 'correction',
      clientId: input.clientId,
      deviceId: input.deviceId,
      operationId: input.operationId,
    }),
  }
}

/**
 * LEGADO (NUT-010): retiro modelado como correction de contribucion CERO. Ya NO se usa para el
 * "Retirar registro" del alumno — ese camino es `buildVoidIntakeRequest` + `void_nutrition_intake_v2`.
 * Sigue viva por DOS razones:
 *   1. la cola offline puede tener retiros encolados con ESTE payload antes del deploy, y su camino
 *      (`correct_nutrition_intake_v2`) tiene que drenar al menos un ciclo de release;
 *   2. el deshacer de PORCIONES (`usePortionMarks`) todavia la usa: su reconciliacion optimista
 *      empareja por el id de la entry correctora, asi que migrarlo a void terminal es una tarea
 *      aparte (documentada como pendiente en `undoPortionIntakeAction`).
 * No cablear codigo nuevo de retiro a esta funcion.
 *
 * @deprecated Para retirar un registro, usar `buildVoidIntakeRequest`.
 */
export function buildVoidIntakeCorrection(input: {
  clientId: string
  deviceId: string
  operationId: string
  localDate: string
  timezone: string
  entry: NutritionIntakeReadItem
  planVersionId?: string | null
  daySnapshotId?: string | null
  reason: string
}): NutritionIntakeCorrection {
  return buildCorrectionMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: input.localDate,
    occurredAt: input.entry.occurredAt,
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
    correctionReason: input.reason.trim(),
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
      exchangeGroupCode: input.entry.exchangeGroupCode ?? undefined,
      exchangePortions: input.entry.exchangePortions ?? undefined,
    },
  })
}

/**
 * Factor de escala IDENTICO al servidor (`private.nutrition_v2_entry_factor`): para g/ml divide la
 * cantidad por el serving-size (100 por defecto); para cualquier otra unidad ('un', etc.) el factor
 * es la cantidad. La formula vive en `@eva/nutrition-v2` (compartida con la web); este alias se
 * conserva por compatibilidad de importaciones RN. Mantener 1:1 con la migracion 20260714210000.
 */
export function nutritionV2EntryFactor(
  quantity: number,
  unit: string | null | undefined,
  servingSize: number | null | undefined,
  basis?: NutritionMacrosBasis | null,
): number {
  return intakeEntryFactor({ quantity, unit, servingSize, basis: basis ?? null })
}

export interface NutritionIntakeTotals {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

/**
 * La fila visual optimista conserva también la cantidad estructurada. La UI la
 * necesita para compartir exactamente el mismo estado que muestra mientras una
 * escritura sigue en vuelo o en la cola, sin volver a parsear `quantityLabel`.
 */
export interface OptimisticNutritionFoodRowModel extends NutritionFoodRowModel {
  shareQuantity: number
  shareUnit: string
  /**
   * Idempotency key de la mutacion AUN encolada que produjo esta fila (null si ya salio o si la
   * fila esta en vuelo). Es lo que permite ofrecer "Retirar" sobre una fila offline: sin ella el
   * alumno veia el registro encolado y no tenia ninguna accion para sacarlo (NUT-003 / NUT-019).
   */
  queuedKey?: string | null
}

/**
 * Totales de UN registro (macros del snapshot x factor), redondeados a 1 decimal COMO EL
 * SERVIDOR. Respeta la base declarada del snapshot (`macrosBasis`), de modo que el numero
 * optimista que ve el alumno y el que persiste el RPC sean el mismo tambien para el catalogo
 * per-100. Delega en la funcion pura compartida con la web (`scaleSnapshotMacros`).
 */
export function computeIntakeTotals(
  quantity: number,
  unit: string,
  snapshot: Pick<
    NutritionIntakeSnapshotInput,
    'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG' | 'servingSize' | 'macrosBasis'
  >,
): NutritionIntakeTotals {
  return scaleSnapshotMacros(snapshot, {
    quantity,
    unit,
    servingSize: snapshot.servingSize ?? null,
    basis: snapshot.macrosBasis ?? null,
  })
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
  queuedKey?: string | null
}): OptimisticNutritionFoodRowModel {
  return {
    id: input.id,
    name: input.name,
    detail: input.brand ?? null,
    shareQuantity: input.quantity,
    shareUnit: input.unit,
    quantityLabel: `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(input.quantity)} ${input.unit}`,
    calories: input.totals.calories,
    proteinG: input.totals.proteinG,
    carbsG: input.totals.carbsG,
    fatsG: input.totals.fatsG,
    status: input.status === 'offline' ? 'offline' : 'pending',
    queuedKey: input.queuedKey ?? null,
  }
}

// ── Overlay optimista derivado de la cola offline ────────────────────────────────
// La cola es autoritativa para el replay pero era INVISIBLE para la UI de intake: no apagaba el
// boton "Lo comí" del item ya encolado (NUT-003) ni ofrecia forma de cancelar lo encolado
// (NUT-019). Este builder es puro para poder fijarlo con tests; la pantalla solo lo consume.

/** Forma minima de un item de la cola (`NutritionV2QueuedMutation` es asignable a esta union). */
export type QueuedIntakeLike =
  | { action: 'record'; idempotencyKey: string; payload: NutritionIntakeMutation }
  | { action: 'correct'; idempotencyKey: string; payload: NutritionIntakeCorrection }
  // NUT-010: retiro terminal encolado. Su payload es MINIMO — no trae `localDate` ni snapshot,
  // asi que no puede filtrarse por dia ni pintarse como fila; solo OCULTA la entry objetivo.
  | { action: 'void'; idempotencyKey: string; payload: NutritionIntakeVoid }
  // Sustitucion encolada. Su PAYLOAD es la INTENCION (item + reemplazo + intento) y no trae
  // nombre ni macros — el servidor los resuelve al drenar, que es justamente lo que impide que el
  // cliente mienta. T2.5 suma `preview`, un dato LOCAL que nunca se envia, para poder pintar la
  // fila mientras espera. Sin `preview` el overlay la ignora, como en T2.4.
  | {
      action: 'substitute'
      idempotencyKey: string
      payload: SubstitutionIntakeRequest
      preview?: {
        name: string
        brand: string | null
        quantity: number
        unit: string
        mealSlot: string | null
        totals: NutritionIntakeTotals
      }
    }

export interface QueuedIntakeOverlay {
  addedBySlot: Record<string, OptimisticNutritionFoodRowModel[]>
  addedUnassigned: OptimisticNutritionFoodRowModel[]
  hiddenIds: string[]
  /** Items prescritos con un `record` AUN encolado para ese dia (apagan el boton "Lo comí"). */
  queuedPrescriptionItemIds: string[]
  /** Idempotency key encolada por `prescriptionItemId`, para cancelar en cola sin buscarla. */
  queuedKeyByPrescriptionItemId: Record<string, string>
}

export const EMPTY_QUEUED_INTAKE_OVERLAY: QueuedIntakeOverlay = {
  addedBySlot: {},
  addedUnassigned: [],
  hiddenIds: [],
  queuedPrescriptionItemIds: [],
  queuedKeyByPrescriptionItemId: {},
}

/**
 * Reconstruye la representacion optimista de records/correcciones normales desde la cola
 * autoritativa (unica fuente persistida: sobrevive remount, focus y reinicio). Las marcas
 * sinteticas de porciones tienen su propio lente (`usePortionMarks`) y se excluyen para no
 * mostrarlas como alimentos consumidos.
 */
export function buildQueuedIntakeOverlay(
  queued: ReadonlyArray<QueuedIntakeLike>,
  localDate: string,
): QueuedIntakeOverlay {
  type QueuedRecordLike = Extract<QueuedIntakeLike, { action: 'record' }>
  type QueuedCorrectionLike = Extract<QueuedIntakeLike, { action: 'correct' }>

  type QueuedSubstitutionLike = Extract<QueuedIntakeLike, { action: 'substitute' }>

  const records: QueuedRecordLike[] = []
  const substitutions: QueuedSubstitutionLike[] = []
  const corrections = new Map<string, QueuedCorrectionLike>()
  // Entries con un RETIRO encolado: se ocultan aunque el servidor todavia las devuelva activas.
  // No se filtran por dia: el payload minimo del void no lleva fecha, y ocultar de mas en otro dia
  // es imposible (el id de la entry es unico).
  const voided: string[] = []

  for (const item of queued) {
    if (item.action === 'void') {
      voided.push(item.payload.entryId)
      continue
    }
    // T2.4 la ignoraba: el payload es la intencion (item + reemplazo), sin nombre ni macros, y
    // era mejor no mostrar nada que inventar un nombre. El precio fue que encolar sin red no daba
    // NINGUNA senal, que es el reparo que quedo abierto.
    //
    // T2.5 lo resuelve sin inventar: el sheet ya sabe que eligio el alumno, y esos datos viajan en
    // `preview` — que es local, no forma parte del payload y nunca se envia. Sin `preview` (cola
    // escrita por una version anterior) se sigue ignorando.
    if (item.action === 'substitute') {
      if (item.payload.localDate !== localDate || !item.preview) continue
      substitutions.push(item)
      continue
    }
    if (item.payload.localDate !== localDate) continue
    if (item.action === 'correct') corrections.set(item.payload.correctsEntryId, item)
    else if (!item.payload.snapshot.exchangeGroupCode) records.push(item)
  }

  const overlay: QueuedIntakeOverlay = {
    addedBySlot: {},
    addedUnassigned: [],
    hiddenIds: [],
    queuedPrescriptionItemIds: [],
    queuedKeyByPrescriptionItemId: {},
  }
  const append = (item: QueuedRecordLike | QueuedCorrectionLike) => {
    const payload = item.payload
    const totals = computeIntakeTotals(payload.quantity, payload.unit, payload.snapshot)
    const row = optimisticIntakeRow({
      id: `queued-${item.idempotencyKey}`,
      name: payload.snapshot.name,
      brand: payload.snapshot.brand,
      quantity: payload.quantity,
      unit: payload.unit,
      status: 'offline',
      totals,
      queuedKey: item.idempotencyKey,
    })
    if (payload.mealSlot) {
      overlay.addedBySlot[payload.mealSlot] = [...(overlay.addedBySlot[payload.mealSlot] ?? []), row]
    } else {
      overlay.addedUnassigned.push(row)
    }
  }

  for (const item of records) {
    append(item)
    const prescriptionItemId = item.payload.prescriptionItemId
    if (prescriptionItemId && !overlay.queuedKeyByPrescriptionItemId[prescriptionItemId]) {
      overlay.queuedPrescriptionItemIds.push(prescriptionItemId)
      overlay.queuedKeyByPrescriptionItemId[prescriptionItemId] = item.idempotencyKey
    }
  }
  // Sustituciones encoladas: la fila optimista sale de `preview`, y el item prescrito queda
  // marcado como "en cola" igual que el camino de "Lo comí" — que era exactamente la señal que
  // faltaba.
  for (const item of substitutions) {
    const preview = item.preview
    if (!preview) continue
    const row = optimisticIntakeRow({
      id: `queued-${item.idempotencyKey}`,
      name: preview.name,
      brand: preview.brand,
      quantity: preview.quantity,
      unit: preview.unit,
      status: 'offline',
      totals: preview.totals,
      queuedKey: item.idempotencyKey,
    })
    if (preview.mealSlot) {
      overlay.addedBySlot[preview.mealSlot] = [
        ...(overlay.addedBySlot[preview.mealSlot] ?? []),
        row,
      ]
    } else {
      overlay.addedUnassigned.push(row)
    }
    const prescriptionItemId = item.payload.prescriptionItemId
    if (!overlay.queuedKeyByPrescriptionItemId[prescriptionItemId]) {
      overlay.queuedPrescriptionItemIds.push(prescriptionItemId)
      overlay.queuedKeyByPrescriptionItemId[prescriptionItemId] = item.idempotencyKey
    }
  }
  for (const [correctsEntryId, item] of corrections) {
    overlay.hiddenIds.push(correctsEntryId)
    // Un retiro LEGADO encolado (payload de corrección de aporte cero, anterior a NUT-010) no se
    // representa como fila consumida. Una edición sí muestra su reemplazo.
    if (item.payload.note !== 'Registro retirado' && !item.payload.snapshot.exchangeGroupCode) append(item)
  }
  for (const entryId of voided) {
    if (!overlay.hiddenIds.includes(entryId)) overlay.hiddenIds.push(entryId)
  }
  return overlay
}

/** Copy + disponibilidad de "Deshacer" del snackbar de una tanda ("Comí toda esta comida"). */
export interface BulkAteSnackbarState {
  message: string
  detail: string | null
  tone: 'default' | 'danger'
  canUndo: boolean
}

/**
 * Reducer PURO del snackbar de la tanda. Antes el copy mentia por omision: con
 * `(recorded 1, queued 2)` decia "Registraste tu Almuerzo" con "Deshacer", el undo solo anulaba lo
 * registrado y minutos despues aparecian los 2 encolados (NUT-019). Ahora el detalle nombra SIEMPRE
 * lo que quedo en cola y el "Deshacer" se ofrece tambien cuando TODO quedo encolado (es cancelable
 * en la cola local).
 */
export function bulkAteSnackbarState(input: {
  slotName: string
  eligible: number
  recorded: number
  queued: number
}): BulkAteSnackbarState {
  const { slotName, eligible, recorded, queued } = input
  if (recorded === 0 && queued === 0) {
    return { message: `No se pudo registrar tu ${slotName}.`, detail: null, tone: 'danger', canUndo: false }
  }
  const leftover = Math.max(eligible - recorded - queued, 0)
  const parts: string[] = []
  if (recorded > 0 && (queued > 0 || leftover > 0)) parts.push(`Registré ${recorded} de ${eligible}.`)
  if (queued > 0) {
    parts.push(
      queued === 1
        ? '1 quedó en cola y se enviará cuando vuelvas a tener internet.'
        : `${queued} quedaron en cola y se enviarán cuando vuelvas a tener internet.`,
    )
  }
  if (leftover > 0) {
    parts.push(leftover === 1 ? 'Quedó 1 sin registrar.' : `Quedaron ${leftover} sin registrar.`)
  }
  return {
    message: recorded === 0 ? `Guardé tu ${slotName} sin conexión.` : `Registraste tu ${slotName}`,
    detail: parts.length > 0 ? parts.join(' ') : null,
    tone: 'default',
    canUndo: true,
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
