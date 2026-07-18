import {
  computeNutritionAdherence,
  type AdherenceMeal,
  type MealLogRow,
} from '@eva/nutrition-engine'
import { getNutritionDayOfWeekFromIsoYmd, isoDateAddDays } from '../../../lib/date-utils'

/**
 * Racha de nutrición — motor ÚNICO (E4-06). Mata el último drift: la racha
 * mobile ahora se deriva del MISMO motor canónico `computeNutritionAdherence`
 * (@eva/nutrition-engine) que alimenta la web, en vez del loop inline propio que
 * usaba umbral/ventana distintos.
 *
 * Semántica IDÉNTICA a la web `NutritionStreakBanner`:
 *  - un día "cuenta" si sus comidas APLICABLES (según day_of_week) están
 *    completadas al ≥50% (mismo criterio que la barra de adherencia),
 *  - se cuenta desde HOY hacia atrás saltando días sin plan,
 *  - "día de gracia": si HOY aún no cuenta pero la racha se rompió por
 *    exactamente un día (ayer) y antes había ≥2, la racha sigue viva (atRisk).
 *
 * El motor da `perDay[].applicableMeals` + `compliancePct` (= mealsDone /
 * applicableMeals · 100). El umbral 50% + gracia es la DEFINICIÓN de la racha
 * (la del engine, `summary.streak`, exige 100% — semántica distinta, no se usa
 * para este banner).
 */

export interface StreakResult {
  /** Días consecutivos cumplidos contando desde hoy hacia atrás. */
  count: number
  /** Se rompió por exactamente un día (ayer) pero antes había racha viva. */
  atRisk: boolean
  /** Largo de la racha previa que quedó en riesgo (para "X de 7 días"). */
  priorCount: number
}

const WINDOW_DAYS = 45

export function computeNutritionStreak(input: {
  /** Comidas del plan (basta id + day_of_week; food_items vacío para la racha). */
  planMeals: { id: string; day_of_week?: number | null }[]
  /** logs por fecha ISO — incluir el estado LIVE de hoy para reflejar toggles. */
  logsByDate: Map<string, { meal_id: string; is_completed: boolean }[]>
  todayIso: string
}): StreakResult {
  const { planMeals, logsByDate, todayIso } = input

  const meals: AdherenceMeal[] = planMeals.map((m) => ({
    id: m.id,
    day_of_week: m.day_of_week ?? null,
    food_items: [],
  }))

  const engineLogs = new Map<string, MealLogRow[]>()
  for (const [date, rows] of logsByDate) {
    engineLogs.set(
      date,
      rows.map((r) => ({ meal_id: r.meal_id, is_completed: r.is_completed }))
    )
  }

  const { perDay } = computeNutritionAdherence({
    meals,
    logsByDate: engineLogs,
    liveTarget: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    range: { startIso: isoDateAddDays(todayIso, -(WINDOW_DAYS - 1)), endIso: todayIso },
    dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmd,
  })

  const byDate = new Map(perDay.map((d) => [d.date, d]))

  // true = día cumplido (≥50%), false = falló, null = sin comidas planificadas.
  const dayMet = (iso: string): boolean | null => {
    const d = byDate.get(iso)
    if (!d || d.applicableMeals === 0) return null
    return d.compliancePct >= 50
  }

  // Cuenta una racha consecutiva empezando `startOffset` días atrás (salta días sin plan).
  const countFrom = (startOffset: number): { count: number; brokeOffset: number | null } => {
    let c = 0
    for (let i = startOffset; i < WINDOW_DAYS; i++) {
      const met = dayMet(isoDateAddDays(todayIso, -i))
      if (met === null) continue
      if (met) c++
      else return { count: c, brokeOffset: i }
    }
    return { count: c, brokeOffset: null }
  }

  const live = countFrom(0)
  if (live.count > 0) {
    return { count: live.count, atRisk: false, priorCount: live.count }
  }

  // Hoy no cuenta (aún). "En riesgo" solo si rompió por exactamente un día (ayer)
  // y antes había racha viva de ≥2 (día de gracia).
  if (live.brokeOffset === 1) {
    const prior = countFrom(2)
    if (prior.count >= 2) {
      return { count: 0, atRisk: true, priorCount: prior.count }
    }
  }

  return { count: 0, atRisk: false, priorCount: 0 }
}
