import { describe, it, expect } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import { calculateFoodItemMacros } from '@eva/nutrition-engine'
import {
  BUILDER_STEP_COUNT,
  CoachFoodInputSchema,
  MAX_ITEM_SUBSTITUTIONS,
  assembleDraft,
  assembleAndValidateDraft,
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  builderReducer,
  computeCustomItemMacros,
  computeItemMacros,
  createEmptyBuilderState,
  createEmptyItem,
  customMacrosOf,
  itemMacros,
  macroEnergyMismatch,
  validateStep,
  type BuilderFood,
  type BuilderItem,
  type BuilderState,
  type DraftPrescriptionItem,
} from './draft-builder'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'

const FOOD: BuilderFood = {
  id: FOOD_ID,
  name: 'Pollo',
  brand: null,
  calories: 100,
  proteinG: 10,
  carbsG: 20,
  fatsG: 5,
  fiberG: 2,
  servingSize: 50,
  servingUnit: 'g',
  category: null,
  media: null,
}

function foodItem(overrides: Partial<BuilderItem> = {}): BuilderItem {
  return {
    ...createEmptyItem('i1'),
    food: FOOD,
    customName: null,
    quantity: '200',
    unit: 'g',
    ...overrides,
  }
}

function customItem(overrides: Partial<BuilderItem> = {}): BuilderItem {
  return {
    ...createEmptyItem('c1'),
    food: null,
    customName: 'Colacion casera',
    quantity: '200',
    unit: 'g',
    customCalories: '100',
    customProteinG: '10',
    customCarbsG: '20',
    customFatsG: '5',
    ...overrides,
  }
}

function flexibleState(): BuilderState {
  return {
    step: 3,
    strategy: 'flexible',
    planName: 'Plan de corte',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' },
    permissions: { canRegisterFreely: true, canAdjustPrescribedQuantity: true, canSubstitute: true },
    slots: [],
  }
}

function structuredState(): BuilderState {
  return {
    step: 3,
    strategy: 'structured',
    planName: 'Plan estructurado',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '150', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    slots: [
      {
        key: 'slot-a',
        name: 'Desayuno',
        startTime: '08:00',
        items: [foodItem()],
      },
    ],
  }
}

describe('computeItemMacros', () => {
  it('reutiliza el motor compartido (paridad con el alumno) para gramos', () => {
    const engine = calculateFoodItemMacros({
      quantity: 200,
      unit: 'g',
      foods: { name: FOOD.name, calories: 100, protein_g: 10, carbs_g: 20, fats_g: 5, serving_size: 50, serving_unit: 'g' },
    })
    const macros = computeItemMacros(FOOD, 200, 'g')
    expect(macros.calories).toBe(engine.calories)
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.fiberG).toBe(4)
  })

  it('usa serving_size para unidades count', () => {
    const macros = computeItemMacros(FOOD, 2, 'un')
    expect(macros.calories).toBe(100)
    expect(macros.proteinG).toBe(10)
  })

  it('devuelve cero para cantidades no positivas', () => {
    expect(computeItemMacros(FOOD, 0, 'g').calories).toBe(0)
  })
})

describe('alimento libre con macros', () => {
  it('computeCustomItemMacros escala las macros por 100 por la cantidad', () => {
    const macros = computeCustomItemMacros(customItem(), 200)
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.carbsG).toBe(40)
    expect(macros.fatsG).toBe(10)
  })

  it('itemMacros refleja las macros del item libre (preview del dia)', () => {
    const macros = itemMacros(customItem({ quantity: '150' }))
    expect(macros.calories).toBe(150)
    expect(macros.proteinG).toBe(15)
  })

  it('item libre sin macros aporta cero (no rompe el preview)', () => {
    const macros = itemMacros(customItem({ customCalories: '', customProteinG: '', customCarbsG: '', customFatsG: '' }))
    expect(macros.calories).toBe(0)
    expect(macros.proteinG).toBe(0)
  })

  it('customMacrosOf coacciona vacios/negativos a cero', () => {
    const m = customMacrosOf(customItem({ customCalories: '', customProteinG: '-5' }))
    expect(m.calories).toBe(0)
    expect(m.proteinG).toBe(0)
    expect(m.carbsG).toBe(20)
  })
})

describe('CoachFoodInputSchema', () => {
  const valid = {
    clientId: CLIENT_ID,
    name: 'Colacion casera',
    unit: 'g' as const,
    calories: 180,
    proteinG: 10,
    carbsG: 20,
    fatsG: 5,
  }

  it('acepta macros no-negativas y aplica default de brand', () => {
    const parsed = CoachFoodInputSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.brand).toBeNull()
  })

  it('rechaza macros negativas', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, proteinG: -1 }).success).toBe(false)
    expect(CoachFoodInputSchema.safeParse({ ...valid, calories: -10 }).success).toBe(false)
  })

  it('rechaza nombre vacio', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })

  it('rechaza unidad fuera de g/ml', () => {
    expect(CoachFoodInputSchema.safeParse({ ...valid, unit: 'un' }).success).toBe(false)
  })
})

describe('macroEnergyMismatch', () => {
  it('sin warning cuando las kcal cuadran con Atwater', () => {
    expect(macroEnergyMismatch({ calories: 165, proteinG: 10, carbsG: 20, fatsG: 5 })).toBe(false)
  })

  it('warning cuando las kcal se alejan mas de 40%', () => {
    expect(macroEnergyMismatch({ calories: 400, proteinG: 10, carbsG: 20, fatsG: 5 })).toBe(true)
  })

  it('todo en cero no dispara warning', () => {
    expect(macroEnergyMismatch({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 })).toBe(false)
  })
})

describe('assembleDraft', () => {
  it('flexible: una variante por defecto, sin franjas, valida contra el contrato', () => {
    const draft = assembleDraft(flexibleState(), { clientId: CLIENT_ID })
    expect(draft.strategy).toBe('flexible')
    expect(draft.dayVariants).toHaveLength(1)
    expect(draft.dayVariants[0].default).toBe(true)
    expect(draft.dayVariants[0].mealSlots).toHaveLength(0)
    expect(draft.dayVariants[0].targets.calories).toBe(2000)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('structured: franjas + items prescritos, valida contra el contrato', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots).toHaveLength(1)
    const slot = draft.dayVariants[0].mealSlots[0]
    expect(slot.code).toBe('slot-1')
    expect(slot.name).toBe('Desayuno')
    expect(slot.startTime).toBe('08:00')
    expect(slot.items[0].foodId).toBe(FOOD_ID)
    expect(slot.items[0].quantity).toBe(200)
    expect(slot.items[0].unit).toBe('g')
  })

  it('item libre (sin food) va al payload como customName + cantidad', () => {
    const state = structuredState()
    state.slots[0].items = [customItem()]
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    const item = draft.dayVariants[0].mealSlots[0].items[0]
    expect(item.foodId).toBeNull()
    expect(item.customName).toBe('Colacion casera')
    expect(item.quantity).toBe(200)
    expect(item.unit).toBe('g')
  })

  it('propaga planId cuando es una nueva version', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.planId).toBe(PLAN_ID)
  })

  it('assembleAndValidateDraft lanza con item de cantidad invalida', () => {
    const bad = structuredState()
    bad.slots[0].items[0].quantity = '0'
    expect(() => assembleAndValidateDraft(bad, { clientId: CLIENT_ID })).toThrow()
  })

  // F-02: los reemplazos autorizados del builder (solo catalogo) viajan al draft como
  // foodId + quantity/unit null ("misma porcion"), con orderIndex por posicion. El server
  // congela el snapshot al persistir. Un item sin reemplazos queda byte-identico a hoy.
  it('mapea los reemplazos autorizados del item al draft (foodId + quantity/unit null + orderIndex)', () => {
    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo molido' }
    const subB: BuilderFood = { ...FOOD, id: '55555555-5555-4555-8555-555555555555', name: 'Merluza' }
    const state = structuredState()
    state.slots[0].items = [
      foodItem({ substitutions: [{ key: 's1', food: subA }, { key: 's2', food: subB }] }),
    ]
    const draft = assembleAndValidateDraft(state, { clientId: CLIENT_ID })
    const item = draft.dayVariants[0].mealSlots[0].items[0]
    expect(item.substitutions).toHaveLength(2)
    expect(item.substitutions?.[0]).toMatchObject({
      foodId: subA.id,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    })
    expect(item.substitutions?.[1]).toMatchObject({ foodId: subB.id, orderIndex: 1 })
  })

  it('item sin reemplazos NO agrega la clave substitutions (capa opcional, byte-identico)', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    expect(draft.dayVariants[0].mealSlots[0].items[0]).not.toHaveProperty('substitutions')
  })
})

describe('validateStep', () => {
  it('paso 0 exige estrategia', () => {
    const state = createEmptyBuilderState('2026-07-20')
    expect(validateStep(state, 0).ok).toBe(false)
    expect(validateStep({ ...state, strategy: 'flexible' }, 0).ok).toBe(true)
  })

  it('paso 1 exige nombre y al menos una meta', () => {
    const state = { ...createEmptyBuilderState('2026-07-20'), strategy: 'flexible' as const }
    const r = validateStep(state, 1)
    expect(r.ok).toBe(false)
    expect(r.errors.planName).toBeTruthy()
    const withName = { ...state, planName: 'X', targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' } }
    expect(validateStep(withName, 1).ok).toBe(true)
  })

  it('paso 1 rechaza kcal no numerico', () => {
    const state = {
      ...createEmptyBuilderState('2026-07-20'),
      strategy: 'flexible' as const,
      planName: 'X',
      targets: { calories: 'abc', proteinG: '', carbsG: '', fatsG: '' },
    }
    expect(validateStep(state, 1).errors.calories).toBeTruthy()
  })

  it('paso 2 (structured) rechaza franja sin nombre y acepta valida', () => {
    const bad = structuredState()
    bad.slots[0].name = ''
    expect(validateStep(bad, 2).ok).toBe(false)
    expect(validateStep(structuredState(), 2).ok).toBe(true)
  })

  it('paso 2 acepta un item libre con nombre y cantidad', () => {
    const state = structuredState()
    state.slots[0].items = [customItem()]
    expect(validateStep(state, 2).ok).toBe(true)
  })
})

describe('builderReducer', () => {
  it('SET_STRATEGY structured siembra una primera franja', () => {
    const state = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'structured', firstSlotKey: 'k1' })
    expect(next.strategy).toBe('structured')
    expect(next.slots).toHaveLength(1)
    expect(next.permissions.canRegisterFreely).toBe(false)
  })

  it('SET_STRATEGY flexible no crea franjas', () => {
    const state = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(state, { type: 'SET_STRATEGY', strategy: 'flexible', firstSlotKey: 'k1' })
    expect(next.slots).toHaveLength(0)
    expect(next.permissions.canRegisterFreely).toBe(true)
  })

  it('ADD_ITEM con alimento precarga cantidad y unidad', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', slotKey, key: 'itemK', food: FOOD })
    expect(state.slots[0].items).toHaveLength(1)
    expect(state.slots[0].items[0].quantity).toBe('50')
    expect(state.slots[0].items[0].unit).toBe('g')
  })

  it('UPDATE_ITEM setea las macros custom del alimento libre', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', slotKey, key: 'freeK', food: null })
    state = builderReducer(state, {
      type: 'UPDATE_ITEM',
      slotKey,
      itemKey: 'freeK',
      patch: { customName: 'Avena', quantity: '100', customCalories: '380', customProteinG: '13', customCarbsG: '67', customFatsG: '7' },
    })
    const item = state.slots[0].items[0]
    expect(item.customName).toBe('Avena')
    expect(itemMacros(item).calories).toBe(380)
  })

  // F-02: reemplazos autorizados por item (append / dedupe / tope / remove).
  it('ADD_ITEM_SUBSTITUTION agrega, deduplica por foodId y respeta el tope', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', slotKey, key: 'itemK', food: FOOD })

    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', key: 'sa', food: subA })
    expect(state.slots[0].items[0].substitutions).toHaveLength(1)

    // Mismo foodId => no duplica.
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', key: 'sa2', food: subA })
    expect(state.slots[0].items[0].substitutions).toHaveLength(1)

    // No permite ofrecer el propio alimento prescrito (FOOD) como reemplazo.
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', key: 'sSelf', food: FOOD })
    expect(state.slots[0].items[0].substitutions).toHaveLength(1)

    // Llena hasta el tope y confirma que no lo supera.
    for (let i = 0; i < MAX_ITEM_SUBSTITUTIONS + 3; i += 1) {
      const f: BuilderFood = { ...FOOD, id: `f-${i}-8888-4888-8888-888888888888`, name: `Alt ${i}` }
      state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', key: `k${i}`, food: f })
    }
    expect(state.slots[0].items[0].substitutions).toHaveLength(MAX_ITEM_SUBSTITUTIONS)
  })

  it('REMOVE_ITEM_SUBSTITUTION quita por key', () => {
    let state = builderReducer(createEmptyBuilderState('2026-07-20'), {
      type: 'SET_STRATEGY',
      strategy: 'structured',
      firstSlotKey: 'slotK',
    })
    const slotKey = state.slots[0].key
    state = builderReducer(state, { type: 'ADD_ITEM', slotKey, key: 'itemK', food: FOOD })
    const subA: BuilderFood = { ...FOOD, id: '44444444-4444-4444-8444-444444444444', name: 'Pavo' }
    state = builderReducer(state, { type: 'ADD_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', key: 'sa', food: subA })
    state = builderReducer(state, { type: 'REMOVE_ITEM_SUBSTITUTION', slotKey, itemKey: 'itemK', subKey: 'sa' })
    expect(state.slots[0].items[0].substitutions).toHaveLength(0)
  })
})

// Respaldo local de borradores (W3b): RESTORE reemplaza el arbol completo desde un
// borrador persistido, con clamp defensivo del step y rechazo de payloads corruptos.
describe('builderReducer — RESTORE', () => {
  it('reemplaza el estado completo por el payload restaurado', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const restored = structuredState()
    const next = builderReducer(current, { type: 'RESTORE', state: restored })
    expect(next).toEqual(restored)
    // No conserva nada del estado previo (era vacio: strategy null, sin nombre).
    expect(next.strategy).toBe('structured')
    expect(next.planName).toBe('Plan estructurado')
    expect(next.slots).toHaveLength(1)
  })

  it('clampa un step por encima del rango a BUILDER_STEP_COUNT - 1', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: 99 } })
    expect(next.step).toBe(BUILDER_STEP_COUNT - 1)
  })

  it('clampa un step negativo a 0', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: -5 } })
    expect(next.step).toBe(0)
  })

  it('un step no finito cae a 0', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: { ...structuredState(), step: Number.NaN } })
    expect(next.step).toBe(0)
  })

  it('ignora un payload corrupto (slots no es array) y conserva el estado actual por referencia', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const corrupt = { ...structuredState(), slots: null } as unknown as BuilderState
    const next = builderReducer(current, { type: 'RESTORE', state: corrupt })
    expect(next).toBe(current)
  })

  it('ignora un payload null y conserva el estado actual', () => {
    const current = createEmptyBuilderState('2026-07-20')
    const next = builderReducer(current, { type: 'RESTORE', state: null as unknown as BuilderState })
    expect(next).toBe(current)
  })
})

describe('insert row builders (args del servidor)', () => {
  const item: DraftPrescriptionItem = {
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

  it('buildItemInsertRow re-deriva macros de snapshot desde el alimento', () => {
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 0, item, food: FOOD })
    expect(row.version_id).toBe('v1')
    expect(row.meal_slot_id).toBe('s1')
    expect(row.food_id).toBe(FOOD_ID)
    expect(row.snapshot_name).toBe('Pollo')
    expect(row.snapshot_calories).toBe(200)
    expect(row.snapshot_protein_g).toBe(20)
    expect(row.snapshot_fiber_g).toBe(4)
  })

  it('buildItemInsertRow para item custom deja macros en null', () => {
    const custom: DraftPrescriptionItem = { ...item, foodId: null, customName: 'Colacion libre' }
    const row = buildItemInsertRow({ versionId: 'v1', mealSlotId: 's1', orderIndex: 1, item: custom, food: null })
    expect(row.food_id).toBeNull()
    expect(row.snapshot_name).toBe('Colacion libre')
    expect(row.snapshot_calories).toBeNull()
  })

  it('buildVariantInsertRow y buildSlotInsertRow mapean columnas de BD', () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const variantRow = buildVariantInsertRow('v1', draft.dayVariants[0])
    expect(variantRow.version_id).toBe('v1')
    expect(variantRow.is_default).toBe(true)
    expect(variantRow.target_calories).toBe(2000)
    const slotRow = buildSlotInsertRow('v1', 'var1', draft.dayVariants[0].mealSlots[0])
    expect(slotRow.day_variant_id).toBe('var1')
    expect(slotRow.slot_code).toBe('slot-1')
    expect(slotRow.name).toBe('Desayuno')
  })
})
