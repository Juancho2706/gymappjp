/**
 * nutrition-v2-portions — capa de PORCIONES (intercambios) del alumno RN (SPEC
 * nutrition-portions R4/R5/UX-b/UX-c). Contiene:
 *
 *  - Contador `attempt` PERSISTIDO por (usuario, fecha, franja, grupo, ordinal)
 *    (hallazgos B2/M1): cada deshacer de un ordinal — incluso si solo canceló una
 *    entrada aún encolada — incrementa `attempt`, así re-marcar produce una
 *    idempotency key NUEVA que jamás colisiona con el intake anulado, mientras el
 *    replay offline de la MISMA marca conserva su key (dedup extremo-a-extremo).
 *  - Constructores del intake sintético de porción (transporte por `p_snapshot`
 *    con `exchangeGroupCode`/`exchangePortions` — SPEC B1) y del void de deshacer.
 *  - Delta optimista SOLO-marcadas + reconciliación contra el read-model
 *    (hallazgo F1-front): las `derivadas` JAMÁS se estiman en cliente.
 *  - Llenado de segmentos de los chips (regla floor(x·2)/2 — SPEC R5) y helpers
 *    de agrupación con REUSO de referencias por franja (hallazgo M3: marcar solo
 *    re-renderiza el chip y su franja).
 *  - Glue de cola offline: cancelar-en-cola (deshacer M1) y lectura de keys
 *    encoladas para reconciliar.
 *
 * La lógica es pura salvo la persistencia del contador (AsyncStorage) y el glue de
 * cola; los tests (tests/mobile-nutrition-v2-portions.test.ts) mockean AsyncStorage
 * por path absoluto igual que la suite de la cola offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  NutritionIntakeMutationSchema,
  buildNutritionPortionIntakeKey,
  type NutritionDayCoverageRead,
  type NutritionExchangeFoodRead,
  type NutritionIntakeMutation,
  type NutritionIntakeReadItem,
  type NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import {
  getNutritionV2QueuedKeys,
  removeNutritionV2QueuedMutation,
  type NutritionV2QueuedMutation,
} from './nutrition-v2-offline'

// ---------------------------------------------------------------------------
// Formato (display es-CL, coma decimal; 1 decimal máx — SPEC R5)
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** "1,5" / "0,8" / "2" — coma decimal es-CL, 1 decimal máx. */
export function formatPortionsCl(value: number): string {
  const r = round1(value)
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',')
}

/** Cuantización a medias porciones para segmentos/exceso: floor(x·2)/2 (SPEC R5). */
export function floorHalf(value: number): number {
  return Math.floor(value * 2 + 1e-9) / 2
}

// ---------------------------------------------------------------------------
// Contador attempt por ordinal (hallazgos B2/M1) — núcleo puro
// ---------------------------------------------------------------------------

export interface PortionCellCounter {
  /** Próximo ordinal (0-based) a usar al marcar en esta celda (fecha, franja, grupo). */
  next: number
  /** attempt vigente por ordinal (default 1). Se incrementa en CADA deshacer del ordinal. */
  attempts: Record<string, number>
}

export interface PortionOrdinalAllocation {
  cell: PortionCellCounter
  ordinal: number
  attempt: number
}

/** Marca: toma el ordinal `next` con su attempt vigente y avanza `next`. Puro. */
export function allocatePortionOrdinal(
  cell: PortionCellCounter | undefined,
): PortionOrdinalAllocation {
  const base: PortionCellCounter = cell ?? { next: 0, attempts: {} }
  const ordinal = Math.max(base.next, 0)
  const attempt = base.attempts[String(ordinal)] ?? 1
  return {
    cell: { next: ordinal + 1, attempts: { ...base.attempts } },
    ordinal,
    attempt,
  }
}

/**
 * Deshacer (o fallo determinista de un marcar): retrocede al último ordinal usado e
 * INCREMENTA su attempt — incluso si el deshacer solo canceló una entrada de la cola
 * (M1): si esa marca ya había sincronizado sin que el device lo supiera, el próximo
 * marcar usa una key nueva y no colisiona. Puro.
 */
export function registerPortionUndoOrdinal(
  cell: PortionCellCounter | undefined,
): PortionOrdinalAllocation {
  const base: PortionCellCounter = cell ?? { next: 0, attempts: {} }
  const ordinal = Math.max(base.next - 1, 0)
  const key = String(ordinal)
  const attempt = (base.attempts[key] ?? 1) + 1
  return {
    cell: { next: ordinal, attempts: { ...base.attempts, [key]: attempt } },
    ordinal,
    attempt,
  }
}

// ---------------------------------------------------------------------------
// Persistencia del contador (AsyncStorage, RMW serializado)
// ---------------------------------------------------------------------------

const ATTEMPTS_KEY = 'eva:nutrition-v2:portion-attempts:v1'
/** Fechas retenidas por usuario (hoy + margen por timezone/medianoche). */
const MAX_DATES_PER_USER = 4

type AttemptStore = Record<string, Record<string, Record<string, PortionCellCounter>>>

function portionCellStorageKey(slotCode: string, groupCode: string): string {
  return `${slotCode}::${groupCode}`
}

function parseAttemptStore(raw: string | null): AttemptStore {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as AttemptStore) : {}
  } catch {
    return {}
  }
}

/** Poda fechas viejas del usuario (el contador solo tiene sentido para el día vigente). */
export function prunePortionAttemptDates(
  dates: Record<string, Record<string, PortionCellCounter>>,
  keep: number = MAX_DATES_PER_USER,
): Record<string, Record<string, PortionCellCounter>> {
  const keys = Object.keys(dates).sort().reverse().slice(0, keep)
  const next: Record<string, Record<string, PortionCellCounter>> = {}
  for (const key of keys) next[key] = dates[key]
  return next
}

// Cadena de serialización: dos taps rápidos no deben pisarse el read-modify-write.
let attemptStoreChain: Promise<unknown> = Promise.resolve()

function withAttemptStore<T>(
  mutate: (store: AttemptStore) => { store: AttemptStore; result: T },
): Promise<T> {
  const run = attemptStoreChain.then(async () => {
    const raw = await AsyncStorage.getItem(ATTEMPTS_KEY).catch(() => null)
    const { store, result } = mutate(parseAttemptStore(raw))
    await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(store)).catch(() => {})
    return result
  })
  attemptStoreChain = run.catch(() => {})
  return run
}

function mutateCell(
  store: AttemptStore,
  input: { userId: string; localDate: string; slotCode: string; groupCode: string },
  fn: (cell: PortionCellCounter | undefined) => PortionOrdinalAllocation,
): { store: AttemptStore; result: { ordinal: number; attempt: number } } {
  const cellKey = portionCellStorageKey(input.slotCode, input.groupCode)
  const userDates = store[input.userId] ?? {}
  const day = userDates[input.localDate] ?? {}
  const { cell, ordinal, attempt } = fn(day[cellKey])
  const nextStore: AttemptStore = {
    ...store,
    [input.userId]: prunePortionAttemptDates({
      ...userDates,
      [input.localDate]: { ...day, [cellKey]: cell },
    }),
  }
  return { store: nextStore, result: { ordinal, attempt } }
}

/** Asigna (y persiste) el ordinal+attempt de una marca nueva. */
export function allocatePortionAttempt(input: {
  userId: string
  localDate: string
  slotCode: string
  groupCode: string
}): Promise<{ ordinal: number; attempt: number }> {
  return withAttemptStore((store) => mutateCell(store, input, allocatePortionOrdinal))
}

/** Registra (y persiste) un deshacer/fallo del último ordinal de la celda. */
export function registerPortionUndo(input: {
  userId: string
  localDate: string
  slotCode: string
  groupCode: string
}): Promise<{ ordinal: number; attempt: number }> {
  return withAttemptStore((store) => mutateCell(store, input, registerPortionUndoOrdinal))
}

// ---------------------------------------------------------------------------
// Intake sintético de porción (SPEC R4) — payload y void
// ---------------------------------------------------------------------------

/**
 * Payload `record` del marcar-porción. Igual que la PWA: los 2 valores de porción
 * viajan DENTRO del snapshot (`p_snapshot` — SPEC B1). El snapshot de macros es la
 * ref POR PORCIÓN del target congelado; `quantity = porciones` con unidad no-g/ml
 * hace que el factor del servidor (`nutrition_v2_entry_factor`) produzca
 * totales = ref × porciones.
 */
export type NutritionPortionIntakeMutation = NutritionIntakeMutation & {
  snapshot: NutritionIntakeMutation['snapshot'] & {
    exchangeGroupCode: string
    exchangePortions: number
  }
}

export function buildPortionMarkMutation(input: {
  clientId: string
  deviceId: string
  localDate: string
  occurredAt: string
  timezone: string
  slotCode: string
  planVersionId: string | null
  daySnapshotId: string | null
  target: Pick<NutritionSlotExchangeTargetRead, 'groupCode' | 'groupName' | 'ref' | 'macrosConfirmed'>
  /** 1 ó 0,5 (múltiplos de 0,5; lo valida el CHECK/contrato). */
  portions: number
  ordinal: number
  attempt: number
}): { payload: NutritionPortionIntakeMutation; idempotencyKey: string } {
  const idempotencyKey = buildNutritionPortionIntakeKey({
    clientId: input.clientId,
    deviceId: input.deviceId,
    localDate: input.localDate,
    slotCode: input.slotCode,
    groupCode: input.target.groupCode,
    ordinal: input.ordinal,
    attempt: input.attempt,
  })
  const parsed = NutritionIntakeMutationSchema.parse({
    clientId: input.clientId,
    localDate: input.localDate,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    foodId: null,
    customName: input.target.groupName,
    quantity: input.portions,
    unit: 'porción',
    mealSlot: input.slotCode,
    source: 'prescription',
    captureMethod: 'prescription',
    daySnapshotId: input.daySnapshotId,
    planVersionId: input.planVersionId,
    prescriptionItemId: null,
    idempotencyKey,
    note: null,
    snapshot: {
      name: input.target.groupName,
      brand: null,
      calories: Math.max(input.target.ref.calories, 0),
      proteinG: Math.max(input.target.ref.proteinG, 0),
      carbsG: Math.max(input.target.ref.carbsG, 0),
      fatsG: Math.max(input.target.ref.fatsG, 0),
      fiberG: null,
      servingSize: null,
      servingUnit: 'porción',
    },
  })
  // El schema del contrato aún no declara los campos de porción en el snapshot (los
  // stripea al parsear), así que se re-adjuntan POST-validación: viajan en el payload
  // encolado y en `p_snapshot` (SPEC B1). Cuando el contrato los declare `.optional()`
  // el parse los conserva y este spread queda inocuo.
  const payload: NutritionPortionIntakeMutation = {
    ...parsed,
    snapshot: {
      ...parsed.snapshot,
      exchangeGroupCode: input.target.groupCode,
      exchangePortions: input.portions,
    },
  }
  return { payload, idempotencyKey }
}

/**
 * Último intake sintético ACTIVO de un grupo en la franja (para deshacer una marca
 * que el read-model ya refleja). Identificación por columnas dedicadas
 * (`exchangeGroupCode`/`exchangePortions`), nunca heurísticas por nombre.
 */
export function pickLastSyntheticIntake(
  intakeItems: ReadonlyArray<NutritionIntakeReadItem>,
  groupCode: string,
): NutritionIntakeReadItem | null {
  let found: NutritionIntakeReadItem | null = null
  for (const item of intakeItems) {
    if (item.status !== 'active') continue
    if (item.exchangeGroupCode !== groupCode) continue
    if (item.exchangePortions == null || item.exchangePortions <= 0) continue
    if (!found || item.occurredAt.localeCompare(found.occurredAt) > 0) found = item
  }
  return found
}

// ---------------------------------------------------------------------------
// Delta optimista SOLO-marcadas + reconciliación (hallazgo F1-front)
// ---------------------------------------------------------------------------

export type PendingPortionStatus = 'inflight' | 'queued' | 'confirmed'

export interface PendingPortionMark {
  idempotencyKey: string
  slotCode: string
  groupCode: string
  portions: number
  /** Instante original del record; se conserva al construir una correccion/void. */
  occurredAt: string
  ordinal: number
  attempt: number
  status: PendingPortionStatus
  /** Id server del intake si el record respondió online (para void sin refetch). */
  entryId: string | null
  confirmedAt: number | null
  createdAt: number
}

/** Rebuild the optimistic overlay directly from the authoritative user-scoped queue. */
export function queuedPortionMarksFromMutations(
  items: ReadonlyArray<NutritionV2QueuedMutation>,
  localDate: string,
): PendingPortionMark[] {
  return queuedPortionOverlayFromMutations(items, localDate).marks
}

function queuedPortionMarksOnly(
  items: ReadonlyArray<NutritionV2QueuedMutation>,
  localDate: string,
): PendingPortionMark[] {
  const marks: PendingPortionMark[] = []
  for (const item of items) {
    if (item.action !== 'record' || item.payload.localDate !== localDate) continue
    const slotCode = item.payload.mealSlot
    const groupCode = item.payload.snapshot.exchangeGroupCode
    const portions = item.payload.snapshot.exchangePortions
    if (
      !slotCode ||
      !groupCode ||
      (portions !== 0.5 && portions !== 1)
    ) continue
    const suffix = item.idempotencyKey.match(/-(\d+)-a(\d+)$/)
    marks.push({
      idempotencyKey: item.idempotencyKey,
      slotCode,
      groupCode,
      portions,
      occurredAt: item.payload.occurredAt,
      ordinal: suffix ? Number(suffix[1]) : 0,
      attempt: suffix ? Number(suffix[2]) : 1,
      status: 'queued',
      entryId: null,
      confirmedAt: null,
      createdAt: item.queuedAt,
    })
  }
  return marks
}

/** Void optimista de una entry que el read-model AÚN cuenta como marcada. */
export interface PendingPortionVoid {
  entryId: string
  idempotencyKey: string
  slotCode: string | null
  groupCode: string
  portions: number
  status: PendingPortionStatus
  confirmedAt: number | null
  createdAt: number
}

export interface QueuedPortionOverlay {
  marks: PendingPortionMark[]
  voids: PendingPortionVoid[]
}

/**
 * Reconstruye marcas Y desmarcados desde la cola. Los voids de porción llevan
 * grupo/porciones dentro del snapshot de la corrección; eso permite restaurar el
 * descuento aun sin red ni read-model fresco después de matar la app.
 */
export function queuedPortionOverlayFromMutations(
  items: ReadonlyArray<NutritionV2QueuedMutation>,
  localDate: string,
): QueuedPortionOverlay {
  const marks = queuedPortionMarksOnly(items, localDate)
  const voids: PendingPortionVoid[] = []
  for (const item of items) {
    if (
      item.action !== 'correct' ||
      item.payload.localDate !== localDate ||
      item.payload.note !== 'Registro retirado'
    ) continue
    const groupCode = item.payload.snapshot.exchangeGroupCode
    const portions = item.payload.snapshot.exchangePortions
    if (!groupCode || portions == null || portions <= 0) continue
    voids.push({
      entryId: item.payload.correctsEntryId,
      idempotencyKey: item.idempotencyKey,
      slotCode: item.payload.mealSlot,
      groupCode,
      portions,
      status: 'queued',
      confirmedAt: null,
      createdAt: item.queuedAt,
    })
  }
  return { marks, voids }
}

/**
 * Reconciliación por idempotency key contra un read-model fresco: salen del delta
 * las marcas que el servidor YA refleja —
 *  - `confirmed` cuyo record terminó ANTES de iniciar el fetch;
 *  - `queued` que ya NO están en la cola (flusheadas) y existían antes del fetch.
 * `inflight` nunca se descarta aquí (su outcome las transiciona).
 */
export function reconcilePendingPortionMarks<T extends {
  idempotencyKey: string
  status: PendingPortionStatus
  confirmedAt: number | null
  createdAt: number
}>(items: ReadonlyArray<T>, input: { fetchStartedAt: number; queuedKeys: ReadonlySet<string> }): T[] {
  return items.filter((item) => {
    if (item.status === 'confirmed') {
      return !(item.confirmedAt != null && item.confirmedAt <= input.fetchStartedAt)
    }
    if (item.status === 'queued') {
      return input.queuedKeys.has(item.idempotencyKey) || item.createdAt > input.fetchStartedAt
    }
    return true
  })
}

/**
 * Agrupa items por franja REUTILIZANDO las referencias de arrays previas cuando el
 * contenido de la franja no cambió (hallazgo M3): las franjas no afectadas conservan
 * su prop por identidad y el `React.memo` de su sección no re-renderiza.
 */
export function stablePortionBuckets<T extends { slotCode: string | null }>(
  prev: Record<string, T[]>,
  items: ReadonlyArray<T>,
): Record<string, T[]> {
  const next: Record<string, T[]> = {}
  for (const item of items) {
    const key = item.slotCode ?? '__none__'
    ;(next[key] ??= []).push(item)
  }
  for (const key of Object.keys(next)) {
    const before = prev[key]
    if (
      before &&
      before.length === next[key].length &&
      before.every((item, index) => item === next[key][index])
    ) {
      next[key] = before
    }
  }
  return next
}

/** Σ porciones de marcas pendientes de (franja, grupo); y si alguna sigue sin sync. */
export function pendingPortionsFor(
  marks: ReadonlyArray<PendingPortionMark>,
  groupCode: string,
): { portions: number; unsynced: boolean } {
  let portions = 0
  let unsynced = false
  for (const mark of marks) {
    if (mark.groupCode !== groupCode) continue
    portions += mark.portions
    if (mark.status !== 'confirmed') unsynced = true
  }
  return { portions: round1(portions), unsynced }
}

/** Σ porciones anuladas optimistamente (voids en vuelo) de un grupo. */
export function pendingVoidPortionsFor(
  voids: ReadonlyArray<PendingPortionVoid>,
  groupCode: string,
): number {
  let total = 0
  for (const item of voids) if (item.groupCode === groupCode) total += item.portions
  return round1(total)
}

// ---------------------------------------------------------------------------
// Vista de cobertura + segmentos del chip (SPEC R5 / UX-b)
// ---------------------------------------------------------------------------

export type PortionHalfKind = 'empty' | 'marked' | 'derived' | 'pending'

/** Segmento visual: una porción entera (left+right) o media porción final (right=null). */
export interface PortionSegmentView {
  key: string
  left: PortionHalfKind
  right: PortionHalfKind | null
}

export interface PortionCoverageView {
  prescribed: number
  /** marcadas server + delta optimista − voids optimistas (clamp ≥ 0). */
  marcadas: number
  derivadas: number
  coverage: number
  /** Visible n/N numerator, capped at N; excess is rendered separately as +n. */
  displayCoverage: number
  complete: boolean
  /** Exceso exacto a 1 decimal sobre lo prescrito ("+n"; nunca descuenta otros grupos). */
  excess: number
  /** ¿Hay marcas aún sin sincronizar? (estilo pending: opacidad + puntito ámbar). */
  unsynced: boolean
  segments: PortionSegmentView[]
}

/**
 * Llenado de segmentos por floor(x·2)/2: medias-unidades secuenciales — primero las
 * marcadas sincronizadas, luego las pendientes (tambien son marcadas), y al final
 * las derivadas de alimentos (estilo anillo). Las derivadas vienen SIEMPRE del read-model.
 */
export function buildPortionCoverageView(input: {
  prescribed: number
  marcadas: number
  derivadas: number
  pendingMarcadas: number
  pendingUnsynced: boolean
  voidedPortions?: number
}): PortionCoverageView {
  const prescribed = Math.max(input.prescribed, 0)
  const syncedMarcadas = Math.max(
    round1(Math.max(input.marcadas, 0) - Math.max(input.voidedPortions ?? 0, 0)),
    0,
  )
  const derivadas = Math.max(input.derivadas, 0)
  const pending = Math.max(input.pendingMarcadas, 0)
  const marcadas = round1(syncedMarcadas + pending)
  const coverage = round1(marcadas + derivadas)

  const halfCount = Math.round(prescribed * 2)
  let markedHalves = Math.floor(syncedMarcadas * 2 + 1e-9)
  let derivedHalves = Math.floor(derivadas * 2 + 1e-9)
  let pendingHalves = Math.floor(pending * 2 + 1e-9)

  const halves: PortionHalfKind[] = []
  for (let i = 0; i < halfCount; i += 1) {
    if (markedHalves > 0) {
      halves.push('marked')
      markedHalves -= 1
    } else if (pendingHalves > 0) {
      halves.push('pending')
      pendingHalves -= 1
    } else if (derivedHalves > 0) {
      halves.push('derived')
      derivedHalves -= 1
    } else {
      halves.push('empty')
    }
  }

  const segments: PortionSegmentView[] = []
  for (let i = 0; i < halves.length; i += 2) {
    segments.push({
      key: `seg-${i / 2}`,
      left: halves[i],
      right: i + 1 < halves.length ? halves[i + 1] : null,
    })
  }

  return {
    prescribed,
    marcadas,
    derivadas,
    coverage,
    displayCoverage: Math.min(round1(coverage), prescribed),
    complete: coverage + 1e-9 >= prescribed && prescribed > 0,
    excess: round1(Math.max(coverage - prescribed, 0)),
    unsynced: input.pendingUnsynced,
    segments,
  }
}

/**
 * Cap visual de segmentos (hallazgo H4 del QA visual): con prescripciones grandes los
 * segmentos comprimen el nombre a cero y desbordan el chip en 360 px, así que con MÁS
 * de 8 segmentos el chip colapsa a una barra de progreso continua + contador n/N
 * (misma semántica marcadas/derivadas con los dos estilos de relleno). Segmentos
 * discretos SOLO con <=8. Espejo web en `_components/portion-marks.logic.ts`.
 */
export const PORTION_SEGMENT_CAP = 8

/** true ⇒ representación compacta (barra continua + n/N); false ⇒ segmentos discretos. */
export function portionChipIsCompact(prescribed: number): boolean {
  return Math.ceil(Math.max(prescribed, 0)) > PORTION_SEGMENT_CAP
}

/**
 * Fracciones [0..1] de la barra compacta con la MISMA cuantización de los segmentos
 * (display por floor(x·2)/2, cap al prescrito, marcado-a-mano primero): `marked` se
 * pinta con relleno pleno y `derived` con el estilo derivado; el exceso sigue yendo
 * al badge "+n", nunca a la barra.
 */
export function portionBarFractions(
  prescribed: number,
  marcadas: number,
  derivadas: number,
): { marked: number; derived: number } {
  if (prescribed <= 0) return { marked: 0, derived: 0 }
  const totalFill = Math.min(floorHalf(Math.max(marcadas, 0) + Math.max(derivadas, 0)), prescribed)
  const marked = Math.min(floorHalf(Math.max(marcadas, 0)), totalFill)
  return { marked: marked / prescribed, derived: (totalFill - marked) / prescribed }
}

/** Vista de un chip del resumen del día (fila "Porciones de hoy"). */
export function buildDayCoverageView(
  row: NutritionDayCoverageRead,
  pendingByGroup: Readonly<Record<string, number>>,
  voidedByGroup: Readonly<Record<string, number>>,
): { coverage: number; displayCoverage: number; complete: boolean; excess: number } {
  const marcadas = Math.max(
    round1(row.marcadas + (pendingByGroup[row.groupCode] ?? 0) - (voidedByGroup[row.groupCode] ?? 0)),
    0,
  )
  const coverage = round1(marcadas + row.derivadas)
  return {
    coverage,
    displayCoverage: Math.min(coverage, row.prescribed),
    complete: row.prescribed > 0 && coverage + 1e-9 >= row.prescribed,
    excess: round1(Math.max(coverage - row.prescribed, 0)),
  }
}

/** Canon web: the day row only lists groups prescribed for that day. */
export function visibleDayCoverageRows(
  rows: ReadonlyArray<NutritionDayCoverageRead>,
): NutritionDayCoverageRead[] {
  return rows.filter((row) => row.prescribed > 0)
}

/** Stable visual order shared by chips and equivalence tabs. */
export function orderedPortionTargets(
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead>,
): NutritionSlotExchangeTargetRead[] {
  return [...targets].sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Canon web search: case-insensitive substring over the food name. */
export function filterPortionExchangeFoods(
  foods: ReadonlyArray<NutritionExchangeFoodRead>,
  groupCode: string,
  search: string,
): NutritionExchangeFoodRead[] {
  const term = search.trim().toLocaleLowerCase('es-CL')
  return foods.filter(
    (food) =>
      food.groupCode === groupCode &&
      (term.length === 0 || food.name.toLocaleLowerCase('es-CL').includes(term)),
  )
}

/**
 * Próximo paso al tocar el chip: la siguiente media/entera pendiente (1,0; o 0,5 si
 * es lo que queda). Con lo prescrito completo el paso es 1,0 pero requiere la
 * confirmación inline de exceso (SPEC UX-b).
 */
export function nextPortionStep(view: Pick<PortionCoverageView, 'prescribed' | 'coverage'>): {
  portions: 1 | 0.5
  requiresConfirm: boolean
} {
  const remaining = round1(view.prescribed - view.coverage)
  if (remaining >= 1) return { portions: 1, requiresConfirm: false }
  if (remaining >= 0.5) return { portions: 0.5, requiresConfirm: false }
  return { portions: 1, requiresConfirm: true }
}

// ---------------------------------------------------------------------------
// Glue de cola offline (deshacer-en-cola — hallazgo M1)
// ---------------------------------------------------------------------------

/**
 * Cancela la entrada local de la cola de una marca aún no sincronizada. `false` ⇒ la
 * cola ya la envió: el caller debe tratar la marca como sincronizada (void normal).
 * El incremento de `attempt` corre por cuenta del caller EN AMBOS casos (M1).
 */
export function cancelQueuedPortionMark(
  userId: string,
  idempotencyKey: string,
): Promise<boolean> {
  return removeNutritionV2QueuedMutation(userId, idempotencyKey)
}

/** Keys aún encoladas del usuario (reconciliación del delta — F1-front). */
export function getQueuedPortionKeys(userId: string): Promise<Set<string>> {
  return getNutritionV2QueuedKeys(userId).then((keys) => new Set(keys))
}
