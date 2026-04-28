import { describe, expect, it } from 'vitest'
import {
  calculateFoodItemMacros,
  calculateConsumedMacros,
  calculateConsumedMacrosWithCompletionFallback,
  mealConsumedPortionMultiplier,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  type MealWithFoodItems,
  type NutritionMealMacroSource,
} from './nutrition-utils'

describe('nutrition-utils', () => {
  it('calculates item macros for grams', () => {
    const macros = calculateFoodItemMacros({
      quantity: 150,
      unit: 'g',
      foods: {
        name: 'Pollo',
        calories: 200,
        protein_g: 30,
        carbs_g: 0,
        fats_g: 5,
        serving_size: 100,
        serving_unit: 'g',
      },
    })

    expect(macros).toEqual({
      calories: 300,
      protein: 45,
      carbs: 0,
      fats: 7.5,
    })
  })

  it('calculates item macros for unit-based foods', () => {
    const macros = calculateFoodItemMacros({
      quantity: 2,
      unit: 'un',
      foods: {
        name: 'Huevo',
        calories: 155,
        protein_g: 13,
        carbs_g: 1.1,
        fats_g: 11,
        serving_size: 60,
        serving_unit: 'un',
      },
    })

    expect(macros).toEqual({
      calories: 186,
      protein: 15.6,
      carbs: 1.3,
      fats: 13.2,
    })
  })

  it('normalizes nested meals and consumes only completed meals', () => {
    const source: NutritionMealMacroSource[] = [
      {
        id: 'm1',
        food_items: [
          {
            quantity: 100,
            unit: 'g',
            foods: {
              name: 'Arroz',
              calories: 130,
              protein_g: 2.7,
              carbs_g: 28,
              fats_g: 0.3,
              serving_size: 100,
              serving_unit: 'g',
            },
          },
        ],
      },
      {
        id: 'm2',
        food_items: [
          {
            quantity: 100,
            unit: 'g',
            foods: {
              name: 'Atun',
              calories: 120,
              protein_g: 26,
              carbs_g: 0,
              fats_g: 1,
              serving_size: 100,
              serving_unit: 'g',
            },
          },
        ],
      },
    ]

    const meals: MealWithFoodItems[] = source.map(normalizeMealForMacros)
    const completed = new Set(['m2'])
    const consumed = calculateConsumedMacros(meals, completed)

    expect(Math.round(consumed.calories)).toBe(120)
    expect(Math.round(consumed.protein)).toBe(26)
    expect(Math.round(consumed.carbs)).toBe(0)
    expect(Math.round(consumed.fats)).toBe(1)
  })

  it('scales completed meal macros by explicit portion % map', () => {
    const source: NutritionMealMacroSource[] = [
      {
        id: 'm1',
        food_items: [
          {
            quantity: 100,
            unit: 'g',
            foods: {
              name: 'X',
              calories: 100,
              protein_g: 10,
              carbs_g: 10,
              fats_g: 10,
              serving_size: 100,
              serving_unit: 'g',
            },
          },
        ],
      },
    ]
    const meals: MealWithFoodItems[] = source.map(normalizeMealForMacros)
    const completed = new Set(['m1'])
    const portion = new Map([['m1', 50]])
    const consumed = calculateConsumedMacros(meals, completed, portion)
    expect(Math.round(consumed.calories)).toBe(50)
    expect(Math.round(consumed.protein)).toBe(5)
  })

  it('portionPctMapFromMealLogs only includes completed rows with quantity', () => {
    const m = portionPctMapFromMealLogs([
      { meal_id: 'a', is_completed: true, consumed_quantity: 40 },
      { meal_id: 'b', is_completed: true, consumed_quantity: null },
      { meal_id: 'c', is_completed: false, consumed_quantity: 50 },
    ])
    expect([...m.entries()]).toEqual([['a', 40]])
  })

  it('mealConsumedPortionMultiplier is 1 when map has no key', () => {
    expect(mealConsumedPortionMultiplier('x', new Map([['y', 25]]))).toBe(1)
  })

  it('uses completion fallback when meals have no macro data', () => {
    const meals: MealWithFoodItems[] = [
      { id: 'm1', food_items: [] },
      { id: 'm2', food_items: [] },
      { id: 'm3', food_items: [] },
    ]
    const completed = new Set(['m1', 'm3'])

    const consumed = calculateConsumedMacrosWithCompletionFallback(meals, completed, {
      calories: 1800,
      protein: 150,
      carbs: 200,
      fats: 60,
    })

    expect(consumed).toEqual({
      calories: 1200,
      protein: 100,
      carbs: expect.closeTo(133.3333333333, 8),
      fats: 40,
    })
  })

  it('weights fallback ratio by portion when meals have no macro data', () => {
    const meals: MealWithFoodItems[] = [{ id: 'm1', food_items: [] }, { id: 'm2', food_items: [] }]
    const completed = new Set(['m1'])
    const portion = new Map([['m1', 50]])
    const consumed = calculateConsumedMacrosWithCompletionFallback(
      meals,
      completed,
      { calories: 2000, protein: 100, carbs: 200, fats: 60 },
      portion
    )
    expect(consumed.calories).toBe(500)
    expect(consumed.protein).toBe(25)
  })
})
