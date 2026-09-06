/**
 * coach-day-entries — el coach VE los registros del día de su alumno (W4.1 del tren «Cantidades
 * honestas», SPEC §7.1, mockup M4).
 *
 * Por qué existe: la ficha del alumno solo mostraba agregados («11 registros · 5.637 kcal») y el
 * coach no tenía forma de ver que 4.470 de esas kcal eran UN registro de una versión anterior del
 * plan, ni de retirarlo. El backend ya autorizaba al coach (`void_nutrition_intake_v2` /
 * `correct_nutrition_intake_v2` con `private.nutrition_v2_can_read_client`): faltaba la UI.
 *
 * Alcance: SOLO hoy (decisión R3 de SPEC §5.7: el historial V2 no emite ítems por día). Este
 * módulo es puro (sin React, sin red): tipos del view-model que pintan `DayIntakeEntries` (web) y
 * `CoachDayIntakeEntries` (RN), y el rótulo del chip «N× la meta» con el umbral D7.
 */

import { COACH_ALERT_CONSUMED_RATIO } from './plausibility'
import { formatItemQuantity } from './quantity-format'
import { formatIntakeClock, isPortionMarkEntry, priorVersionEntries } from './today-entries'
import type { NutritionFoodRowModel } from './design'
import type { NutritionIntakeReadItem, NutritionTodayReadModel } from './read-models'

/** Una fila del panel: el registro tal cual + lo que la fila necesita para pintarse. */
export interface CoachDayIntakeRow {
  entry: NutritionIntakeReadItem
  /** Modelo de `FoodRow` (nombre, «2 huevos (122 g)», macros, miniatura). */
  row: NutritionFoodRowModel
  /** Nombre de la franja del plan donde cayó el registro; `null` = fuera del plan. */
  slotName: string | null
  /** «13:04» en la zona horaria del alumno; cadena vacía si la fecha no parsea. */
  clock: string
  /** Apunta a un ítem de una versión anterior del plan (huérfano): chip «plan anterior». */
  priorVersion: boolean
}

/** Motivo fijo del retiro hecho por el coach (el RPC exige ≥ 3 caracteres; no hay sheet de motivo). */
export const COACH_VOID_REASON = 'Registro retirado por el coach'

/**
 * Filas del panel «Registros de hoy» de la ficha, en el orden en que ocurrieron.
 *
 * Fuente: los registros ACTIVOS del día — los de cada franja (`mealSlots[].intakeItems`) MÁS los
 * que no calzaron en ninguna (`unassignedIntake`). Sin marcas de porción (`isPortionMarkEntry`):
 * son intakes sintéticos de «marcar porción», no alimentos que el alumno registró, y no hay nada
 * que retirar ni corregir en ellos desde acá.
 *
 * `thumbnailUrl` sale SIEMPRE en `null`: la miniatura la resuelve cada app con su helper de media
 * (web `resolveFoodMediaUrl` + la base pública de Supabase, RN `foodMediaThumbnailUrl`), que este
 * paquete no puede conocer. El llamador la pisa antes de pintar.
 *
 * `priorVersion` reusa `priorVersionEntries` (criterio GLOBAL del día: un ítem que solo cambió de
 * franja NO es huérfano) y además acepta el linaje explícito de W3.1
 * (`originalPrescriptionItemId`), que marca los registros hechos sobre un ancestro aunque el alias
 * los haya reconectado al ítem vigente.
 */
export function buildCoachDayIntakeRows(today: NutritionTodayReadModel): CoachDayIntakeRow[] {
  const slotNameByCode = new Map(today.mealSlots.map((slot) => [slot.code, slot.name]))
  const orphanEntryIds = new Set(priorVersionEntries(today).map((entry) => entry.id))

  const entries = [
    ...today.mealSlots.flatMap((slot) => slot.intakeItems),
    ...today.unassignedIntake,
  ].filter((entry) => entry.status === 'active' && !isPortionMarkEntry(entry))

  return entries
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((entry) => ({
      entry,
      row: toCoachFoodRow(entry),
      slotName: (entry.mealSlot != null ? slotNameByCode.get(entry.mealSlot) : undefined) ?? null,
      clock: formatIntakeClock(entry.occurredAt, today.timezone),
      priorVersion: entry.originalPrescriptionItemId != null || orphanEntryIds.has(entry.id),
    }))
}

/**
 * Cuánto hay registrado hoy, para el aviso del editor único antes de republicar con vigencia HOY
 * (W3.2): «{entryCount} registros en {slotCount} franjas». Se deriva de las MISMAS filas del panel
 * (`buildCoachDayIntakeRows`), así que el aviso y la lista nunca se contradicen. `entryCount` sale
 * de `consumed.entryCount` —la cifra que la ficha ya muestra— y `slotCount` cuenta las franjas
 * DISTINTAS con al menos un registro activo (los que quedaron sin franja no inflan el número).
 */
export function buildCoachDayIntakeSummary(today: NutritionTodayReadModel): {
  entryCount: number
  slotCount: number
} {
  const rows = buildCoachDayIntakeRows(today)
  return {
    entryCount: today.consumed.entryCount,
    slotCount: new Set(
      rows.map((row) => row.entry.mealSlot).filter((code): code is string => code != null),
    ).size,
  }
}

/** `FoodRow` de un registro: nombre y macros CONGELADOS, cantidad con el rótulo honesto (W2.3). */
function toCoachFoodRow(entry: NutritionIntakeReadItem): NutritionFoodRowModel {
  return {
    id: entry.id,
    name: entry.snapshot.name,
    quantityLabel: formatItemQuantity({
      quantity: entry.quantity,
      unit: entry.unit,
      householdLabel: entry.householdLabel ?? null,
      householdGrams: entry.householdGrams ?? null,
    }),
    calories: entry.totals.calories,
    proteinG: entry.totals.proteinG,
    carbsG: entry.totals.carbsG,
    fatsG: entry.totals.fatsG,
    thumbnailUrl: null,
  }
}

function formatRatio(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
  return `${text}×`
}

/**
 * «4× la meta» cuando lo consumido supera `COACH_ALERT_CONSUMED_RATIO` veces la meta del día
 * (D7: 2×); `null` cuando no hay meta utilizable o el día está dentro de lo esperable. Es el chip
 * del encabezado del panel (M4) y el mismo umbral que la alerta V2 del coach (W4.2).
 */
export function consumedRatioChipLabel(input: {
  consumedCalories: number | null | undefined
  targetCalories: number | null | undefined
}): string | null {
  const target = input.targetCalories
  const consumed = input.consumedCalories
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null
  if (typeof consumed !== 'number' || !Number.isFinite(consumed) || consumed <= 0) return null
  const ratio = consumed / target
  if (ratio < COACH_ALERT_CONSUMED_RATIO) return null
  return `${formatRatio(ratio)} la meta`
}
