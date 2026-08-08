import { describe, expect, it } from 'vitest'
import {
  buildItemInsertRow,
  buildItemSubstitutionInsertRow,
  builderReducer,
  computeItemMacros,
  createBaseVariant,
  createEmptyBuilderState,
  createEmptyItem,
  type BuilderFood,
  type BuilderState,
  type DraftItemSubstitution,
  type DraftPrescriptionItem,
} from './draft-builder'

/**
 * GOLDEN del freeze por base declarada (T2.1 — specs/nutrition-food-overrides).
 *
 * El catalogo tiene dos convenciones vivas: `per_100` (importado) y `per_serving` (seed de
 * intercambios, y ahora los overrides del coach). El freeze congela `snapshot_*` al publicar y
 * ese numero es inmutable: si la base se ignora, el error solo se ve cuando el alumno mira su
 * plan, semanas despues y sin forma de corregirlo. Este archivo es la red que sostiene el resto
 * de la feature — existe ANTES de que exista un solo override real.
 */

const FOOD_ID = '33333333-3333-4333-8333-333333333333'
const SUB_FOOD_ID = '44444444-4444-4444-8444-444444444444'

/** Galleta del seed de intercambios: 190 kcal POR PORCION de 50 g (no por 100 g). */
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

/** El MISMO alimento sin base declarada: el 100% del catalogo importado. */
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

describe('computeItemMacros — base declarada', () => {
  it('sin base declarada mantiene la formula historica por 100 g (byte-identico)', () => {
    // 200 g / 100 = factor 2 sobre los macros de la fila.
    expect(computeItemMacros(SIN_BASE, 200, 'g')).toEqual({
      calories: 380,
      proteinG: 6,
      carbsG: 60,
      fatsG: 10,
      fiberG: 2,
    })
  })

  it('per_100 explicito da el MISMO resultado que la ausencia de base', () => {
    expect(computeItemMacros({ ...PER_SERVING, macrosBasis: 'per_100' }, 200, 'g')).toEqual(
      computeItemMacros(SIN_BASE, 200, 'g'),
    )
  })

  it('per_serving escala por la porcion declarada, no por 100 g', () => {
    // 200 g sobre una porcion de 50 g ⇒ factor 4 (no 2). Ignorar la base subregistraria a la mitad.
    expect(computeItemMacros(PER_SERVING, 200, 'g')).toEqual({
      calories: 760,
      proteinG: 12,
      carbsG: 120,
      fatsG: 20,
      fiberG: 4,
    })
  })

  it('per_serving en unidades contables multiplica por la cantidad', () => {
    const contable: BuilderFood = { ...PER_SERVING, servingUnit: 'un' }
    expect(computeItemMacros(contable, 3, 'un')).toEqual({
      calories: 570,
      proteinG: 9,
      carbsG: 90,
      fatsG: 15,
      fiberG: 3,
    })
  })

  it('cantidad no positiva sigue dando cero en cualquier base', () => {
    expect(computeItemMacros(PER_SERVING, 0, 'g').calories).toBe(0)
    expect(computeItemMacros(PER_SERVING, Number.NaN, 'g').calories).toBe(0)
  })

  it('fibra ausente cuenta como cero, no como NaN', () => {
    expect(computeItemMacros({ ...PER_SERVING, fiberG: null }, 200, 'g').fiberG).toBe(0)
  })
})

describe('freeze de publicacion — golden per_serving', () => {
  it('buildItemInsertRow congela el snapshot con la base del alimento', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item: ITEM, food: PER_SERVING })
    expect(row.snapshot_calories).toBe(760)
    expect(row.snapshot_protein_g).toBe(12)
    expect(row.snapshot_carbs_g).toBe(120)
    expect(row.snapshot_fats_g).toBe(20)
    expect(row.snapshot_fiber_g).toBe(4)
  })

  it('el mismo item sin base declarada congela los numeros de siempre', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item: ITEM, food: SIN_BASE })
    expect(row.snapshot_calories).toBe(380)
  })

  it('el reemplazo autorizado congela "una porcion" con la base correcta', () => {
    // Sin `quantity` propia, la referencia es el servingSize del alimento: 50 g de una fila
    // per_serving = EXACTAMENTE una porcion ⇒ factor 1, los macros de la fila tal cual.
    const sub: DraftItemSubstitution = {
      foodId: SUB_FOOD_ID,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    }
    const row = buildItemSubstitutionInsertRow({
      versionId: 'v1',
      prescriptionItemId: 'i1',
      orderIndex: 0,
      sub,
      food: { ...PER_SERVING, id: SUB_FOOD_ID },
    })
    expect(row.snapshot_calories).toBe(190)
    expect(row.snapshot_carbs_g).toBe(30)
  })
})

describe('APPLY_FOOD_OVERRIDE — la correccion es del alimento, no de la fila', () => {
  const OTRO_ID = '55555555-5555-4555-8555-555555555555'
  const OTRO: BuilderFood = { ...PER_SERVING, id: OTRO_ID, name: 'Otro alimento' }

  /**
   * El MISMO alimento en dos dias distintos, mas una vez como reemplazo autorizado. Si el
   * reducer tocara solo la fila abierta, el coach veria dos numeros para el mismo alimento en
   * la misma pantalla.
   */
  function stateConElMismoAlimentoDosVeces(): BuilderState {
    const base = createEmptyBuilderState('2026-07-20')
    const variante = { ...createBaseVariant(), key: 'v1', slots: [
      {
        key: 'slot-a',
        name: 'Desayuno',
        startTime: '08:00',
        items: [
          { ...createEmptyItem('i1'), food: SIN_BASE, quantity: '100', unit: 'g' as const },
        ],
      },
    ] }
    const variante2 = { ...createBaseVariant(), key: 'v2', isDefault: false, slots: [
      {
        key: 'slot-b',
        name: 'Cena',
        startTime: '20:00',
        items: [
          {
            ...createEmptyItem('i2'),
            food: OTRO,
            quantity: '50',
            unit: 'g' as const,
            substitutions: [{ key: 's1', food: SIN_BASE }],
          },
        ],
      },
    ] }
    return { ...base, variants: [variante, variante2], activeVariantKey: 'v1' }
  }

  const PATCH = {
    calories: 111,
    proteinG: 1,
    carbsG: 2,
    fatsG: 3,
    fiberG: 4,
    macrosBasis: 'per_100' as const,
    hasOverride: true,
    originalMacros: { calories: 190, proteinG: 3, carbsG: 30, fatsG: 5, fiberG: 1 },
  }

  it('alcanza TODAS las apariciones: otro dia y tambien los reemplazos', () => {
    const next = builderReducer(stateConElMismoAlimentoDosVeces(), {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: PATCH,
    })
    expect(next.variants[0].slots[0].items[0].food?.calories).toBe(111)
    expect(next.variants[0].slots[0].items[0].food?.hasOverride).toBe(true)
    const sub = next.variants[1].slots[0].items[0].substitutions?.[0]
    expect(sub?.food.calories).toBe(111)
    expect(sub?.food.originalMacros?.calories).toBe(190)
  })

  it('no toca los demas alimentos', () => {
    const next = builderReducer(stateConElMismoAlimentoDosVeces(), {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: PATCH,
    })
    const otro = next.variants[1].slots[0].items[0].food
    expect(otro?.id).toBe(OTRO_ID)
    expect(otro?.calories).toBe(190)
    expect(otro?.hasOverride).toBeUndefined()
  })

  it('restaurar deja el alimento sin marca y con los macros del catalogo', () => {
    const conOverride = builderReducer(stateConElMismoAlimentoDosVeces(), {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: PATCH,
    })
    const restaurado = builderReducer(conOverride, {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: {
        calories: 190,
        proteinG: 3,
        carbsG: 30,
        fatsG: 5,
        fiberG: 1,
        macrosBasis: null,
        hasOverride: false,
        originalMacros: null,
      },
    })
    const food = restaurado.variants[0].slots[0].items[0].food
    expect(food?.calories).toBe(190)
    expect(food?.hasOverride).toBe(false)
    expect(food?.originalMacros).toBeNull()
  })

  it('el preview del item usa los macros corregidos al instante', () => {
    const next = builderReducer(stateConElMismoAlimentoDosVeces(), {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_ID,
      macros: PATCH,
    })
    const item = next.variants[0].slots[0].items[0]
    // 100 g de una fila per_100 corregida a 111 kcal => 111.
    expect(computeItemMacros(item.food as BuilderFood, 100, 'g').calories).toBe(111)
  })
})
