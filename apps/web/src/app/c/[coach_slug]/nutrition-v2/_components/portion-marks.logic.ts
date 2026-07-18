import { formatPortions } from '@eva/nutrition-engine'
import {
  portionCoverageKey,
  type NutritionDayCoverageRead,
  type NutritionExchangeFoodRead,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
  type NutritionSlotExchangeTargetRead,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'

/**
 * Lógica PURA (sin React, sin IO) del marcar-porción del alumno web (SPEC UX-b/UX-c).
 *
 * Modelo de reconciliación (hallazgo F1-front): la cobertura canónica viene del
 * read-model del server; el cliente mantiene SOLO un delta optimista de `marcadas`
 * pendientes que SUMA sobre el último read-model. Al llegar un fetch nuevo, las
 * pendientes cuyo intake ya aparece en el read-model salen del delta (reconciliación
 * por `entryId`, que el server action devuelve para la key idempotente del gesto).
 * Las `derivadas` JAMÁS se estiman en el cliente. El segmento nunca salta hacia atrás.
 */

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** `formatPortions` del engine con coma decimal es-CL ("1,5") para display. */
export function formatPortionsEs(portions: number): string {
  return formatPortions(portions).replace('.', ',')
}

/** "{n} porción" / "{n} porciones" pre-formateado para `PORTIONS_COPY.student.dupWarning`. */
export function portionsCountLabelEs(portions: number): string {
  return `${formatPortionsEs(portions)} ${portions === 1 ? 'porción' : 'porciones'}`
}

/**
 * Divide el copy canónico `student.markFailed` ("… . Reintentar") en mensaje + label
 * de la acción del toast, SIN duplicar strings fuera de `PORTIONS_COPY` (UX-d).
 */
export function splitRetryCopy(copy: string): { message: string; retryLabel: string } {
  const idx = copy.lastIndexOf('. ')
  if (idx === -1) return { message: copy, retryLabel: copy }
  return { message: copy.slice(0, idx + 1), retryLabel: copy.slice(idx + 2).trim() }
}

// ---------------------------------------------------------------------------
// Delta optimista de marcadas pendientes
// ---------------------------------------------------------------------------

/** Una marca optimista local (aún no reflejada en el read-model del server). */
export interface PendingPortionMark {
  /** Idempotency key canónica del gesto (identidad del delta). */
  key: string
  slotCode: string
  groupCode: string
  groupName: string
  /** 1 ó 0,5 (lo que llenó este tap). */
  portions: number
  /** Índice del evento de marcado dentro de (fecha, franja, grupo) — 0-based. */
  ordinal: number
  /** Contador local por ordinal (arranca en 1; sube con cada deshacer del ordinal). */
  attempt: number
  /** Id del intake confirmado por el server (null mientras está en vuelo). */
  entryId: string | null
}

export function pendingInCell(
  pending: ReadonlyArray<PendingPortionMark>,
  slotCode: string,
  groupCode: string,
): PendingPortionMark[] {
  return pending.filter((m) => m.slotCode === slotCode && m.groupCode === groupCode)
}

export function pendingPortionsSum(pending: ReadonlyArray<PendingPortionMark>): number {
  return pending.reduce((sum, m) => sum + m.portions, 0)
}

/** Ids de TODOS los intakes del read-model (franjas + sin franja) para reconciliar. */
export function collectTodayIntakeIds(today: NutritionTodayReadModel): Set<string> {
  const ids = new Set<string>()
  for (const slot of today.mealSlots) for (const item of slot.intakeItems) ids.add(item.id)
  for (const item of today.unassignedIntake) ids.add(item.id)
  return ids
}

/**
 * Reconciliación F1-front: saca del delta las marcas confirmadas que YA aparecen en
 * el read-model recibido. Las que siguen en vuelo (`entryId === null`) se conservan.
 */
export function reconcilePendingMarks(
  pending: ReadonlyArray<PendingPortionMark>,
  todayIntakeIds: ReadonlySet<string>,
): PendingPortionMark[] {
  return pending.filter((m) => m.entryId === null || !todayIntakeIds.has(m.entryId))
}

// ---------------------------------------------------------------------------
// Cobertura efectiva (server + delta) y llenado de segmentos
// ---------------------------------------------------------------------------

export interface EffectivePortionCoverage {
  marcadas: number
  derivadas: number
  coverage: number
}

/** Cobertura efectiva de un target: server (`marcadas`/`derivadas`) + delta local. */
export function effectiveTargetCoverage(
  target: Pick<NutritionSlotExchangeTargetRead, 'marcadas' | 'derivadas'>,
  pendingPortions: number,
): EffectivePortionCoverage {
  const marcadas = (target.marcadas ?? 0) + pendingPortions
  const derivadas = target.derivadas ?? 0
  return { marcadas, derivadas, coverage: marcadas + derivadas }
}

/**
 * Qué llena el SIGUIENTE tap: 1 porción, o 0,5 si es lo que resta al target.
 * Con lo prescrito completo, el tap pasa a flujo "extra" (confirmación inline; el
 * exceso NUNCA descuenta otros grupos — SPEC R5).
 */
export function nextMarkForTarget(
  prescribed: number,
  coverage: number,
): { extra: boolean; portions: 0.5 | 1 } {
  const remaining = prescribed - coverage
  if (remaining >= 1) return { extra: false, portions: 1 }
  if (remaining > 0) return { extra: false, portions: 0.5 }
  return { extra: true, portions: 1 }
}

/** Segmento visual del chip: capacidad 1 (círculo) o 0,5 (semicírculo final). */
export interface PortionSegment {
  capacity: number
  /** Parte llenada por marcas a mano (relleno `primary` pleno). */
  marked: number
  /** Parte llenada por alimentos reales (relleno `primary` con anillo fino). */
  derived: number
}

/**
 * Llenado de segmentos (SPEC R5): display por `floor(x·2)/2`, capeado al prescrito
 * (el exceso va como badge "+n", nunca como segmentos de más). Se llena primero lo
 * marcado-a-mano y después lo derivado-de-alimento, de izquierda a derecha.
 */
export function segmentsForTarget(
  prescribed: number,
  marcadas: number,
  derivadas: number,
): PortionSegment[] {
  const floorHalf = (value: number): number => Math.floor(value * 2) / 2
  const totalFill = Math.min(floorHalf(marcadas + derivadas), prescribed)
  let markedLeft = Math.min(floorHalf(marcadas), totalFill)
  let derivedLeft = totalFill - markedLeft

  const segments: PortionSegment[] = []
  for (let i = 0; i < prescribed; i += 1) {
    const capacity = Math.min(1, prescribed - i)
    const marked = Math.min(markedLeft, capacity)
    markedLeft -= marked
    const derived = Math.min(derivedLeft, capacity - marked)
    derivedLeft -= derived
    segments.push({ capacity, marked, derived })
  }
  return segments
}

/** Exceso sobre lo prescrito para el badge "+n" (1 decimal máx; 0 si no hay exceso). */
export function extraPortionsValue(prescribed: number, coverage: number): number {
  const over = coverage - prescribed
  return over > 0 ? Math.round(over * 10) / 10 : 0
}

// ---------------------------------------------------------------------------
// Ordinal + attempt (hallazgos B2/M1)
// ---------------------------------------------------------------------------

/** Intakes sintéticos ACTIVOS de un grupo en la franja (cada uno = 1 evento de marcado). */
export function activeSyntheticMarks(
  intakeItems: ReadonlyArray<NutritionIntakeReadItem>,
  groupCode: string,
): NutritionIntakeReadItem[] {
  return intakeItems
    .filter(
      (item) =>
        item.status === 'active' &&
        item.exchangeGroupCode === groupCode &&
        (item.exchangePortions ?? 0) > 0,
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

/**
 * Ordinal del PRÓXIMO evento de marcado en la celda (0-based, en unidades de
 * llenado): nº de intakes sintéticos activos del server + nº de marcas pendientes
 * locales. Tras un deshacer, el ordinal se reutiliza con `attempt` incrementado.
 */
export function nextPortionOrdinal(activeCount: number, pendingCount: number): number {
  return activeCount + pendingCount
}

/** Mapa local de attempts por `(fecha, franja, grupo, ordinal)` (persistido). */
export type PortionAttemptMap = Record<string, number>

export function portionAttemptKey(
  localDate: string,
  slotCode: string,
  groupCode: string,
  ordinal: number,
): string {
  return `${localDate}|${slotCode}|${groupCode}|${ordinal}`
}

/** Attempt vigente para una key (arranca en 1 — SPEC R4). */
export function attemptFor(map: PortionAttemptMap, key: string): number {
  const value = map[key]
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 1
}

/** Incrementa el attempt del ordinal (en CADA deshacer de ese ordinal — B2/M1). */
export function bumpAttempt(map: PortionAttemptMap, key: string): PortionAttemptMap {
  return { ...map, [key]: attemptFor(map, key) + 1 }
}

/** Poda entradas de otras fechas (el mapa solo importa para el día vigente). */
export function prunePortionAttemptMap(
  map: PortionAttemptMap,
  localDate: string,
): PortionAttemptMap {
  const pruned: PortionAttemptMap = {}
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(`${localDate}|`) && Number.isInteger(value) && value >= 1) {
      pruned[key] = value
    }
  }
  return pruned
}

/** Superficie mínima de storage (inyectable en tests; `localStorage` en runtime). */
export interface StringStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function portionAttemptStorageKey(clientId: string): string {
  return `eva-nutrition-portion-attempts:${clientId}`
}

export function loadPortionAttemptMap(
  storage: StringStorageLike | null,
  clientId: string,
  localDate: string,
): PortionAttemptMap {
  if (!storage) return {}
  try {
    const raw = storage.getItem(portionAttemptStorageKey(clientId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return prunePortionAttemptMap(parsed as PortionAttemptMap, localDate)
  } catch {
    return {}
  }
}

export function savePortionAttemptMap(
  storage: StringStorageLike | null,
  clientId: string,
  map: PortionAttemptMap,
): void {
  if (!storage) return
  try {
    storage.setItem(portionAttemptStorageKey(clientId), JSON.stringify(map))
  } catch {
    // Storage lleno/bloqueado: el attempt sigue vivo en memoria durante la sesión.
  }
}

// ---------------------------------------------------------------------------
// deviceId estable del navegador (parte de la idempotency key)
// ---------------------------------------------------------------------------

export const NUTRITION_DEVICE_ID_STORAGE_KEY = 'eva-nutrition-device-id'

/**
 * deviceId estable por navegador para la idempotency key del marcar-porción.
 * El registro de intake PWA existente no persiste deviceId (usa uuid por gesto),
 * así que aquí se genera y persiste uno en localStorage (patrón del repo:
 * `web-` + uuid, espejo del `web-quick-edit` estático del quick-edit).
 */
export function getOrCreateNutritionDeviceId(
  storage: StringStorageLike | null,
  randomUUID: () => string = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
): string {
  const fresh = `web-${randomUUID()}`
  if (!storage) return fresh
  try {
    const existing = storage.getItem(NUTRITION_DEVICE_ID_STORAGE_KEY)
    if (existing && existing.trim().length >= 8) return existing
    storage.setItem(NUTRITION_DEVICE_ID_STORAGE_KEY, fresh)
    return fresh
  } catch {
    return fresh
  }
}

// ---------------------------------------------------------------------------
// Vistas derivadas del read-model (franjas, día, equivalencias, anti-duplicado)
// ---------------------------------------------------------------------------

/** True si la franja tiene targets de porciones (capa visible — SPEC R1/Q1). */
export function slotHasPortionTargets(slot: NutritionMealSlotRead): boolean {
  return (slot.exchangeTargets?.length ?? 0) > 0
}

/**
 * Franjas del plan a renderizar: con items fijos O con porciones (Q2: una franja
 * solo-porciones también aparece). Plan sin porciones ⇒ idéntico al filtro previo.
 */
export function slotsWithPrescribedContent(
  today: NutritionTodayReadModel,
): NutritionMealSlotRead[] {
  return today.mealSlots.filter(
    (slot) => slot.prescriptionItems.length > 0 || slotHasPortionTargets(slot),
  )
}

/** Targets de la franja ordenados por `orderIndex` (estable para chips y tabs). */
export function orderedExchangeTargets(
  slot: NutritionMealSlotRead,
): NutritionSlotExchangeTargetRead[] {
  return [...(slot.exchangeTargets ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Alimentos de equivalencia de UN grupo (lista del sheet — hallazgo F3). */
export function exchangeFoodsForGroup(
  foods: ReadonlyArray<NutritionExchangeFoodRead> | undefined,
  groupCode: string,
): NutritionExchangeFoodRead[] {
  return (foods ?? []).filter((food) => food.groupCode === groupCode)
}

/** Mapa foodId → groupCode del catálogo clasificado que viaja en el read-model. */
export function foodGroupCodeMap(
  foods: ReadonlyArray<NutritionExchangeFoodRead> | undefined,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const food of foods ?? []) map.set(food.foodId, food.groupCode)
  return map
}

/**
 * Nombres de alimentos reales ACTIVOS que derivan cobertura del grupo en la franja
 * (tooltip/aria `student.coveredBy` de los segmentos derivados). Sin estimar
 * porciones en cliente: solo identifica QUÉ alimento cubre (las `derivadas` vienen
 * del server).
 */
export function derivedFoodNames(
  intakeItems: ReadonlyArray<NutritionIntakeReadItem>,
  foods: ReadonlyArray<NutritionExchangeFoodRead> | undefined,
  groupCode: string,
): string[] {
  const groupByFood = foodGroupCodeMap(foods)
  const names: string[] = []
  for (const item of intakeItems) {
    if (item.status !== 'active') continue
    if ((item.exchangePortions ?? 0) > 0) continue // sintético ⇒ marcada, no derivada
    if (!item.foodId || groupByFood.get(item.foodId) !== groupCode) continue
    if (!names.includes(item.snapshot.name)) names.push(item.snapshot.name)
  }
  return names
}

/**
 * Cobertura del DÍA con el delta optimista sumado por grupo (fila "Porciones de
 * hoy"). Solo mueve `marcadas`/`coverage`; `derivadas` y `prescribed` son del server.
 */
export function dayCoverageWithPending(
  dayCoverage: ReadonlyArray<NutritionDayCoverageRead> | undefined,
  pending: ReadonlyArray<PendingPortionMark>,
): NutritionDayCoverageRead[] {
  const pendingByGroup = new Map<string, number>()
  for (const mark of pending) {
    pendingByGroup.set(mark.groupCode, (pendingByGroup.get(mark.groupCode) ?? 0) + mark.portions)
  }
  return (dayCoverage ?? []).map((row) => {
    const delta = pendingByGroup.get(row.groupCode) ?? 0
    if (delta === 0) return row
    return {
      ...row,
      marcadas: row.marcadas + delta,
      coverage: row.coverage + delta,
    }
  })
}

/**
 * Aviso anti-duplicado (SPEC R5 mitigación b): al registrar un alimento clasificado
 * en una franja donde YA hay porciones marcadas de su grupo, devuelve las marcadas
 * efectivas (server + delta) y el nombre del grupo para `student.dupWarning`.
 * No bloquea nada: la UI lo muestra inline.
 */
export function dupPortionInfo(input: {
  foodId: string
  mealSlotCode: string | null
  today: Pick<NutritionTodayReadModel, 'mealSlots' | 'exchangeFoods'>
  pending: ReadonlyArray<PendingPortionMark>
}): { groupCode: string; groupName: string; marcadas: number } | null {
  const { foodId, mealSlotCode, today, pending } = input
  if (!mealSlotCode) return null
  const groupCode = foodGroupCodeMap(today.exchangeFoods).get(foodId)
  if (!groupCode) return null
  const slot = today.mealSlots.find((s) => s.code === mealSlotCode)
  if (!slot) return null
  const target = (slot.exchangeTargets ?? []).find((t) => t.groupCode === groupCode)
  const pendingSum = pendingPortionsSum(pendingInCell(pending, mealSlotCode, groupCode))
  const marcadas = (target?.marcadas ?? 0) + pendingSum
  if (marcadas <= 0) return null
  return { groupCode, groupName: target?.groupName ?? groupCode, marcadas }
}

/** Re-export local para que los componentes usen la key canónica de celda. */
export { portionCoverageKey }
