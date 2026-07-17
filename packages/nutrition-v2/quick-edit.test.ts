import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from './contracts'
import type { NutritionPlanReadModel } from './read-models'
import { QUICK_EDIT_ERROR_CODES, countDraftChanges, readModelToDraft } from './quick-edit'

const CLIENT = '33333333-3333-4333-8333-333333333333'
const PLAN = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'
const VARIANT = '66666666-6666-4666-8666-666666666666'
const SLOT = '77777777-7777-4777-8777-777777777777'
const ITEM_FOOD = '88888888-8888-4888-8888-888888888888'
const ITEM_CUSTOM = '99999999-9999-4999-8999-999999999999'
const FOOD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function fullTargets(calories: number | null) {
  return { calories, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null }
}

function planReadModel(overrides: Partial<NutritionPlanReadModel> = {}): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-17T12:00:00.000Z',
    asOfDate: '2026-07-17',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN,
      name: 'Plan de definicion',
      strategy: 'structured',
      versionId: VERSION,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-07-10',
      effectiveTo: null,
    },
    visibleNotes: 'Toma agua',
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [
      {
        id: VARIANT,
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: fullTargets(2000),
        mealSlots: [
          {
            id: SLOT,
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: { calories: 500 },
            prescriptionItems: [
              {
                id: ITEM_FOOD,
                foodId: FOOD,
                recipeId: null,
                name: 'Avena',
                brand: 'Quaker',
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10, carbsG: 50, fatsG: 5, fiberG: 8 },
              },
              {
                id: ITEM_CUSTOM,
                foodId: null,
                recipeId: null,
                name: 'Cafe negro',
                brand: null,
                quantity: 1,
                unit: 'un',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: true,
                substitutionGroupId: null,
                notes: 'sin azucar',
                macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'tok-1',
    ...overrides,
  } as NutritionPlanReadModel
}

describe('readModelToDraft', () => {
  it('devuelve null cuando el alumno no tiene plan vigente', () => {
    expect(readModelToDraft(planReadModel({ plan: null }), CLIENT)).toBeNull()
  })

  it('hidrata un draft valido contra el contrato NutritionPlanDraftSchema', () => {
    const draft = readModelToDraft(planReadModel(), CLIENT)
    expect(draft).not.toBeNull()
    // El draft hidratado debe re-validar limpio (mismo esquema que el server re-parsea).
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
  })

  it('mapea cabecera y notas; privateNotes queda null (carry-over server-side)', () => {
    const draft = readModelToDraft(planReadModel(), CLIENT)!
    expect(draft.planId).toBe(PLAN)
    expect(draft.clientId).toBe(CLIENT)
    expect(draft.name).toBe('Plan de definicion')
    expect(draft.strategy).toBe('structured')
    expect(draft.timezone).toBe('America/Santiago')
    expect(draft.visibleNotes).toBe('Toma agua')
    expect(draft.protocolNotes).toBeNull()
    expect(draft.privateNotes).toBeNull()
    // El server calcula el effectiveFrom real; el draft lo deja null.
    expect(draft.effectiveFrom).toBeNull()
    expect(draft.permissions.canRegisterFreely).toBe(true)
  })

  it('mapea variante (isDefault -> default) y franjas con orderIndex por posicion', () => {
    const draft = readModelToDraft(planReadModel(), CLIENT)!
    expect(draft.dayVariants).toHaveLength(1)
    const variant = draft.dayVariants[0]
    expect(variant.key).toBe('default')
    expect(variant.default).toBe(true)
    expect(variant.orderIndex).toBe(0)
    expect(variant.targets.calories).toBe(2000)
    const slot = variant.mealSlots[0]
    expect(slot.code).toBe('slot-1')
    expect(slot.startTime).toBe('08:00')
    expect(slot.orderIndex).toBe(0)
  })

  it('item de catalogo -> customName null (server re-deriva); item libre -> conserva el nombre', () => {
    const draft = readModelToDraft(planReadModel(), CLIENT)!
    const items = draft.dayVariants[0].mealSlots[0].items
    const foodItem = items[0]
    expect(foodItem.foodId).toBe(FOOD)
    expect(foodItem.customName).toBeNull()
    expect(foodItem.quantity).toBe(80)
    const customItem = items[1]
    expect(customItem.foodId).toBeNull()
    expect(customItem.customName).toBe('Cafe negro')
    expect(customItem.notes).toBe('sin azucar')
    expect(customItem.optional).toBe(true)
  })
})

describe('countDraftChanges', () => {
  const baseline = () => readModelToDraft(planReadModel(), CLIENT)!

  it('drafts identicos => 0 cambios', () => {
    expect(countDraftChanges(baseline(), baseline())).toBe(0)
  })

  it('cambiar una cantidad => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].items[0].quantity = 120
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('swap de alimento (mismo id, otro foodId) => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].items[0].foodId = ITEM_CUSTOM
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('agregar un item nuevo (sin id) => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].items.push({
      foodId: FOOD,
      recipeId: null,
      customName: null,
      quantity: 50,
      unit: 'g',
      minimumQuantity: null,
      maximumQuantity: null,
      optional: false,
      substitutionGroupId: null,
      notes: null,
      orderIndex: 2,
    })
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('eliminar un item => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].items.splice(1, 1)
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('cambiar las metas de la variante => 1', () => {
    const current = baseline()
    current.dayVariants[0].targets.calories = 2200
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('cambiar el nombre/hora de una franja => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].startTime = '09:00'
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('agregar una franja nueva (sin id) => 1', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots.push({
      code: 'slot-2',
      name: 'Almuerzo',
      startTime: '13:00',
      endTime: null,
      mode: 'anchor',
      required: false,
      targets: {},
      instructions: null,
      orderIndex: 1,
      items: [],
    })
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })

  it('cambios acumulados suman (cantidad + meta) => 2', () => {
    const current = baseline()
    current.dayVariants[0].mealSlots[0].items[0].quantity = 90
    current.dayVariants[0].targets.calories = 1900
    expect(countDraftChanges(baseline(), current)).toBe(2)
  })

  it('cambiar el nombre del plan => 1', () => {
    const current = baseline()
    current.name = 'Plan renovado'
    expect(countDraftChanges(baseline(), current)).toBe(1)
  })
})

describe('QUICK_EDIT_ERROR_CODES', () => {
  it('expone el set canonico de codigos tipados', () => {
    expect(QUICK_EDIT_ERROR_CODES).toContain('STALE_BASE')
    expect(QUICK_EDIT_ERROR_CODES).toContain('UPGRADE_REQUIRED')
    expect(QUICK_EDIT_ERROR_CODES).toContain('EFFECTIVE_DATE')
  })
})
