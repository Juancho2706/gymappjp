import { describe, expect, it } from 'vitest'
import {
  buildItemInsertRow,
  computeItemMacros,
  type BuilderFood,
  type DraftPrescriptionItem,
} from '../apps/mobile/lib/nutrition-v2-builder'

/**
 * ESPEJO RN del golden `draft-builder.macros-basis.test.ts` de la web (T2.1 —
 * specs/nutrition-food-overrides). El builder movil es una copia portada 1:1 del de la web y
 * congela los MISMOS `snapshot_*`: si una sola de las dos ignora la base declarada, el plan
 * queda con numeros distintos segun desde donde lo publico el coach — el drift web/RN que ya
 * denuncio la auditoria (NUT-039). Los numeros de aca son los mismos del archivo web a
 * proposito: si divergen, uno de los dos builders se movio solo.
 */

const FOOD_ID = '33333333-3333-4333-8333-333333333333'

const PER_SERVING: BuilderFood = {
  id: FOOD_ID,
  name: 'Galleta de arroz',
  brand: null,
  calories: 190,
  proteinG: 3,
  carbsG: 30,
  fatsG: 5,
  fiberG: 1,
  servingSize: 50,
  servingUnit: 'g',
  category: null,
  media: null,
  macrosBasis: 'per_serving',
}

const SIN_BASE: BuilderFood = { ...PER_SERVING, macrosBasis: undefined }

const ITEM: DraftPrescriptionItem = {
  foodId: FOOD_ID,
  recipeId: null,
  customName: null,
  quantity: 200,
  unit: 'g',
  minimumQuantity: null,
  maximumQuantity: null,
  optional: false,
  substitutionGroupId: null,
  notes: null,
  orderIndex: 0,
}

describe('builder RN — base declarada de macros', () => {
  it('sin base declarada mantiene la formula historica por 100 g', () => {
    expect(computeItemMacros(SIN_BASE, 200, 'g')).toEqual({
      calories: 380,
      proteinG: 6,
      carbsG: 60,
      fatsG: 10,
      fiberG: 2,
    })
  })

  it('per_serving escala por la porcion declarada, igual que la web', () => {
    expect(computeItemMacros(PER_SERVING, 200, 'g')).toEqual({
      calories: 760,
      proteinG: 12,
      carbsG: 120,
      fatsG: 20,
      fiberG: 4,
    })
  })

  it('el freeze del RN congela el mismo snapshot que el de la web', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item: ITEM, food: PER_SERVING })
    expect(row.snapshot_calories).toBe(760)
    expect(row.snapshot_fiber_g).toBe(4)
  })
})
