import { describe, it, expect } from 'vitest'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import { calculateFoodItemMacros } from '@eva/nutrition-engine'
import {
  assembleDraft,
  assembleAndValidateDraft,
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  builderReducer,
  computeItemMacros,
  createEmptyBuilderState,
  validateStep,
  type BuilderFood,
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
        items: [
          { key: 'i1', food: FOOD, customName: null, quantity: '200', unit: 'g', optional: false, notes: null },
        ],
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

  it('propaga planId cuando es una nueva version', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.planId).toBe(PLAN_ID)
  })

  it('assembleAndValidateDraft lanza con item de cantidad invalida', () => {
    const bad = structuredState()
    bad.slots[0].items[0].quantity = '0'
    expect(() => assembleAndValidateDraft(bad, { clientId: CLIENT_ID })).toThrow()
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
