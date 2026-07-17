import { describe, it, expect } from 'vitest'
import { foodCategoryFromName, NUTRITION_FOOD_CATEGORIES } from './food-category'

describe('foodCategoryFromName', () => {
  it('maps null / undefined / empty / unknown to "otro"', () => {
    expect(foodCategoryFromName(null)).toBe('otro')
    expect(foodCategoryFromName(undefined)).toBe('otro')
    expect(foodCategoryFromName('   ')).toBe('otro')
    expect(foodCategoryFromName('cosa rara sin match')).toBe('otro')
  })

  it('is accent- and case-insensitive', () => {
    expect(foodCategoryFromName('Lácteo entero')).toBe('lacteo')
    expect(foodCategoryFromName('PLÁTANO')).toBe('fruta')
  })

  it('classifies common Spanish and English food names into the canonical enum', () => {
    expect(foodCategoryFromName('Yogurt natural')).toBe('lacteo')
    expect(foodCategoryFromName('Pollo a la plancha')).toBe('proteina')
    expect(foodCategoryFromName('Chicken breast')).toBe('proteina')
    expect(foodCategoryFromName('Arroz blanco')).toBe('carbohidrato')
    expect(foodCategoryFromName('Manzana')).toBe('fruta')
    expect(foodCategoryFromName('Verduras mixtas')).toBe('verdura')
    expect(foodCategoryFromName('Lentejas')).toBe('legumbre')
    expect(foodCategoryFromName('Aceite de oliva')).toBe('grasa')
    expect(foodCategoryFromName('Almendras')).toBe('grasa')
    expect(foodCategoryFromName('Bebida gaseosa')).toBe('bebida')
    expect(foodCategoryFromName('Galletas dulces')).toBe('snack')
    expect(foodCategoryFromName('Whey protein')).toBe('proteina')
  })

  it('prefers the more specific bucket by keyword order', () => {
    // "leche de almendras" -> lacteo (leche) gana sobre grasa (almendra)
    expect(foodCategoryFromName('Leche de almendras')).toBe('lacteo')
  })

  it('only ever returns a canonical category key', () => {
    for (const name of ['Pollo', 'x', '', 'zzz', 'Café con leche']) {
      expect(NUTRITION_FOOD_CATEGORIES).toContain(foodCategoryFromName(name))
    }
  })
})
