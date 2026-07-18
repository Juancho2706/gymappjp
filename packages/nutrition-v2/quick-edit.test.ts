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
const TARGET_C = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TARGET_V = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_C = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const GROUP_V = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const GROUP_P = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

type ReadSlot = NutritionPlanReadModel['dayVariants'][number]['mealSlots'][number]
type ReadExchangeTarget = NonNullable<ReadSlot['exchangeTargets']>[number]

function readTarget(overrides: Partial<ReadExchangeTarget> = {}): ReadExchangeTarget {
  return {
    id: TARGET_C,
    exchangeGroupId: GROUP_C,
    groupCode: 'C',
    groupName: 'Cereales',
    color: '#F59E0B',
    portions: 2,
    notes: null,
    orderIndex: 0,
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0.5 },
    composedOf: null,
    macrosConfirmed: true,
    ...overrides,
  }
}

/** Read model con targets de porciones en la primera franja (capa opcional presente). */
function planReadModelWithPortions(targets: ReadExchangeTarget[]): NutritionPlanReadModel {
  const model = planReadModel()
  model.dayVariants[0].mealSlots[0] = { ...model.dayVariants[0].mealSlots[0], exchangeTargets: targets }
  return model
}

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

describe('readModelToDraft — porciones (capa opcional)', () => {
  it('plan sin porciones: el draft NO incluye la clave exchangeTargets (identico a antes)', () => {
    const draft = readModelToDraft(planReadModel(), CLIENT)!
    expect(draft.dayVariants[0].mealSlots[0]).not.toHaveProperty('exchangeTargets')
  })

  it('roundtrip: los targets del read model vuelven al draft con los campos del contrato', () => {
    const model = planReadModelWithPortions([
      readTarget(),
      readTarget({
        id: TARGET_V,
        exchangeGroupId: GROUP_V,
        groupCode: 'V',
        groupName: 'Verduras',
        portions: 1.5,
        notes: 'crudas de preferencia',
        orderIndex: 1,
      }),
    ])
    const draft = readModelToDraft(model, CLIENT)!
    const targets = draft.dayVariants[0].mealSlots[0].exchangeTargets
    expect(targets).toHaveLength(2)
    expect(targets![0]).toEqual({
      id: TARGET_C,
      exchangeGroupId: GROUP_C,
      portions: 2,
      notes: null,
      orderIndex: 0,
    })
    expect(targets![1]).toEqual({
      id: TARGET_V,
      exchangeGroupId: GROUP_V,
      portions: 1.5,
      notes: 'crudas de preferencia',
      orderIndex: 1,
    })
    // El draft hidratado con porciones re-valida limpio contra el contrato del server.
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
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

describe('countDraftChanges — porciones', () => {
  const portionsBaseline = () =>
    readModelToDraft(
      planReadModelWithPortions([
        readTarget(),
        readTarget({
          id: TARGET_V,
          exchangeGroupId: GROUP_V,
          groupCode: 'V',
          groupName: 'Verduras',
          portions: 1.5,
          orderIndex: 1,
        }),
      ]),
      CLIENT,
    )!

  it('plan con porciones sin editar => 0 cambios', () => {
    expect(countDraftChanges(portionsBaseline(), portionsBaseline())).toBe(0)
  })

  it('cambiar porciones 2 -> 1,5 => 1', () => {
    const current = portionsBaseline()
    current.dayVariants[0].mealSlots[0].exchangeTargets![0].portions = 1.5
    expect(countDraftChanges(portionsBaseline(), current)).toBe(1)
  })

  it('cambiar las notas de un target => 1', () => {
    const current = portionsBaseline()
    current.dayVariants[0].mealSlots[0].exchangeTargets![0].notes = 'integrales'
    expect(countDraftChanges(portionsBaseline(), current)).toBe(1)
  })

  it('alta de un grupo + baja de otro => 2', () => {
    const current = portionsBaseline()
    const targets = current.dayVariants[0].mealSlots[0].exchangeTargets!
    // Baja: sale Verduras. Alta: entra Proteinas (target nuevo de la UI, sin id).
    targets.splice(1, 1)
    targets.push({ exchangeGroupId: GROUP_P, portions: 1, notes: null, orderIndex: 1 })
    expect(countDraftChanges(portionsBaseline(), current)).toBe(2)
  })

  it('agregar porciones a una franja que no tenia => 1 por grupo agregado', () => {
    const current = baselinePlain()
    current.dayVariants[0].mealSlots[0].exchangeTargets = [
      { exchangeGroupId: GROUP_C, portions: 2, notes: null, orderIndex: 0 },
    ]
    expect(countDraftChanges(baselinePlain(), current)).toBe(1)
  })

  it('quitar TODOS los targets => 1 cambio por target quitado', () => {
    const current = portionsBaseline()
    current.dayVariants[0].mealSlots[0].exchangeTargets = []
    expect(countDraftChanges(portionsBaseline(), current)).toBe(2)
  })

  function baselinePlain() {
    return readModelToDraft(planReadModel(), CLIENT)!
  }
})

describe('QUICK_EDIT_ERROR_CODES', () => {
  it('expone el set canonico de codigos tipados', () => {
    expect(QUICK_EDIT_ERROR_CODES).toContain('STALE_BASE')
    expect(QUICK_EDIT_ERROR_CODES).toContain('UPGRADE_REQUIRED')
    expect(QUICK_EDIT_ERROR_CODES).toContain('EFFECTIVE_DATE')
  })
})
