/**
 * computeNutritionAdherence — MOTOR CANÓNICO de adherencia de nutrición.
 *
 * Fuente de verdad única reutilizada por web + mobile. PURE: sin Next.js /
 * Supabase / React / RN, y SIN importar date-utils (la convención día-de-semana
 * 1=Lun…7=Dom se inyecta vía `dayOfWeekResolver` / `mealAppliesOn`).
 *
 * Invariantes (críticas — ver docs/audits/nutrition-*):
 *  - compliancePct DIARIO  = mealsDone / applicableMeals  (comidas filtradas por
 *    día de semana mediante el resolver inyectado).
 *  - compliancePct de RANGO = sum(mealsDone) / sum(applicableMeals)  — NUNCA el
 *    promedio de los % diarios.
 *  - consumedMacros via calculateConsumedMacrosWithCompletionFallback.
 *  - targetMacros = snapshot de targetByDate si existe, si no liveTarget (por día,
 *    TODOS los macros).
 *  - loggingEngagementPct = daysWithLog / rangeDays * 100 — campo SEPARADO, jamás
 *    fusionado dentro de compliancePct.
 */

import {
  calculateConsumedMacrosWithCompletionFallback,
  type MealWithFoodItems,
} from './macros'

export type MacroTarget = {
  calories: number
  protein: number
  carbs: number
  fats: number
}

export type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fats: number
}

/** Una fila de `nutrition_meal_logs` (mínimo necesario para el motor). */
export type MealLogRow = {
  meal_id: string
  is_completed: boolean
  consumed_quantity?: number | null
}

/**
 * Meal del plan con su `day_of_week` opcional (NULL = aplica todos los días) +
 * los `food_items` ya normalizados para macros.
 */
export type AdherenceMeal = MealWithFoodItems & {
  day_of_week?: number | null
}

export type ComputeNutritionAdherenceInput = {
  /** Comidas del plan (con food_items normalizados via normalizeMealForMacros). */
  meals: AdherenceMeal[]
  /** logs agrupados por fecha ISO `YYYY-MM-DD`. */
  logsByDate: Map<string, MealLogRow[]>
  /** Snapshot de target por fecha (si una fecha falta, se usa liveTarget). */
  targetByDate?: Map<string, MacroTarget>
  /** Target vigente (fallback cuando no hay snapshot para una fecha). */
  liveTarget: MacroTarget
  /** Rango inclusivo de fechas ISO a evaluar. */
  range: { startIso: string; endIso: string }
  /** Convención 1=Lun … 7=Dom (inyectada para no importar date-utils). */
  dayOfWeekResolver: (isoYmd: string) => number
  /**
   * Predicado opcional de aplicabilidad de una comida en una fecha. Por default
   * se deriva de `day_of_week` + `dayOfWeekResolver`:
   *   day_of_week == null → aplica todos los días.
   */
  mealAppliesOn?: (meal: AdherenceMeal, isoYmd: string) => boolean
}

export type AdherenceDay = {
  date: string
  applicableMeals: number
  mealsDone: number
  mealsTotal: number
  compliancePct: number
  consumedMacros: MacroTotals
  targetMacros: MacroTarget
  hasLog: boolean
}

export type AdherenceStreak = {
  current: number
  longest: number
}

export type ComputeNutritionAdherenceOutput = {
  perDay: AdherenceDay[]
  summary: {
    compliancePct: number
    consumedMacros: MacroTotals
    targetMacros: MacroTarget
    loggingEngagementPct: number
    streak: AdherenceStreak
  }
}

/** Enumera las fechas ISO `YYYY-MM-DD` inclusive entre start y end. */
function enumerateDates(startIso: string, endIso: string): string[] {
  const out: string[] = []
  // Anclar a mediodía UTC para evitar saltos por DST al iterar por días.
  let cur = new Date(`${startIso}T12:00:00Z`).getTime()
  const end = new Date(`${endIso}T12:00:00Z`).getTime()
  const DAY_MS = 86_400_000
  // Guard: rango invertido → solo el primer día.
  if (Number.isNaN(cur) || Number.isNaN(end) || cur > end) {
    return startIso ? [startIso] : []
  }
  while (cur <= end) {
    const d = new Date(cur)
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`
    out.push(iso)
    cur += DAY_MS
  }
  return out
}

function emptyMacros(): MacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fats: 0 }
}

export function computeNutritionAdherence(
  input: ComputeNutritionAdherenceInput
): ComputeNutritionAdherenceOutput {
  const {
    meals,
    logsByDate,
    targetByDate,
    liveTarget,
    range,
    dayOfWeekResolver,
    mealAppliesOn,
  } = input

  const appliesOn =
    mealAppliesOn ??
    ((meal: AdherenceMeal, isoYmd: string): boolean => {
      if (meal.day_of_week == null) return true
      return meal.day_of_week === dayOfWeekResolver(isoYmd)
    })

  const dates = enumerateDates(range.startIso, range.endIso)

  const perDay: AdherenceDay[] = []

  // Acumuladores de rango (compliance del rango = suma/suma, NO promedio de %).
  let sumMealsDone = 0
  let sumApplicable = 0
  let daysWithLog = 0
  const summedConsumed = emptyMacros()
  const summedTarget: MacroTarget = { calories: 0, protein: 0, carbs: 0, fats: 0 }

  for (const date of dates) {
    const applicable = meals.filter((m) => appliesOn(m, date))
    const applicableMeals = applicable.length

    const logs = logsByDate.get(date) ?? []
    const hasLog = logs.length > 0

    const completedMealIds = new Set<string>()
    const portionPctByMealId = new Map<string, number>()
    for (const row of logs) {
      if (!row.is_completed) continue
      completedMealIds.add(row.meal_id)
      if (row.consumed_quantity != null) {
        const n = Number(row.consumed_quantity)
        if (!Number.isNaN(n)) portionPctByMealId.set(row.meal_id, n)
      }
    }

    // mealsDone: comidas APLICABLES ese día que están completadas.
    const applicableIds = new Set(applicable.map((m) => m.id))
    let mealsDone = 0
    for (const id of completedMealIds) {
      if (applicableIds.has(id)) mealsDone += 1
    }

    const targetMacros: MacroTarget = targetByDate?.get(date) ?? liveTarget

    const consumedMacros = calculateConsumedMacrosWithCompletionFallback(
      applicable,
      completedMealIds,
      targetMacros,
      portionPctByMealId
    )

    const compliancePct =
      applicableMeals > 0 ? (mealsDone / applicableMeals) * 100 : 0

    perDay.push({
      date,
      applicableMeals,
      mealsDone,
      mealsTotal: meals.length,
      compliancePct,
      consumedMacros,
      targetMacros,
      hasLog,
    })

    sumMealsDone += mealsDone
    sumApplicable += applicableMeals
    if (hasLog) daysWithLog += 1
    summedConsumed.calories += consumedMacros.calories
    summedConsumed.protein += consumedMacros.protein
    summedConsumed.carbs += consumedMacros.carbs
    summedConsumed.fats += consumedMacros.fats
    summedTarget.calories += targetMacros.calories
    summedTarget.protein += targetMacros.protein
    summedTarget.carbs += targetMacros.carbs
    summedTarget.fats += targetMacros.fats
  }

  const rangeDays = dates.length

  const summaryCompliance =
    sumApplicable > 0 ? (sumMealsDone / sumApplicable) * 100 : 0

  const loggingEngagementPct = rangeDays > 0 ? (daysWithLog / rangeDays) * 100 : 0

  const streak = computeStreak(perDay)

  return {
    perDay,
    summary: {
      compliancePct: summaryCompliance,
      consumedMacros: summedConsumed,
      targetMacros: summedTarget,
      loggingEngagementPct,
      streak,
    },
  }
}

/**
 * Streak de adherencia. Un día "cuenta" si tiene comidas aplicables y TODAS
 * fueron completadas (compliancePct === 100). Días sin comidas aplicables se
 * tratan como neutros (no rompen ni extienden la racha).
 *
 * - current: racha que termina en el último día del rango (cola de la serie).
 * - longest: racha máxima en cualquier ventana del rango.
 */
function computeStreak(perDay: AdherenceDay[]): AdherenceStreak {
  let longest = 0
  let run = 0
  for (const d of perDay) {
    if (d.applicableMeals === 0) {
      // neutro: no rompe ni suma
      continue
    }
    if (d.mealsDone >= d.applicableMeals && d.applicableMeals > 0) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }

  // current: contar desde el final hacia atrás (saltando días neutros).
  let current = 0
  for (let i = perDay.length - 1; i >= 0; i -= 1) {
    const d = perDay[i]
    if (d.applicableMeals === 0) continue
    if (d.mealsDone >= d.applicableMeals && d.applicableMeals > 0) {
      current += 1
    } else {
      break
    }
  }

  return { current, longest }
}
