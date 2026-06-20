import { cache } from 'react'
import { subDays, format, parseISO } from 'date-fns'
import { getNutritionAdherenceInputs30d } from '../../dashboard/_data/dashboard.queries'
import { getNutritionDayOfWeekFromIsoYmdInSantiago, getTodayInSantiago } from '@/lib/date-utils'
import {
  computeNutritionAdherence,
  normalizeMealForMacros,
  type AdherenceMeal,
  type MacroTarget,
  type MealLogRow,
} from '@eva/nutrition-engine'

/**
 * Recap semanal motivacional del alumno (feature K). Calcula la adherencia de los ULTIMOS 7 dias
 * vs los 7 anteriores con el motor canonico `computeNutritionAdherence` (mismas cifras que el resto
 * de la app — auditable, snapshot-primero). On-demand: reusa el loader cacheado de 30d, sin tabla
 * nueva ni cron (el rollup materializado D1 es para escala del board roster, no para este recap
 * de un solo alumno). Tono ADAPTATIVO (gentil en semana floja, sin culpa). No toca datos.
 */

export type WeeklyRecapTone = 'great' | 'good' | 'gentle' | 'start'

export type WeeklyRecap = {
  /** Cumplimiento de comidas % (sum hechas / sum aplicables) en los ultimos 7 dias. */
  thisWeekPct: number
  /** Idem semana anterior (null si no hay ningun registro la semana previa). */
  lastWeekPct: number | null
  /** thisWeekPct - lastWeekPct (null si no hay base de comparacion). */
  deltaPct: number | null
  /** Dias con al menos un registro en los ultimos 7 (0..7). */
  daysLoggedThisWeek: number
  tone: WeeklyRecapTone
}

export const getNutritionWeeklyRecap = cache(
  async (clientId: string): Promise<WeeklyRecap | null> => {
    const inputs = await getNutritionAdherenceInputs30d(clientId)
    if (!inputs) return null
    const { plan, logs } = inputs

    const meals: AdherenceMeal[] = (plan.nutrition_meals ?? []).map((m) => ({
      ...normalizeMealForMacros(m),
      day_of_week: m.day_of_week,
    }))
    const liveTarget: MacroTarget = {
      calories: plan.daily_calories ?? 0,
      protein: plan.protein_g ?? 0,
      carbs: plan.carbs_g ?? 0,
      fats: plan.fats_g ?? 0,
    }

    const logsByDate = new Map<string, MealLogRow[]>()
    const targetByDate = new Map<string, MacroTarget>()
    for (const day of logs) {
      logsByDate.set(
        day.log_date,
        (day.nutrition_meal_logs ?? []).map((r) => ({
          meal_id: r.meal_id,
          is_completed: !!r.is_completed,
          consumed_quantity: r.consumed_quantity,
        }))
      )
      if (day.target_calories_at_log != null) {
        targetByDate.set(day.log_date, {
          calories: day.target_calories_at_log ?? 0,
          protein: day.target_protein_at_log ?? 0,
          carbs: day.target_carbs_at_log ?? 0,
          fats: day.target_fats_at_log ?? 0,
        })
      }
    }

    const { iso: todayIso } = getTodayInSantiago()
    const anchor = parseISO(todayIso)
    const windowOf = (endDaysAgo: number, startDaysAgo: number) => ({
      startIso: format(subDays(anchor, startDaysAgo), 'yyyy-MM-dd'),
      endIso: format(subDays(anchor, endDaysAgo), 'yyyy-MM-dd'),
    })

    const runWindow = (range: { startIso: string; endIso: string }) =>
      computeNutritionAdherence({
        meals,
        logsByDate,
        targetByDate,
        liveTarget,
        range,
        dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago,
      })

    const thisAgg = runWindow(windowOf(0, 6)) // hoy-6 .. hoy
    const lastAgg = runWindow(windowOf(7, 13)) // hoy-13 .. hoy-7

    const thisWeekPct = Math.min(100, Math.round(thisAgg.summary.compliancePct))
    const daysLoggedThisWeek = thisAgg.perDay.filter((d) => d.hasLog).length
    const lastWeekHasData = lastAgg.perDay.some((d) => d.hasLog)
    const lastWeekPct = lastWeekHasData ? Math.min(100, Math.round(lastAgg.summary.compliancePct)) : null
    const deltaPct = lastWeekPct != null ? thisWeekPct - lastWeekPct : null

    const tone: WeeklyRecapTone =
      daysLoggedThisWeek === 0 ? 'start' : thisWeekPct >= 85 ? 'great' : thisWeekPct >= 60 ? 'good' : 'gentle'

    return { thisWeekPct, lastWeekPct, deltaPct, daysLoggedThisWeek, tone }
  }
)
