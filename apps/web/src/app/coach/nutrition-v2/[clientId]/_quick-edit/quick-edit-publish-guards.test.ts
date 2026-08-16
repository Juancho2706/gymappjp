import { describe, expect, it } from 'vitest'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'
import { NutritionPlanDraftSchema } from '@eva/nutrition-v2'
import { mapCatalogItemToFood } from '../../_lib/food-catalog-mapping'
import {
  applyQuickEditToDraft,
  collectBlankUuidPaths,
  createCustomItem,
  qeEmptyDayVariants,
  quickEditReducer,
  validateQuickEdit,
  type QeItem,
  type QeSlot,
  type QeVariant,
  type QuickEditState,
} from '@eva/nutrition-v2'

/**
 * Regresiones del PUBLISH del quick-edit (QA del owner, 2026-08-05):
 *
 *  1. La proyeccion del draft nunca puede emitir un identificador VACIO ('') — un '' en una
 *     columna uuid es `invalid input syntax for type uuid: ""` (22P02) y llega al coach como un
 *     "No se pudo publicar" sin causa. Se cubre el camino completo del QA: alta desde el picker
 *     unificado, swap de un item y mover entre franjas.
 *  2. Un dia SIN comidas en un plan con franjas se corta LOCALMENTE, marcando el dia, en vez de
 *     viajar al servidor y volver como error opaco (guard `EMPTY_DAY_VARIANT`).
 */

const VARIANT_ID = 'a1111111-1111-4111-8111-111111111111'
const SLOT_ID = 'b2222222-2222-4222-8222-222222222222'
const SLOT_2_ID = 'b3333333-3333-4333-8333-333333333333'
const ITEM_ID = 'c4444444-4444-4444-8444-444444444444'
const FOOD_ID = 'd5555555-5555-4555-8555-555555555555'
const CATALOG_FOOD_ID = 'e6666666-6666-4666-8666-666666666666'
const PLAN_ID = 'f7777777-7777-4777-8777-777777777777'
const CLIENT_ID = '18888888-8888-4888-8888-888888888888'
const GROUP_ID = '29999999-9999-4999-8999-999999999999'

function catalogItem() {
  return {
    id: CATALOG_FOOD_ID,
    catalogKey: null,
    gtin: null,
    name: 'Avena',
    brand: null,
    category: 'cereal',
    countryCode: 'CL',
    servingSize: 100,
    servingUnit: 'g',
    calories: 380,
    proteinG: 13,
    carbsG: 67,
    fatsG: 7,
    fiberG: 10,
    sodiumMg: null,
    sugarG: null,
    saturatedFatG: null,
    packageQuantity: null,
    packageUnit: null,
    source: 'catalog',
    sourceRef: null,
    verificationStatus: 'eva_verified' as const,
    media: null,
  }
}

function hydratedItem(): QeItem {
  return {
    key: ITEM_ID,
    id: ITEM_ID,
    foodId: FOOD_ID,
    recipeId: null,
    displayName: 'Arroz',
    brand: null,
    quantity: '120',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food: null,
    macroBase: { quantity: 120, macros: { calories: 130, proteinG: 3, carbsG: 28, fatsG: 0.3, fiberG: 0.4 } },
    isCustom: false,
    media: null,
    category: null,
    substitutions: [],
  }
}

function slot(key: string, id: string | null, name: string, items: QeItem[]): QeSlot {
  return {
    key,
    id,
    code: key,
    name,
    startTime: '08:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    items,
    portionTargets: [
      {
        key: 'target-1',
        id: null,
        exchangeGroupId: GROUP_ID,
        groupCode: 'P',
        groupName: 'Proteína',
        color: null,
        macrosConfirmed: true,
        portions: '2',
        notes: null,
      },
    ],
  }
}

function variant(slots: QeSlot[]): QeVariant {
  return {
    key: VARIANT_ID,
    id: VARIANT_ID,
    variantKey: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots,
  }
}

function state(): QuickEditState {
  return {
    variants: [
      variant([
        slot(SLOT_ID, SLOT_ID, 'Desayuno', [hydratedItem()]),
        slot(SLOT_2_ID, SLOT_2_ID, 'Almuerzo', []),
      ]),
    ],
    visibleNotes: 'Toma agua',
  }
}

function baseDraft(): NutritionPlanDraft {
  return {
    planId: PLAN_ID,
    clientId: CLIENT_ID,
    name: 'Plan',
    strategy: 'structured',
    effectiveFrom: null,
    timezone: 'America/Santiago',
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visibleNotes: null,
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [],
  } as unknown as NutritionPlanDraft
}

describe('proyeccion del draft — ningun identificador vacio (22P02)', () => {
  it('alta desde el picker + swap + mover entre franjas produce un draft sin strings vacios', () => {
    const food = mapCatalogItemToFood(catalogItem())

    // 1) Alta desde el picker unificado (adaptador FoodPickerSheet -> ADD_CATALOG_ITEM).
    const added = quickEditReducer(state(), {
      type: 'ADD_CATALOG_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      key: 'nuevo-1',
      food,
    })
    // 2) Swap del item hidratado por el mismo alimento del catalogo.
    const swapped = quickEditReducer(added, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      food,
    })
    // 3) Mover el item recien agregado a la otra franja del dia.
    const moved = quickEditReducer(swapped, {
      type: 'MOVE_ITEM',
      variantKey: VARIANT_ID,
      fromSlotKey: SLOT_ID,
      toSlotKey: SLOT_2_ID,
      itemKey: 'nuevo-1',
    })

    const draft = applyQuickEditToDraft(baseDraft(), moved)

    expect(collectBlankUuidPaths(draft)).toEqual([])
    // El contrato es el techo real: si algun uuid llegara vacio, este parse falla.
    expect(NutritionPlanDraftSchema.safeParse(draft).success).toBe(true)

    const items = draft.dayVariants[0].mealSlots.flatMap((s) => s.items)
    expect(items.map((item) => item.foodId)).toEqual([CATALOG_FOOD_ID, CATALOG_FOOD_ID])
    expect(items.every((item) => item.foodId !== '')).toBe(true)
  })

  it('detecta un identificador vacio plantado en cualquier nivel del arbol', () => {
    const draft = applyQuickEditToDraft(baseDraft(), state()) as unknown as Record<string, unknown>
    const variants = draft.dayVariants as Array<Record<string, unknown>>
    const slots = variants[0].mealSlots as Array<Record<string, unknown>>
    const items = slots[0].items as Array<Record<string, unknown>>
    items[0].foodId = ''
    const targets = slots[0].exchangeTargets as Array<Record<string, unknown>>
    targets[0].exchangeGroupId = ''

    expect(collectBlankUuidPaths(draft)).toEqual([
      'draft.dayVariants[0].mealSlots[0].items[0].foodId',
      'draft.dayVariants[0].mealSlots[0].exchangeTargets[0].exchangeGroupId',
    ])
    // Y el contrato lo rechaza igual: la deteccion es diagnostico, no la barrera.
    expect(NutritionPlanDraftSchema.safeParse(draft).success).toBe(false)
  })

  it('no confunde un texto vacio que NO es identificador (notas, marca)', () => {
    expect(collectBlankUuidPaths({ notes: '', customName: '', code: '' })).toEqual([])
  })
})

describe('dia sin comidas — se corta local y marcando el dia (guard EMPTY_DAY_VARIANT)', () => {
  function withEmptyDay(): QuickEditState {
    const base = state()
    return {
      ...base,
      variants: [
        ...base.variants,
        { ...variant([]), key: 'lunes', id: null, variantKey: 'dia-1', label: 'Lunes', dayOfWeek: 1, isDefault: false },
      ],
    }
  }

  it('marca el dia vacio en un plan structured', () => {
    const validation = validateQuickEdit(withEmptyDay(), { strategy: 'structured' })
    expect(validation.ok).toBe(false)
    expect(validation.errors['variant.lunes.slots']).toContain('ninguna comida')
    expect(qeEmptyDayVariants(withEmptyDay(), 'structured').map((v) => v.key)).toEqual(['lunes'])
  })

  it('en flexible un dia sin franjas es su estado correcto', () => {
    expect(validateQuickEdit(withEmptyDay(), { strategy: 'flexible' }).ok).toBe(true)
    expect(qeEmptyDayVariants(withEmptyDay(), 'flexible')).toEqual([])
  })

  it('sin estrategia declarada la validacion no cambia de comportamiento', () => {
    expect(validateQuickEdit(withEmptyDay()).ok).toBe(true)
  })

  it('un plan con todas las franjas cargadas sigue publicando', () => {
    const withItem = quickEditReducer(state(), {
      type: 'ADD_CUSTOM_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_2_ID,
      key: 'libre-1',
    })
    const named = quickEditReducer(withItem, {
      type: 'SET_ITEM_NAME',
      variantKey: VARIANT_ID,
      slotKey: SLOT_2_ID,
      itemKey: 'libre-1',
      value: 'Pan amasado',
    })
    expect(validateQuickEdit(named, { strategy: 'structured' }).ok).toBe(true)
    // Sanity del helper compartido con el resto de la suite.
    expect(createCustomItem('x').isCustom).toBe(true)
  })
})
