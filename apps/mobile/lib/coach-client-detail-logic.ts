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

/**
 * Compliance de HOY del plan activo: denominador = comidas vivas aplicables a ese dia.
 * Devuelve `null` cuando NO hay dato honesto (sin plan activo, o plan sin comidas aplicables
 * hoy): antes esos dos casos valian `0` y la ficha los pintaba como "0 % de cumplimiento".
 * Un 0 REAL (plan activo, comidas aplicables y ninguna completada) sigue devolviendo `0`.
 */
export function activePlanNutritionComplianceForDay(
  date: string,
  rows: NutritionLog[],
  macroMeals: MacroMeal[],
  activePlanId: string | null,
): number | null {
  if (!activePlanId) return null
  const row = rows.find((candidate) =>
    String(candidate.log_date ?? '').slice(0, 10) === date && candidate.plan_id === activePlanId,
  )
  const applicableMeals = macroMeals.filter((meal) =>
    meal.day_of_week == null || meal.day_of_week === getNutritionDayOfWeekFromIsoYmd(date),
  )
  if (applicableMeals.length === 0) return null
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

type TrainingStrengthSeries = { muscleGroup: string; totalVolume: number }
type TrainingRadarRow = { muscleGroup: string; volume: number }

export function filterTrainingStrengthSeries<T extends TrainingStrengthSeries>(rows: T[], muscle: string | null): T[] {
  return muscle
    ? rows.filter((row) => row.muscleGroup === muscle).sort((a, b) => b.totalVolume - a.totalVolume)
    : rows.slice(0, 4)
}

export function selectTrainingRadarRows<T extends TrainingRadarRow>(rows: T[]): T[] {
  return [...rows].filter((row) => row.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 8)
}

export function trainingProgressionLabel(mode: string | null, value: number | null): string | null {
  if (mode === 'weekly_linear') return value != null ? `Lineal +${value}/sem` : 'Lineal'
  if (mode === 'double') return 'Doble progresión'
  return null
}

export function isValidIsoYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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

/** Copy único del anillo sin dato (web y RN comparten la forma capitalizada). */
export const NUTRITION_NO_PLAN_HINT = 'Sin plan vigente'

export interface NutritionSignal {
  /** Dominio encendido: con `false` el anillo (y todo rastro de nutrición) desaparece. */
  showRing: boolean
  /** `null` ⇒ `ComplianceRing` en `empty` (gris + «—»), nunca 0 %. */
  ringValue: number | null
  /** `Sin plan vigente` solo si el anillo se ve y no hay dato. */
  ringHint: string | undefined
  /** Lo que se pasa a `getProfileTopAlert`: `undefined` ⇒ la regla del banner se omite. */
  alertInput: number | undefined
  /** `null` ⇒ la píldora «Nutrición en riesgo / en track» no se pinta. Se decide con `todayPct` (< 60). */
  atRisk: boolean | null
}

/**
 * Única decisión de «qué se ve» de nutrición en la ficha RN: los `.tsx` solo pintan.
 * Pura y testeable sin montar React Native.
 *
 * `prevWeeklyAvgPct` viaja en el input por contrato: el delta del anillo solo existe con los
 * DOS promedios en `number` y esa comparación se hace en el llamador (`OverviewTab`), espejo
 * de la ficha web.
 */
export function resolveNutritionSignal(input: {
  nutritionEnabled: boolean
  weeklyAvgPct: number | null
  prevWeeklyAvgPct: number | null
  todayPct: number | null
}): NutritionSignal {
  const showRing = input.nutritionEnabled
  const ringValue = input.weeklyAvgPct == null ? null : Math.min(100, input.weeklyAvgPct)
  return {
    showRing,
    ringValue,
    ringHint: showRing && ringValue == null ? NUTRITION_NO_PLAN_HINT : undefined,
    alertInput: input.nutritionEnabled ? input.todayPct ?? undefined : undefined,
    // Misma ventana que tenía la píldora (HOY): sin dato de hoy no hay veredicto.
    atRisk: input.nutritionEnabled && input.todayPct != null ? input.todayPct < 60 : null,
  }
}
