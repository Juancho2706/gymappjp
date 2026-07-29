// CE-5 — copiar UNA franja a otros dias en el quick-edit RN (multi-dia en telefono sin
// rearmar "Almuerzo" siete veces). Logica PURA de apps/mobile/lib/nutrition-v2-quick-edit.ts
// (accion COPY_SLOT_TO_VARIANTS + resolveQuickEditSlotCopyTargets) y de su capa hermana de porciones
// (components/nutrition-v2/quick-edit/portions-state.ts, copyPortionsToSlots).
//
// Semantica ESPEJO del builder (misma spec, mismo `slotMergeName`): clon completo + merge por
// NOMBRE (trim + case-insensitive) conservando posicion, o alta al final; deterministico y
// repetible; el dia origen jamas se toca. Ningun modulo importa runtime react-native.
import { describe, expect, it } from 'vitest'
import {
  countQuickEditChanges,
  otherQuickEditVariantKeys,
  resolveQuickEditSlotCopyTargets,
  quickEditReducer,
  type QuickEditItem,
  type QuickEditSlot,
  type QuickEditState,
  type QuickEditVariant,
} from '../apps/mobile/lib/nutrition-v2-quick-edit'
import {
  copyPortionsToSlots,
  type QuickEditPortionTarget,
  type QuickEditPortionsState,
} from '../apps/mobile/components/nutrition-v2/quick-edit/portions-state'

const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeItem(key: string, overrides: Partial<QuickEditItem> = {}): QuickEditItem {
  return {
    key,
    id: ITEM_ID,
    foodId: FOOD_ID,
    recipeId: null,
    displayName: 'Avena',
    brand: null,
    customName: null,
    quantity: '80',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    baseQuantity: 80,
    baseMacros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
    food: null,
    ...overrides,
  }
}

function makeSlot(key: string, name: string, overrides: Partial<QuickEditSlot> = {}): QuickEditSlot {
  return {
    key,
    id: SLOT_ID,
    code: 'slot-1',
    name,
    startTime: '08:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    targets: {},
    instructions: null,
    items: [makeItem(key + '-i1')],
    ...overrides,
  }
}

function makeVariant(key: string, overrides: Partial<QuickEditVariant> = {}): QuickEditVariant {
  return {
    key,
    id: null,
    label: key === 'default' ? 'Todos los días' : 'Sábado',
    dayOfWeek: key === 'default' ? null : 6,
    default: key === 'default',
    targets: { calories: '2200', proteinG: '160', carbsG: '220', fatsG: '70' },
    fixedTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [],
    ...overrides,
  }
}

/** Base con "Desayuno", sabado con "Cena" y domingo vacio. */
function makeState(): QuickEditState {
  return {
    visibleNotes: 'Toma agua',
    variants: [
      makeVariant('default', { slots: [makeSlot('s-des', 'Desayuno')] }),
      makeVariant('dia-6', { slots: [makeSlot('s-cena', 'Cena', { startTime: '21:00' })] }),
      makeVariant('dia-0', { label: 'Domingo', dayOfWeek: 0 }),
    ],
  }
}

function variantOf(state: QuickEditState, key: string): QuickEditVariant {
  return state.variants.find((variant) => variant.key === key) as QuickEditVariant
}

const COPY_DESAYUNO = {
  type: 'COPY_SLOT_TO_VARIANTS',
  sourceVariantKey: 'default',
  slotKey: 's-des',
  targetVariantKeys: ['dia-6', 'dia-0'],
} as const

describe('quick-edit RN — COPY_SLOT_TO_VARIANTS', () => {
  it('clona la franja COMPLETA al final del dia destino, con keys de UI propias', () => {
    const state = quickEditReducer(makeState(), COPY_DESAYUNO)
    const sabado = variantOf(state, 'dia-6')
    expect(sabado.slots.map((slot) => slot.name)).toEqual(['Cena', 'Desayuno'])
    expect(sabado.slots[1].key).toBe('dia-6:s-des')
    expect(sabado.slots[1].startTime).toBe('08:00')
    expect(sabado.slots[1].items[0].key).toBe('dia-6:s-des:s-des-i1')
    expect(sabado.slots[1].items[0].quantity).toBe('80')
    // Franja AGREGADA: identidad nueva en el dia destino (id null) y `slot_code` LIBRE — el
    // sabado ya usaba 'slot-1' en "Cena" y la BD exige unique (day_variant_id, slot_code).
    expect(sabado.slots[1].id).toBeNull()
    expect(sabado.slots[1].code).toBe('slot-1-2')
    // Los ids de los ITEMS si VIAJAN: son la llave del carry-over de reemplazos autorizados
    // (`injectSubstitutionsIntoDraft` empareja por item.id), igual que al clonar un dia
    // entero. La persistencia los ignora e inserta filas nuevas.
    expect(sabado.slots[1].items[0].id).toBe(ITEM_ID)
    // Dia vacio: la franja es la unica y conserva el codigo del origen (no hay con quien chocar).
    expect(variantOf(state, 'dia-0').slots.map((slot) => slot.key)).toEqual(['dia-0:s-des'])
    expect(variantOf(state, 'dia-0').slots[0].code).toBe('slot-1')
    // El dia origen jamas se toca.
    expect(variantOf(state, 'default').slots).toEqual(makeState().variants[0].slots)
  })

  it('el clon es independiente: editar el destino no mueve el origen', () => {
    let state = quickEditReducer(makeState(), COPY_DESAYUNO)
    state = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: 'dia-6',
      slotKey: 'dia-6:s-des',
      itemKey: 'dia-6:s-des:s-des-i1',
      value: '999',
    })
    expect(variantOf(state, 'dia-6').slots[1].items[0].quantity).toBe('999')
    expect(variantOf(state, 'default').slots[0].items[0].quantity).toBe('80')
  })

  it('merge por NOMBRE (trim + case-insensitive): reemplaza contenido conservando posicion y key', () => {
    const start: QuickEditState = {
      ...makeState(),
      variants: makeState().variants.map((variant) =>
        variant.key !== 'dia-6'
          ? variant
          : {
              ...variant,
              slots: [
                makeSlot('s-cena', 'Cena', { startTime: '21:00' }),
                makeSlot('s-otro', '  DESAYUNO ', { startTime: '11:00', items: [] }),
              ],
            },
      ),
    }
    const state = quickEditReducer(start, COPY_DESAYUNO)
    const sabado = variantOf(state, 'dia-6')
    // Sin franja nueva: la homonima se reemplazo EN SU POSICION conservando su key.
    expect(sabado.slots.map((slot) => slot.key)).toEqual(['s-cena', 's-otro'])
    expect(sabado.slots[1].name).toBe('Desayuno')
    expect(sabado.slots[1].startTime).toBe('08:00')
    expect(sabado.slots[1].items.map((item) => item.key)).toEqual(['s-otro:s-des-i1'])
    // Al REEMPLAZAR viaja la identidad de la franja pisada: el contador la lee como franja
    // tocada (no baja + alta) y su `slot_code` sigue siendo el suyo dentro del dia.
    expect(sabado.slots[1].id).toBe(SLOT_ID)
    expect(sabado.slots[1].code).toBe('slot-1')
  })

  it('aplicar dos veces deja el MISMO arbol (deterministico y repetible)', () => {
    const once = quickEditReducer(makeState(), COPY_DESAYUNO)
    expect(quickEditReducer(once, COPY_DESAYUNO)).toEqual(once)
  })

  it('"aplicar a todos los dias" = otherQuickEditVariantKeys; origen y keys fantasma se ignoran', () => {
    const start = makeState()
    const targets = otherQuickEditVariantKeys(start, 'default')
    expect(targets).toEqual(['dia-6', 'dia-0'])
    const state = quickEditReducer(start, {
      type: 'COPY_SLOT_TO_VARIANTS',
      sourceVariantKey: 'default',
      slotKey: 's-des',
      targetVariantKeys: [...targets, 'default', 'fantasma'],
    })
    expect(variantOf(state, 'dia-6').slots).toHaveLength(2)
    expect(variantOf(state, 'dia-0').slots).toHaveLength(1)
    expect(variantOf(state, 'default').slots).toHaveLength(1)
  })

  it('sin destinos validos (o franja/origen inexistente) devuelve el MISMO estado', () => {
    const state = makeState()
    const noop = (params: { sourceVariantKey: string; slotKey: string; targetVariantKeys: string[] }) =>
      quickEditReducer(state, { type: 'COPY_SLOT_TO_VARIANTS', ...params })
    expect(noop({ sourceVariantKey: 'default', slotKey: 's-des', targetVariantKeys: [] })).toBe(state)
    expect(noop({ sourceVariantKey: 'default', slotKey: 'fantasma', targetVariantKeys: ['dia-6'] })).toBe(state)
    expect(noop({ sourceVariantKey: 'fantasma', slotKey: 's-des', targetVariantKeys: ['dia-6'] })).toBe(state)
    expect(noop({ sourceVariantKey: 'default', slotKey: 's-des', targetVariantKeys: ['default'] })).toBe(state)
  })

  it('la copia NO pierde las notas visibles y suma cambios publicables', () => {
    const start = makeState()
    const state = quickEditReducer(start, COPY_DESAYUNO)
    expect(state.visibleNotes).toBe('Toma agua')
    // Franja nueva en cada dia = 1 + sus items (contrato del contador RN).
    expect(countQuickEditChanges(start, state)).toBe(4)
  })

  it('resolveQuickEditSlotCopyTargets anticipa EXACTAMENTE las keys que quedan en el estado', () => {
    const start = makeState()
    const params = { sourceVariantKey: 'default', slotKey: 's-des', targetVariantKeys: ['dia-6', 'dia-0'] }
    const destinations = resolveQuickEditSlotCopyTargets(start, params)
    expect(destinations).toEqual([
      { variantKey: 'dia-6', slotKey: 'dia-6:s-des', replaced: false },
      { variantKey: 'dia-0', slotKey: 'dia-0:s-des', replaced: false },
    ])
    const state = quickEditReducer(start, { type: 'COPY_SLOT_TO_VARIANTS', ...params })
    for (const destination of destinations) {
      expect(variantOf(state, destination.variantKey).slots.some((slot) => slot.key === destination.slotKey)).toBe(true)
    }
    // Segunda pasada: los mismos destinos, ahora por merge (idempotencia de las porciones).
    expect(resolveQuickEditSlotCopyTargets(state, params)).toEqual(destinations.map((d) => ({ ...d, replaced: true })))
    expect(resolveQuickEditSlotCopyTargets(start, { ...params, targetVariantKeys: [] })).toEqual([])
  })

  it('una franja clonada y RENOMBRADA no se pisa: la copia entra con key desambiguada', () => {
    let state = quickEditReducer(makeState(), COPY_DESAYUNO)
    state = quickEditReducer(state, {
      type: 'UPDATE_SLOT',
      variantKey: 'dia-6',
      slotKey: 'dia-6:s-des',
      patch: { name: 'Colación' },
    })
    state = quickEditReducer(state, COPY_DESAYUNO)
    expect(variantOf(state, 'dia-6').slots.map((slot) => slot.key)).toEqual([
      's-cena',
      'dia-6:s-des',
      'dia-6:s-des-2',
    ])
    expect(variantOf(state, 'dia-6').slots.map((slot) => slot.name)).toEqual(['Cena', 'Colación', 'Desayuno'])
  })
})

// ---------------------------------------------------------------------------
// La capa de porciones (reducer hermano, keyed por slot.key) sigue a la franja.
// ---------------------------------------------------------------------------

describe('quick-edit RN — copyPortionsToSlots (las porciones viajan con la franja)', () => {
  function target(key: string, portions: number): QuickEditPortionTarget {
    return {
      key,
      id: null,
      exchangeGroupId: GROUP_C,
      groupCode: 'C',
      groupName: 'Cereales',
      color: null,
      macrosConfirmed: true,
      portions,
      notes: '',
    }
  }

  const TARGETS = [{ slotKey: 'dia-6:s-des' }, { slotKey: 'dia-0:s-des' }]

  it('replica los targets con keys de UI propias y deja el origen intacto', () => {
    const state: QuickEditPortionsState = { bySlot: { 's-des': [target('t1', 2)] } }
    const copied = copyPortionsToSlots(state, { sourceSlotKey: 's-des', targets: TARGETS })
    expect(copied.bySlot['dia-6:s-des']).toEqual([{ ...target('dia-6:s-des:t1', 2) }])
    expect(copied.bySlot['dia-0:s-des']?.[0].key).toBe('dia-0:s-des:t1')
    expect(copied.bySlot['s-des']).toEqual([target('t1', 2)])
  })

  it('es REEMPLAZO: un origen sin porciones BORRA las del destino', () => {
    const state: QuickEditPortionsState = { bySlot: { 's-des': [], 'dia-6:s-des': [target('t9', 3)] } }
    const copied = copyPortionsToSlots(state, { sourceSlotKey: 's-des', targets: TARGETS })
    expect('dia-6:s-des' in copied.bySlot).toBe(false)
    expect('dia-0:s-des' in copied.bySlot).toBe(false)
  })

  it('aplicar dos veces devuelve la MISMA referencia (idempotente, sin re-render)', () => {
    const state: QuickEditPortionsState = { bySlot: { 's-des': [target('t1', 1.5)] } }
    const params = { sourceSlotKey: 's-des', targets: TARGETS }
    const once = copyPortionsToSlots(state, params)
    expect(copyPortionsToSlots(once, params)).toBe(once)
    expect(copyPortionsToSlots(state, { sourceSlotKey: 's-des', targets: [] })).toBe(state)
  })
})
