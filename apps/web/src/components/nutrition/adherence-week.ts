/**
 * Adherencia semanal del coach — núcleo PURO (sin React, sin DOM, sin `server-only`).
 *
 * Es la ÚNICA definición de "registrado" y "en meta" que usan las tres superficies del coach:
 *  - hub (`/coach/nutrition-v2`): ventana rodante de 7 días que trae el read model (`days7d`);
 *  - perfil del alumno (tab Nutrición de `/coach/clients/[clientId]`): semana Lu-Do en curso;
 *  - ficha nutricional (`/coach/nutrition-v2/[clientId]`): la semana Lu-Do que el coach mira.
 *
 * Reglas (no se redefinen en ninguna superficie):
 *  - "registrado" = el día tiene al menos una ingesta (`entryCount > 0`). La AUSENCIA de la fecha
 *    es "sin registro", nunca "consumió cero" (los read models omiten los días vacíos).
 *  - "en meta" = `resolveCoachDayAdherence` devuelve tono `success`, es decir la banda 0.9–1.1 de
 *    la meta CONGELADA de ese día. Los umbrales viven en la ficha (`_lib/week-nav`) y se importan;
 *    acá no se copia ningún número.
 *
 * Vive separado de `AdherenceWeekDots.tsx` a propósito: ese archivo es `'use client'`, y los
 * exports de un módulo cliente son referencias-de-cliente cuando un Server Component los importa
 * (llamarlos server-side revienta). La ficha del coach es RSC y necesita `summarizeWeek` en el
 * servidor, así que la lógica pura tiene que estar en un módulo neutro.
 *
 * No se exporta desde `components/nutrition/index.ts` para no arrastrar `@eva/nutrition-v2` al
 * bundle de las superficies V1 que sí usan ese barrel (misma razón que `AdherenceWeekDots`).
 */

import { resolveCoachDayAdherence } from '@/app/coach/nutrition-v2/[clientId]/_lib/week-nav'

export interface AdherenceWeekDay {
  /** `YYYY-MM-DD` en la zona del coach. */
  date: string
  entryCount: number
  consumedCalories: number
  targetCalories: number | null
}

export interface AdherenceWeekSummary {
  /** Días de la ventana con al menos un registro. */
  registered: number
  /** Días registrados con meta evaluable Y consumo dentro de la banda (90–110 %). */
  inRange: number
  /** Días registrados que tenían meta evaluable (denominador honesto de "en meta"). */
  evaluable: number
}

/**
 * Resumen puro de la semana. Cuenta SOLO días con registro: la ausencia de una fecha en
 * los datos es "sin registro", nunca "consumió cero" (el RPC omite los días vacíos).
 */
export function summarizeWeek(
  days: readonly AdherenceWeekDay[] | null | undefined,
): AdherenceWeekSummary {
  let registered = 0
  let inRange = 0
  let evaluable = 0
  for (const day of days ?? []) {
    if (!day || !Number.isFinite(day.entryCount) || day.entryCount <= 0) continue
    registered += 1
    const adherence = resolveCoachDayAdherence(day.consumedCalories, day.targetCalories)
    if (adherence == null) continue
    evaluable += 1
    if (adherence.tone === 'success') inRange += 1
  }
  return { registered, inRange, evaluable }
}

export type AdherenceDotState = 'empty' | 'in-range' | 'off-range' | 'logged'

/** Estado visual de un día. `logged` = registró pero sin meta evaluable (o muy fuera de banda). */
export function resolveDotState(day: AdherenceWeekDay | undefined): AdherenceDotState {
  if (!day || !Number.isFinite(day.entryCount) || day.entryCount <= 0) return 'empty'
  const adherence = resolveCoachDayAdherence(day.consumedCalories, day.targetCalories)
  if (adherence == null) return 'logged'
  if (adherence.tone === 'success') return 'in-range'
  if (adherence.tone === 'warning') return 'off-range'
  return 'logged'
}

const MS_PER_DAY = 86_400_000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Las 7 fechas de la ventana rodante que termina en `anchorIso` (índice 6 = el ancla). */
function buildWindowDates(anchorIso: string): string[] {
  if (!ISO_DATE_RE.test(anchorIso)) return []
  const anchorMs = Date.parse(`${anchorIso}T00:00:00Z`)
  if (Number.isNaN(anchorMs)) return []
  return Array.from({ length: 7 }, (_, index) =>
    new Date(anchorMs - (6 - index) * MS_PER_DAY).toISOString().slice(0, 10),
  )
}

/**
 * Las 7 fechas que se pintan. El RPC arma `days7d` con `current_date` de la base (UTC) y
 * `todayIso` es hoy en la zona del coach: entre ~21:00 y medianoche en Chile difieren en un día
 * y el extremo viejo de la ventana quedaría pintado como "sin registro" teniendo uno. Se ancla
 * en el mayor de los dos, lo que NO mueve la semana cuando el alumno simplemente no registró hoy
 * (la fecha más nueva de los datos es entonces <= hoy).
 */
export function resolveWeekWindow(
  todayIso: string,
  days: readonly AdherenceWeekDay[] | null | undefined,
): string[] {
  let latest = ''
  for (const day of days ?? []) {
    if (day && typeof day.date === 'string' && day.date > latest) latest = day.date
  }
  return buildWindowDates(latest > todayIso ? latest : todayIso)
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Copy — una sola fuente para las tres superficies (nadie reescribe la fórmula a mano).
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Fórmula visible (tooltip de la fila / del encabezado "Semana"). */
export const ADHERENCE_WEEK_FORMULA_TITLE =
  'Un día cuenta “en meta” si el consumo queda entre 90% y 110% de la meta de ese día. ' +
  'Banda sana: 75-90% de adherencia semanal.'

/** "5/7 registrados · 3/4 en meta" — los 7 son SIEMPRE los días que la superficie pinta. */
export function formatAdherenceWeekSummaryText(summary: AdherenceWeekSummary): string {
  return summary.evaluable > 0
    ? `${summary.registered}/7 registrados · ${summary.inRange}/${summary.evaluable} en meta`
    : `${summary.registered}/7 registrados · sin meta evaluable`
}

/** Tooltip con los números del alumno + la fórmula. */
export function formatAdherenceWeekSummaryTitle(summary: AdherenceWeekSummary): string {
  return `En meta ${summary.inRange} de ${summary.evaluable} días registrados. ${ADHERENCE_WEEK_FORMULA_TITLE}`
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Mapper historial → días de adherencia.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Fila de historial V2 (`recentDays` del coach / `history.items` del alumno). Forma estructural
 * mínima: `NutritionHistoryDay` la cumple sin casts.
 */
export interface AdherenceWeekHistoryLike {
  localDate: string
  activeEntryCount?: number | null
  consumed?: { calories?: number | null; entryCount?: number | null } | null
  /** Metas CONGELADAS del snapshot de ese día (no las de hoy). */
  targets?: { calories?: number | null } | null
}

/**
 * HOY. Va aparte porque el historial NUNCA trae la fila del día en curso: vive en el read
 * separado `today` (`get_nutrition_today_v2` es el único que puede materializarlo). Sin esto,
 * un alumno que ya registró hoy aparecería como "sin registro" en la semana.
 */
export interface AdherenceWeekTodayLike {
  date: string
  entryCount: number
  consumedCalories: number
  targetCalories: number | null
}

function toFiniteNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toTargetCalories(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * PURA: filas de historial (+ hoy) → `AdherenceWeekDay[]` ordenado por fecha.
 *
 * - `window` recorta a las fechas que la superficie pinta (la semana Lu-Do). Sin `window` pasa
 *   todo (el llamador ya recortó).
 * - Primera fila gana ante fechas repetidas: el historial viene descendente y una fecha repetida
 *   es la misma jornada, no dos días (misma convención que `buildNutritionWeek`).
 * - `today` PISA la fila de historial de esa fecha si existiera: el read del día es el dato vivo.
 * - Días solo del sistema anterior (V1) quedan con `entryCount` 0 ⇒ "sin registro", igual que en
 *   la tira Lu-Do: sus totales V2 son ceros por construcción y pintarlos mentiría.
 */
export function toAdherenceWeekDays(input: {
  historyDays?: readonly AdherenceWeekHistoryLike[] | null
  /** Fechas `YYYY-MM-DD` a conservar; `null`/ausente = sin recorte. */
  window?: readonly string[] | null
  today?: AdherenceWeekTodayLike | null
}): AdherenceWeekDay[] {
  const allowed =
    input.window == null ? null : new Set(input.window.filter((iso) => typeof iso === 'string'))

  const byDate = new Map<string, AdherenceWeekDay>()
  for (const row of input.historyDays ?? []) {
    if (row == null || typeof row.localDate !== 'string') continue
    const date = row.localDate.trim()
    if (date === '') continue
    if (allowed != null && !allowed.has(date)) continue
    if (byDate.has(date)) continue
    byDate.set(date, {
      date,
      entryCount: Math.max(
        toFiniteNumber(row.activeEntryCount),
        toFiniteNumber(row.consumed?.entryCount),
      ),
      consumedCalories: toFiniteNumber(row.consumed?.calories),
      targetCalories: toTargetCalories(row.targets?.calories),
    })
  }

  const today = input.today
  if (today != null && typeof today.date === 'string' && today.date.trim() !== '') {
    const date = today.date.trim()
    if (allowed == null || allowed.has(date)) {
      byDate.set(date, {
        date,
        entryCount: toFiniteNumber(today.entryCount),
        consumedCalories: toFiniteNumber(today.consumedCalories),
        targetCalories: toTargetCalories(today.targetCalories),
      })
    }
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
