/**
 * Navegación por día (`?date=`) de la ficha nutricional del coach — lógica PURA.
 *
 * La ficha sigue leyendo el detalle UNA vez y SIEMPRE con la fecha de hoy: el RPC
 * `get_nutrition_client_detail_scoped_v2` compone internamente `get_nutrition_today_v2`, que es
 * `volatile` (materializa snapshots create-once) y revienta con fecha > hoy+1
 * (`nutrition_v2_snapshot_date_out_of_window`). Por eso `?date=` NO cambia la llamada: es un
 * selector de lectura sobre datos que YA viajaron (`plan.dayVariants` + `recentDays`), tal como
 * exige la factibilidad 2026-07-29 (§2.3 "lo que no se debe hacer").
 *
 * Ventana navegable (fail-closed, sin flechas de semana en esta entrega):
 *  - tope superior: el domingo de la semana en curso (más allá no hay ni plan proyectable útil
 *    ni derecho a materializar nada);
 *  - tope inferior: el lunes de la semana del día más antiguo del historial YA recortado por el
 *    gate de Nutrición Pro. Así la ventana BASE de ~30 días se respeta sola: si el recorte quitó
 *    los días viejos, sus semanas dejan de ser alcanzables por URL.
 *
 * Framework-neutral (sin React, sin Next): testeable y reutilizable por la ficha entera.
 */

import {
  addNutritionDays,
  nutritionDayOfWeekFromIso,
  nutritionWeekStartIso,
} from '@eva/nutrition-v2'

export interface CoachWeekSelectionInput {
  /** Valor crudo de `?date=` (puede venir vacío, basura o fuera de ventana). */
  requestedDate?: string | null
  /** Hoy en la zona del alumno (`YYYY-MM-DD`). */
  todayIso: string
  /** Historial YA recortado por el gate Pro; define hasta dónde atrás se puede navegar. */
  historyDays?: readonly { localDate: string }[] | null
}

export interface CoachWeekSelection {
  /** Día que la ficha muestra. Siempre una fecha honrable (nunca la basura de la URL). */
  selectedIso: string
  /** Lunes de la semana que pinta la tira Lu-Do. */
  weekStartIso: string
  /** `true` cuando la ficha muestra HOY: el único día con datos en vivo del snapshot. */
  isToday: boolean
}

/**
 * Resuelve qué día muestra la ficha. Fecha inválida o fuera de la ventana navegable ⇒ hoy
 * (silencioso a propósito: ningún camino de la UI produce esos enlaces, solo una URL editada a
 * mano o un marcador viejo, y "hoy" es el estado correcto en ambos casos).
 *
 * Los ISO `YYYY-MM-DD` comparan lexicográficamente = cronológicamente, igual que el recorte del
 * gate Pro (`filterHistoryDaysToBaseWindow`).
 */
export function resolveCoachWeekSelection(input: CoachWeekSelectionInput): CoachWeekSelection {
  const todayIso = typeof input.todayIso === 'string' ? input.todayIso.trim() : ''
  const todayWeekStart = nutritionWeekStartIso(todayIso) ?? todayIso
  const latestIso = addNutritionDays(todayWeekStart, 6) ?? todayIso

  let earliestIso = todayWeekStart
  for (const day of input.historyDays ?? []) {
    if (day == null || typeof day.localDate !== 'string') continue
    const weekStart = nutritionWeekStartIso(day.localDate)
    if (weekStart != null && weekStart < earliestIso) earliestIso = weekStart
  }

  const requested = typeof input.requestedDate === 'string' ? input.requestedDate.trim() : ''
  const honored =
    requested !== '' &&
    nutritionDayOfWeekFromIso(requested) != null &&
    requested >= earliestIso &&
    requested <= latestIso

  const selectedIso = honored ? requested : todayIso
  return {
    selectedIso,
    weekStartIso: nutritionWeekStartIso(selectedIso) ?? todayWeekStart,
    isToday: selectedIso === todayIso,
  }
}

/** Tono del indicador de adherencia. Sin `danger`: el pasado se informa, no se castiga. */
export type CoachDayAdherenceTone = 'success' | 'warning' | 'neutral'

export interface CoachDayAdherence {
  /** % de la meta de energía SIN tope: 135 % se lee 135 %, no 100 % (comer de más se ve). */
  percent: number
  tone: CoachDayAdherenceTone
}

/**
 * Adherencia de energía de un día cerrado: consumido vs meta CONGELADA del snapshot.
 *
 * `null` (no se pinta indicador) cuando falta cualquiera de los dos lados: sin registro
 * (`consumed = null` ≠ "registró cero") o sin meta de energía. Rangos: ±10 % de la meta = en
 * rango; hasta 60 % abajo o 130 % arriba = desvío moderado; fuera de eso, neutro (informa la
 * cifra sin semáforo agresivo).
 */
export function resolveCoachDayAdherence(
  consumedCalories: number | null | undefined,
  targetCalories: number | null | undefined,
): CoachDayAdherence | null {
  if (consumedCalories == null || !Number.isFinite(consumedCalories)) return null
  if (targetCalories == null || !Number.isFinite(targetCalories) || targetCalories <= 0) return null
  const ratio = consumedCalories / targetCalories
  const tone: CoachDayAdherenceTone =
    ratio >= 0.9 && ratio <= 1.1 ? 'success' : ratio >= 0.6 && ratio <= 1.3 ? 'warning' : 'neutral'
  return { percent: Math.round(ratio * 100), tone }
}

/**
 * "27 jul" — día y mes en es-CL, sin el nombre del día (que la ficha ya muestra como título).
 * `formatNutritionShortDate` de `date-utils` incluye el día de la semana y aquí duplicaría el
 * título ("Lunes · lun 27 jul"). Timezone-safe: la fecha ya viene resuelta en la zona del alumno,
 * se formatea en UTC para que jamás se corra un día.
 */
export function formatNutritionDayAndMonth(isoDate: string): string {
  if (nutritionDayOfWeekFromIso(isoDate) == null) return ''
  const date = new Date(`${isoDate.trim()}T00:00:00Z`)
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .formatToParts(date)
    .map((part) => (part.type === 'month' ? part.value.replace(/\.$/, '') : part.value))
    .join('')
}
