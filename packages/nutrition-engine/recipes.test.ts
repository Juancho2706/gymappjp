import { describe, expect, it } from 'vitest'
import {
  calculateStructuredRecipePerServing,
  calculateStructuredRecipeTotals,
  formatFoodReference,
  preferredFoodIntakeQuantity,
  preferredFoodIntakeUnit,
} from './recipes'

const ingredients = [
  {
    name_snapshot: 'Pollo',
    quantity: 200,
    unit: 'g',
    calories_snapshot: 165,
    protein_g_snapshot: 31,
    carbs_g_snapshot: 0,
    fats_g_snapshot: 3.6,
    fiber_g_snapshot: 0,
    serving_size_snapshot: 100,
    serving_unit_snapshot: 'g',
  },
  {
    name_snapshot: 'Huevo',
    quantity: 2,
    unit: 'un',
    calories_snapshot: 143,
    protein_g_snapshot: 13,
    carbs_g_snapshot: 0.7,
    fats_g_snapshot: 9.5,
    fiber_g_snapshot: 0,
    serving_size_snapshot: 60,
    serving_unit_snapshot: 'un',
  },
] as const

describe('structured recipe calculator', () => {
  it('uses per-100 values for grams and serving_size for units', () => {
    expect(calculateStructuredRecipeTotals(ingredients)).toEqual({
      calories: 501.6,
      protein: 77.6,
      carbs: 0.8,
      fats: 18.6,
      fiber: 0,
    })
  })

  it('divides totals by servings', () => {
    expect(calculateStructuredRecipePerServing(ingredients, 2)).toEqual({
      calories: 250.8,
      protein: 38.8,
      carbs: 0.4,
      fats: 9.3,
      fiber: 0,
    })
  })
})

describe('food reference UI contract', () => {
  it('shows per 100 g/ml without mixing it with the reference serving', () => {
    expect(
      formatFoodReference({ calories: 165, serving_size: 150, serving_unit: 'g' }),
    ).toBe('165 kcal / 100 g')
    expect(
      formatFoodReference({ calories: 42, serving_size: 250, serving_unit: 'ml', is_liquid: true }),
    ).toBe('42 kcal / 100 ml')
  })

  it('shows the computed value for one countable unit', () => {
    expect(
      formatFoodReference({ calories: 143, serving_size: 60, serving_unit: 'un' }),
    ).toBe('1 un ≈ 60 g · 85.8 kcal')
  })

  it('selects a sensible initial unit and quantity', () => {
    expect(preferredFoodIntakeUnit({ serving_unit: 'un' })).toBe('un')
    expect(preferredFoodIntakeQuantity({ serving_size: 60, serving_unit: 'un' })).toBe(1)
    expect(preferredFoodIntakeUnit({ serving_unit: 'ml', is_liquid: true })).toBe('ml')
    expect(preferredFoodIntakeQuantity({ serving_size: 250, serving_unit: 'ml' })).toBe(250)
  })
})
