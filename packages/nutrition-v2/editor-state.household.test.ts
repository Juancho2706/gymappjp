import { describe, expect, it } from 'vitest'
import type { NutritionPlanReadModel } from './read-models'
import type { BuilderFood } from './editor-food'
import {
  applyQuickEditToDraft,
  createCatalogItem,
  qeItemMacros,
  qeItemPlausibility,
  quantityStep,
  quickEditReducer,
  readModelToEditState,
  validateQuickEdit,
  type QeItem,
  type QuickEditState,
} from './editor-state'
import { readModelToDraft } from './quick-edit'

/**
 * W2 «Cantidades honestas» — la medida casera en el EDITOR UNICO.
 *
 * La regla del tren (SPEC §5.1): la unidad `casera` vive en el editor y en el borrador; lo que
 * se persiste son gramos + el par congelado. Este archivo cuida los dos filos:
 *
 *  · R1 (el mas caro): un item hidratado en modo casera tiene que mostrar los MISMOS macros que
 *    tenia en gramos. `hydrateItem` deja `food: null`, asi que `qeItemMacros` escala por
 *    `qty / macroBase.quantity`; con `quantity = 2` (huevos) y `macroBase.quantity = 122`
 *    (gramos) el editor mostraria 1/61 de las kcal reales… y republicar congelaria ESE numero.
 *  · el borrador emite `unit: 'casera'` + el par, y la traduccion a g/ml ocurre en la ultima
 *    milla (`buildItemInsertRow`), no aca.
 */

const PLAN_ID = '10000000-0000-4000-8000-000000000001'
const VERSION_ID = '10000000-0000-4000-8000-000000000002'
const VARIANT_ID = '10000000-0000-4000-8000-000000000003'
const SLOT_ID = '10000000-0000-4000-8000-000000000004'
const ITEM_ID = '10000000-0000-4000-8000-000000000005'
const FOOD_ID = '10000000-0000-4000-8000-000000000006'
const CLIENT_ID = '10000000-0000-4000-8000-000000000007'

/** Huevo del catalogo: per-100, medida casera «huevo» = 61 g. */
const HUEVO: BuilderFood = {
  id: FOOD_ID,
  name: 'Huevo',
  brand: null,
  calories: 149,
  proteinG: 10,
  carbsG: 1.6,
  fatsG: 11,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  householdGrams: 61,
  householdLabel: 'huevo',
}

/** Alimento SIN medida casera, para el swap que la pierde. */
const ARROZ: BuilderFood = {
  ...HUEVO,
  id: '10000000-0000-4000-8000-000000000008',
  name: 'Arroz cocido',
  calories: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatsG: 0.3,
  householdGrams: null,
  householdLabel: null,
}

/** Plan publicado con UN item: «122 g de huevo» + la medida congelada (huevo / 61 g). */
function makePlanModel(over: { householdLabel?: string | null; householdGrams?: number | null } = {}): NutritionPlanReadModel {
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
      versionNumber: 1,
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
                name: 'Huevo',
                brand: null,
                quantity: 122,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 181.8, proteinG: 12.2, carbsG: 2, fatsG: 13.4, fiberG: 0 },
                householdLabel: 'householdLabel' in over ? over.householdLabel : 'huevo',
                householdGrams: 'householdGrams' in over ? over.householdGrams : 61,
              },
            ],
            exchangeTargets: [],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  } as unknown as NutritionPlanReadModel
}

function firstItem(state: QuickEditState): QeItem {
  return state.variants[0]!.slots[0]!.items[0]!
}

const VARIANT_KEY = VARIANT_ID
const SLOT_KEY = SLOT_ID

function dispatch(state: QuickEditState, action: Parameters<typeof quickEditReducer>[1]): QuickEditState {
  return quickEditReducer(state, action)
}

describe('R1 — rehidratacion en medida casera sin mover un solo macro', () => {
  it('«huevo 122 g / hg 61» se muestra como 2 huevos con los MISMOS macros', () => {
    const item = firstItem(readModelToEditState(makePlanModel()))
    expect(item.unit).toBe('casera')
    expect(item.quantity).toBe('2')
    expect(item.householdGrams).toBe(61)
    expect(item.householdLabel).toBe('huevo')
    // La trampa de R1: `macroBase` tiene que quedar en la MISMA unidad que `quantity`.
    expect(item.macroBase?.quantity).toBe(2)
    expect(qeItemMacros(item)).toEqual({
      calories: 181.8,
      proteinG: 12.2,
      carbsG: 2,
      fatsG: 13.4,
      fiberG: 0,
    })
  })

  it('bajar a 1 huevo escala a la mitad (y no a 1/122)', () => {
    const state = readModelToEditState(makePlanModel())
    const next = dispatch(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      value: '1',
    })
    expect(qeItemMacros(firstItem(next)).calories).toBe(90.9)
  })

  it('sin par congelado la fila sigue en gramos, exactamente como antes de W2', () => {
    const item = firstItem(readModelToEditState(makePlanModel({ householdLabel: null, householdGrams: null })))
    expect(item.unit).toBe('g')
    expect(item.quantity).toBe('122')
    expect(item.macroBase?.quantity).toBe(122)
    expect(qeItemMacros(item).calories).toBe(181.8)
  })

  it('el aviso de plausibilidad resuelve los gramos con el par del ITEM (b15)', () => {
    const item = firstItem(readModelToEditState(makePlanModel()))
    expect(qeItemPlausibility(item).grams).toBe(122)
  })

  it('el stepper de una fila casera avanza de a medio (b12)', () => {
    expect(quantityStep('casera')).toBe(0.5)
    expect(quantityStep('g')).toBe(5)
    expect(quantityStep('un')).toBe(0.5)
  })
})

describe('alta desde el catalogo (b13)', () => {
  it('un alimento con medida casera arranca en «1 <medida>», con el par copiado', () => {
    const item = createCatalogItem('k1', HUEVO)
    expect(item.unit).toBe('casera')
    expect(item.quantity).toBe('1')
    expect(item.householdGrams).toBe(61)
    expect(item.householdLabel).toBe('huevo')
    expect(qeItemMacros(item).calories).toBe(90.9)
  })

  it('sin medida casera el alta queda como siempre: la porcion del catalogo en su magnitud', () => {
    const item = createCatalogItem('k1', ARROZ)
    expect(item.unit).toBe('g')
    expect(item.quantity).toBe('100')
    expect(item.householdGrams).toBeNull()
  })
})

describe('cambio de unidad (b14) y «Usar huevos» (W2.5)', () => {
  function stateWithCatalogItem(): QuickEditState {
    const base = readModelToEditState(makePlanModel({ householdLabel: null, householdGrams: null }))
    // Swap sobre el item hidratado: asi la fila queda con `food` del catalogo, que es el
    // escenario donde el selector puede ofrecer la medida casera.
    return dispatch(base, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      food: HUEVO,
    })
  }

  it('g → casera → g vuelve al mismo gramaje y copia el par al entrar', () => {
    const enGramos = stateWithCatalogItem()
    expect(firstItem(enGramos).unit).toBe('g')
    expect(firstItem(enGramos).quantity).toBe('122')

    const enCasera = dispatch(enGramos, {
      type: 'SET_ITEM_UNIT',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      unit: 'casera',
    })
    expect(firstItem(enCasera).quantity).toBe('2')
    expect(firstItem(enCasera).householdGrams).toBe(61)
    expect(firstItem(enCasera).householdLabel).toBe('huevo')
    expect(qeItemMacros(firstItem(enCasera)).calories).toBe(181.8)

    const deVuelta = dispatch(enCasera, {
      type: 'SET_ITEM_UNIT',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      unit: 'g',
    })
    expect(firstItem(deVuelta).unit).toBe('g')
    expect(firstItem(deVuelta).quantity).toBe('122')
    // Al SALIR el par se conserva: el rotulo sigue siendo cierto y volver a casera es un tap.
    expect(firstItem(deVuelta).householdGrams).toBe(61)
  })

  it('«Usar huevos» (REINTERPRET a casera) NO convierte la cantidad y copia el par', () => {
    const enGramos = stateWithCatalogItem()
    const reinterpretado = dispatch(enGramos, {
      type: 'REINTERPRET_ITEM_UNIT',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      unit: 'casera',
    })
    // La premisa es «el numero estaba bien y la unidad no»: 122 se queda en 122.
    expect(firstItem(reinterpretado).quantity).toBe('122')
    expect(firstItem(reinterpretado).unit).toBe('casera')
    expect(firstItem(reinterpretado).householdGrams).toBe(61)
  })

  it('swap a un alimento SIN medida: la fila baja a gramos con la medida vieja', () => {
    const enCasera = readModelToEditState(makePlanModel())
    expect(firstItem(enCasera).unit).toBe('casera')
    const swapped = dispatch(enCasera, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      food: ARROZ,
    })
    expect(firstItem(swapped).unit).toBe('g')
    expect(firstItem(swapped).quantity).toBe('122')
    expect(firstItem(swapped).householdGrams).toBeNull()
    expect(firstItem(swapped).householdLabel).toBeNull()
  })

  it('swap a un alimento CON medida conserva la cuenta y recalcula el par', () => {
    const enCasera = readModelToEditState(makePlanModel())
    const pan: BuilderFood = { ...ARROZ, householdGrams: 30, householdLabel: 'rebanada' }
    const swapped = dispatch(enCasera, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_ID,
      food: pan,
    })
    expect(firstItem(swapped).unit).toBe('casera')
    expect(firstItem(swapped).quantity).toBe('2')
    expect(firstItem(swapped).householdGrams).toBe(30)
    expect(firstItem(swapped).householdLabel).toBe('rebanada')
  })
})

describe('proyeccion al borrador (b16) y validacion', () => {
  it('el borrador conserva `casera` y emite el par (la traduccion es de `buildItemInsertRow`)', () => {
    const state = readModelToEditState(makePlanModel())
    const baseDraft = readModelToDraft(makePlanModel(), CLIENT_ID)
    if (!baseDraft) throw new Error('fixture sin plan')
    const draft = applyQuickEditToDraft(baseDraft, state)
    const item = draft.dayVariants[0]!.mealSlots[0]!.items[0]!
    expect(item.unit).toBe('casera')
    expect(item.quantity).toBe(2)
    expect(item.householdLabel).toBe('huevo')
    expect(item.householdGrams).toBe(61)
  })

  it('un item en casera SIN par es un error de borrador con su propio mensaje', () => {
    // Estado imposible por UI (el selector solo ofrece `casera` con par), pero alcanzable desde
    // un respaldo local viejo o un alimento al que le quitaron la medida del catalogo.
    const state = readModelToEditState(makePlanModel({ householdLabel: null, householdGrams: null }))
    const item: QeItem = { ...firstItem(state), unit: 'casera', householdGrams: null, householdLabel: null }
    const conItemRoto: QuickEditState = {
      ...state,
      variants: [
        { ...state.variants[0]!, slots: [{ ...state.variants[0]!.slots[0]!, items: [item] }] },
      ],
    }
    const res = validateQuickEdit(conItemRoto)
    expect(res.ok).toBe(false)
    expect(res.errors[`item.${item.key}.unit`]).toBe('Este alimento no tiene medida casera.')
  })

  it('un item en casera CON par valida sin errores', () => {
    expect(validateQuickEdit(readModelToEditState(makePlanModel())).ok).toBe(true)
  })
})
