import {
  CATALOG_MACROS_BASIS,
  consumedEntryForItem,
  defaultFoodUnit,
  foodMagnitudeUnit,
  formatIntakeClock,
  formatItemQuantity,
  isHouseholdUnit,
  isPortionMarkEntry,
  normalizeIntakeUnit,
  outOfPlanEntries,
  prescribedSnapshotMacros,
  resolveItemDisplayNote,
  scaleSnapshotMacros,
  slotFreeEntries,
  slotPortionMarksTotal,
  type NutritionMacroTotalsLike,
} from '@eva/nutrition-v2'
import type { StringStorageLike } from './portion-marks.logic'
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
  SubstitutionEquivalence,
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

// ── Camino PRESCRITO: una intención, una clave (NUT-003) ─────────────────────────
// "Me comí ESTE item prescrito ESTE día" tiene identidad lógica propia, así que su clave se DERIVA
// de ella en vez de sortearse por gesto. Con un uuid por gesto el único dedup del servidor
// (short-circuit por `client_id + idempotency_key`) nunca matchea: dos toques, o el MISMO toque
// repetido desde una pestaña con el read-model viejo, insertaban dos registros y el día terminaba
// con el aporte duplicado — el caso medido el 2026-08-25 (una franja marcada 3 veces, +1350 kcal).
// Es la misma semántica que RN ya usa (`apps/mobile/lib/nutrition-v2-intake.ts`
// ::prescribedIntentOperationId), con la MISMA forma de clave, así que un alumno que marca en el
// teléfono y en el navegador tampoco duplica.
//
// El alimento LIBRE, las correcciones y los retiros siguen con `newIdempotencyKey`: registrar dos
// veces el mismo alimento libre es una intención válida y colapsarla sería mentir.

/**
 * Clave de idempotencia determinista del "Lo comí" prescrito.
 *
 * `attempt` (>= 1) sube SOLO al retirar un registro del item, nunca al reintentar: el
 * short-circuit del RPC no mira `entry_status`, así que reusar la clave de una entry ya retirada
 * devolvería su id sin escribir nada y el item quedaría inconsumible el resto del día (el mismo
 * hallazgo que QA 2026-08-10 obligó a resolver en el camino de reemplazos). Lo lleva el mapa local
 * de más abajo — mismo patrón que el `attempt` del marcar-porción (`portion-marks.logic.ts`).
 */
export function prescribedIntakeIdempotencyKey(input: {
  localDate: string
  prescriptionItemId: string
  attempt?: number
}): string {
  const attempt = input.attempt ?? 1
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('prescribedIntakeIdempotencyKey: attempt debe ser entero >= 1')
  }
  // Normalizada igual que `buildNutritionIdempotencyKey` (el builder de RN) para que las dos
  // superficies emitan exactamente la misma cadena aunque un id llegue en mayúsculas.
  return `intake-presc-${input.localDate}-${input.prescriptionItemId}-a${attempt}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
}

/** Mapa local de attempts del camino prescrito, por `(fecha, item prescrito)`. */
export type PrescribedAttemptMap = Record<string, number>

export function prescribedAttemptKey(localDate: string, prescriptionItemId: string): string {
  return `${localDate}|${prescriptionItemId}`
}

/** Attempt vigente para una key (arranca en 1). */
export function prescribedAttemptFor(map: PrescribedAttemptMap, key: string): number {
  const value = map[key]
  return Number.isInteger(value) && value >= 1 ? value : 1
}

/** Incrementa el attempt del item: se llama en CADA retiro de un registro suyo. */
export function bumpPrescribedAttempt(
  map: PrescribedAttemptMap,
  key: string,
): PrescribedAttemptMap {
  return { ...map, [key]: prescribedAttemptFor(map, key) + 1 }
}

/** Poda entradas de otras fechas (el mapa solo importa para el día vigente). */
export function prunePrescribedAttemptMap(
  map: PrescribedAttemptMap,
  localDate: string,
): PrescribedAttemptMap {
  const pruned: PrescribedAttemptMap = {}
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(`${localDate}|`) && Number.isInteger(value) && value >= 1) {
      pruned[key] = value
    }
  }
  return pruned
}

export function prescribedAttemptStorageKey(clientId: string): string {
  return `eva-nutrition-prescribed-attempts:${clientId}`
}

/**
 * El mapa se PERSISTE (no basta un ref): si el alumno deshace y recarga la pantalla antes de
 * volver a marcar, un contador en memoria volvería a 1 y la clave chocaría con la entry retirada.
 */
export function loadPrescribedAttemptMap(
  storage: StringStorageLike | null,
  clientId: string,
  localDate: string,
): PrescribedAttemptMap {
  if (!storage) return {}
  try {
    const raw = storage.getItem(prescribedAttemptStorageKey(clientId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return prunePrescribedAttemptMap(parsed as PrescribedAttemptMap, localDate)
  } catch {
    return {}
  }
}

export function savePrescribedAttemptMap(
  storage: StringStorageLike | null,
  clientId: string,
  map: PrescribedAttemptMap,
): void {
  if (!storage) return
  try {
    storage.setItem(prescribedAttemptStorageKey(clientId), JSON.stringify(map))
  } catch {
    // Storage lleno/bloqueado: el attempt sigue vivo en memoria durante la sesión.
  }
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
    // W2.3: el rotulo honesto vive en `formatItemQuantity` (packages/nutrition-v2/quantity-format.ts).
    // Con el par casero congelado en el registro dice «2 huevos (122 g)»; sin el, «122 g» como siempre.
    quantityLabel: formatItemQuantity({
      quantity: entry.quantity,
      unit: entry.unit,
      householdLabel: entry.householdLabel,
      householdGrams: entry.householdGrams,
    }),
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

/** Lo minimo del alimento para decidir la unidad del registro libre (medida casera incluida). */
type CatalogUnitFood = Pick<FoodCatalogItem, 'servingUnit' | 'servingSize'> & {
  householdGrams?: number | null
  householdLabel?: string | null
}

/**
 * Cantidad y unidad iniciales al elegir un alimento en el buscador/scanner del alumno (W2.1).
 * La unidad la manda `defaultFoodUnit` (medida casera > contable > magnitud) y la cantidad tiene
 * que ser COHERENTE con ella: precargar `servingSize` con la unidad `casera` o `un` escribiria
 * «100 huevos» de entrada — exactamente el numero que nadie sabia leer (SPEC §1, causa 1). Solo
 * en g/ml la porcion del catalogo es una cantidad honesta.
 */
export function catalogIntakeDefaults(food: CatalogUnitFood): { quantity: number; unit: string } {
  const unit = defaultFoodUnit(food)
  return { quantity: unit === 'g' || unit === 'ml' ? food.servingSize : 1, unit }
}

/**
 * Traduce la cantidad/unidad ELEGIDA en la UI a la que se PERSISTE (SPEC §5.3, AUDIT W2.0 c1-c4).
 * `casera` vive solo en la pantalla: al enviar, «2 huevos» son `2 x householdGrams` gramos con la
 * magnitud real del alimento, porque `NutritionIntakeUnitSchema` no la acepta (c6, y no cambia) y
 * el factor la leeria como contable. `null` = el alimento no tiene gramaje casero usable: no hay
 * nada honesto que persistir ni que estimar, y la UI no deja registrar.
 */
export function catalogIntakeSubmission(input: {
  food: CatalogUnitFood
  quantity: number
  unit: string
}): { quantity: number; unit: string } | null {
  if (!isHouseholdUnit(input.unit)) return { quantity: input.quantity, unit: input.unit }
  const householdGrams = input.food.householdGrams
  if (typeof householdGrams !== 'number' || !Number.isFinite(householdGrams) || householdGrams <= 0) {
    return null
  }
  return {
    quantity: Math.round(input.quantity * householdGrams * 10) / 10,
    unit: foodMagnitudeUnit(input.food.servingUnit),
  }
}

/** Total en cero: lo que muestra el preview cuando la unidad elegida no es estimable (casera sin gramaje). */
const ZERO_TOTALS: NutritionMacroTotalsLike = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatsG: 0,
  fiberG: 0,
}

/**
 * Total ESTIMADO de un alimento del catalogo para la cantidad/unidad elegidas. Usa la MISMA
 * funcion pura que el servidor (`scaleSnapshotMacros` ⇒ `intakeEntryFactor`) con la base
 * declarada del catalogo, de modo que el numero del formulario y el que persiste el RPC son el
 * mismo. Es lo que vuelve OBVIO un cambio de unidad mal hecho antes de guardar (NUT-017).
 *
 * `casera` se convierte a gramos ANTES de estimar (SPEC R9 / AUDIT c5): hasta W2 el
 * `normalizeIntakeUnit(unit) ?? unit` la dejaba pasar tal cual a `intakeEntryFactor`, que sin
 * reconocerla caia a la rama contable (x servingSize / 100) — el preview mentia antes de que el
 * contrato rechazara la escritura. Sin gramaje casero el total es CERO, jamas esa rama.
 */
export function estimateCatalogIntakeTotals(input: {
  food: Pick<FoodCatalogItem, 'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG'> & CatalogUnitFood
  quantity: number
  unit: string
}): NutritionMacroTotalsLike {
  const submission = catalogIntakeSubmission(input)
  if (submission === null) return ZERO_TOTALS
  return scaleSnapshotMacros(input.food, {
    quantity: submission.quantity,
    unit: normalizeIntakeUnit(submission.unit) ?? submission.unit,
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
// misma clave determinista por item) para que el snapshot congelado y los totales sean idénticos.
// El "qué es elegible" lo decide el helper puro compartido (bulkMarkSlotState) — que depende de un
// read-model fresco, y por eso la clave es la que de verdad impide el doble registro.

/** Payloads de registro para N items prescritos de una franja (uno por item, clave por item). */
export function buildBulkPrescribedPayloads(input: {
  context: Context
  slot: NutritionMealSlotRead
  items: PrescriptionItemRead[]
  /** Attempts locales por item (ver `prescribedAttemptKey`); vacío ⇒ primer intento del día. */
  attempts?: PrescribedAttemptMap
}): NutritionIntakeMutation[] {
  return input.items.map((item) =>
    buildPrescribedIntakePayload({
      context: input.context,
      slot: input.slot,
      item,
      idempotencyKey: prescribedIntakeIdempotencyKey({
        localDate: input.context.date,
        prescriptionItemId: item.id,
        attempt: prescribedAttemptFor(
          input.attempts ?? {},
          prescribedAttemptKey(input.context.date, item.id),
        ),
      }),
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
 * Nota a mostrar bajo un item prescrito. La implementacion es UNICA y vive en
 * `@eva/nutrition-v2` (`plan-substitutions.ts`): este modulo la RE-EXPORTA para no romper a
 * `PlanVariantCard` / `TodayExperience`, que la importan desde aca. Antes habia una copia
 * literal en este archivo (misma semantica, mismo prefijo legado "Alternativas: "); web y RN
 * comparten ahora la misma funcion — RN ya la re-exporta igual desde `lib/nutrition-v2-plan.ts`.
 */
export { resolveItemDisplayNote }

// ── "Hoy sin eco" (auditoría H4/H5): un hecho, un solo lugar ─────────────────────
// El registro de un item prescrito se pinta EN su fila (check + hora), no en una segunda lista.
// Lo libre de la franja cuelga de la misma card; lo que no calza en ninguna franja va a "Fuera
// del plan". Las marcas de porción (sintéticas) se colapsan en una sola línea por franja.
//
// La implementación se MUDÓ tal cual a `@eva/nutrition-v2` (`today-entries.ts`) en el tren
// «Cantidades honestas» W1.4: RN escondía los registros huérfanos que la web sí mostraba (SPEC
// §1 Causa 2) y no podía importar de `apps/web`. Este módulo las RE-EXPORTA con los mismos
// nombres para no tocar a `TodayExperience` ni a `nutrition-today.logic.test.ts`.
export {
  consumedEntryForItem,
  formatIntakeClock,
  isPortionMarkEntry,
  outOfPlanEntries,
  slotFreeEntries,
  slotPortionMarksTotal,
}

// ── Capa optimista del Hoy (F7 · hallazgo H2) ────────────────────────────────────
// Un tap paga la server action + `router.refresh()` (segundos): sin esto la pantalla queda con
// el estado viejo hasta que llega el re-render y el alumno cree que no pasó nada. El reducer
// aplica el gesto sobre el read model EN MEMORIA vía `useOptimistic`: React lo pinta al instante,
// lo reemplaza cuando el refresh trae la verdad del servidor, y lo REVIERTE solo si la acción
// falló (la transición termina sin refresh). Nada de esto persiste: es puro dibujo, la escritura
// sigue siendo exclusivamente del RPC.

export type TodayOptimisticAction =
  | { kind: 'add'; slotCode: string | null; entry: NutritionIntakeReadItem }
  | { kind: 'void'; entryId: string }
  | { kind: 'edit'; entryId: string; quantity: number }
  | {
      kind: 'substitute'
      prescriptionItemId: string
      slotCode: string | null
      entry: NutritionIntakeReadItem
    }

type ConsumedTotals = NutritionTodayReadModel['consumed']
type EntryTotals = NutritionIntakeReadItem['totals']

const roundMacro = (value: number): number => Math.round(value * 10) / 10

/** Totales de entry a partir de macros sueltas: redondeados y sin negativos (contrato del schema). */
function entryTotalsFrom(totals: NutritionMacroTotalsLike): EntryTotals {
  const clean = (value: number) => (Number.isFinite(value) && value > 0 ? roundMacro(value) : 0)
  return {
    calories: clean(totals.calories),
    proteinG: clean(totals.proteinG),
    carbsG: clean(totals.carbsG),
    fatsG: clean(totals.fatsG),
    fiberG: clean(totals.fiberG),
  }
}

function shiftConsumed(
  consumed: ConsumedTotals,
  delta: EntryTotals,
  sign: 1 | -1,
  entryDelta: number,
): ConsumedTotals {
  const clamp = (value: number) => (value < 0 ? 0 : roundMacro(value))
  return {
    calories: clamp(consumed.calories + sign * delta.calories),
    proteinG: clamp(consumed.proteinG + sign * delta.proteinG),
    carbsG: clamp(consumed.carbsG + sign * delta.carbsG),
    fatsG: clamp(consumed.fatsG + sign * delta.fatsG),
    fiberG: clamp(consumed.fiberG + sign * delta.fiberG),
    entryCount: Math.max(0, consumed.entryCount + sign * entryDelta),
  }
}

/** `remaining` coherente con el nuevo consumido; sodio/agua no viven en `consumed` y se conservan. */
function remainingFrom(
  targets: NutritionTodayReadModel['targets'],
  consumed: ConsumedTotals,
  previous: NutritionTodayReadModel['remaining'],
): NutritionTodayReadModel['remaining'] {
  const left = (target: number | null, eaten: number) =>
    target === null ? null : Math.max(0, roundMacro(target - eaten))
  return {
    ...previous,
    calories: left(targets.calories, consumed.calories),
    proteinG: left(targets.proteinG, consumed.proteinG),
    carbsG: left(targets.carbsG, consumed.carbsG),
    fatsG: left(targets.fatsG, consumed.fatsG),
    fiberG: left(targets.fiberG, consumed.fiberG),
  }
}

/** Quita una entry de donde esté (franja o sin franja); devuelve el modelo nuevo y lo removido. */
function withoutEntries(
  today: NutritionTodayReadModel,
  matches: (entry: NutritionIntakeReadItem) => boolean,
): { today: NutritionTodayReadModel; removed: NutritionIntakeReadItem[] } {
  const removed: NutritionIntakeReadItem[] = []
  const keep = (entry: NutritionIntakeReadItem) => {
    if (matches(entry)) {
      removed.push(entry)
      return false
    }
    return true
  }
  const mealSlots = today.mealSlots.map((slot) => {
    const intakeItems = slot.intakeItems.filter(keep)
    return intakeItems.length === slot.intakeItems.length ? slot : { ...slot, intakeItems }
  })
  const unassignedIntake = today.unassignedIntake.filter(keep)
  if (removed.length === 0) return { today, removed }
  return { today: { ...today, mealSlots, unassignedIntake }, removed }
}

function withEntry(
  today: NutritionTodayReadModel,
  slotCode: string | null,
  entry: NutritionIntakeReadItem,
): NutritionTodayReadModel {
  const slotExists = slotCode !== null && today.mealSlots.some((slot) => slot.code === slotCode)
  if (!slotExists) {
    return { ...today, unassignedIntake: [...today.unassignedIntake, entry] }
  }
  return {
    ...today,
    mealSlots: today.mealSlots.map((slot) =>
      slot.code === slotCode ? { ...slot, intakeItems: [...slot.intakeItems, entry] } : slot,
    ),
  }
}

function reflowTotals(
  today: NutritionTodayReadModel,
  base: NutritionTodayReadModel,
  delta: EntryTotals,
  sign: 1 | -1,
  entryDelta: number,
): NutritionTodayReadModel {
  const consumed = shiftConsumed(base.consumed, delta, sign, entryDelta)
  return { ...today, consumed, remaining: remainingFrom(base.targets, consumed, base.remaining) }
}

/**
 * Reducer de `useOptimistic`. Refleja el modelo que el servidor va a devolver: el Today solo trae
 * entries ACTIVAS, así que retirar/corregir/sustituir REMUEVE la entry vieja en vez de re-etiquetarla.
 */
export function applyTodayOptimistic(
  today: NutritionTodayReadModel,
  action: TodayOptimisticAction,
): NutritionTodayReadModel {
  switch (action.kind) {
    case 'add': {
      const next = withEntry(today, action.slotCode, action.entry)
      return reflowTotals(next, today, action.entry.totals, 1, 1)
    }
    case 'void': {
      const { today: next, removed } = withoutEntries(today, (entry) => entry.id === action.entryId)
      const gone = removed[0]
      if (!gone) return today
      return reflowTotals(next, today, gone.totals, -1, 1)
    }
    case 'edit': {
      const { today: stripped, removed } = withoutEntries(
        today,
        (entry) => entry.id === action.entryId,
      )
      const previous = removed[0]
      if (!previous || previous.quantity <= 0) return today
      const factor = action.quantity / previous.quantity
      const edited: NutritionIntakeReadItem = {
        ...previous,
        quantity: action.quantity,
        totals: entryTotalsFrom({
          calories: previous.totals.calories * factor,
          proteinG: previous.totals.proteinG * factor,
          carbsG: previous.totals.carbsG * factor,
          fatsG: previous.totals.fatsG * factor,
          fiberG: previous.totals.fiberG * factor,
        }),
      }
      const next = withEntry(stripped, previous.mealSlot, edited)
      // El neto puede ser negativo y `shiftConsumed` recorta a cero por campo: restar lo viejo y
      // sumar lo nuevo en dos pasos evita inventar un "delta" con signo mixto.
      const minus = reflowTotals(next, today, previous.totals, -1, 0)
      return reflowTotals(minus, minus, edited.totals, 1, 0)
    }
    case 'substitute': {
      const { today: stripped, removed } = withoutEntries(
        today,
        (entry) => entry.prescriptionItemId === action.prescriptionItemId,
      )
      const next = withEntry(stripped, action.slotCode, action.entry)
      const removedTotals = removed.reduce(
        (sum, entry) => ({
          calories: sum.calories + entry.totals.calories,
          proteinG: sum.proteinG + entry.totals.proteinG,
          carbsG: sum.carbsG + entry.totals.carbsG,
          fatsG: sum.fatsG + entry.totals.fatsG,
          fiberG: sum.fiberG + entry.totals.fiberG,
        }),
        { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
      )
      const minus = reflowTotals(next, today, entryTotalsFrom(removedTotals), -1, removed.length)
      return reflowTotals(minus, minus, action.entry.totals, 1, 1)
    }
  }
}

/** Id efímero de una entry optimista; el refresh la reemplaza por la fila real del servidor. */
function optimisticEntryId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Entry optimista desde el MISMO payload que viaja al RPC (snapshot idéntico byte a byte).
 * `totals` viene del llamador porque cada camino ya los conoce: los macros prescritos en
 * "Lo comí", `estimateCatalogIntakeTotals` en el registro libre.
 */
export function buildOptimisticIntakeEntry(input: {
  payload: NutritionIntakeMutation
  totals: NutritionMacroTotalsLike
  media?: NutritionIntakeReadItem['media']
  category?: string | null
}): NutritionIntakeReadItem {
  const { payload } = input
  return {
    id: optimisticEntryId(),
    foodId: payload.foodId ?? null,
    customName: payload.customName ?? null,
    quantity: payload.quantity,
    unit: payload.unit,
    mealSlot: payload.mealSlot ?? null,
    source: payload.source,
    captureMethod: payload.captureMethod,
    occurredAt: payload.occurredAt,
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: payload.prescriptionItemId ?? null,
    snapshot: {
      name: payload.snapshot.name,
      brand: payload.snapshot.brand ?? null,
      calories: payload.snapshot.calories ?? null,
      proteinG: payload.snapshot.proteinG ?? null,
      carbsG: payload.snapshot.carbsG ?? null,
      fatsG: payload.snapshot.fatsG ?? null,
      fiberG: payload.snapshot.fiberG ?? null,
      servingSize: payload.snapshot.servingSize ?? null,
      servingUnit: payload.snapshot.servingUnit ?? null,
      macrosBasis: payload.snapshot.macrosBasis ?? null,
    },
    totals: entryTotalsFrom(input.totals),
    media: input.media ?? null,
    category: input.category ?? null,
  }
}

/**
 * Entry optimista de una sustitución, desde la MISMA equivalencia que la UI mostró (T2.4).
 * Si el alumno confirmó otra cantidad, los totales se escalan linealmente — el servidor
 * puede corregirla (cantidad fijada por el coach) y el refresh trae la verdad.
 */
export function buildOptimisticSubstitutionEntry(input: {
  prescriptionItemId: string
  mealSlot: string | null
  foodId: string | null
  equivalence: SubstitutionEquivalence
  quantity: number | null
  occurredAt: string
}): NutritionIntakeReadItem {
  const { equivalence } = input
  const quantity = input.quantity ?? equivalence.quantity
  const factor = equivalence.quantity > 0 ? quantity / equivalence.quantity : 1
  return {
    id: optimisticEntryId(),
    foodId: input.foodId,
    customName: null,
    quantity,
    unit: equivalence.unit,
    mealSlot: input.mealSlot,
    source: 'substitution',
    captureMethod: 'prescription',
    occurredAt: input.occurredAt,
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: input.prescriptionItemId,
    snapshot: {
      name: equivalence.snapshot.name,
      brand: equivalence.snapshot.brand,
      calories: equivalence.snapshot.calories,
      proteinG: equivalence.snapshot.proteinG,
      carbsG: equivalence.snapshot.carbsG,
      fatsG: equivalence.snapshot.fatsG,
      fiberG: equivalence.snapshot.fiberG,
      servingSize: equivalence.snapshot.servingSize,
      servingUnit: equivalence.snapshot.servingUnit,
      macrosBasis: equivalence.snapshot.macrosBasis ?? null,
    },
    totals: entryTotalsFrom({
      calories: equivalence.totals.calories * factor,
      proteinG: equivalence.totals.proteinG * factor,
      carbsG: equivalence.totals.carbsG * factor,
      fatsG: equivalence.totals.fatsG * factor,
      fiberG: equivalence.totals.fiberG * factor,
    }),
    media: null,
    category: null,
  }
}
