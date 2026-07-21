import { describe, it, expect } from 'vitest'
import {
  buildItemSubstitutionInsertRow,
  collectSubstitutionFoodIds,
  type BuilderFood,
} from './draft-builder'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'

const FOOD: BuilderFood = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Pavo molido cocido',
  brand: 'Marca',
  calories: 200,
  proteinG: 27,
  carbsG: 0,
  fatsG: 10,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: null,
  media: null,
}

const V = '55555555-5555-4555-8555-555555555555'
const ITEM = '66666666-6666-4666-8666-666666666666'

describe('buildItemSubstitutionInsertRow — freeze del reemplazo', () => {
  it('food resuelto + cantidad => congela nombre/marca + macros a esa cantidad', () => {
    const row = buildItemSubstitutionInsertRow({
      versionId: V,
      prescriptionItemId: ITEM,
      orderIndex: 0,
      sub: { foodId: FOOD.id, recipeId: null, customName: null, quantity: 100, unit: 'g', orderIndex: 0 },
      food: FOOD,
    })
    expect(row.version_id).toBe(V)
    expect(row.prescription_item_id).toBe(ITEM)
    expect(row.food_id).toBe(FOOD.id)
    expect(row.snapshot_name).toBe('Pavo molido cocido')
    expect(row.snapshot_brand).toBe('Marca')
    expect(row.snapshot_calories).toBe(200)
    expect(row.snapshot_protein_g).toBe(27)
    expect(row.order_index).toBe(0)
  })

  it('cantidad null => usa el servingSize del alimento como referencia (misma porción)', () => {
    const row = buildItemSubstitutionInsertRow({
      versionId: V,
      prescriptionItemId: ITEM,
      orderIndex: 1,
      sub: { foodId: FOOD.id, recipeId: null, customName: null, quantity: null, unit: null, orderIndex: 1 },
      food: FOOD,
    })
    expect(row.quantity).toBeNull()
    expect(row.snapshot_calories).toBe(200) // servingSize 100 => macros por-100
  })

  it('reemplazo libre (sin food) => snapshot solo con nombre, macros null', () => {
    const row = buildItemSubstitutionInsertRow({
      versionId: V,
      prescriptionItemId: ITEM,
      orderIndex: 0,
      sub: { foodId: null, recipeId: null, customName: 'Merluza al horno', quantity: null, unit: null, orderIndex: 0 },
      food: null,
    })
    expect(row.food_id).toBeNull()
    expect(row.snapshot_name).toBe('Merluza al horno')
    expect(row.snapshot_brand).toBeNull()
    expect(row.snapshot_calories).toBeNull()
  })
})

describe('collectSubstitutionFoodIds', () => {
  it('junta food ids de reemplazos de todos los items (dedupe), ignora libres', () => {
    const draft = {
      dayVariants: [
        {
          mealSlots: [
            {
              items: [
                { substitutions: [{ foodId: 'f1' }, { foodId: 'f2' }, { foodId: null, customName: 'libre' }] },
                { substitutions: [{ foodId: 'f1' }] },
                { substitutions: undefined },
                {},
              ],
            },
          ],
        },
      ],
    } as unknown as NutritionPlanDraft
    expect(collectSubstitutionFoodIds(draft).sort()).toEqual(['f1', 'f2'])
  })
})
