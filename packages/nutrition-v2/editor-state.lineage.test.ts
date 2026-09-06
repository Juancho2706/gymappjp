import { describe, expect, it } from 'vitest'
import type { NutritionPlanReadModel } from './read-models'
import type { BuilderFood } from './editor-food'
import {
  applyQuickEditToDraft,
  createCatalogItem,
  createCustomItem,
  quickEditReducer,
  readModelToEditState,
  type QeItem,
  type QuickEditState,
} from './editor-state'
import { readModelToDraft } from './quick-edit'
import { stripDraftIdentity } from './plan-templates'

/**
 * W3.1 «Cantidades honestas» — LINAJE de ítems en el editor (SPEC §6.1).
 *
 * El problema (Causa 2): cada publicación inserta filas nuevas con ids nuevos, así que los
 * registros que el alumno ya hizo HOY quedan apuntando a un ítem que no está en el snapshot.
 * Republicar sin tocar nada le borraba el «Registrado» (y habilitaba una doble marca).
 *
 * La red es `sourceItemId`: el ítem nuevo declara de quién es copia y la lectura reasigna los
 * registros. Su valor está en la regla del reductor, y esa regla es lo que cuida este archivo:
 * el linaje SOLO sobrevive si sigue siendo la MISMA comida —misma franja, mismo alimento/nombre,
 * misma cantidad y misma unidad—. Un ítem tocado queda huérfano A PROPÓSITO: es otra comida.
 */

const PLAN_ID = '20000000-0000-4000-8000-000000000001'
const VERSION_ID = '20000000-0000-4000-8000-000000000002'
const VARIANT_ID = '20000000-0000-4000-8000-000000000003'
const SLOT_A = '20000000-0000-4000-8000-000000000004'
const SLOT_B = '20000000-0000-4000-8000-000000000005'
/** Ítem de catálogo de la versión vigente: el ancestro del que hay que colgar los registros. */
const ITEM_POLLO = '20000000-0000-4000-8000-000000000006'
/** Segundo ítem de la misma franja (para reordenar sin cruzar de franja). */
const ITEM_ARROZ = '20000000-0000-4000-8000-000000000007'
/** Ítem libre (sin foodId): el único al que `SET_ITEM_NAME` le cambia el nombre. */
const ITEM_LIBRE = '20000000-0000-4000-8000-000000000008'
const FOOD_POLLO = '20000000-0000-4000-8000-000000000009'
const FOOD_ATUN = '20000000-0000-4000-8000-00000000000a'
const CLIENT_ID = '20000000-0000-4000-8000-00000000000b'

const POLLO: BuilderFood = {
  id: FOOD_POLLO,
  name: 'Pollo',
  brand: null,
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatsG: 3.6,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  householdGrams: null,
  householdLabel: null,
}

const ATUN: BuilderFood = { ...POLLO, id: FOOD_ATUN, name: 'Atún en agua', calories: 108, proteinG: 23.3 }

function readItem(over: Record<string, unknown>) {
  return {
    id: ITEM_POLLO,
    foodId: FOOD_POLLO,
    recipeId: null,
    name: 'Pollo',
    brand: null,
    quantity: 100,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    macros: { calories: 165, proteinG: 31, carbsG: 0, fatsG: 3.6, fiberG: 0 },
    householdLabel: null,
    householdGrams: null,
    ...over,
  }
}

function readSlot(id: string, code: string, name: string, items: ReturnType<typeof readItem>[]) {
  return {
    id,
    code,
    name,
    startTime: '13:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    prescriptionItems: items,
    exchangeTargets: [],
  }
}

/** Plan vigente: Almuerzo (pollo + arroz libre) y Cena (vacía a propósito, destino del «Mover a…»). */
function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-06T12:00:00+00:00',
    asOfDate: '2026-09-06',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de prueba',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: true,
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
          calories: 2000,
          proteinG: 150,
          carbsG: 200,
          fatsG: 60,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [
          readSlot(SLOT_A, 'slot-1', 'Almuerzo', [
            readItem({}),
            readItem({ id: ITEM_ARROZ, foodId: null, recipeId: null, name: 'Arroz', quantity: 80 }),
          ]),
          readSlot(SLOT_B, 'slot-2', 'Cena', [
            readItem({ id: ITEM_LIBRE, foodId: null, recipeId: null, name: 'Colación libre', quantity: 50 }),
          ]),
        ],
      },
    ],
    syncToken: 'sync-token',
  } as unknown as NutritionPlanReadModel
}

function dispatch(state: QuickEditState, action: Parameters<typeof quickEditReducer>[1]): QuickEditState {
  return quickEditReducer(state, action)
}

function itemsOf(state: QuickEditState, slotKey: string): QeItem[] {
  return state.variants[0]!.slots.find((slot) => slot.key === slotKey)!.items
}

function itemByKey(state: QuickEditState, itemKey: string): QeItem | undefined {
  return state.variants[0]!.slots.flatMap((slot) => slot.items).find((item) => item.key === itemKey)
}

function lineageOf(state: QuickEditState, itemKey: string): string | null | undefined {
  return itemByKey(state, itemKey)?.sourceItemId
}

/**
 * Estado con el ítem de catálogo YA con su `food` en mano y el linaje intacto. Es el único modo de
 * ejercitar `SET_ITEM_UNIT`/`REINTERPRET_ITEM_UNIT` sobre un ítem con ancestro: la hidratación
 * deja `food: null` (unidad bloqueada) y un swap previo ya habría anulado el linaje.
 */
function stateWithUnlockedUnit(): QuickEditState {
  const base = readModelToEditState(makePlanModel())
  return {
    ...base,
    variants: base.variants.map((variant) => ({
      ...variant,
      slots: variant.slots.map((slot) => ({
        ...slot,
        items: slot.items.map((item) => (item.key === ITEM_POLLO ? { ...item, food: POLLO } : item)),
      })),
    })),
  }
}

describe('hidratación y proyección', () => {
  it('la hidratación carga el id del ítem vigente como ancestro', () => {
    const state = readModelToEditState(makePlanModel())
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
    expect(lineageOf(state, ITEM_LIBRE)).toBe(ITEM_LIBRE)
  })

  it('`projectItem` emite `sourceItemId` en el borrador que se publica', () => {
    const state = readModelToEditState(makePlanModel())
    const base = readModelToDraft(makePlanModel(), CLIENT_ID)!
    const draft = applyQuickEditToDraft(base, state)
    expect(draft.dayVariants[0]!.mealSlots[0]!.items[0]!.sourceItemId).toBe(ITEM_POLLO)
  })

  it('un ítem CAMBIADO proyecta el linaje en null (queda huérfano a propósito)', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      value: '250',
    })
    const draft = applyQuickEditToDraft(readModelToDraft(makePlanModel(), CLIENT_ID)!, state)
    expect(draft.dayVariants[0]!.mealSlots[0]!.items[0]!.sourceItemId).toBeNull()
  })

  it('un ítem NUEVO nace sin ancestro (el alumno no pudo registrarlo)', () => {
    expect(createCatalogItem('k1', POLLO).sourceItemId).toBeNull()
    expect(createCustomItem('k2').sourceItemId).toBeNull()
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'ADD_CATALOG_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      key: 'nuevo-1',
      food: POLLO,
    })
    expect(lineageOf(state, 'nuevo-1')).toBeNull()
  })
})

describe('acciones que ANULAN el linaje (cambió la comida)', () => {
  it('SET_ITEM_QUANTITY', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      value: '150',
    })
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })

  it('STEP_ITEM_QUANTITY', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'STEP_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      direction: 1,
    })
    expect(itemByKey(state, ITEM_POLLO)!.quantity).toBe('105')
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })

  it('SET_ITEM_UNIT (la conversión mueve la cantidad, W1.1)', () => {
    const state = dispatch(stateWithUnlockedUnit(), {
      type: 'SET_ITEM_UNIT',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      unit: 'un',
    })
    expect(itemByKey(state, ITEM_POLLO)!.unit).toBe('un')
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })

  it('REINTERPRET_ITEM_UNIT («quise decir 100 g», W1.3)', () => {
    const state = dispatch(stateWithUnlockedUnit(), {
      type: 'REINTERPRET_ITEM_UNIT',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      unit: 'un',
    })
    expect(itemByKey(state, ITEM_POLLO)!.quantity).toBe('100')
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })

  it('SWAP_ITEM_FOOD (otro alimento es otra comida)', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      food: ATUN,
    })
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })

  it('SET_ITEM_NAME sobre un alimento libre', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'SET_ITEM_NAME',
      variantKey: VARIANT_ID,
      slotKey: SLOT_B,
      itemKey: ITEM_LIBRE,
      value: 'Otra colación',
    })
    expect(lineageOf(state, ITEM_LIBRE)).toBeNull()
  })

  it('MOVE_ITEM a otra franja (los registros cuelgan de la franja)', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'MOVE_ITEM',
      variantKey: VARIANT_ID,
      fromSlotKey: SLOT_A,
      toSlotKey: SLOT_B,
      itemKey: ITEM_POLLO,
    })
    expect(itemsOf(state, SLOT_A).map((item) => item.key)).toEqual([ITEM_ARROZ])
    expect(lineageOf(state, ITEM_POLLO)).toBeNull()
  })
})

describe('acciones que CONSERVAN el linaje (es la misma comida)', () => {
  it('reordenar DENTRO de la franja', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'REORDER_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      toIndex: 1,
    })
    expect(itemsOf(state, SLOT_A).map((item) => item.key)).toEqual([ITEM_ARROZ, ITEM_POLLO])
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
  })

  it('agregar y quitar un reemplazo autorizado (F-02)', () => {
    const added = dispatch(readModelToEditState(makePlanModel()), {
      type: 'ADD_ITEM_SUBSTITUTION',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      food: ATUN,
    })
    expect(itemByKey(added, ITEM_POLLO)!.substitutions).toHaveLength(1)
    expect(lineageOf(added, ITEM_POLLO)).toBe(ITEM_POLLO)

    const removed = dispatch(added, {
      type: 'REMOVE_ITEM_SUBSTITUTION',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      index: 0,
    })
    expect(lineageOf(removed, ITEM_POLLO)).toBe(ITEM_POLLO)
  })

  it('APPLY_FOOD_OVERRIDE (corrige los macros del alimento, no la comida prescrita)', () => {
    const state = dispatch(stateWithUnlockedUnit(), {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: FOOD_POLLO,
      macros: { calories: 180, proteinG: 33, carbsG: 0, fatsG: 4, fiberG: 0 },
    })
    expect(itemByKey(state, ITEM_POLLO)!.food?.calories).toBe(180)
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
  })

  it('elegir la unidad que el ítem YA tenía no es una edición', () => {
    const state = dispatch(stateWithUnlockedUnit(), {
      type: 'SET_ITEM_UNIT',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      unit: 'g',
    })
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
  })

  it('reescribir el MISMO texto de cantidad tampoco (re-dispatch del tap-to-edit)', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_A,
      itemKey: ITEM_POLLO,
      value: '100',
    })
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
  })
})

describe('copias: otra franja, otro día, otro plan', () => {
  it('copiar el día a otro día deja los ítems sin ancestro', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: VARIANT_ID,
      days: [3],
      mode: 'replace',
      keySeed: 'copia',
    })
    const copiado = state.variants[1]!.slots[0]!.items[0]!
    expect(copiado.sourceItemId).toBeNull()
    // El día original no se toca: sigue con su linaje.
    expect(lineageOf(state, ITEM_POLLO)).toBe(ITEM_POLLO)
  })

  it('duplicar un día tampoco arrastra el ancestro', () => {
    const state = dispatch(readModelToEditState(makePlanModel()), {
      type: 'DUPLICATE_VARIANT_AS',
      sourceVariantKey: VARIANT_ID,
      dayOfWeek: 6,
      variantKey: 'dia-sabado',
    })
    expect(state.variants[1]!.slots[0]!.items[0]!.sourceItemId).toBeNull()
  })

  it('guardar como PLANTILLA borra el linaje (apunta a un plan concreto)', () => {
    const state = readModelToEditState(makePlanModel())
    const draft = applyQuickEditToDraft(readModelToDraft(makePlanModel(), CLIENT_ID)!, state)
    expect(draft.dayVariants[0]!.mealSlots[0]!.items[0]!.sourceItemId).toBe(ITEM_POLLO)
    const template = stripDraftIdentity(draft)
    expect(template.dayVariants[0]!.mealSlots[0]!.items[0]!.sourceItemId).toBeNull()
  })
})
