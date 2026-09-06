/**
 * today-entries — cómo se reparten los REGISTROS del día del alumno entre las franjas y
 * "Fuera del plan". Lógica PURA compartida web/RN, sin React ni red.
 *
 * Vivía solo en el web (`apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/
 * nutrition-today.logic.ts:485-546`) y RN tenía su propio filtro, más pobre: escondía los
 * registros huérfanos (con `prescriptionItemId` de una versión anterior del plan) aunque
 * `consumed` los sumara — el caso del alumno de Jean, 5.637 kcal con 5 registros invisibles
 * (SPEC cantidades-honestas §1 Causa 2). Ahora las dos superficies leen LA MISMA función; el
 * módulo web las re-exporta desde su ruta histórica para no tocar a sus importadores.
 */

import { formatNutritionCalories } from './design'
import { assessItemPlausibility, implausibleItemCopy, type ItemPlausibility } from './plausibility'
import type { NutritionIntakeReadItem, NutritionMealSlotRead, NutritionTodayReadModel } from './read-models'

// ── "Hoy sin eco" (auditoría H4/H5): un hecho, un solo lugar ─────────────────────
// El registro de un item prescrito se pinta EN su fila (check + hora), no en una segunda lista.
// Lo libre de la franja cuelga de la misma card; lo que no calza en ninguna franja va a "Fuera
// del plan". Las marcas de porción (sintéticas) se colapsan en una sola línea por franja.

/** True si el intake es una marca de porción sintética (SPEC R4), no un alimento real registrado. */
export function isPortionMarkEntry(entry: NutritionIntakeReadItem): boolean {
  return entry.exchangeGroupCode != null && (entry.exchangePortions ?? 0) > 0
}

/** Registro de consumo del item prescrito, si ya se marcó (para el check + hora de su fila). */
export function consumedEntryForItem(
  slot: NutritionMealSlotRead,
  itemId: string,
): NutritionIntakeReadItem | null {
  return slot.intakeItems.find((entry) => entry.prescriptionItemId === itemId) ?? null
}

/**
 * Registros LIBRES de la franja: alimentos que el alumno registró bajo esta franja sin calzar con
 * NINGÚN item prescrito vigente — sin `prescriptionItemId`, o con uno que ya no existe en el plan
 * (huérfano). Excluye las marcas de porción, que se resumen aparte (una línea, no una fila por
 * marca — auditoría §2.2).
 */
export function slotFreeEntries(slot: NutritionMealSlotRead): NutritionIntakeReadItem[] {
  const validPrescriptionIds = new Set(slot.prescriptionItems.map((item) => item.id))
  return slot.intakeItems.filter(
    (entry) =>
      !isPortionMarkEntry(entry) &&
      (entry.prescriptionItemId === null || !validPrescriptionIds.has(entry.prescriptionItemId)),
  )
}

/** Suma de porciones marcadas a mano en la franja (todos los grupos), para "Porciones marcadas: N". */
export function slotPortionMarksTotal(slot: NutritionMealSlotRead): number {
  return slot.intakeItems.filter(isPortionMarkEntry).reduce((sum, entry) => sum + (entry.exchangePortions ?? 0), 0)
}

/**
 * "Fuera del plan": lo que no calza en ninguna franja renderizada — `unassignedIntake` (sin
 * franja) MÁS los registros de franjas que no se muestran (sin prescripción ni porciones, podadas
 * por `slotsWithPrescribedContent`). Ningún registro desaparece en silencio: si su franja no tiene
 * card, cae acá.
 */
export function outOfPlanEntries(
  today: NutritionTodayReadModel,
  renderedSlotCodes: ReadonlySet<string>,
): NutritionIntakeReadItem[] {
  const stranded = today.mealSlots
    .filter((slot) => !renderedSlotCodes.has(slot.code))
    .flatMap((slot) => slot.intakeItems)
  return [...today.unassignedIntake, ...stranded].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

/** Hora corta ("13:04") de un registro en la zona horaria del día; fecha inválida ⇒ cadena vacía. */
export function formatIntakeClock(occurredAt: string, timezone: string): string {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) return ''
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  try {
    return new Intl.DateTimeFormat('es-CL', { ...options, timeZone: timezone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-CL', options).format(date)
  }
}

// ── Registros de una VERSIÓN ANTERIOR del plan (SPEC cantidades-honestas §4.4) ────
// Republicar el mismo día genera ids nuevos por item (`plan-persistence.ts:489`) y la RPC no
// toca `nutrition_intake_entries`: el registro queda apuntando a un `prescription_item_id` que
// ya no está en el snapshot del día. Es un subconjunto ESTRICTO de lo libre: un huérfano sí
// tiene id de item, solo que de una versión que ya no existe. Nombrarlo permite explicarlo
// ("de una versión anterior del plan") y retirarlo, en vez de que sume kcal sin verse.

/** True si el registro apunta a un item prescrito que YA NO existe en esta franja (huérfano). */
export function isPriorVersionEntry(entry: NutritionIntakeReadItem, slot: NutritionMealSlotRead): boolean {
  if (entry.prescriptionItemId === null) return false
  return !slot.prescriptionItems.some((item) => item.id === entry.prescriptionItemId)
}

/** Los libres de la franja que además son huérfanos (para el chip y el "Retirar los N"). */
export function slotPriorVersionEntries(slot: NutritionMealSlotRead): NutritionIntakeReadItem[] {
  return slotFreeEntries(slot).filter((entry) => isPriorVersionEntry(entry, slot))
}

/**
 * Todos los registros ACTIVOS del día que apuntan a un item prescrito ausente de CUALQUIER franja
 * del snapshot vigente (no solo de la suya: un item puede haber cambiado de franja). Incluye los
 * de `unassignedIntake`. Sin marcas de porción, que no vienen de un item prescrito.
 */
export function priorVersionEntries(today: NutritionTodayReadModel): NutritionIntakeReadItem[] {
  const validPrescriptionIds = new Set(
    today.mealSlots.flatMap((slot) => slot.prescriptionItems.map((item) => item.id)),
  )
  return [...today.mealSlots.flatMap((slot) => slot.intakeItems), ...today.unassignedIntake].filter(
    (entry) =>
      entry.status === 'active' &&
      !isPortionMarkEntry(entry) &&
      entry.prescriptionItemId !== null &&
      !validPrescriptionIds.has(entry.prescriptionItemId),
  )
}

/** kcal que el día le debe a registros huérfanos ("{N} kcal vienen de una versión anterior"). */
export function priorVersionCalories(today: NutritionTodayReadModel): number {
  const total = priorVersionEntries(today).reduce((sum, entry) => sum + (entry.totals.calories ?? 0), 0)
  return Math.round(total * 10) / 10
}

// ── "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5, W1.5) ─────────────────
// El alumno también puede registrar un absurdo de un tap: el ítem del plan de Jean sumaba 4.470
// kcal y "Lo comí" lo metía sin preguntar. Acá vive la traducción del ítem PRESCRITO del read
// model al input de `plausibility`, para que web y RN pregunten con el mismo criterio y el
// mismo texto. Avisa, no bloquea: confirmar corre el flujo de siempre, sin tocar payload ni
// idempotency key.

/**
 * Diagnóstico de un ítem prescrito del Hoy. El read model NO trae el `serving_size` del alimento
 * (`prescriptionItems` solo tiene cantidad, unidad y macros congelados), así que va `null`: los
 * gramos resultantes solo salen con unidad de masa (g/ml) y el motivo `kcal` cubre el resto —
 * justamente el caso "30 un = 4.470 kcal".
 */
export function prescribedItemPlausibility(
  item: NutritionMealSlotRead['prescriptionItems'][number],
): ItemPlausibility {
  return assessItemPlausibility({
    quantity: item.quantity,
    unit: item.unit,
    servingSize: null,
    calories: item.macros.calories ?? 0,
  })
}

/**
 * Cuerpo de la confirmación: «¿Seguro? 900 g de arroz cocido. Suma 1.240 kcal.» Con gramaje el
 * copy habla de peso y las kcal se agregan aparte; sin gramaje el copy YA las dice y repetirlas
 * sería el mismo número dos veces.
 */
export function prescribedItemImplausibleCopy(
  item: NutritionMealSlotRead['prescriptionItems'][number],
  assessment: ItemPlausibility = prescribedItemPlausibility(item),
): string {
  const copy = implausibleItemCopy({
    quantity: item.quantity,
    unit: item.unit,
    foodName: item.name ?? 'este alimento',
    grams: assessment.grams,
    calories: assessment.calories,
    servingSize: null,
  })
  return assessment.grams === null
    ? `${copy}.`
    : `${copy}. Suma ${formatNutritionCalories(assessment.calories)}.`
}
