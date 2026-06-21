import { isoDateAddDays, nutritionMealApplies } from './date-utils'

/**
 * Recap semanal motivacional del alumno (feature K) — lado ALUMNO (mobile).
 *
 * Espejo del tono/cifras de apps/web/src/app/c/[coach_slug]/nutrition/_data/recap.queries.ts +
 * _components/WeeklyRecapCard.tsx. La web usa el motor canonico `computeNutritionAdherence`
 * (@eva/nutrition-engine) con targets snapshot por dia. Mobile NO tiene ese motor ni los targets
 * en el payload de adherencia que ya carga la pantalla (solo {meal_id, is_completed} por dia), asi
 * que computamos la adherencia de COMIDAS (sum hechas / sum aplicables) — la misma base que usa el
 * resto de la pantalla (racha, AdherenceStrip) — sobre ventanas de 7 dias.
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * NO duplica una formula de macros: usa el conteo de comidas aplicables/completadas, identico al
 * criterio de la racha existente en la pantalla. El motor con macros queda server-side (web).
 */

export type WeeklyRecapTone = 'great' | 'good' | 'gentle' | 'start'

export type WeeklyRecap = {
  thisWeekPct: number
  lastWeekPct: number | null
  deltaPct: number | null
  daysLoggedThisWeek: number
  tone: WeeklyRecapTone
}

type AdherenceDay = {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

type PlanMeal = { id: string; day_of_week: number | null }

function computeWindow(
  adherence: AdherenceDay[],
  planMeals: PlanMeal[],
  startIso: string,
  endIso: string
): { pct: number; daysLogged: number; hasData: boolean } {
  const byDate = new Map(adherence.map((d) => [d.log_date, d]))
  let appliedTotal = 0
  let completedTotal = 0
  let daysLogged = 0
  let hasData = false

  let cursor = startIso
  for (let i = 0; i < 8 && cursor <= endIso; i++) {
    const applicable = planMeals.filter((m) => nutritionMealApplies(m, cursor))
    const day = byDate.get(cursor)
    if (day && (day.nutrition_meal_logs?.length ?? 0) > 0) {
      hasData = true
      daysLogged++
    }
    if (applicable.length > 0) {
      const applicableIds = new Set(applicable.map((m) => m.id))
      const completed = (day?.nutrition_meal_logs ?? []).filter(
        (l) => l.is_completed && applicableIds.has(l.meal_id)
      ).length
      appliedTotal += applicable.length
      completedTotal += completed
    }
    cursor = isoDateAddDays(cursor, 1)
  }

  const pct = appliedTotal > 0 ? Math.min(100, Math.round((completedTotal / appliedTotal) * 100)) : 0
  return { pct, daysLogged, hasData }
}

/**
 * Calcula el recap de los ultimos 7 dias vs los 7 anteriores. `todayIso` ancla la ventana
 * (hoy-6..hoy). Tono adaptativo (gentil en semana floja, sin culpa). Read-only.
 */
export function computeWeeklyRecap(
  adherence: AdherenceDay[],
  planMeals: PlanMeal[],
  todayIso: string
): WeeklyRecap {
  const thisWeek = computeWindow(adherence, planMeals, isoDateAddDays(todayIso, -6), todayIso)
  const lastWeek = computeWindow(
    adherence,
    planMeals,
    isoDateAddDays(todayIso, -13),
    isoDateAddDays(todayIso, -7)
  )

  const thisWeekPct = thisWeek.pct
  const daysLoggedThisWeek = thisWeek.daysLogged
  const lastWeekPct = lastWeek.hasData ? lastWeek.pct : null
  const deltaPct = lastWeekPct != null ? thisWeekPct - lastWeekPct : null

  const tone: WeeklyRecapTone =
    daysLoggedThisWeek === 0
      ? 'start'
      : thisWeekPct >= 85
        ? 'great'
        : thisWeekPct >= 60
          ? 'good'
          : 'gentle'

  return { thisWeekPct, lastWeekPct, deltaPct, daysLoggedThisWeek, tone }
}
