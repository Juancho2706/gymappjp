import { describe, expect, it } from 'vitest'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { assembleDraft, type BuilderState } from '../_lib/draft-builder'
import {
  addPortionGroup,
  attachPortionsAndValidate,
  derivePortionTotals,
  esDecimal,
  formatPortionsEs,
  hasAnyPortions,
  parsePortionsInput,
  removePortionGroup,
  setPortionValue,
  snapPortions,
  sortGroupsForPicker,
  stepPortionValue,
  type PortionsBySlot,
} from './portions-state'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ID_C = 'a0000000-0000-4000-8000-000000000001'
const ID_P = 'a0000000-0000-4000-8000-000000000002'
const ID_LEG = 'a0000000-0000-4000-8000-000000000003'
const ID_CUSTOM = 'a0000000-0000-4000-8000-000000000009'

function group(over: Partial<ExchangeGroup>): ExchangeGroup {
  return {
    id: ID_C,
    slug: 'cereales',
    code: 'C',
    name: 'Cereales',
    coachId: null,
    teamId: null,
    isSystem: true,
    refCalories: 70,
    refProteinG: 2,
    refCarbsG: 15,
    refFatsG: 0,
    color: null,
    sortOrder: 1,
    composedOf: null,
    macrosConfirmed: true,
    ...over,
  }
}

const GROUPS: ExchangeGroup[] = [
  group({}),
  group({ id: ID_P, slug: 'proteinas', code: 'P', name: 'Proteinas', refCalories: 75, refProteinG: 11, refCarbsG: 0, refFatsG: 5, sortOrder: 2 }),
  group({
    id: ID_LEG,
    slug: 'leguminosas',
    code: 'LEG',
    name: 'Leguminosas',
    // refs propios irrelevantes: la expansión usa los grupos base P y C.
    refCalories: 999,
    refProteinG: 99,
    refCarbsG: 99,
    refFatsG: 99,
    sortOrder: 9,
    composedOf: [
      { code: 'P', portions: 1 },
      { code: 'C', portions: 1 },
    ],
  }),
]

describe('snapPortions / parsePortionsInput', () => {
  it('ajusta al múltiplo de 0,5 dentro de [0,5; 99]', () => {
    expect(snapPortions(0.4)).toBe(0.5)
    expect(snapPortions(1.3)).toBe(1.5)
    expect(snapPortions(1.2)).toBe(1)
    expect(snapPortions(200)).toBe(99)
    expect(snapPortions(0)).toBe(0.5)
  })

  it('acepta coma decimal es-CL y rechaza basura', () => {
    expect(parsePortionsInput('1,5')).toBe(1.5)
    expect(parsePortionsInput('2')).toBe(2)
    expect(parsePortionsInput(' 3.5 ')).toBe(3.5)
    expect(parsePortionsInput('abc')).toBeNull()
    expect(parsePortionsInput('')).toBeNull()
    expect(parsePortionsInput('-1')).toBeNull()
    expect(parsePortionsInput('0')).toBeNull()
  })
})

describe('formato es-CL', () => {
  it('formatPortionsEs usa coma decimal', () => {
    expect(formatPortionsEs(1.5)).toBe('1,5')
    expect(formatPortionsEs(2)).toBe('2')
  })

  it('esDecimal solo convierte decimales, no otros puntos', () => {
    expect(esDecimal('2C · 1.5V')).toBe('2C · 1,5V')
    expect(esDecimal('2C')).toBe('2C')
  })
})

describe('operaciones del mapa slot→targets', () => {
  it('agrega con 1 porción por defecto y dedupea por grupo', () => {
    let map: PortionsBySlot = {}
    map = addPortionGroup(map, 's1', ID_C)
    expect(map.s1).toEqual([{ exchangeGroupId: ID_C, portions: 1 }])
    const again = addPortionGroup(map, 's1', ID_C)
    expect(again).toBe(map) // no-op: UNIQUE franja+grupo
  })

  it('step ±0,5 con clamp inferior 0,5 y set con snap', () => {
    let map: PortionsBySlot = { s1: [{ exchangeGroupId: ID_C, portions: 1 }] }
    map = stepPortionValue(map, 's1', ID_C, 1)
    expect(map.s1[0].portions).toBe(1.5)
    map = stepPortionValue(map, 's1', ID_C, -1)
    map = stepPortionValue(map, 's1', ID_C, -1)
    map = stepPortionValue(map, 's1', ID_C, -1)
    expect(map.s1[0].portions).toBe(0.5) // nunca bajo el mínimo
    map = setPortionValue(map, 's1', ID_C, 4.3)
    expect(map.s1[0].portions).toBe(4.5)
  })

  it('remueve el grupo de la franja', () => {
    let map: PortionsBySlot = { s1: [{ exchangeGroupId: ID_C, portions: 2 }] }
    map = removePortionGroup(map, 's1', ID_C)
    expect(map.s1).toEqual([])
  })

  it('hasAnyPortions ignora claves de franjas borradas', () => {
    const map: PortionsBySlot = { borrada: [{ exchangeGroupId: ID_C, portions: 2 }] }
    expect(hasAnyPortions(map, ['s1', 's2'])).toBe(false)
    expect(hasAnyPortions(map, ['borrada'])).toBe(true)
  })
})

describe('sortGroupsForPicker', () => {
  it('9 system primero (sortOrder), custom del coach después', () => {
    const custom = group({ id: ID_CUSTOM, code: 'X', name: 'Mi grupo', isSystem: false, sortOrder: 0 })
    const sorted = sortGroupsForPicker([custom, GROUPS[2], GROUPS[0], GROUPS[1]])
    expect(sorted.map((g) => g.code)).toEqual(['C', 'P', 'LEG', 'X'])
  })
})

describe('derivePortionTotals (paridad engine, expansión composed_of)', () => {
  it('2C + 1LEG = 3C + 1P vía grupos base', () => {
    const map: PortionsBySlot = {
      s1: [{ exchangeGroupId: ID_C, portions: 2 }],
      s2: [{ exchangeGroupId: ID_LEG, portions: 1 }],
    }
    const totals = derivePortionTotals(['s1', 's2'], map, GROUPS)
    expect(totals).toEqual({ calories: 285, proteinG: 17, carbsG: 45, fatsG: 5 })
  })
})

function builderState(): BuilderState {
  return {
    step: 3,
    strategy: 'structured',
    planName: 'Plan test',
    effectiveFrom: '2026-07-20',
    targets: { calories: '2000', proteinG: '', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    slots: [
      { key: 's1', name: 'Desayuno', startTime: '', items: [] },
      { key: 's2', name: 'Almuerzo', startTime: '', items: [] },
    ],
  }
}

describe('attachPortionsAndValidate', () => {
  it('sin porciones devuelve el MISMO draft (byte-idéntico, SPEC R1/Q1)', () => {
    const draft = assembleDraft(builderState(), { clientId: CLIENT_ID })
    const result = attachPortionsAndValidate(draft, ['s1', 's2'], {})
    expect(result).toBe(draft)
  })

  it('inyecta exchangeTargets solo en las franjas con porciones, con orderIndex', () => {
    const draft = assembleDraft(builderState(), { clientId: CLIENT_ID })
    const map: PortionsBySlot = {
      s1: [
        { exchangeGroupId: ID_C, portions: 2 },
        { exchangeGroupId: ID_P, portions: 1.5 },
      ],
    }
    const result = attachPortionsAndValidate(draft, ['s1', 's2'], map)
    const [slot1, slot2] = result.dayVariants[0].mealSlots
    expect(slot1.exchangeTargets).toEqual([
      { exchangeGroupId: ID_C, portions: 2, notes: null, orderIndex: 0 },
      { exchangeGroupId: ID_P, portions: 1.5, notes: null, orderIndex: 1 },
    ])
    // La franja sin porciones queda EXACTAMENTE igual (sin la clave).
    expect('exchangeTargets' in slot2).toBe(false)
  })

  it('ignora claves huérfanas de franjas borradas', () => {
    const draft = assembleDraft(builderState(), { clientId: CLIENT_ID })
    const map: PortionsBySlot = { borrada: [{ exchangeGroupId: ID_C, portions: 2 }] }
    const result = attachPortionsAndValidate(draft, ['s1', 's2'], map)
    expect(result).toBe(draft)
  })
})
