// Porciones V2 en el quick-edit RN (T1.4) — logica PURA de
// apps/mobile/components/nutrition-v2/quick-edit/portions-state.ts: hidratacion desde
// el read model, stepper 0,5 (SPEC R2), reducer, contador (se suma a la barra "N
// cambios"), inyeccion en el draft canonico (capa invisible => draft identico) y filas
// de insert con snapshot congelado (SPEC R2/A1/B5 — jamas snapshot NULL).
//
// El modulo bajo prueba solo importa TIPOS de la lib RN y del paquete: cero deps de
// runtime react-native, se testea directo.
import { describe, expect, it } from 'vitest'
import type { NutritionPlanDraft, NutritionPlanReadModel } from '@eva/nutrition-v2'
import type { QuickEditState } from '../apps/mobile/lib/nutrition-v2-quick-edit'
import {
  EMPTY_PORTIONS_STATE,
  PORTION_MAX,
  buildPortionTargetInsertRows,
  countPortionsChanges,
  createPortionTarget,
  formatPortionsEsCl,
  hydrateQuickEditPortions,
  injectExchangeTargetsIntoDraft,
  portionsReducer,
  stepPortions,
  type QuickEditPortionGroup,
  type QuickEditPortionsState,
} from '../apps/mobile/components/nutrition-v2/quick-edit/portions-state'

// ---------------------------------------------------------------------------
// Fixtures minimos (solo los campos que la logica lee; cast controlado)
// ---------------------------------------------------------------------------

const REF_C = { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0.5 }
const REF_LEG = { calories: 145, proteinG: 9, carbsG: 16, fatsG: 1.5 }

function readTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    exchangeGroupId: 'b0000000-0000-4000-8000-000000000001',
    groupCode: 'C',
    groupName: 'Cereales',
    color: '#F59E0B',
    portions: 2,
    notes: null,
    orderIndex: 0,
    ref: REF_C,
    composedOf: null,
    macrosConfirmed: true,
    ...overrides,
  }
}

const LEG_TARGET = readTarget({
  id: 'a0000000-0000-4000-8000-000000000002',
  exchangeGroupId: 'b0000000-0000-4000-8000-000000000002',
  groupCode: 'LEG',
  groupName: 'Leguminosas',
  color: null,
  portions: 1.5,
  composedOf: [
    { code: 'P', portions: 1, ref: { calories: 75, proteinG: 11, carbsG: 1, fatsG: 3 } },
    { code: 'C', portions: 1, ref: REF_C },
  ],
  macrosConfirmed: false,
})

function planModelWith(targetsBySlot: Record<string, unknown>[][]): NutritionPlanReadModel {
  return {
    dayVariants: [
      {
        mealSlots: targetsBySlot.map((exchangeTargets, i) => ({
          id: `slot-id-${i}`,
          exchangeTargets: exchangeTargets.length > 0 ? exchangeTargets : undefined,
        })),
      },
    ],
  } as unknown as NutritionPlanReadModel
}

function editStateWithSlotKeys(slotKeys: string[]): QuickEditState {
  return {
    variants: [{ key: 'v1', slots: slotKeys.map((key) => ({ key })) }],
  } as unknown as QuickEditState
}

const GROUP_C: QuickEditPortionGroup = {
  exchangeGroupId: 'b0000000-0000-4000-8000-000000000001',
  groupCode: 'C',
  groupName: 'Cereales',
  color: '#F59E0B',
  ref: REF_C,
  composedOf: null,
  macrosConfirmed: true,
  sortOrder: 0,
}

const GROUP_LEG: QuickEditPortionGroup = {
  exchangeGroupId: 'b0000000-0000-4000-8000-000000000002',
  groupCode: 'LEG',
  groupName: 'Leguminosas',
  color: null,
  ref: REF_LEG,
  composedOf: LEG_TARGET.composedOf as QuickEditPortionGroup['composedOf'],
  macrosConfirmed: false,
  sortOrder: 1,
}

// ---------------------------------------------------------------------------

describe('hydrateQuickEditPortions', () => {
  it('plan sin porciones => estado vacio y cero grupos (capa invisible)', () => {
    const { initial, groups } = hydrateQuickEditPortions(
      planModelWith([[], []]),
      editStateWithSlotKeys(['s1', 's2']),
    )
    expect(initial.bySlot).toEqual({})
    expect(groups).toEqual([])
  })

  it('hidrata targets por slot.key del estado y colecciona el dict ordenado por codigo', () => {
    const { initial, groups } = hydrateQuickEditPortions(
      planModelWith([[readTarget(), LEG_TARGET], []]),
      editStateWithSlotKeys(['s1', 's2']),
    )
    expect(Object.keys(initial.bySlot)).toEqual(['s1'])
    expect(initial.bySlot.s1).toHaveLength(2)
    expect(initial.bySlot.s1[0]).toMatchObject({
      key: 'a0000000-0000-4000-8000-000000000001',
      id: 'a0000000-0000-4000-8000-000000000001',
      groupCode: 'C',
      portions: 2,
      notes: '',
    })
    // Dict: unico por grupo, orden por codigo, sortOrder = indice (fallback de color).
    expect(groups.map((g) => g.groupCode)).toEqual(['C', 'LEG'])
    expect(groups.map((g) => g.sortOrder)).toEqual([0, 1])
    expect(groups[1].composedOf).toHaveLength(2)
  })
})

describe('stepPortions / formatPortionsEsCl', () => {
  it('paso 0,5 con clamp [0,5..99]', () => {
    expect(stepPortions(1, 1)).toBe(1.5)
    expect(stepPortions(1.5, -1)).toBe(1)
    // Nunca baja de 0,5: devuelve el actual (la baja del grupo es eliminar).
    expect(stepPortions(0.5, -1)).toBe(0.5)
    expect(stepPortions(PORTION_MAX, 1)).toBe(PORTION_MAX)
  })

  it('display es-CL con coma decimal', () => {
    expect(formatPortionsEsCl(1.5)).toBe('1,5')
    expect(formatPortionsEsCl(2)).toBe('2')
    expect(formatPortionsEsCl(0.5)).toBe('0,5')
  })
})

describe('portionsReducer', () => {
  const base: QuickEditPortionsState = {
    bySlot: { s1: [createPortionTarget('k1', GROUP_C)] },
  }

  it('ADD_TARGET agrega en 1 porcion y respeta unicidad por grupo (cinturon)', () => {
    const added = portionsReducer(base, { type: 'ADD_TARGET', slotKey: 's1', key: 'k2', group: GROUP_LEG })
    expect(added.bySlot.s1.map((t) => t.groupCode)).toEqual(['C', 'LEG'])
    expect(added.bySlot.s1[1]).toMatchObject({ id: null, portions: 1, notes: '' })
    // Grupo ya presente: no duplica.
    const dup = portionsReducer(added, { type: 'ADD_TARGET', slotKey: 's1', key: 'k3', group: GROUP_C })
    expect(dup.bySlot.s1).toHaveLength(2)
  })

  it('STEP_PORTIONS y SET_NOTES tocan solo el target indicado', () => {
    const stepped = portionsReducer(base, { type: 'STEP_PORTIONS', slotKey: 's1', targetKey: 'k1', direction: 1 })
    expect(stepped.bySlot.s1[0].portions).toBe(1.5)
    const noted = portionsReducer(stepped, { type: 'SET_NOTES', slotKey: 's1', targetKey: 'k1', value: 'integral' })
    expect(noted.bySlot.s1[0].notes).toBe('integral')
  })

  it('REMOVE_TARGET + RESTORE_TARGET hacen round-trip en el mismo indice', () => {
    const withTwo = portionsReducer(base, { type: 'ADD_TARGET', slotKey: 's1', key: 'k2', group: GROUP_LEG })
    const removedTarget = withTwo.bySlot.s1[0]
    const removed = portionsReducer(withTwo, { type: 'REMOVE_TARGET', slotKey: 's1', targetKey: 'k1' })
    expect(removed.bySlot.s1.map((t) => t.key)).toEqual(['k2'])
    const restored = portionsReducer(removed, {
      type: 'RESTORE_TARGET',
      slotKey: 's1',
      index: 0,
      target: removedTarget,
    })
    expect(restored.bySlot.s1.map((t) => t.key)).toEqual(['k1', 'k2'])
  })
})

describe('countPortionsChanges', () => {
  const baseline: QuickEditPortionsState = {
    bySlot: { s1: [{ ...createPortionTarget('k1', GROUP_C), id: 'row-1', portions: 2 }] },
  }
  const live = new Set(['s1', 's2'])

  it('sin ediciones = 0 (y notas "" equivale a null)', () => {
    const current: QuickEditPortionsState = {
      bySlot: { s1: [{ ...baseline.bySlot.s1[0], notes: '' }] },
    }
    expect(countPortionsChanges(baseline, current, live)).toBe(0)
  })

  it('portions o notes distinto = 1; alta = 1; baja = 1', () => {
    const changed: QuickEditPortionsState = {
      bySlot: { s1: [{ ...baseline.bySlot.s1[0], portions: 2.5 }] },
    }
    expect(countPortionsChanges(baseline, changed, live)).toBe(1)

    const added = portionsReducer(baseline, { type: 'ADD_TARGET', slotKey: 's2', key: 'k9', group: GROUP_LEG })
    expect(countPortionsChanges(baseline, added, live)).toBe(1)

    expect(countPortionsChanges(baseline, EMPTY_PORTIONS_STATE, live)).toBe(1)
  })

  it('franja eliminada del estado principal no cuenta sus targets', () => {
    expect(countPortionsChanges(baseline, EMPTY_PORTIONS_STATE, new Set(['s2']))).toBe(0)
  })
})

describe('injectExchangeTargetsIntoDraft', () => {
  function draftWithSlots(slotCount: number): NutritionPlanDraft {
    return {
      planId: 'plan-1',
      dayVariants: [
        {
          key: 'v1',
          mealSlots: Array.from({ length: slotCount }, (_, i) => ({
            code: `slot-${i}`,
            items: [],
          })),
        },
      ],
    } as unknown as NutritionPlanDraft
  }

  it('estado vacio => slots identicos, SIN la clave exchangeTargets (plan sin porciones)', () => {
    const draft = draftWithSlots(2)
    const out = injectExchangeTargetsIntoDraft(draft, editStateWithSlotKeys(['s1', 's2']), EMPTY_PORTIONS_STATE)
    expect(out).toEqual(draft)
    expect('exchangeTargets' in out.dayVariants[0].mealSlots[0]).toBe(false)
  })

  it('inyecta por indice paralelo con id conservado, notes normalizado y orderIndex', () => {
    const draft = draftWithSlots(2)
    const portions: QuickEditPortionsState = {
      bySlot: {
        s2: [
          { ...createPortionTarget('k1', GROUP_C), id: 'row-1', portions: 2, notes: '  ' },
          { ...createPortionTarget('k2', GROUP_LEG), notes: ' media al almuerzo ' },
        ],
      },
    }
    const out = injectExchangeTargetsIntoDraft(draft, editStateWithSlotKeys(['s1', 's2']), portions)
    expect('exchangeTargets' in out.dayVariants[0].mealSlots[0]).toBe(false)
    expect(out.dayVariants[0].mealSlots[1].exchangeTargets).toEqual([
      {
        id: 'row-1',
        exchangeGroupId: GROUP_C.exchangeGroupId,
        portions: 2,
        notes: null,
        orderIndex: 0,
      },
      {
        exchangeGroupId: GROUP_LEG.exchangeGroupId,
        portions: 1,
        notes: 'media al almuerzo',
        orderIndex: 1,
      },
    ])
  })
})

describe('buildPortionTargetInsertRows', () => {
  const groupsById = new Map([
    [GROUP_C.exchangeGroupId, GROUP_C],
    [GROUP_LEG.exchangeGroupId, GROUP_LEG],
  ])

  it('congela snapshot por valor desde el dict (composed_of enriquecido, copia profunda)', () => {
    const rows = buildPortionTargetInsertRows({
      versionId: 'ver-1',
      mealSlotId: 'ms-1',
      targets: [
        { exchangeGroupId: GROUP_LEG.exchangeGroupId, portions: 1.5, notes: null, orderIndex: 0 },
      ],
      groupsById,
    })
    expect(rows).not.toBeNull()
    expect(rows![0]).toMatchObject({
      version_id: 'ver-1',
      meal_slot_id: 'ms-1',
      exchange_group_id: GROUP_LEG.exchangeGroupId,
      portions: 1.5,
      order_index: 0,
      snapshot_group_code: 'LEG',
      snapshot_group_name: 'Leguminosas',
      snapshot_ref_calories: REF_LEG.calories,
      snapshot_macros_confirmed: false,
    })
    expect(rows![0].snapshot_composed_of).toEqual(GROUP_LEG.composedOf)
    // Copia profunda: mutar la fila no toca el dict congelado del plan.
    expect(rows![0].snapshot_composed_of).not.toBe(GROUP_LEG.composedOf)
    expect(rows![0].snapshot_composed_of![0].ref).not.toBe(GROUP_LEG.composedOf![0].ref)
  })

  it('grupo no resolvible => null (el caller corta el publish; jamas snapshot NULL)', () => {
    const rows = buildPortionTargetInsertRows({
      versionId: 'ver-1',
      mealSlotId: 'ms-1',
      targets: [
        { exchangeGroupId: 'c0000000-0000-4000-8000-00000000dead', portions: 1, notes: null, orderIndex: 0 },
      ],
      groupsById,
    })
    expect(rows).toBeNull()
  })
})
