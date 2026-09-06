import { describe, expect, it } from 'vitest'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { assembleDraft, type BuilderFood } from './draft-builder'
import { attachPortionsAndValidate, portionsKey, variantPortionKeys } from '../_components/portions-state'
import { collectPlanFoodIds, rehydrateBuilderState } from './rehydrate'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const FOOD_ID = '44444444-4444-4444-8444-444444444444'
const SUB_FOOD_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_ID = 'a0000000-0000-4000-8000-000000000001'

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
  householdGrams: null,
  householdLabel: null,
}

const SUB_FOOD: BuilderFood = { ...FOOD, id: SUB_FOOD_ID, name: 'Pavo' }

let idSeed = 0
function uuid(): string {
  idSeed += 1
  const hex = idSeed.toString(16).padStart(12, '0')
  return `66666666-6666-4666-8666-${hex}`
}

type ReadVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadSlot = ReadVariant['mealSlots'][number]
type ReadItem = ReadSlot['prescriptionItems'][number]

function item(over: Partial<ReadItem> = {}): ReadItem {
  return {
    id: uuid(),
    foodId: FOOD_ID,
    recipeId: null,
    name: 'Pollo',
    brand: null,
    quantity: 200,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    macros: { calories: 200, proteinG: 20, carbsG: 40, fatsG: 10, fiberG: 4 },
    media: null,
    category: null,
    ...over,
  }
}

function slot(over: Partial<ReadSlot> = {}): ReadSlot {
  return {
    id: uuid(),
    code: 'slot-1',
    name: 'Almuerzo',
    startTime: '13:00:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    prescriptionItems: [item()],
    ...over,
  }
}

function variant(over: Partial<ReadVariant> = {}): ReadVariant {
  return {
    id: uuid(),
    key: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: null, sodiumMg: null, waterMl: null },
    mealSlots: [slot()],
    ...over,
  }
}

function planModel(dayVariants: ReadVariant[]): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-28T12:00:00.000Z',
    asOfDate: '2026-07-28',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de definicion',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    },
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: true,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants,
    syncToken: 'tok',
  } as unknown as NutritionPlanReadModel
}

function rehydrate(model: NutritionPlanReadModel, subs: NutritionItemSubstitutionRead[] = []) {
  const substitutionsByItemId: Record<string, NutritionItemSubstitutionRead[]> = {}
  for (const sub of subs) {
    substitutionsByItemId[sub.prescriptionItemId] = [...(substitutionsByItemId[sub.prescriptionItemId] ?? []), sub]
  }
  return rehydrateBuilderState({
    planModel: model,
    foods: { [FOOD_ID]: FOOD, [SUB_FOOD_ID]: SUB_FOOD },
    substitutionsByItemId,
    effectiveFrom: '2026-07-28',
    portionKeyOf: portionsKey,
  })
}

describe('rehydrateBuilderState — plan vigente -> estado del wizard', () => {
  it('sin plan vigente devuelve null (wizard en blanco, como siempre)', () => {
    const empty = { ...planModel([]), plan: null } as unknown as NutritionPlanReadModel
    expect(rehydrate(empty)).toBeNull()
  })

  it('rehidrata cabecera, franjas e items del plan de un dia', () => {
    const result = rehydrate(planModel([variant()]))
    expect(result).not.toBeNull()
    const state = result!.state
    expect(state.strategy).toBe('structured')
    expect(state.planName).toBe('Plan de definicion')
    expect(state.effectiveFrom).toBe('2026-07-28')
    expect(state.targets).toEqual({ calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' })
    expect(state.permissions).toEqual({
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      canSubstitute: true,
    })
    expect(state.variants).toHaveLength(1)
    const [base] = state.variants
    expect(base.isDefault).toBe(true)
    expect(base.slots).toHaveLength(1)
    expect(base.slots[0].name).toBe('Almuerzo')
    // `13:00:00` (columna time) -> `13:00` (input del wizard).
    expect(base.slots[0].startTime).toBe('13:00')
    expect(base.slots[0].items[0].food?.id).toBe(FOOD_ID)
    expect(base.slots[0].items[0].quantity).toBe('200')
    expect(base.slots[0].items[0].unit).toBe('g')
  })

  it('plan de 3 dias: rehidrata las 3 variantes y re-publicar emite las MISMAS 3 (sin perdida)', () => {
    const model = planModel([
      variant(),
      variant({
        key: 'sabado',
        label: 'Sábado',
        dayOfWeek: 6,
        isDefault: false,
        // Metas propias => se rehidrata como personalizado.
        targets: { calories: 2600, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: null, sodiumMg: null, waterMl: null },
        mealSlots: [slot({ name: 'Almuerzo', prescriptionItems: [item({ quantity: 350, macros: { calories: 350, proteinG: 35, carbsG: 70, fatsG: 17.5, fiberG: 7 } })] })],
      }),
      variant({
        key: 'domingo',
        label: 'Domingo',
        dayOfWeek: 0,
        isDefault: false,
        // Mismas metas del base => hereda.
        mealSlots: [slot({ name: 'Brunch' })],
      }),
    ])
    const result = rehydrate(model)!
    const state = result.state

    expect(state.variants.map((v) => v.key)).toEqual(['default', 'sabado', 'domingo'])
    expect(state.variants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(state.variants.map((v) => v.targetsMode)).toEqual(['inherit', 'custom', 'inherit'])
    expect(state.variants[1].targets.calories).toBe('2600')
    expect(state.activeVariantKey).toBe('default')

    // Re-publicar sin tocar nada reproduce el plan: 3 variantes, mismos dias/labels/metas.
    const draft = assembleDraft(state, { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.dayVariants).toHaveLength(3)
    expect(draft.dayVariants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(draft.dayVariants.map((v) => v.label)).toEqual(['Todos los días', 'Sábado', 'Domingo'])
    expect(draft.dayVariants.map((v) => v.targets.calories)).toEqual([2000, 2600, 2000])
    expect(draft.dayVariants[1].mealSlots[0].items[0].quantity).toBe(350)
    expect(draft.dayVariants[2].mealSlots[0].name).toBe('Brunch')
  })

  // PERDIDA DE DATOS (P0): las "Notas para tu alumno" se escriben en la edicion rapida y el
  // wizard no tiene campo para editarlas. Como publicar reescribe la version COMPLETA, sin este
  // round-trip "Rehacer con el asistente" + publicar las borraba en silencio.
  it('round-trip: rehidrata las notas visibles y re-publicar las CONSERVA', () => {
    const model = { ...planModel([variant()]), visibleNotes: 'Domingo comida libre, hidratate' }
    const result = rehydrate(model)!
    expect(result.state.visibleNotes).toBe('Domingo comida libre, hidratate')

    const draft = assembleDraft(result.state, { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.visibleNotes).toBe('Domingo comida libre, hidratate')
    // El protocolo profesional NO viaja del cliente: es capacidad Pro y lo repone
    // `publishPlanAction` desde la version base (carry-over server-side).
    expect(draft.protocolNotes).toBeNull()
  })

  it('plan sin notas visibles: el draft las emite null (no inventa contenido)', () => {
    const result = rehydrate(planModel([variant()]))!
    expect(result.state.visibleNotes).toBeNull()
    const draft = assembleDraft(result.state, { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.visibleNotes).toBeNull()
  })

  it('rehidrata las porciones con clave por dia y las devuelve al draft', () => {
    const withPortions = slot({
      name: 'Cena',
      exchangeTargets: [
        {
          id: uuid(),
          exchangeGroupId: GROUP_ID,
          groupCode: 'C',
          groupName: 'Cereales',
          color: null,
          portions: 2.5,
          notes: null,
          orderIndex: 0,
          ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
          composedOf: null,
          macrosConfirmed: true,
        },
      ],
    } as Partial<ReadSlot>)
    const model = planModel([
      variant({ mealSlots: [withPortions] }),
      variant({ key: 'sabado', label: 'Sábado', dayOfWeek: 6, isDefault: false, mealSlots: [slot({ name: 'Cena' })] }),
    ])
    const result = rehydrate(model)!

    const baseSlotKey = result.state.variants[0].slots[0].key
    expect(result.portionsBySlot[portionsKey('default', baseSlotKey)]).toEqual([
      { exchangeGroupId: GROUP_ID, portions: 2.5 },
    ])
    // La cena HOMONIMA del sabado no hereda porciones (claves separadas por dia).
    const sabadoSlotKey = result.state.variants[1].slots[0].key
    expect(result.portionsBySlot[portionsKey('sabado', sabadoSlotKey)]).toBeUndefined()

    const draft = attachPortionsAndValidate(
      assembleDraft(result.state, { clientId: CLIENT_ID, planId: PLAN_ID }),
      variantPortionKeys(result.state.variants),
      result.portionsBySlot,
    )
    expect(draft.dayVariants[0].mealSlots[0].exchangeTargets).toEqual([
      { exchangeGroupId: GROUP_ID, portions: 2.5, notes: null, orderIndex: 0 },
    ])
    expect('exchangeTargets' in draft.dayVariants[1].mealSlots[0]).toBe(false)
  })

  it('rehidrata los reemplazos autorizados del item (carry-over F-02)', () => {
    const model = planModel([variant()])
    const itemId = model.dayVariants[0].mealSlots[0].prescriptionItems[0].id
    const sub: NutritionItemSubstitutionRead = {
      id: uuid(),
      prescriptionItemId: itemId,
      foodId: SUB_FOOD_ID,
      recipeId: null,
      name: 'Pavo',
      brand: null,
      quantity: null,
      unit: null,
      macros: { calories: 100, proteinG: 10, carbsG: 20, fatsG: 5, fiberG: 2 },
    }
    const result = rehydrate(model, [sub])!
    const subs = result.state.variants[0].slots[0].items[0].substitutions
    expect(subs).toHaveLength(1)
    expect(subs[0].food.id).toBe(SUB_FOOD_ID)

    const draft = assembleDraft(result.state, { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.dayVariants[0].mealSlots[0].items[0].substitutions).toEqual([
      { foodId: SUB_FOOD_ID, recipeId: null, customName: null, quantity: null, unit: null, orderIndex: 0 },
    ])
  })

  it('item libre (sin foodId): invierte las macros del snapshot a macros por 100', () => {
    const model = planModel([
      variant({
        mealSlots: [
          slot({
            prescriptionItems: [
              item({
                foodId: null,
                name: 'Colacion casera',
                quantity: 200,
                macros: { calories: 200, proteinG: 20, carbsG: 40, fatsG: 10, fiberG: null },
              }),
            ],
          }),
        ],
      }),
    ])
    const builderItem = rehydrate(model)!.state.variants[0].slots[0].items[0]
    expect(builderItem.food).toBeNull()
    expect(builderItem.customName).toBe('Colacion casera')
    expect(builderItem.customCalories).toBe('100')
    expect(builderItem.customProteinG).toBe('10')
    expect(builderItem.customCarbsG).toBe('20')
    expect(builderItem.customFatsG).toBe('5')
  })

  it('alimento ilegible: reconstruye el alimento desde el snapshot y CONSERVA el foodId', () => {
    const model = planModel([variant()])
    const result = rehydrateBuilderState({
      planModel: model,
      // Catalogo sin la fila (borrada o fuera de RLS).
      foods: {},
      substitutionsByItemId: {},
      effectiveFrom: '2026-07-28',
      portionKeyOf: portionsKey,
    })!
    const food = result.state.variants[0].slots[0].items[0].food
    expect(food?.id).toBe(FOOD_ID)
    // 200 g -> 200 kcal congeladas => 100 kcal por 100 g, con servingSize 100.
    expect(food?.calories).toBe(100)
    expect(food?.servingSize).toBe(100)
    const draft = assembleDraft(result.state, { clientId: CLIENT_ID, planId: PLAN_ID })
    expect(draft.dayVariants[0].mealSlots[0].items[0].foodId).toBe(FOOD_ID)
  })
})

describe('collectPlanFoodIds', () => {
  it('junta los ids de items y reemplazos, sin repetir', () => {
    const model = planModel([variant(), variant({ key: 'sabado', dayOfWeek: 6, isDefault: false, label: 'Sábado' })])
    const ids = collectPlanFoodIds(model, [
      {
        id: uuid(),
        prescriptionItemId: 'x',
        foodId: SUB_FOOD_ID,
        recipeId: null,
        name: 'Pavo',
        brand: null,
        quantity: null,
        unit: null,
        macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
      },
    ])
    expect(ids.sort()).toEqual([FOOD_ID, SUB_FOOD_ID].sort())
  })
})
