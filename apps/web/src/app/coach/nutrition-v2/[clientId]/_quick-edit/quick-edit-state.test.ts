import { describe, expect, it } from 'vitest'
import {
  NutritionPlanDraftSchema,
  countDraftChanges,
  readModelToDraft,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import {
  applyQuickEditToDraft,
  createCatalogItem,
  normalizeTimeHHMM,
  qeItemMacros,
  quickEditReducer,
  readModelToEditState,
  stepQuantityText,
  validateQuickEdit,
  type QuickEditState,
} from './quick-edit-state'
import type { BuilderFood } from '../builder/_lib/draft-builder'

// Invariante central del quick-edit web: hidratar el read model y proyectarlo SIN editar
// debe dar CERO cambios contra el baseline (mismo pipeline de proyeccion en ambos lados),
// y cada operacion de edicion debe mover el contador y producir un draft valido (Zod).

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'

function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-17T12:00:00+00:00',
    asOfDate: '2026-07-17',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de prueba',
      strategy: 'structured',
      versionId: VERSION_ID,
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
        id: VARIANT_ID,
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: {
          calories: 2200,
          proteinG: 160,
          carbsG: 220,
          fatsG: 70,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [
          {
            id: SLOT_ID,
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                id: ITEM_ID,
                foodId: FOOD_ID,
                recipeId: null,
                name: 'Avena',
                brand: null,
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  }
}

const swapFood: BuilderFood = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Quinoa',
  brand: null,
  calories: 368,
  proteinG: 14,
  carbsG: 64,
  fatsG: 6,
  fiberG: 7,
  servingSize: 100,
  servingUnit: 'g',
  category: null,
  media: null,
}

function hydrate(): { state: QuickEditState; baseline: ReturnType<typeof applyQuickEditToDraft> } {
  const planModel = makePlanModel()
  const state = readModelToEditState(planModel)
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!state || !baseDraft) throw new Error('fixture sin plan')
  return { state, baseline: applyQuickEditToDraft(baseDraft, state) }
}

function currentDraftOf(state: QuickEditState) {
  const planModel = makePlanModel()
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!baseDraft) throw new Error('fixture sin plan')
  return applyQuickEditToDraft(baseDraft, state)
}

describe('quick-edit-state (web)', () => {
  it('hidratar y proyectar sin editar produce CERO cambios (sin diffs fantasma)', () => {
    const { state, baseline } = hydrate()
    expect(countDraftChanges(baseline, currentDraftOf(state))).toBe(0)
  })

  it('cambiar una cantidad cuenta 1 cambio y vuelve a 0 al deshacer el valor', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '90',
    })
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    const reverted = quickEditReducer(edited, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '80',
    })
    expect(countDraftChanges(baseline, currentDraftOf(reverted))).toBe(0)
  })

  it('swap conserva cantidad/unidad, cuenta 1 cambio y el draft resultante pasa el schema', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      food: swapFood,
    })
    const item = edited.variants[0].slots[0].items[0]
    expect(item.foodId).toBe(swapFood.id)
    expect(item.quantity).toBe('80')
    expect(item.unit).toBe('g')
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    expect(() => NutritionPlanDraftSchema.parse(currentDraftOf(edited))).not.toThrow()
  })

  it('eliminar item + restaurar en su posicion = undo local exacto', () => {
    const { state, baseline } = hydrate()
    const removedItem = state.variants[0].slots[0].items[0]
    const removed = quickEditReducer(state, {
      type: 'REMOVE_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
    })
    expect(countDraftChanges(baseline, currentDraftOf(removed))).toBe(1)
    const restored = quickEditReducer(removed, {
      type: 'RESTORE_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      index: 0,
      item: removedItem,
    })
    expect(countDraftChanges(baseline, currentDraftOf(restored))).toBe(0)
  })

  it('agregar franja produce un draft valido y cuenta 1 cambio', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'ADD_SLOT',
      variantKey: VARIANT_ID,
      key: 'nueva-franja-key',
      name: 'Cena',
      startTime: '20:30',
    })
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    const draft = currentDraftOf(edited)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
    const slots = draft.dayVariants[0].mealSlots
    expect(slots[slots.length - 1].startTime).toBe('20:30')
  })

  it('macros en vivo: item hidratado escala linealmente; item swapeado usa el motor exacto', () => {
    const { state } = hydrate()
    const base = state.variants[0].slots[0].items[0]
    const doubled = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '160',
    })
    expect(qeItemMacros(base).calories).toBe(300)
    expect(qeItemMacros(doubled.variants[0].slots[0].items[0]).calories).toBe(600)

    const catalogItem = createCatalogItem('k1', swapFood)
    expect(qeItemMacros(catalogItem).calories).toBeGreaterThan(0)
  })

  it('validacion local: cantidad invalida y nombre libre vacio bloquean el publish', () => {
    const { state } = hydrate()
    const badQty = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '0',
    })
    expect(validateQuickEdit(badQty).ok).toBe(false)
    const withCustom = quickEditReducer(state, {
      type: 'ADD_CUSTOM_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      key: 'custom-1',
    })
    expect(validateQuickEdit(withCustom).ok).toBe(false)
  })

  it('steppers: 5 en g, no baja de cero; normalizacion de hora HH:MM[:SS]', () => {
    expect(stepQuantityText('80', 5, 1)).toBe('85')
    expect(stepQuantityText('3', 5, -1)).toBe('3')
    expect(normalizeTimeHHMM('08:00:00')).toBe('08:00')
    expect(normalizeTimeHHMM(null)).toBe('')
  })
})
