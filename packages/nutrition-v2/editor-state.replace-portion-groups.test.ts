import { describe, expect, it } from 'vitest'
import {
  quickEditReducer,
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
  type QeVariant,
  type QuickEditState,
} from './editor-state'
import { convertPortionsToCl } from './exchange-conversion'

/**
 * W3.4 — `REPLACE_PORTION_GROUPS` aplica el resultado de la conversion al BORRADOR en UN
 * solo dispatch (T-05: nada se publica).
 *
 * Lo que este test guarda es el ORDEN (R-08). El bug que evita es concreto: armar la franja
 * como `[...convertidos, ...intactos]` empuja todo lo convertido al principio, o sea la
 * conversion REORDENA la franja sin decirlo, justo en la pantalla que prometia mostrar el
 * antes y el despues.
 */

function group(
  groupCode: string,
  ref: readonly [number, number, number, number],
  extra: Partial<QePortionGroup> = {},
): QePortionGroup {
  const [calories, proteinG, carbsG, fatsG] = ref
  return {
    exchangeGroupId: `id-${groupCode}`,
    groupCode,
    groupName: `Grupo ${groupCode}`,
    color: null,
    ref: { calories, proteinG, carbsG, fatsG },
    composedOf: null,
    macrosConfirmed: true,
    ...extra,
  }
}

const CATALOG: QePortionGroup[] = [
  group('C', [70, 2, 15, 0], { portionSystem: 'smae' }),
  group('ARL', [45, 0, 0, 5], { portionSystem: 'smae' }),
  group('G', [45, 0, 0, 5], { portionSystem: 'smae' }),
  group('PCT', [140, 3, 30, 1], { portionSystem: 'cl' }),
  group('AG', [45, 0, 0, 5], { portionSystem: 'cl' }),
  // Grupo PROPIO del coach que no calza con ninguno: se queda EN SU LUGAR.
  group('PPRO', [422, 90, 5, 5], { groupName: 'Proteinapro' }),
]

function byCode(code: string): QePortionGroup {
  const found = CATALOG.find((candidate) => candidate.groupCode === code)
  if (found == null) throw new Error(`fixture sin grupo ${code}`)
  return found
}

function target(code: string, portions: string, notes: string | null = null): QePortionTarget {
  const source = byCode(code)
  return {
    key: `t-${code}`,
    id: `row-${code}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes,
  }
}

function slotWith(portionTargets: QePortionTarget[]): QeSlot {
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
    portionTargets,
  }
}

function stateWith(portionTargets: QePortionTarget[]): QuickEditState {
  const variant: QeVariant = {
    key: 'v1',
    id: null,
    variantKey: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [slotWith(portionTargets)],
  }
  return { variants: [variant], visibleNotes: 'Toma agua' }
}

function applyConversion(state: QuickEditState): QuickEditState {
  const result = convertPortionsToCl({
    variants: state.variants,
    catalog: CATALOG,
    coachSystem: 'cl',
  })
  return quickEditReducer(state, { type: 'REPLACE_PORTION_GROUPS', variants: result.variants })
}

function targetsOf(state: QuickEditState): QePortionTarget[] {
  return state.variants[0].slots[0].portionTargets
}

describe('REPLACE_PORTION_GROUPS — la conversion entra al borrador en un solo dispatch', () => {
  it('conserva el orden de la franja: el custom se queda en su lugar y AG nace donde estaba ARL', () => {
    const previo = stateWith([
      target('PPRO', '1'),
      target('ARL', '1'),
      target('C', '2'),
      target('G', '1'),
    ])

    const next = applyConversion(previo)

    expect(targetsOf(next).map((row) => row.key)).toEqual([
      't-PPRO', // no convertible: NO se va al final
      'cl:s1:AG', // colapso ARL + G, en la posicion del PRIMERO de los dos
      'cl:s1:PCT',
    ])
    expect(targetsOf(next).map((row) => row.groupCode)).toEqual(['PPRO', 'AG', 'PCT'])
    // Un solo target por grupo: `unique (meal_slot_id, exchange_group_id)` no se viola.
    expect(new Set(targetsOf(next).map((row) => row.exchangeGroupId)).size).toBe(3)
    expect(targetsOf(next)[1].portions).toBe('2')
  })

  it('la nota se conserva, y con dos origenes colapsados se concatena', () => {
    const previo = stateWith([
      target('ARL', '1', 'Palta'),
      target('G', '1', 'Aceite de oliva'),
      target('C', '2', 'Pan integral'),
    ])

    const next = applyConversion(previo)

    expect(targetsOf(next).map((row) => row.notes)).toEqual([
      'Palta · Aceite de oliva',
      'Pan integral',
    ])
  })

  it('el estado previo NO se muta y el resto del estado viaja intacto', () => {
    const previo = stateWith([target('C', '2'), target('PPRO', '1')])
    const copiaProfunda = structuredClone(previo)

    const next = applyConversion(previo)

    expect(previo).toEqual(copiaProfunda)
    expect(next).not.toBe(previo)
    expect(next.visibleNotes).toBe('Toma agua')
    expect(next.variants[0].label).toBe('Todos los días')
    expect(next.variants[0].slots[0].name).toBe('Desayuno')
  })

  it('las franjas que el resultado no menciona quedan EXACTAMENTE como estaban', () => {
    const previo = stateWith([target('C', '2')])
    const otra = { ...slotWith([target('PPRO', '1')]), key: 's2', name: 'Almuerzo' }
    const conDos: QuickEditState = {
      ...previo,
      variants: [{ ...previo.variants[0], slots: [previo.variants[0].slots[0], otra] }],
    }

    const next = quickEditReducer(conDos, {
      type: 'REPLACE_PORTION_GROUPS',
      variants: [
        {
          ...conDos.variants[0],
          slots: [{ ...conDos.variants[0].slots[0], portionTargets: [target('PCT', '1')] }],
        },
      ],
    })

    expect(next.variants[0].slots[0].portionTargets.map((row) => row.groupCode)).toEqual(['PCT'])
    expect(next.variants[0].slots[1]).toBe(otra)
  })

  it('sin variantes en el payload es un no-op que devuelve el MISMO estado', () => {
    const previo = stateWith([target('C', '2')])
    expect(quickEditReducer(previo, { type: 'REPLACE_PORTION_GROUPS', variants: [] })).toBe(previo)
  })
})
