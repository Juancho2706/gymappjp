import { describe, expect, it } from 'vitest'
import {
  applyMealFoodSwaps,
  calculateFoodItemMacros,
  calculateConsumedMacros,
  calculateConsumedMacrosWithCompletionFallback,
  coerceSwapOptionUnit,
  resolveCoachSwapPortionFromSwapOptions,
  mealConsumedPortionMultiplier,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  swapOptionIsLiquid,
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

  it('calculates item macros for ml (direct proportion, same as g)', () => {
    // Bug fix: ml was using serving_size multiplier → inflated macros
    // 15ml aceite (884 kcal/100ml) → should be 132.6 kcal, not 15*14/100*884
    const macros = calculateFoodItemMacros({
      quantity: 15,
      unit: 'ml',
      foods: {
        name: 'Aceite de oliva',
        calories: 884,
        protein_g: 0,
        carbs_g: 0,
        fats_g: 100,
        serving_size: 14,
        serving_unit: 'ml',
      },
    })
    expect(macros.calories).toBe(132.6)
    expect(macros.fats).toBe(15)
    expect(macros.protein).toBe(0)
  })

  it('calculates item macros for ml liquid drink (200ml)', () => {
    // Bug fix: 200ml jugo con serving_size=200 daba factor=400x
    const macros = calculateFoodItemMacros({
      quantity: 200,
      unit: 'ml',
      foods: {
        name: 'Jugo de naranja',
        calories: 45,
        protein_g: 0.7,
        carbs_g: 10.4,
        fats_g: 0.2,
        serving_size: 200,
        serving_unit: 'ml',
      },
    })
    expect(macros.calories).toBe(90)
    expect(macros.carbs).toBe(20.8)
  })

  it('ml and g produce same factor (density approximation for liquids)', () => {
    const base = {
      name: 'Leche',
      calories: 60,
      protein_g: 3.2,
      carbs_g: 4.7,
      fats_g: 3.3,
      serving_size: 200,
      serving_unit: 'ml',
    }
    const withMl = calculateFoodItemMacros({ quantity: 200, unit: 'ml', foods: base })
    const withG = calculateFoodItemMacros({ quantity: 200, unit: 'g', foods: base })
    expect(withMl).toEqual(withG)
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

  it('replaces meal item food macros when a swap is applied', () => {
    const meal: MealWithFoodItems = {
      id: 'm1',
      food_items: [
        {
          quantity: 100,
          unit: 'g',
          foods: {
            id: 'f-original',
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
    }

    const swapped = applyMealFoodSwaps(
      meal,
      new Map([
        [
          'f-original',
          {
            swappedFood: {
              id: 'f-swap',
              name: 'Papa',
              calories: 87,
              protein_g: 1.9,
              carbs_g: 20.1,
              fats_g: 0.1,
              serving_size: 100,
              serving_unit: 'g',
            },
          },
        ],
      ])
    )

    expect(swapped.food_items[0]?.foods.id).toBe('f-swap')
    expect(swapped.food_items[0]?.foods.name).toBe('Papa')
  })

  it('applies swapped quantity and unit overrides when provided', () => {
    const meal: MealWithFoodItems = {
      id: 'm1',
      food_items: [
        {
          quantity: 100,
          unit: 'g',
          foods: {
            id: 'f-original',
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
    }
    const swapped = applyMealFoodSwaps(
      meal,
      new Map([
        [
          'f-original',
          {
            swappedFood: {
              id: 'f-swap',
              name: 'Papa',
              calories: 87,
              protein_g: 1.9,
              carbs_g: 20.1,
              fats_g: 0.1,
              serving_size: 100,
              serving_unit: 'g',
            },
            swappedQuantity: 180,
            swappedUnit: 'g',
          },
        ],
      ])
    )
    expect(swapped.food_items[0]?.quantity).toBe(180)
    expect(swapped.food_items[0]?.unit).toBe('g')
  })

  it('coerces swap option units to allowed set for liquid vs solid', () => {
    expect(coerceSwapOptionUnit('g', true)).toBe('ml')
    expect(coerceSwapOptionUnit('ml', true)).toBe('ml')
    expect(coerceSwapOptionUnit('un', true)).toBe('un')
    expect(coerceSwapOptionUnit('ml', false)).toBe('g')
    expect(coerceSwapOptionUnit('g', false)).toBe('g')
    expect(coerceSwapOptionUnit('un', false)).toBe('un')
  })

  it('detects liquid swap rows from is_liquid or serving_unit', () => {
    expect(swapOptionIsLiquid({ is_liquid: true, serving_unit: 'g' })).toBe(true)
    expect(swapOptionIsLiquid({ is_liquid: false, serving_unit: 'ml' })).toBe(true)
    expect(swapOptionIsLiquid({ serving_unit: 'ml' })).toBe(true)
    expect(swapOptionIsLiquid({ serving_unit: 'g' })).toBe(false)
    expect(swapOptionIsLiquid({ is_liquid: false, serving_unit: 'g' })).toBe(false)
  })

  it('resolveCoachSwapPortionFromSwapOptions uses coach quantity and unit', () => {
    const opts = [
      {
        food_id: 'a',
        quantity: 40,
        unit: 'un',
        serving_size: 100,
        serving_unit: 'g',
        is_liquid: false,
      },
    ]
    expect(resolveCoachSwapPortionFromSwapOptions(opts, 'a')).toEqual({ quantity: 40, unit: 'un' })
  })

  it('resolveCoachSwapPortionFromSwapOptions falls back to serving_size when quantity missing', () => {
    const opts = [
      {
        food_id: 'b',
        serving_size: 200,
        unit: 'g',
        serving_unit: 'g',
        is_liquid: false,
      },
    ]
    expect(resolveCoachSwapPortionFromSwapOptions(opts, 'b')).toEqual({ quantity: 200, unit: 'g' })
  })
})
