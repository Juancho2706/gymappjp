import { describe, expect, it } from 'vitest'
import {
  calculateIntakeEntriesTotals,
  calculateIntakeEntryMacros,
  combineNutritionMacros,
  normalizeNutritionMealSlot,
  nutritionTargetPercent,
} from './intake'

describe('real intake calculations', () => {
  it('prefers snapshots over current food values', () => {
    expect(calculateIntakeEntryMacros({
      quantity: 2,
      unit: 'un',
      snapshot_calories: 143,
      snapshot_protein_g: 13,
      snapshot_carbs_g: 0.7,
      snapshot_fats_g: 9.5,
      snapshot_serving_size: 60,
      snapshot_serving_unit: 'un',
      food: {
        calories: 999,
        protein_g: 999,
        carbs_g: 999,
        fats_g: 999,
        serving_size: 100,
        serving_unit: 'g',
      },
    })).toEqual({
      calories: 171.6,
      protein: 15.6,
      carbs: 0.8,
      fats: 11.4,
      fiber: 0,
    })
  })

  it('adds multiple entries and combines them with plan consumption', () => {
    const intake = calculateIntakeEntriesTotals([
      {
        quantity: 100,
        unit: 'g',
        snapshot_calories: 165,
        snapshot_protein_g: 31,
        snapshot_carbs_g: 0,
        snapshot_fats_g: 3.6,
        snapshot_serving_size: 100,
      },
      {
        quantity: 250,
        unit: 'ml',
        snapshot_calories: 42,
        snapshot_protein_g: 3.4,
        snapshot_carbs_g: 5,
        snapshot_fats_g: 1,
        snapshot_serving_size: 100,
      },
    ])

    expect(intake).toEqual({
      calories: 270,
      protein: 39.5,
      carbs: 12.5,
      fats: 6.1,
      fiber: 0,
    })
    expect(combineNutritionMacros(
      { calories: 1000, protein: 80, carbs: 120, fats: 30 },
      intake,
    )).toEqual({
      calories: 1270,
      protein: 119.5,
      carbs: 132.5,
      fats: 36.1,
    })
  })

  it('normalizes unknown slots and calculates target percentage', () => {
    expect(normalizeNutritionMealSlot('lunch')).toBe('lunch')
    expect(normalizeNutritionMealSlot('legacy')).toBe('other')
    expect(nutritionTargetPercent(1800, 2000)).toBe(90)
    expect(nutritionTargetPercent(300, 0)).toBe(0)
  })
})
