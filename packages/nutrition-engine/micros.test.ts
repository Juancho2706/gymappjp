import { describe, expect, it } from 'vitest'
import {
  calculateFoodItemMicros,
  sumMealMicros,
  formatHouseholdCount,
  gramsToHousehold,
  type FoodItemForMicros,
} from './index'

function item(over: Partial<FoodItemForMicros> & {
  foods: Partial<FoodItemForMicros['foods']>
}): FoodItemForMicros {
  return {
    quantity: over.quantity ?? 100,
    unit: over.unit ?? 'g',
    foods: {
      name: 'x',
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fats_g: 0,
      serving_size: 100,
      serving_unit: null,
      ...over.foods,
    },
    swap_options: over.swap_options,
  }
}

describe('calculateFoodItemMicros', () => {
  it('escala micros por gramos (factor = qty/100)', () => {
    const m = calculateFoodItemMicros(
      item({ quantity: 200, unit: 'g', foods: { fiber_g: 5, sodium_mg: 100, sugar_g: 10 } })
    )
    expect(m.fiber_g).toBe(10)
    expect(m.sodium_mg).toBe(200)
    expect(m.sugar_g).toBe(20)
  })

  it('unidad "un" usa serving_size', () => {
    // 1 un, serving_size=60 → factor 0.6
    const m = calculateFoodItemMicros(
      item({ quantity: 1, unit: 'un', foods: { serving_size: 60, sugar_g: 10 } })
    )
    expect(m.sugar_g).toBe(6)
  })

  it('valores ausentes (null) cuentan como 0', () => {
    const m = calculateFoodItemMicros(item({ quantity: 100, foods: { fiber_g: null } }))
    expect(m.fiber_g).toBe(0)
    expect(m.saturated_fat_g).toBe(0)
  })
})

describe('sumMealMicros', () => {
  it('suma micros de varios ítems', () => {
    const meal = {
      food_items: [
        item({ quantity: 100, foods: { fiber_g: 3, sodium_mg: 50 } }),
        item({ quantity: 100, foods: { fiber_g: 2, sodium_mg: 25, sugar_g: 4 } }),
      ],
    }
    const m = sumMealMicros(meal)
    expect(m.fiber_g).toBe(5)
    expect(m.sodium_mg).toBe(75)
    expect(m.sugar_g).toBe(4)
  })

  it('comida vacía → ceros', () => {
    expect(sumMealMicros({ food_items: [] })).toEqual({
      fiber_g: 0,
      sodium_mg: 0,
      sugar_g: 0,
      saturated_fat_g: 0,
      unsaturated_fat_g: 0,
    })
  })
})

describe('gramsToHousehold', () => {
  it('1 porción exacta', () => {
    expect(gramsToHousehold({ household_grams: 120, household_label: 'taza' }, 120)).toBe(
      '120 g (1 taza)'
    )
  })

  it('pluraliza (vocal +s)', () => {
    expect(gramsToHousehold({ household_grams: 120, household_label: 'taza' }, 240)).toBe(
      '240 g (2 tazas)'
    )
  })

  it('pluraliza (consonante +es)', () => {
    expect(gramsToHousehold({ household_grams: 50, household_label: 'cucharon' }, 100)).toBe(
      '100 g (2 cucharones)'
    )
  })

  it('fracción común ½', () => {
    expect(gramsToHousehold({ household_grams: 120, household_label: 'taza' }, 60)).toBe(
      '60 g (½ taza)'
    )
  })

  it('sin household devuelve solo masa', () => {
    expect(gramsToHousehold({ household_grams: null, household_label: null }, 75)).toBe('75 g')
    expect(gramsToHousehold({}, 75)).toBe('75 g')
  })

  it('decimal sin fracción común: coma es-CL, no punto (mejora del jefe 06-09)', () => {
    expect(gramsToHousehold({ household_grams: 61, household_label: 'huevo' }, 91.5)).toBe(
      '92 g (1,5 huevos)'
    )
  })
})

describe('formatHouseholdCount', () => {
  it('decimal >= 1 sin fracción común: coma es-CL, 1 decimal', () => {
    expect(formatHouseholdCount(1.5, 'huevo')).toBe('1,5 huevos')
    expect(formatHouseholdCount(2.3, 'taza')).toBe('2,3 tazas')
  })

  it('entero: sin decimales de más', () => {
    expect(formatHouseholdCount(2, 'huevo')).toBe('2 huevos')
  })

  it('fracción común < 1: glifo tal cual, sin pasar por el formateador de número', () => {
    expect(formatHouseholdCount(0.5, 'taza')).toBe('½ taza')
    expect(formatHouseholdCount(0.25, 'taza')).toBe('¼ taza')
    expect(formatHouseholdCount(0.333, 'taza')).toBe('⅓ taza')
    expect(formatHouseholdCount(0.667, 'taza')).toBe('⅔ taza')
    expect(formatHouseholdCount(0.75, 'taza')).toBe('¾ taza')
  })

  it('decimal < 1 sin fracción cercana: coma es-CL (singular, count <= 1)', () => {
    expect(formatHouseholdCount(0.4, 'taza')).toBe('0,4 taza')
  })
})
