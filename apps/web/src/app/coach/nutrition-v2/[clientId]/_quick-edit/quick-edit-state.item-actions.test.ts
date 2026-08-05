import { describe, expect, it } from 'vitest'
import {
  createCustomItem,
  qeCoachFoodCandidate,
  quickEditReducer,
  type QeItem,
  type QeSlot,
  type QeVariant,
  type QuickEditState,
} from './quick-edit-state'

/**
 * Acciones de fila del quick-edit sumadas en esta ola: `MOVE_ITEM` (BD7, con su Deshacer) y el
 * candidato de "Guardar en mi catalogo" (BD5, macros por 100 reescaladas desde el snapshot).
 */

function makeItem(key: string, overrides: Partial<QeItem> = {}): QeItem {
  return { ...createCustomItem(key), displayName: key, ...overrides }
}

function makeSlot(key: string, name: string, items: QeItem[]): QeSlot {
  return {
    key,
    id: null,
    code: key,
    name,
    startTime: '',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    items,
    portionTargets: [],
  }
}

function makeVariant(key: string, slots: QeSlot[]): QeVariant {
  return {
    key,
    id: null,
    variantKey: key,
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots,
  }
}

function makeState(): QuickEditState {
  return {
    variants: [
      makeVariant('dia-base', [
        makeSlot('desayuno', 'Desayuno', [makeItem('a'), makeItem('b'), makeItem('c')]),
        makeSlot('almuerzo', 'Almuerzo', [makeItem('x')]),
      ]),
    ],
    visibleNotes: 'Toma agua',
  }
}

function keysOf(state: QuickEditState, slotKey: string): string[] {
  const slot = state.variants[0].slots.find((candidate) => candidate.key === slotKey)
  return (slot?.items ?? []).map((item) => item.key)
}

describe('MOVE_ITEM (quick-edit) — espejo del wizard', () => {
  it('saca el item del origen y lo deja al final del destino', () => {
    const next = quickEditReducer(makeState(), {
      type: 'MOVE_ITEM',
      variantKey: 'dia-base',
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'b',
    })
    expect(keysOf(next, 'desayuno')).toEqual(['a', 'c'])
    expect(keysOf(next, 'almuerzo')).toEqual(['x', 'b'])
  })

  it('conserva el item entero, incluido su `id` (carry-over de reemplazos en RN)', () => {
    const state: QuickEditState = {
      ...makeState(),
      variants: [
        makeVariant('dia-base', [
          makeSlot('desayuno', 'Desayuno', [makeItem('a', { id: 'item-1', quantity: '150', unit: 'ml' })]),
          makeSlot('almuerzo', 'Almuerzo', []),
        ]),
      ],
    }
    const next = quickEditReducer(state, {
      type: 'MOVE_ITEM',
      variantKey: 'dia-base',
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'a',
    })
    const moved = next.variants[0].slots[1].items[0]
    expect(moved.id).toBe('item-1')
    expect(moved.quantity).toBe('150')
    expect(moved.unit).toBe('ml')
  })

  it('mover + deshacer (`toIndex`) deja el arbol de partida', () => {
    const moved = quickEditReducer(makeState(), {
      type: 'MOVE_ITEM',
      variantKey: 'dia-base',
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'b',
    })
    const back = quickEditReducer(moved, {
      type: 'MOVE_ITEM',
      variantKey: 'dia-base',
      fromSlotKey: 'almuerzo',
      toSlotKey: 'desayuno',
      itemKey: 'b',
      toIndex: 1,
    })
    expect(keysOf(back, 'desayuno')).toEqual(['a', 'b', 'c'])
    expect(keysOf(back, 'almuerzo')).toEqual(['x'])
  })

  it('conserva los campos hermanos del estado (visibleNotes)', () => {
    const next = quickEditReducer(makeState(), {
      type: 'MOVE_ITEM',
      variantKey: 'dia-base',
      fromSlotKey: 'desayuno',
      toSlotKey: 'almuerzo',
      itemKey: 'a',
    })
    expect(next.visibleNotes).toBe('Toma agua')
  })

  it('no-op TOTAL si el gesto no aplica (jamas se pierde el item)', () => {
    const state = makeState()
    const cases = [
      { fromSlotKey: 'desayuno', toSlotKey: 'desayuno', itemKey: 'a' },
      { fromSlotKey: 'desayuno', toSlotKey: 'nope', itemKey: 'a' },
      { fromSlotKey: 'desayuno', toSlotKey: 'almuerzo', itemKey: 'zzz' },
      { fromSlotKey: 'nope', toSlotKey: 'almuerzo', itemKey: 'a' },
    ]
    for (const params of cases) {
      expect(quickEditReducer(state, { type: 'MOVE_ITEM', variantKey: 'dia-base', ...params })).toBe(state)
    }
    expect(
      quickEditReducer(state, {
        type: 'MOVE_ITEM',
        variantKey: 'otro',
        fromSlotKey: 'desayuno',
        toSlotKey: 'almuerzo',
        itemKey: 'a',
      }),
    ).toBe(state)
  })
})

describe('qeCoachFoodCandidate — "Guardar en mi catalogo" desde el quick-edit', () => {
  const freeItem = makeItem('libre', {
    displayName: 'Pan amasado',
    quantity: '80',
    unit: 'g',
    macroBase: { quantity: 80, macros: { calories: 220, proteinG: 6.4, carbsG: 40, fatsG: 3.2, fiberG: 2 } },
  })

  it('reescala el snapshot de la cantidad prescrita a macros POR 100', () => {
    const candidate = qeCoachFoodCandidate(freeItem)
    expect(candidate.ok).toBe(true)
    if (!candidate.ok) return
    // 80 g -> 100 g = factor 1,25
    expect(candidate.payload).toEqual({
      name: 'Pan amasado',
      unit: 'g',
      calories: 275,
      proteinG: 8,
      carbsG: 50,
      fatsG: 4,
    })
  })

  it('respeta la unidad ml', () => {
    const candidate = qeCoachFoodCandidate({ ...freeItem, unit: 'ml' })
    expect(candidate.ok).toBe(true)
    if (candidate.ok) expect(candidate.payload.unit).toBe('ml')
  })

  it('un alimento del catalogo no se ofrece (ya esta guardado)', () => {
    const fromCatalog = { ...freeItem, isCustom: false, foodId: 'food-1' }
    expect(qeCoachFoodCandidate(fromCatalog)).toEqual({ ok: false, reason: 'not-custom' })
  })

  it('sin nombre no se guarda', () => {
    expect(qeCoachFoodCandidate({ ...freeItem, displayName: '   ' })).toEqual({ ok: false, reason: 'no-name' })
  })

  it('en unidades no se puede convertir a por-100: se bloquea con motivo propio', () => {
    expect(qeCoachFoodCandidate({ ...freeItem, unit: 'un' })).toEqual({ ok: false, reason: 'bad-unit' })
  })

  it('sin macros (item libre recien creado en el quick-edit) se bloquea', () => {
    expect(qeCoachFoodCandidate({ ...freeItem, macroBase: null })).toEqual({ ok: false, reason: 'no-macros' })
    expect(
      qeCoachFoodCandidate({
        ...freeItem,
        macroBase: { quantity: 0, macros: { calories: 10, proteinG: 1, carbsG: 1, fatsG: 1, fiberG: 0 } },
      }),
    ).toEqual({ ok: false, reason: 'no-macros' })
    expect(
      qeCoachFoodCandidate({
        ...freeItem,
        macroBase: { quantity: 100, macros: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 } },
      }),
    ).toEqual({ ok: false, reason: 'no-macros' })
  })

  it('las macros salen no negativas y con un decimal', () => {
    const candidate = qeCoachFoodCandidate({
      ...freeItem,
      macroBase: { quantity: 30, macros: { calories: 99.99, proteinG: 1.234, carbsG: 0, fatsG: 0, fiberG: 0 } },
    })
    expect(candidate.ok).toBe(true)
    if (!candidate.ok) return
    expect(candidate.payload.calories).toBe(333.3)
    expect(candidate.payload.proteinG).toBe(4.1)
    expect(candidate.payload.carbsG).toBe(0)
  })
})
