import { describe, expect, it } from 'vitest'
import {
  PORTION_MAX,
  createPortionTarget,
  findPortionTargetByGroup,
  formatMacroEsCl,
  formatPortionsEsCl,
  portionsAfterBump,
  quickEditReducer,
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
  type QeVariant,
  type QuickEditState,
} from './editor-state'
import { PORTIONS_COPY } from './nutrition-portions-copy'
import { PORTIONS_EVENT_GROUP_BUMPED, portionGroupBumpedPayload } from './portions-analytics'

// W2.1 — tocar un grupo que la franja YA tiene suma media porcion en vez de no hacer nada
// (defecto D2-A: el picker lo mostraba deshabilitado y el coach tenia que irse al stepper).
// El bump se resuelve por `exchangeGroupId` porque el picker no conoce el `targetKey`.

function group(exchangeGroupId: string, groupCode: string): QePortionGroup {
  return {
    exchangeGroupId,
    groupCode,
    groupName: groupCode,
    color: null,
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
    composedOf: null,
    macrosConfirmed: true,
  }
}

function target(exchangeGroupId: string, portions: string): QePortionTarget {
  return { ...createPortionTarget(`t-${exchangeGroupId}`, group(exchangeGroupId, 'C')), portions }
}

// Franja y dia COMPLETOS (sin `as unknown as`): el reducer lee el arbol entero y un estado
// parcial dejaria estos tests verdes sobre una forma imposible el dia que `QeSlot` o `QeVariant`
// ganen un campo requerido. Con el objeto tipado, ese dia el compilador avisa aca.
function slotWith(targets: QePortionTarget[]): QeSlot {
  return {
    key: 's1',
    id: null,
    code: 'BREAKFAST',
    name: 'Desayuno',
    startTime: '',
    endTime: null,
    mode: 'flexible',
    required: false,
    instructions: null,
    targets: {},
    items: [],
    portionTargets: targets,
  }
}

function stateWith(targets: QePortionTarget[]): QuickEditState {
  const variant: QeVariant = {
    key: 'v1',
    id: null,
    variantKey: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [slotWith(targets)],
  }
  return { variants: [variant], visibleNotes: '' }
}

function portionsOf(state: QuickEditState): string | undefined {
  return state.variants[0]?.slots[0]?.portionTargets[0]?.portions
}

describe('BUMP_PORTION_TARGET', () => {
  it('suma 0,5 al target del grupo (default `by`)', () => {
    const next = quickEditReducer(stateWith([target('g-1', '1')]), {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
    })
    expect(portionsOf(next)).toBe('1.5')
  })

  it('respeta un `by` explicito', () => {
    const next = quickEditReducer(stateWith([target('g-1', '1')]), {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
      by: 1,
    })
    expect(portionsOf(next)).toBe('2')
  })

  it('es un no-op —MISMA referencia— si el grupo no esta en la franja', () => {
    const state = stateWith([target('g-1', '1')])
    expect(
      quickEditReducer(state, {
        type: 'BUMP_PORTION_TARGET',
        variantKey: 'v1',
        slotKey: 's1',
        exchangeGroupId: 'g-otro',
      }),
    ).toBe(state)
  })

  it('es un no-op si la franja o el dia no existen', () => {
    const state = stateWith([target('g-1', '1')])
    const otraFranja = quickEditReducer(state, {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's-otra',
      exchangeGroupId: 'g-1',
    })
    const otroDia = quickEditReducer(state, {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v-otro',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
    })
    expect(otraFranja).toBe(state)
    expect(otroDia).toBe(state)
  })

  it('satura en 99 y no lo pasa ni con un `by` grande', () => {
    const enElTope = quickEditReducer(stateWith([target('g-1', '99')]), {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
    })
    const casiEnElTope = quickEditReducer(stateWith([target('g-1', '98.5')]), {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
      by: 20,
    })
    expect(portionsOf(enElTope)).toBe(String(PORTION_MAX))
    expect(portionsOf(casiEnElTope)).toBe('99')
  })

  it('acepta el texto con coma decimal que deja el tap-to-edit', () => {
    const next = quickEditReducer(stateWith([target('g-1', '1,5')]), {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
    })
    expect(portionsOf(next)).toBe('2')
  })

  it('solo toca el target del grupo tocado', () => {
    const state = stateWith([target('g-1', '1'), target('g-2', '3')])
    const next = quickEditReducer(state, {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-2',
    })
    expect(next.variants[0]?.slots[0]?.portionTargets.map((t) => t.portions)).toEqual(['1', '3.5'])
  })
})

describe('ADD_PORTION_TARGET sigue siendo no-op sobre un grupo presente', () => {
  // Cinturon contra `unique (meal_slot_id, exchange_group_id)`: el bump NO lo reemplaza.
  it('no duplica la fila: la franja vuelve intacta (MISMA referencia)', () => {
    const state = stateWith([target('g-1', '1')])
    const next = quickEditReducer(state, {
      type: 'ADD_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      key: 't-nueva',
      group: group('g-1', 'C'),
    })
    expect(next.variants[0]?.slots[0]).toBe(state.variants[0]?.slots[0])
    expect(next.variants[0]?.slots[0]?.portionTargets).toHaveLength(1)
  })
})

describe('portionsAfterBump', () => {
  it('suma y hace snap a medios', () => {
    expect(portionsAfterBump(1, 0.5)).toBe(1.5)
    expect(portionsAfterBump(1.5, 0.5)).toBe(2)
    expect(portionsAfterBump(1, 0.3)).toBe(1.5)
    expect(portionsAfterBump(1, 0.2)).toBe(1)
  })

  it('nunca baja de 0,5 ni sube de 99', () => {
    expect(portionsAfterBump(0, 0.5)).toBe(0.5)
    expect(portionsAfterBump(0.5, -5)).toBe(0.5)
    expect(portionsAfterBump(99, 0.5)).toBe(99)
    expect(portionsAfterBump(120, 0)).toBe(99)
  })

  it('trata lo no finito como 0 en vez de propagar NaN', () => {
    expect(portionsAfterBump(Number.NaN, 0.5)).toBe(0.5)
    expect(portionsAfterBump(1, Number.NaN)).toBe(1)
  })
})

describe('formatPortionsEsCl', () => {
  it('usa coma decimal y no agrega ceros de mas', () => {
    expect(formatPortionsEsCl(1)).toBe('1')
    expect(formatPortionsEsCl(1.5)).toBe('1,5')
    expect(formatPortionsEsCl(0.5)).toBe('0,5')
    expect(formatPortionsEsCl(2.5)).toBe('2,5')
    expect(formatPortionsEsCl(99)).toBe('99')
  })

  it('devuelve vacio ante lo no finito (jamas "NaN" en pantalla)', () => {
    expect(formatPortionsEsCl(Number.NaN)).toBe('')
    expect(formatPortionsEsCl(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('BUMP_PORTION_TARGET en el tope no ensucia el borrador', () => {
  // Saturar no es editar: si el valor no cambia, el estado tiene que volver IDENTICO o el
  // borrador queda marcado como sucio (y el guardado pregunta) por un toque sin efecto.
  it('devuelve la MISMA referencia cuando ya estaba en 99', () => {
    const state = stateWith([target('g-1', '99')])
    const next = quickEditReducer(state, {
      type: 'BUMP_PORTION_TARGET',
      variantKey: 'v1',
      slotKey: 's1',
      exchangeGroupId: 'g-1',
    })
    expect(next).toBe(state)
    expect(portionsOf(next)).toBe(String(PORTION_MAX))
  })

  it('tambien con el texto que deja el tap-to-edit ("99,0", " 99 ")', () => {
    // El no-op compara NUMEROS, no cadenas: '99,0' vale 99 y reescribirlo a '99' ensuciaria el
    // borrador por un toque sin efecto (el bug que la comparacion por String() dejaba pasar).
    for (const texto of ['99,0', ' 99 ', '99.0']) {
      const state = stateWith([target('g-1', texto)])
      const next = quickEditReducer(state, {
        type: 'BUMP_PORTION_TARGET',
        variantKey: 'v1',
        slotKey: 's1',
        exchangeGroupId: 'g-1',
      })
      expect(next).toBe(state)
      expect(portionsOf(next)).toBe(texto)
    }
  })
})

describe('formatMacroEsCl', () => {
  // Contrato PROPIO: hoy imprime igual que el de porciones, y el test existe justamente para
  // que cambiar uno no arrastre al otro sin que nadie se entere.
  it('usa coma decimal y vacio ante lo no finito', () => {
    expect(formatMacroEsCl(140)).toBe('140')
    expect(formatMacroEsCl(3.5)).toBe('3,5')
    expect(formatMacroEsCl(Number.NaN)).toBe('')
  })
})

describe('copy del tope', () => {
  it('groupAtMax imprime el tope del contrato, no un 99 escrito a mano', () => {
    expect(PORTIONS_COPY.builder.groupAtMax('Desayuno')).toBe(
      `Ya está en Desayuno con ${formatPortionsEsCl(PORTION_MAX)} · es el máximo`,
    )
  })
})

describe('portionGroupBumpedPayload (DATA.md §11, evento 1)', () => {
  it('arma las 5 props exactas del contrato y ninguna mas', () => {
    const payload = portionGroupBumpedPayload('web', {
      groupCode: 'PCT',
      portionSystem: 'cl',
      from: 'picker',
      undone: false,
    })
    expect(payload).toEqual({
      surface: 'web',
      group_code: 'PCT',
      portion_system: 'cl',
      from: 'picker',
      undone: false,
    })
    expect(Object.keys(payload).sort()).toEqual([
      'from',
      'group_code',
      'portion_system',
      'surface',
      'undone',
    ])
  })

  it('no filtra ninguna cifra de salud (Ley 21.719): el nombre del evento y nada de kcal', () => {
    const payload = portionGroupBumpedPayload('rn', {
      groupCode: 'LAC',
      portionSystem: 'smae',
      from: 'stepper',
      undone: true,
    })
    expect(PORTIONS_EVENT_GROUP_BUMPED).toBe('nutrition_portion_group_bumped')
    expect(JSON.stringify(payload)).not.toMatch(/kcal|portions|gram|food|_id/i)
  })
})

describe('findPortionTargetByGroup', () => {
  it('encuentra el target por grupo y devuelve null si no esta', () => {
    const slot = stateWith([target('g-1', '1'), target('g-2', '2')]).variants[0]!.slots[0]!
    expect(findPortionTargetByGroup(slot, 'g-2')?.portions).toBe('2')
    expect(findPortionTargetByGroup(slot, 'g-3')).toBeNull()
  })
})
