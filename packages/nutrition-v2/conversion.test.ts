import { describe, expect, it } from 'vitest'
import {
  mapV1PlanToV2Conversion,
  type ConversionBundle,
  type ConversionOpts,
  type V1FoodItemRow,
  type V1FoodRow,
  type V1MealRow,
  type V1PlanRow,
  type V1PlanTree,
} from './conversion'

// --- Fabricas de datos V1 ---

function makeIdFactory(): () => string {
  let n = 0
  return () => `id-${++n}`
}

function baseOpts(overrides: Partial<ConversionOpts> = {}): ConversionOpts {
  return {
    newId: makeIdFactory(),
    versionNumber: 1,
    effectiveFromLocalDate: '2026-07-17',
    ...overrides,
  }
}

const FOOD_A: V1FoodRow = {
  id: 'food-a',
  name: 'Pollo',
  calories: 100,
  protein_g: 10,
  carbs_g: 20,
  fats_g: 5,
  serving_size: 100,
  serving_unit: 'g',
}

// Alimento contable: serving_size 60 (1 huevo ~ 60 g), unidad 'un'.
const FOOD_B: V1FoodRow = {
  id: 'food-b',
  name: 'Huevo',
  calories: 155,
  protein_g: 13,
  carbs_g: 1.1,
  fats_g: 11,
  serving_size: 60,
  serving_unit: 'un',
}

function item(overrides: Partial<V1FoodItemRow> & Pick<V1FoodItemRow, 'id' | 'food'>): V1FoodItemRow {
  return {
    food_id: overrides.food ? overrides.food.id : 'food-x',
    quantity: 100,
    unit: 'g',
    swap_options: [],
    ...overrides,
  }
}

function meal(overrides: Partial<V1MealRow> & Pick<V1MealRow, 'id'>): V1MealRow {
  return {
    name: 'Comida',
    description: null,
    order_index: 0,
    day_of_week: null,
    items: [],
    ...overrides,
  }
}

function plan(overrides: Partial<V1PlanRow> = {}): V1PlanRow {
  return {
    id: 'plan-1',
    client_id: 'client-1',
    coach_id: 'coach-1',
    org_id: null,
    team_id: null,
    name: 'Plan de Ana',
    plan_mode: 'grams',
    daily_calories: 2000,
    protein_g: 150,
    carbs_g: 200,
    fats_g: 60,
    instructions: null,
    updated_at: '2026-07-17T12:00:00Z',
    ...overrides,
  }
}

function tree(p: Partial<V1PlanRow>, meals: V1MealRow[]): V1PlanTree {
  return { plan: plan(p), meals }
}

function asBundle(result: ReturnType<typeof mapV1PlanToV2Conversion>): ConversionBundle {
  if (!result.ok) throw new Error(`expected bundle, got skip: ${result.reason}`)
  return result
}

// --- Tests ---

describe('mapV1PlanToV2Conversion — mapeo de dia (dow)', () => {
  it('V1 7 (Domingo) -> V2 0 y V1 1 (Lunes) -> V2 1', () => {
    const meals = [
      meal({ id: 'm0', day_of_week: null, items: [item({ id: 'i0', food: FOOD_A })] }),
      meal({ id: 'm7', day_of_week: 7, items: [item({ id: 'i7', food: FOOD_A })] }),
      meal({ id: 'm1', day_of_week: 1, items: [item({ id: 'i1', food: FOOD_A })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    const byKey = new Map(bundle.variantRows.map((v) => [v.variant_key as string, v]))
    expect(byKey.get('dow-1')?.day_of_week).toBe(1)
    expect(byKey.get('dow-0')?.day_of_week).toBe(0)
    // La variante default no lleva dia.
    expect(byKey.get('default')?.day_of_week).toBeNull()
    expect(byKey.get('default')?.is_default).toBe(true)
  })
})

describe('mapV1PlanToV2Conversion — fan-out de comidas NULL', () => {
  it('cada variante por dia contiene las comidas NULL mas las del dia', () => {
    const meals = [
      meal({ id: 'm0', name: 'Base', day_of_week: null, order_index: 0, items: [item({ id: 'i0', food: FOOD_A })] }),
      meal({ id: 'm1', name: 'LunesX', day_of_week: 1, order_index: 1, items: [item({ id: 'i1', food: FOOD_A })] }),
      meal({ id: 'm3', name: 'MiercolesX', day_of_week: 3, order_index: 1, items: [item({ id: 'i3', food: FOOD_A })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))

    // 3 variantes: default + dow-1 + dow-3.
    expect(bundle.variantRows.map((v) => v.variant_key)).toEqual(['default', 'dow-1', 'dow-3'])

    const variantIdByKey = new Map(bundle.variantRows.map((v) => [v.variant_key as string, v.id as string]))
    const slotNamesFor = (key: string) =>
      bundle.slotRows.filter((s) => s.day_variant_id === variantIdByKey.get(key)).map((s) => s.name)

    expect(slotNamesFor('default')).toEqual(['Base'])
    expect(slotNamesFor('dow-1')).toEqual(['Base', 'LunesX'])
    expect(slotNamesFor('dow-3')).toEqual(['Base', 'MiercolesX'])

    // Fidelidad cuenta por FUENTE, sin doble conteo del fan-out.
    expect(bundle.fidelity.mealCount).toBe(3)
    expect(bundle.fidelity.slotCount).toBe(3)
    expect(bundle.fidelity.itemCount).toBe(3)
  })
})

describe('mapV1PlanToV2Conversion — solo default cuando todo es NULL', () => {
  it('produce una unica variante default con todas las comidas', () => {
    const meals = [
      meal({ id: 'm0', name: 'Desayuno', order_index: 0, items: [item({ id: 'i0', food: FOOD_A })] }),
      meal({ id: 'm1', name: 'Almuerzo', order_index: 1, items: [item({ id: 'i1', food: FOOD_A })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.variantRows).toHaveLength(1)
    const v = bundle.variantRows[0]
    expect(v.variant_key).toBe('default')
    expect(v.is_default).toBe(true)
    expect(v.day_of_week).toBeNull()
    expect(v.label).toBe('Todos los dias')
    expect(bundle.slotRows.map((s) => s.name)).toEqual(['Desayuno', 'Almuerzo'])
  })
})

describe('mapV1PlanToV2Conversion — paridad de macros (caso numerico verificado a mano)', () => {
  it('snapshot y totales espejan la aritmetica del servidor', () => {
    // FOOD_A 150 g: factor 1.5 -> cal 150, prot 15, carb 30, fat 7.5
    // FOOD_B 2 un (serving 60): factor 1.2 -> cal 186, prot 15.6, carb 1.3, fat 13.2
    const meals = [
      meal({
        id: 'm0',
        name: 'Almuerzo',
        items: [
          item({ id: 'iA', food: FOOD_A, food_id: FOOD_A.id, quantity: 150, unit: 'g' }),
          item({ id: 'iB', food: FOOD_B, food_id: FOOD_B.id, quantity: 2, unit: 'un' }),
        ],
      }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))

    const rowA = bundle.itemRows.find((r) => r.food_id === FOOD_A.id)!
    expect(rowA.snapshot_calories).toBe(150)
    expect(rowA.snapshot_protein_g).toBe(15)
    expect(rowA.snapshot_carbs_g).toBe(30)
    expect(rowA.snapshot_fats_g).toBe(7.5)
    // FOOD_A no trae fiber_g -> el builder (y por paridad la conversion) escribe 0, no null.
    expect(rowA.snapshot_fiber_g).toBe(0)

    const rowB = bundle.itemRows.find((r) => r.food_id === FOOD_B.id)!
    expect(rowB.snapshot_calories).toBe(186)
    expect(rowB.snapshot_protein_g).toBe(15.6)
    expect(rowB.snapshot_carbs_g).toBe(1.3)
    expect(rowB.snapshot_fats_g).toBe(13.2)

    expect(bundle.fidelity.v1Totals).toEqual({ calories: 336, proteinG: 30.6, carbsG: 31.3, fatsG: 20.7 })
    expect(bundle.fidelity.v2Totals).toEqual(bundle.fidelity.v1Totals)
  })
})

describe('mapV1PlanToV2Conversion — fibra en snapshot', () => {
  it('escala fiber_g del alimento con el mismo factor y redondeo que el builder', () => {
    // FOOD con fiber_g 2, 150 g directos -> factor 1.5 -> fibra 3.
    const foodWithFiber: V1FoodRow = { ...FOOD_A, id: 'food-f', fiber_g: 2 }
    const meals = [
      meal({ id: 'm0', items: [item({ id: 'iF', food: foodWithFiber, food_id: 'food-f', quantity: 150, unit: 'g' })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.itemRows[0].snapshot_fiber_g).toBe(3)
  })

  it('unidad contable escala fiber_g por serving_size (paridad con el builder)', () => {
    // FOOD con fiber_g 1, serving 60, 2 un -> factor 1.2 -> fibra 1.2.
    const foodWithFiber: V1FoodRow = { ...FOOD_B, id: 'food-g', fiber_g: 1 }
    const meals = [
      meal({ id: 'm0', items: [item({ id: 'iG', food: foodWithFiber, food_id: 'food-g', quantity: 2, unit: 'un' })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.itemRows[0].snapshot_fiber_g).toBe(1.2)
  })

  it('alimento sin fiber_g -> snapshot_fiber_g 0 (no null), igual que el builder', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.itemRows[0].snapshot_fiber_g).toBe(0)
  })
})

describe('mapV1PlanToV2Conversion — comida de texto puro', () => {
  it('crea slot con la descripcion como notas y 0 items', () => {
    const meals = [
      meal({ id: 'm0', name: 'Ayuno', description: 'Ayuno intermitente 16h', items: [] }),
      meal({ id: 'm1', name: 'Cena', items: [item({ id: 'i1', food: FOOD_A })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    const ayunoSlot = bundle.slotRows.find((s) => s.name === 'Ayuno')!
    expect(ayunoSlot.instructions).toBe('Ayuno intermitente 16h')
    // No hay items para la comida de texto puro.
    expect(bundle.itemRows.filter((r) => r.meal_slot_id === ayunoSlot.id)).toHaveLength(0)
    expect(bundle.fidelity.textOnlySlots).toBe(1)
    expect(bundle.fidelity.itemCount).toBe(1)
  })
})

describe('mapV1PlanToV2Conversion — swaps a notas', () => {
  it('preserva las alternativas del swap_options en las notas del item', () => {
    const meals = [
      meal({
        id: 'm0',
        items: [
          item({
            id: 'iA',
            food: FOOD_A,
            swap_options: [
              { food_id: 'food-p', name: 'Pavo' },
              { food_id: 'food-t', name: 'Atun' },
            ],
          }),
        ],
      }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.itemRows[0].notes).toBe('Alternativas: Pavo, Atun')
    expect(bundle.fidelity.swapsAsNotes).toBe(1)
  })

  it('no cuenta swaps cuando el array esta vacio', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'iA', food: FOOD_A, swap_options: [] })] })]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.itemRows[0].notes).toBeNull()
    expect(bundle.fidelity.swapsAsNotes).toBe(0)
  })
})

describe('mapV1PlanToV2Conversion — skips tipados', () => {
  it('plan_mode exchanges -> exchanges_manual', () => {
    const result = mapV1PlanToV2Conversion(
      tree({ plan_mode: 'exchanges' }, [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]),
      baseOpts(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('exchanges_manual')
  })

  it('sin comidas -> no_meals', () => {
    const result = mapV1PlanToV2Conversion(tree({}, []), baseOpts())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no_meals')
  })

  it('item con food faltante -> missing_food', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'iX', food: null, food_id: 'ghost' })] })]
    const result = mapV1PlanToV2Conversion(tree({}, meals), baseOpts())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_food')
      expect(result.detail).toContain('ghost')
    }
  })
})

describe('mapV1PlanToV2Conversion — idempotency key', () => {
  it('deriva la key de v1_plan_id + epoch de updated_at, estable entre corridas', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const epoch = Math.floor(Date.parse('2026-07-17T12:00:00Z') / 1000)
    const b1 = asBundle(mapV1PlanToV2Conversion(tree({ id: 'plan-9' }, meals), baseOpts()))
    const b2 = asBundle(mapV1PlanToV2Conversion(tree({ id: 'plan-9' }, meals), baseOpts()))
    expect(b1.idempotencyKey).toBe(`v1conv:plan-9:${epoch}`)
    expect(b2.idempotencyKey).toBe(b1.idempotencyKey)
  })
})

describe('mapV1PlanToV2Conversion — slot_code unico por variante', () => {
  it('desambigua comidas con el mismo nombre dentro de una variante', () => {
    const meals = [
      meal({ id: 'm0', name: 'Snack', order_index: 0, items: [item({ id: 'i0', food: FOOD_A })] }),
      meal({ id: 'm1', name: 'Snack', order_index: 1, items: [item({ id: 'i1', food: FOOD_A })] }),
    ]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    const codesByVariant = new Map<string, string[]>()
    for (const s of bundle.slotRows) {
      const key = s.day_variant_id as string
      const list = codesByVariant.get(key) ?? []
      list.push(s.slot_code as string)
      codesByVariant.set(key, list)
    }
    for (const codes of codesByVariant.values()) {
      expect(new Set(codes).size).toBe(codes.length)
    }
    expect(bundle.slotRows.map((s) => s.slot_code)).toEqual(['snack-1', 'snack-2'])
  })
})

describe('mapV1PlanToV2Conversion — plan/version wiring', () => {
  it('planRow nuevo cuando no hay existingV2PlanId; version draft sin campos de publish', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const bundle = asBundle(mapV1PlanToV2Conversion(tree({}, meals), baseOpts()))
    expect(bundle.planRow).not.toBeNull()
    expect(bundle.planRow!.strategy).toBe('structured')
    expect(bundle.planRow!.lifecycle_status).toBe('active')
    expect(bundle.versionRow.plan_id).toBe(bundle.planRow!.id)
    expect(bundle.versionRow.status).toBe('draft')
    expect(bundle.versionRow.strategy).toBe('structured')
    // Sin campos de publish: los pone el RPC.
    expect('effective_from' in bundle.versionRow).toBe(false)
    expect('published_at' in bundle.versionRow).toBe(false)
    expect('publish_idempotency_key' in bundle.versionRow).toBe(false)
    // FK cableadas.
    for (const v of bundle.variantRows) expect(v.version_id).toBe(bundle.versionRow.id)
    const variantIds = new Set(bundle.variantRows.map((v) => v.id))
    for (const s of bundle.slotRows) {
      expect(s.version_id).toBe(bundle.versionRow.id)
      expect(variantIds.has(s.day_variant_id)).toBe(true)
    }
    const slotIds = new Set(bundle.slotRows.map((s) => s.id))
    for (const it of bundle.itemRows) {
      expect(it.version_id).toBe(bundle.versionRow.id)
      expect(slotIds.has(it.meal_slot_id)).toBe(true)
    }
  })

  it('re-sync: existingV2PlanId -> planRow null y version apunta al plan existente', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const bundle = asBundle(
      mapV1PlanToV2Conversion(tree({}, meals), baseOpts({ existingV2PlanId: 'v2-plan-77', versionNumber: 3 })),
    )
    expect(bundle.planRow).toBeNull()
    expect(bundle.versionRow.plan_id).toBe('v2-plan-77')
    expect(bundle.versionRow.version_number).toBe(3)
  })
})

describe('mapV1PlanToV2Conversion — targets y no_acarreado', () => {
  it('copia targets verbatim (NULL preservado) e hidratacion a water_ml', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const bundle = asBundle(
      mapV1PlanToV2Conversion(
        tree({ daily_calories: 1800, protein_g: null, carbs_g: 190, fats_g: 55, hydration_target_ml: 2500 }, meals),
        baseOpts(),
      ),
    )
    const v = bundle.variantRows[0]
    expect(v.target_calories).toBe(1800)
    expect(v.target_protein_g).toBeNull()
    expect(v.target_carbs_g).toBe(190)
    expect(v.target_fats_g).toBe(55)
    expect(v.target_water_ml).toBe(2500)
  })

  it('reporta en no_acarreado los targets secundarios sin columna V2 equivalente', () => {
    const meals = [meal({ id: 'm0', items: [item({ id: 'i0', food: FOOD_A })] })]
    const bundle = asBundle(
      mapV1PlanToV2Conversion(
        tree(
          {
            steps_target: 10000,
            sleep_target_hours: 8,
            fasting_target_hours: 16,
            supplement_guidance: ['Creatina 5g', 'Omega 3'],
            protocol_notes: 'Refeed los domingos',
            instructions: 'Toma agua antes de cada comida',
          },
          meals,
        ),
        baseOpts(),
      ),
    )
    expect(bundle.fidelity.noAcarreado).toEqual([
      'steps_target',
      'sleep_target_hours',
      'fasting_target_hours',
      'supplement_guidance',
    ])
    // protocol_notes SI se acarrea (grandfathering); instructions -> visible_notes.
    expect(bundle.versionRow.protocol_notes).toBe('Refeed los domingos')
    expect(bundle.versionRow.visible_notes).toBe('Toma agua antes de cada comida')
  })
})
