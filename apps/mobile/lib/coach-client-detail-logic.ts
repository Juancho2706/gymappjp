import type { MealWithFoodItems } from './nutrition-utils'
import {
  calculateConsumedMacrosWithCompletionFallback,
  portionPctMapFromMealLogs,
} from './nutrition-utils'
import {
  getNutritionDayOfWeekFromIsoYmd,
  getSantiagoIsoYmdForUtcInstant,
  isoDateAddDays,
} from './date-utils'
import {
  effectiveWeekVariantFromPlans,
  resolveActiveWeekVariantForDisplay,
  workoutPlanMatchesVariant,
} from './program-week-variant'

export interface NutritionTimelineEntry {
  date: string
  planId: string | null
  matchesActivePlan: boolean
  mealsDone: number
  mealsTotal: number
  compliancePct: number
  targetCalories: number
  consumedCalories: number
  targetProtein: number
  consumedProtein: number
  targetCarbs: number
  consumedCarbs: number
  targetFats: number
  consumedFats: number
}

type NutritionLog = {
  log_date?: string | null
  plan_id?: string | null
  target_calories_at_log?: number | null
  target_protein_at_log?: number | null
  target_carbs_at_log?: number | null
  target_fats_at_log?: number | null
  nutrition_meal_logs?: Array<{
    meal_id?: string | null
    is_completed?: boolean | null
    consumed_quantity?: number | null
  }> | null
}

type MacroMeal = MealWithFoodItems & { day_of_week?: number | null }
type MacroGoals = { calories: number; protein: number; carbs: number; fats: number }

const ZERO_MACROS: MacroGoals = { calories: 0, protein: 0, carbs: 0, fats: 0 }

function validSantiagoDayFromCheckIn(row: { created_at?: string | null; date?: string | null }): string | null {
  if (row.created_at && Number.isFinite(new Date(row.created_at).getTime())) {
    return getSantiagoIsoYmdForUtcInstant(row.created_at)
  }
  const date = String(row.date ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

/** Espejo de `checkInRegularityPercentAsOf`: 100 hoy, caida lineal, 0 a los 7 dias. */
export function checkInRegularityPercentAsOfSantiago(
  asOfIso: string,
  checkIns: Array<{ created_at?: string | null; date?: string | null }>,
): number {
  const latest = checkIns
    .map(validSantiagoDayFromCheckIn)
    .filter((date): date is string => date != null && date <= asOfIso)
    .sort()
    .pop()
  if (!latest) return 0
  const asOfMs = new Date(`${asOfIso}T12:00:00Z`).getTime()
  const latestMs = new Date(`${latest}T12:00:00Z`).getTime()
  if (!Number.isFinite(asOfMs) || !Number.isFinite(latestMs)) return 0
  const daysSince = Math.max(0, Math.round((asOfMs - latestMs) / 86_400_000))
  return Math.max(0, Math.round(100 - Math.min(100, (daysSince / 7) * 100)))
}

/** Compliance de HOY del plan activo: denominador = comidas vivas aplicables a ese dia. */
export function activePlanNutritionComplianceForDay(
  date: string,
  rows: NutritionLog[],
  macroMeals: MacroMeal[],
  activePlanId: string | null,
): number {
  if (!activePlanId) return 0
  const row = rows.find((candidate) =>
    String(candidate.log_date ?? '').slice(0, 10) === date && candidate.plan_id === activePlanId,
  )
  const applicableMeals = macroMeals.filter((meal) =>
    meal.day_of_week == null || meal.day_of_week === getNutritionDayOfWeekFromIsoYmd(date),
  )
  const applicableIds = new Set(applicableMeals.map((meal) => meal.id))
  const completedIds = new Set(
    (row?.nutrition_meal_logs ?? [])
      .filter((log) => log.is_completed === true && applicableIds.has(String(log.meal_id ?? '')))
      .map((log) => String(log.meal_id)),
  )
  const total = Math.max(1, applicableMeals.length)
  return Math.min(100, Math.round((completedIds.size / total) * 100))
}

/**
 * Timeline real de nutrición: una fila solo existe si hubo daily_nutrition_logs.
 * Un log de otro plan conserva su snapshot y completitud, pero nunca se recalcula
 * con comidas/macros del plan activo actual.
 */
export function buildNutritionTimeline(
  todayIso: string,
  rows: NutritionLog[],
  macroMeals: MacroMeal[],
  liveGoals: MacroGoals,
  activePlanId: string | null,
): NutritionTimelineEntry[] {
  const fromIso = isoDateAddDays(todayIso, -29)
  const timeline: NutritionTimelineEntry[] = []

  for (const row of rows) {
    const date = String(row.log_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < fromIso || date > todayIso) continue

    const planId = typeof row.plan_id === 'string' ? row.plan_id : null
    const matchesActivePlan = activePlanId != null && planId === activePlanId
    const logs = (row.nutrition_meal_logs ?? []).map((log) => ({
      meal_id: String(log.meal_id ?? ''),
      is_completed: log.is_completed === true,
      consumed_quantity: log.consumed_quantity ?? null,
    }))
    const applicableMeals = matchesActivePlan
      ? macroMeals.filter((meal) => meal.day_of_week == null || meal.day_of_week === getNutritionDayOfWeekFromIsoYmd(date))
      : []
    const applicableMealIds = new Set(applicableMeals.map((meal) => meal.id))
    const applicableLogs = matchesActivePlan
      ? logs.filter((log) => applicableMealIds.has(log.meal_id))
      : logs
    const completedMealIds = new Set(applicableLogs.filter((log) => log.is_completed).map((log) => log.meal_id))
    // Timeline + promedio mensual web usan las filas historicas CRUDAS. La compliance
    // de hoy con comidas aplicables se calcula aparte en activePlanNutritionComplianceForDay.
    const total = logs.length
    const done = logs.filter((log) => log.is_completed).length
    const fallback = matchesActivePlan ? liveGoals : { calories: 0, protein: 0, carbs: 0, fats: 0 }
    const dayTarget = {
      calories: Number(row.target_calories_at_log ?? fallback.calories),
      protein: Number(row.target_protein_at_log ?? fallback.protein),
      carbs: Number(row.target_carbs_at_log ?? fallback.carbs),
      fats: Number(row.target_fats_at_log ?? fallback.fats),
    }
    const consumed = matchesActivePlan
      ? calculateConsumedMacrosWithCompletionFallback(
          applicableMeals,
          completedMealIds,
          dayTarget,
          portionPctMapFromMealLogs(applicableLogs),
        )
      : ZERO_MACROS

    timeline.push({
      date,
      planId,
      matchesActivePlan,
      mealsDone: done,
      mealsTotal: total,
      compliancePct: total > 0 ? Math.round((done / total) * 100) : 0,
      targetCalories: dayTarget.calories,
      consumedCalories: Math.round(consumed.calories),
      targetProtein: dayTarget.protein,
      consumedProtein: Math.round(consumed.protein),
      targetCarbs: dayTarget.carbs,
      consumedCarbs: Math.round(consumed.carbs),
      targetFats: dayTarget.fats,
      consumedFats: Math.round(consumed.fats),
    })
  }

  return timeline.sort((a, b) => b.date.localeCompare(a.date))
}

export function filterTimelineForActivePlan(
  timeline: NutritionTimelineEntry[],
  activePlanId: string | null,
): NutritionTimelineEntry[] {
  return activePlanId == null ? [] : timeline.filter((row) => row.planId === activePlanId)
}

export function averageNutritionTimelineCompliance(rows: NutritionTimelineEntry[]): number | null {
  return rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.compliancePct, 0) / rows.length)
    : null
}

type TargetProgram = {
  ab_mode?: boolean | null
  start_date?: string | null
  weeks_to_repeat?: number | null
  workoutPlans: Array<{ week_variant?: string | null; blocks: unknown[] }>
}

/** Mismo target del web: variante A/B efectiva y solo días que contienen bloques. */
export function effectiveWorkoutTarget(program: TargetProgram | null, now: Date = new Date()): number {
  if (!program) return 1
  const abMode = Boolean(program.ab_mode)
  const cycleVariant = resolveActiveWeekVariantForDisplay(program, undefined, now)
  const activeVariant = effectiveWeekVariantFromPlans(program.workoutPlans, cycleVariant, abMode)
  const count = program.workoutPlans.filter(
    (plan) => plan.blocks.length > 0 && workoutPlanMatchesVariant(plan, activeVariant, abMode),
  ).length
  return Math.max(1, count)
}
