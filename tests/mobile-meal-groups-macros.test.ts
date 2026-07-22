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

// Mock chainable de PostgREST: captura el payload insertado en `saved_meal_items`
// para verificar que `saveMealGroup` persiste la cantidad SIN redondear (4B-15).
const H = vi.hoisted(() => {
  const capture: { items: any[] | null } = { items: null }
  const makeBuilder = (table: string) => {
    let inserted = false
    const builder: any = {
      update() { return builder },
      delete() { return builder },
      insert(v: any) {
        inserted = true
        if (table === 'saved_meal_items') capture.items = v
        return builder
      },
      select() { return builder },
      eq() { return builder },
      is() { return builder },
      not() { return builder },
      order() { return builder },
      single() {
        if (table === 'saved_meals' && inserted) return Promise.resolve({ data: { id: 'g1' }, error: null })
        return Promise.resolve({
          data: { id: 'g1', name: 'Grupo', org_id: null, items: capture.items ?? [] },
          error: null,
        })
      },
      then(onF: any, onR?: any) {
        return Promise.resolve({ error: null, data: null }).then(onF, onR)
      },
    }
    return builder
  }
  const supabase = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'coach1' } } }) },
    from: (table: string) => makeBuilder(table),
  }
  return { supabase, capture }
})

vi.mock('../apps/mobile/lib/supabase', () => ({ supabase: H.supabase }))
vi.mock('../apps/mobile/lib/org', () => ({
  getCoachOrgContext: () => Promise.resolve({ orgId: null }),
}))
vi.mock('../apps/mobile/lib/nutrition-builder', () => ({
  foodToDraftItem: () => ({}),
}))

const { mealGroupItemMacros, mealGroupTotals, saveMealGroup } = await import('../apps/mobile/lib/meal-groups')

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

describe('saveMealGroup (cantidad decimal)', () => {
  it('persiste la cantidad cruda 0.5 sin redondear (paridad web)', async () => {
    H.capture.items = null
    const res = await saveMealGroup({
      name: 'Test decimal',
      items: [{ food_id: 'egg', quantity: 0.5, unit: 'un' }],
    })
    expect(res.ok).toBe(true)
    expect(H.capture.items).not.toBeNull()
    expect(H.capture.items![0].quantity).toBe(0.5)
    // NO el 1 (o 0) que dejaba el `Math.round` previo.
    expect(H.capture.items![0].quantity).not.toBe(1)
  })
})
