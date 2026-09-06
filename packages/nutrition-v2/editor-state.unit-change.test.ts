import { describe, expect, it } from 'vitest'
import type { BuilderFood } from './editor-food'
import {
  qeItemPlausibility,
  quickEditReducer,
  type QeItem,
  type QeSlot,
  type QeVariant,
  type QuickEditState,
} from './editor-state'

/**
 * `SET_ITEM_UNIT` no tenia NI UNA prueba y solo pisaba `unit` (W1.1 «Cantidades honestas»):
 * el coach dejaba "30", cambiaba de g a `un` y publicaba 30 porciones de 100 g. Este es el
 * reductor COMPARTIDO web + RN, asi que la conversion vale para las dos superficies de una vez.
 */

const VARIANT_KEY = 'default'
const SLOT_KEY = 'slot-1'
const ITEM_KEY = 'item-1'

/** «Huevo revuelto» tal como esta en LIVE: 149 kcal/100 g y porcion de 100 g. */
const HUEVO_REVUELTO: BuilderFood = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Huevo revuelto',
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
}

function item(overrides: Partial<QeItem> = {}): QeItem {
  return {
    key: ITEM_KEY,
    id: null,
    foodId: HUEVO_REVUELTO.id,
    recipeId: null,
    displayName: HUEVO_REVUELTO.name,
    brand: null,
    quantity: '30',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food: HUEVO_REVUELTO,
    macroBase: null,
    isCustom: false,
    media: null,
    category: null,
    substitutions: [],
    ...overrides,
  }
}

function stateWith(qeItem: QeItem): QuickEditState {
  const slot = { key: SLOT_KEY, items: [qeItem], portionTargets: [] } as unknown as QeSlot
  const variant = { key: VARIANT_KEY, label: 'Todos los días', isDefault: true, slots: [slot] } as unknown as QeVariant
  return { variants: [variant], visibleNotes: '' }
}

function firstItem(state: QuickEditState): QeItem {
  return state.variants[0].slots[0].items[0]
}

function setUnit(state: QuickEditState, unit: string): QuickEditState {
  return quickEditReducer(state, {
    type: 'SET_ITEM_UNIT',
    variantKey: VARIANT_KEY,
    slotKey: SLOT_KEY,
    itemKey: ITEM_KEY,
    unit,
  })
}

describe('quickEditReducer SET_ITEM_UNIT', () => {
  it('g → un convierte la cantidad con la porcion del alimento (30 g, porcion 100 ⇒ 0,3 un)', () => {
    const next = firstItem(setUnit(stateWith(item({ quantity: '30', unit: 'g' })), 'un'))
    expect(next.unit).toBe('un')
    expect(next.quantity).toBe('0.3')
  })

  it('g → un con porcion de 60 g deja 1,7 un a partir de 100 g', () => {
    const food = { ...HUEVO_REVUELTO, servingSize: 60 }
    const next = firstItem(setUnit(stateWith(item({ quantity: '100', unit: 'g', food })), 'un'))
    expect(next.quantity).toBe('1.7')
  })

  it('un → g multiplica por la porcion (1 un de 60 g ⇒ 60 g)', () => {
    const food = { ...HUEVO_REVUELTO, servingSize: 60 }
    const next = firstItem(setUnit(stateWith(item({ quantity: '1', unit: 'un', food })), 'g'))
    expect(next.unit).toBe('g')
    expect(next.quantity).toBe('60')
  })

  it('g → ml conserva el numero (misma base per-100)', () => {
    const next = firstItem(setUnit(stateWith(item({ quantity: '250', unit: 'g' })), 'ml'))
    expect(next.unit).toBe('ml')
    expect(next.quantity).toBe('250')
  })

  it('la unidad heredada `porción` conserva el numero (el aviso de plausibilidad cubre el resto)', () => {
    const next = firstItem(setUnit(stateWith(item({ quantity: '2', unit: 'porción' })), 'g'))
    expect(next.unit).toBe('g')
    expect(next.quantity).toBe('2')
  })

  it('sin alimento del catalogo el reductor sigue siendo un no-op TOTAL (ni unidad ni cantidad)', () => {
    const sinFood = item({ quantity: '30', unit: 'g', food: null, foodId: null, isCustom: true })
    const next = firstItem(setUnit(stateWith(sinFood), 'un'))
    expect(next.unit).toBe('g')
    expect(next.quantity).toBe('30')
  })
})

describe('quickEditReducer REINTERPRET_ITEM_UNIT', () => {
  function reinterpret(state: QuickEditState, unit: string): QuickEditState {
    return quickEditReducer(state, {
      type: 'REINTERPRET_ITEM_UNIT',
      variantKey: VARIANT_KEY,
      slotKey: SLOT_KEY,
      itemKey: ITEM_KEY,
      unit,
    })
  }

  it('«Cambiar a 30 g» conserva el numero: el error estaba en la unidad, no en la cantidad', () => {
    const next = firstItem(reinterpret(stateWith(item({ quantity: '30', unit: 'un' })), 'g'))
    expect(next.unit).toBe('g')
    expect(next.quantity).toBe('30')
  })

  it('sin alimento del catalogo no hace nada (mismo guard que SET_ITEM_UNIT)', () => {
    const sinFood = item({ quantity: '30', unit: 'un', food: null, foodId: null, isCustom: true })
    const next = firstItem(reinterpret(stateWith(sinFood), 'g'))
    expect(next.unit).toBe('un')
    expect(next.quantity).toBe('30')
  })

  it('deja el item plausible justo donde SET_ITEM_UNIT lo dejaria en 0,3 un', () => {
    const base = stateWith(item({ quantity: '30', unit: 'un' }))
    expect(qeItemPlausibility(firstItem(base)).implausible).toBe(true)
    expect(qeItemPlausibility(firstItem(reinterpret(base, 'g'))).implausible).toBe(false)
    expect(firstItem(setUnit(base, 'g')).quantity).toBe('3000')
  })
})

describe('qeItemPlausibility', () => {
  it('«30 un» de un alimento de 100 g avisa por gramos y por kcal (el caso del 06-09)', () => {
    const result = qeItemPlausibility(item({ quantity: '30', unit: 'un' }))
    expect(result.grams).toBe(3000)
    expect(result.calories).toBe(4470)
    expect(result.reasons).toEqual(['grams', 'kcal'])
    expect(result.implausible).toBe(true)
  })

  it('los mismos 30 g (la cantidad que el coach queria decir) son plausibles', () => {
    const result = qeItemPlausibility(item({ quantity: '30', unit: 'g' }))
    expect(result.grams).toBe(30)
    expect(result.implausible).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('un item con cantidad no numerica no inventa gramos ni kcal', () => {
    const result = qeItemPlausibility(item({ quantity: 'dos', unit: 'un' }))
    expect(result.grams).toBeNull()
    expect(result.calories).toBe(0)
    expect(result.implausible).toBe(false)
  })

  it('un item sin alimento del catalogo no tiene porcion: sin gramos, y las kcal las pone macroBase', () => {
    const libre = item({ quantity: '1', unit: 'porción', food: null, foodId: null, isCustom: true })
    const result = qeItemPlausibility(libre)
    expect(result.grams).toBeNull()
    expect(result.calories).toBe(0)
    expect(result.implausible).toBe(false)
  })
})
