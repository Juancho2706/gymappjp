import { describe, expect, it } from 'vitest'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  sumMealMacros,
  type NutritionMealMacroSource,
} from './nutrition-utils'
import { nutritionMealAppliesOnIsoYmdInSantiago } from './date-utils'

describe('nutrition day scope (day_of_week vs macros)', () => {
  const mealWithKcal = (id: string, kcal: number): NutritionMealMacroSource => ({
    id,
    food_items: [
      {
        quantity: 100,
        unit: 'g',
        foods: {
          name: 'X',
          calories: kcal,
          protein_g: 0,
          carbs_g: 0,
          fats_g: 0,
          serving_size: 100,
          serving_unit: 'g',
        },
      },
    ],
  })

  it('filters meals by day_of_week before any macro math (contract for NutritionShell)', () => {
    const mondayIso = '2026-04-27'
    const mAll = { ...mealWithKcal('every', 100), day_of_week: null as number | null }
    const mTue = { ...mealWithKcal('tue', 200), day_of_week: 2 }
    const planMeals = [mAll, mTue]
    const visible = planMeals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, mondayIso))
    expect(visible.map((m) => m.id)).toEqual(['every'])
    const plannedKcalMonday = visible.reduce((acc, m) => acc + sumMealMacros(normalizeMealForMacros(m)).calories, 0)
    expect(plannedKcalMonday).toBe(100)
  })

  it('consumed macros only sum completed meals in the list passed in (already day-filtered)', () => {
    const visible = [normalizeMealForMacros(mealWithKcal('m1', 500))]
    const completed = new Set(['m1'])
    /** Plan-level targets from `nutrition_plans` — siguen siendo las metas globales del plan. */
    const fullPlanGoals = { calories: 4000, protein: 100, carbs: 400, fats: 100 }
    const consumed = calculateConsumedMacrosWithCompletionFallback(visible, completed, fullPlanGoals)
    expect(Math.round(consumed.calories)).toBe(500)
  })
})
