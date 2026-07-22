// 4B-01 — Regresión de macros de grupos de comidas (apps/mobile/lib/meal-groups.ts).
//
// RN reimplementaba la fórmula a mano: para `un` usaba factor = cantidad, ignorando
// `serving_size`. El motor compartido usa factor = qty × serving_size / 100. Estos tests
// fijan que RN consuma el motor `@eva/nutrition-engine` (mismos números que la web).
//
// El módulo bajo prueba importa `./supabase` (que arrastra `react-native` vía polyfills,
// impáseable por Vitest). Mockeamos los módulos con dependencias nativas y cargamos el
// módulo de forma dinámica tras registrar los mocks — mismo patrón que
// mobile-nutrition-v2-portions.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { calculateFoodItemMacros } from '@eva/nutrition-engine'
import type { MealGroupItem } from '../apps/mobile/lib/meal-groups'
import type { FoodRow } from '../apps/mobile/lib/nutrition-builder'

vi.mock('../apps/mobile/lib/supabase', () => ({ supabase: {} }))
vi.mock('../apps/mobile/lib/org', () => ({
  getCoachOrgContext: () => Promise.resolve({ orgId: null }),
}))
vi.mock('../apps/mobile/lib/nutrition-builder', () => ({
  foodToDraftItem: () => ({}),
}))

const { mealGroupItemMacros, mealGroupTotals } = await import('../apps/mobile/lib/meal-groups')

const EGG: FoodRow = {
  id: 'egg',
  name: 'Huevo',
  calories: 155,
  protein_g: 13,
  carbs_g: 1.1,
  fats_g: 11,
  serving_size: 60,
  serving_unit: 'un',
  is_liquid: false,
  category: null,
  brand: null,
}

function eggItem(quantity: number, unit: string): MealGroupItem {
  return { food_id: EGG.id, quantity, unit, food: EGG }
}

describe('mealGroupItemMacros', () => {
  it('unidad `un` con serving_size ≠ 100 usa la fórmula del motor (caso huevo)', () => {
    // 2 un × serving 60 / 100 = factor 1.2 → 13 × 1.2 = 15.6 g proteína.
    const m = mealGroupItemMacros(eggItem(2, 'un'))
    expect(m.protein).toBe(15.6)
    expect(m.calories).toBe(186) // 155 × 1.2
    // NO el número inflado del cálculo local previo (13 × 2 = 26).
    expect(m.protein).not.toBe(26)
  })

  it('unidad `g` es proporción directa (qty / 100), sin cambio', () => {
    const m = mealGroupItemMacros(eggItem(100, 'g'))
    expect(m.protein).toBe(13)
    expect(m.calories).toBe(155)
  })

  it('normaliza la unidad legacy `u` a `un`', () => {
    expect(mealGroupItemMacros(eggItem(2, 'u'))).toEqual(mealGroupItemMacros(eggItem(2, 'un')))
  })

  it('coincide con el consumo directo del motor (mismo contrato que la web)', () => {
    const engine = calculateFoodItemMacros({
      quantity: 2,
      unit: 'un',
      foods: {
        id: EGG.id,
        name: EGG.name,
        calories: EGG.calories,
        protein_g: EGG.protein_g,
        carbs_g: EGG.carbs_g,
        fats_g: EGG.fats_g,
        serving_size: EGG.serving_size,
        serving_unit: EGG.serving_unit,
      },
    })
    expect(mealGroupItemMacros(eggItem(2, 'un'))).toEqual({
      calories: engine.calories,
      protein: engine.protein,
      carbs: engine.carbs,
      fats: engine.fats,
    })
  })

  it('food nulo no rompe (todo 0)', () => {
    const m = mealGroupItemMacros({ food_id: 'x', quantity: 2, unit: 'un', food: null })
    expect(m).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 })
  })
})

describe('mealGroupTotals', () => {
  it('suma los macros por ítem del motor', () => {
    const totals = mealGroupTotals([eggItem(2, 'un'), eggItem(100, 'g')])
    // 15.6 (P un) + 13 (P g) = 28.6 ; 186 + 155 = 341 kcal.
    expect(totals.protein).toBeCloseTo(28.6, 5)
    expect(totals.calories).toBeCloseTo(341, 5)
  })

  it('grupo vacío = todo 0', () => {
    expect(mealGroupTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 })
  })
})
