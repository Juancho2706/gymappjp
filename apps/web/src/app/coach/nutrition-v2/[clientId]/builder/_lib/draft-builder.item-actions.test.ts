import { describe, it, expect } from 'vitest'
import {
  BASE_VARIANT_KEY,
  builderReducer,
  createBaseVariant,
  createEmptyBuilderState,
  createEmptyItem,
  createEmptySlot,
  type BuilderItem,
  type BuilderState,
} from './draft-builder'

/**
 * `MOVE_ITEM` y `RESTORE_ITEM` (BD4/BD7): las dos acciones que sostienen "quitar con Deshacer" y
 * "mover a otra franja con Deshacer". Lo que se testea es la INVARIANTE que hace confiable el
 * Deshacer: el item vuelve a su franja y a su POSICION exacta, y ningun no-op pierde el item.
 */

function item(key: string): BuilderItem {
  return { ...createEmptyItem(key), customName: key, quantity: '100', unit: 'g' }
}

/** Dia base con dos franjas: desayuno (a, b, c) y almuerzo (x). */
function stateWithTwoSlots(): BuilderState {
  const base = {
    ...createBaseVariant(),
    slots: [
      { ...createEmptySlot('desayuno', 'Desayuno'), items: [item('a'), item('b'), item('c')] },
      { ...createEmptySlot('almuerzo', 'Almuerzo'), items: [item('x')] },
    ],
  }
  return { ...createEmptyBuilderState('2026-08-05'), strategy: 'structured', variants: [base] }
}

function keysOf(state: BuilderState, slotKey: string): string[] {
  const slot = state.variants[0].slots.find((candidate) => candidate.key === slotKey)
  return (slot?.items ?? []).map((entry) => entry.key)
}

describe('MOVE_ITEM — mover un alimento a otra franja del mismo dia', () => {
  it('lo saca del origen y lo deja al final del destino', () => {
    const next = builderReducer(stateWithTwoSlots(), {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'b',
    })
    expect(keysOf(next, 'desayuno')).toEqual(['a', 'c'])
    expect(keysOf(next, 'almuerzo')).toEqual(['x', 'b'])
  })

  it('conserva el item COMPLETO (misma referencia): cantidad, unidad y macros libres intactas', () => {
    const state = stateWithTwoSlots()
    const original = state.variants[0].slots[0].items[1]
    const next = builderReducer(state, {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'b',
    })
    expect(next.variants[0].slots[1].items[1]).toBe(original)
  })

  it('`toIndex` aterriza en la posicion pedida (es lo que usa el Deshacer)', () => {
    const moved = builderReducer(stateWithTwoSlots(), {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'b',
    })
    const back = builderReducer(moved, {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'almuerzo',
      toSlotKey: 'desayuno',
      itemKey: 'b',
      toIndex: 1,
    })
    // Deshacer deja EXACTAMENTE el arbol de partida.
    expect(keysOf(back, 'desayuno')).toEqual(['a', 'b', 'c'])
    expect(keysOf(back, 'almuerzo')).toEqual(['x'])
  })

  it('un `toIndex` fuera de rango se acota en vez de perder el item', () => {
    const next = builderReducer(stateWithTwoSlots(), {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'a',
      toIndex: 99,
    })
    expect(keysOf(next, 'almuerzo')).toEqual(['x', 'a'])
    const first = builderReducer(stateWithTwoSlots(), {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'a',
      toIndex: -5,
    })
    expect(keysOf(first, 'almuerzo')).toEqual(['a', 'x'])
  })

  it('no-op TOTAL (misma referencia) cuando el gesto no aplica: jamas se pierde el item', () => {
    const state = stateWithTwoSlots()
    const cases = [
      { fromSlotKey: 'desayuno', toSlotKey: 'desayuno', itemKey: 'a' }, // misma franja
      { fromSlotKey: 'desayuno', toSlotKey: 'no-existe', itemKey: 'a' }, // destino inexistente
      { fromSlotKey: 'desayuno', toSlotKey: 'almuerzo', itemKey: 'zzz' }, // item inexistente
      { fromSlotKey: 'no-existe', toSlotKey: 'almuerzo', itemKey: 'a' }, // origen inexistente
    ]
    for (const params of cases) {
      expect(builderReducer(state, { type: 'MOVE_ITEM', variantKey: BASE_VARIANT_KEY, ...params })).toBe(state)
    }
    expect(
      builderReducer(state, {
        type: 'MOVE_ITEM',
        variantKey: 'otro-dia',
        fromSlotKey: 'desayuno',
        toSlotKey: 'almuerzo',
        itemKey: 'a',
      }),
    ).toBe(state)
  })

  it('no toca las OTRAS franjas ni los otros dias', () => {
    const state = stateWithTwoSlots()
    const withSecondDay: BuilderState = {
      ...state,
      variants: [
        ...state.variants,
        {
          key: 'sabado',
          label: 'Sábado',
          dayOfWeek: 6,
          isDefault: false,
          targetsMode: 'inherit' as const,
          targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
          slots: [{ ...createEmptySlot('sab-desayuno', 'Desayuno'), items: [item('s1')] }],
        },
      ],
    }
    const next = builderReducer(withSecondDay, {
      type: 'MOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'a',
    })
    expect(next.variants[1]).toBe(withSecondDay.variants[1])
  })
})

describe('RESTORE_ITEM — Deshacer de "quitar alimento"', () => {
  it('quitar + deshacer devuelve el item a su posicion exacta', () => {
    const state = stateWithTwoSlots()
    const removed = state.variants[0].slots[0].items[1]
    const afterRemove = builderReducer(state, {
      type: 'REMOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'desayuno',
      itemKey: 'b',
    })
    expect(keysOf(afterRemove, 'desayuno')).toEqual(['a', 'c'])

    const undone = builderReducer(afterRemove, {
      type: 'RESTORE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'desayuno',
      index: 1,
      item: removed,
    })
    expect(keysOf(undone, 'desayuno')).toEqual(['a', 'b', 'c'])
    expect(undone.variants[0].slots[0].items[1]).toBe(removed)
  })

  it('acota el indice (item quitado del final tras haber editado la franja)', () => {
    const state = stateWithTwoSlots()
    const removed = state.variants[0].slots[1].items[0]
    const emptied = builderReducer(state, {
      type: 'REMOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'almuerzo',
      itemKey: 'x',
    })
    const undone = builderReducer(emptied, {
      type: 'RESTORE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'almuerzo',
      index: 7,
      item: removed,
    })
    expect(keysOf(undone, 'almuerzo')).toEqual(['x'])
  })

  it('doble Deshacer no duplica el item', () => {
    const state = stateWithTwoSlots()
    const removed = state.variants[0].slots[0].items[0]
    const afterRemove = builderReducer(state, {
      type: 'REMOVE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'desayuno',
      itemKey: 'a',
    })
    const once = builderReducer(afterRemove, {
      type: 'RESTORE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'desayuno',
      index: 0,
      item: removed,
    })
    const twice = builderReducer(once, {
      type: 'RESTORE_ITEM',
      variantKey: BASE_VARIANT_KEY,
      slotKey: 'desayuno',
      index: 0,
      item: removed,
    })
    expect(keysOf(twice, 'desayuno')).toEqual(['a', 'b', 'c'])
  })
})
