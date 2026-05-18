import { describe, expect, it } from 'vitest'
import { buildNutritionDayPlainTextLines } from './nutrition-day-plain-text'

const sampleFood = {
  quantity: 100,
  unit: 'g' as const,
  foods: {
    name: 'Avena',
    calories: 380,
    protein_g: 13,
    carbs_g: 67,
    fats_g: 7,
    serving_size: 100,
    serving_unit: 'g' as const,
  },
}

describe('buildNutritionDayPlainTextLines', () => {
  it('includes plan name, date, meals and goal line', () => {
    const lines = buildNutritionDayPlainTextLines({
      planName: 'Test Plan',
      date: '2026-04-30',
      instructions: null,
      meals: [{ name: 'Desayuno', food_items: [sampleFood] }],
      goals: { calories: 2000, protein: 150, carbs: 200, fats: 60 },
    })
    expect(lines.some((l) => l.includes('Test Plan'))).toBe(true)
    expect(lines.some((l) => l.includes('2026-04-30'))).toBe(true)
    expect(lines.some((l) => l.includes('DESAYUNO'))).toBe(true)
    expect(lines.some((l) => l.includes('Avena'))).toBe(true)
    expect(lines.some((l) => l.includes('Meta diaria: 2000 kcal'))).toBe(true)
  })

  it('includes instructions block when present', () => {
    const lines = buildNutritionDayPlainTextLines({
      planName: 'P',
      date: '2026-01-01',
      instructions: 'Bebe agua',
      meals: [],
      goals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    })
    expect(lines.join('\n')).toContain('Bebe agua')
  })
})
