import { describe, expect, it } from 'vitest'
import type { ConversionExchangeGroup, V1MealRow } from '@eva/nutrition-v2/conversion'
import {
  buildGroupLookup,
  declaredPortionsByGroupCode,
  isFailClosedBlocked,
  mealExchangeBreakdown,
  parsePriorityIds,
  renderGroupComparisonLine,
  renderMealExchangeTable,
  reorderByPriority,
} from './report'

// ---------------------------------------------------------------------------
// parsePriorityIds
// ---------------------------------------------------------------------------

describe('parsePriorityIds', () => {
  it('undefined/empty -> []', () => {
    expect(parsePriorityIds(undefined)).toEqual([])
    expect(parsePriorityIds('')).toEqual([])
  })

  it('separa por coma, recorta espacios, descarta vacios y duplicados preservando orden', () => {
    expect(parsePriorityIds(' alan-id , ali-id ,,alan-id')).toEqual(['alan-id', 'ali-id'])
  })
})

// ---------------------------------------------------------------------------
// reorderByPriority
// ---------------------------------------------------------------------------

type Item = { id: string; label: string }

describe('reorderByPriority', () => {
  const items: Item[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
    { id: 'd', label: 'D' },
  ]

  it('sin prioridades: copia en el mismo orden (no muta la fuente)', () => {
    const out = reorderByPriority(items, (i) => i.id, [])
    expect(out).toEqual(items)
    expect(out).not.toBe(items)
  })

  it('pone los priorizados primero, en el orden del flag; el resto conserva su orden', () => {
    const out = reorderByPriority(items, (i) => i.id, ['c', 'a'])
    expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('id de prioridad que no matchea ningun item: se ignora sin romper', () => {
    const out = reorderByPriority(items, (i) => i.id, ['zzz', 'b'])
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('varios items con el mismo id de prioridad quedan todos al frente, juntos', () => {
    const dup: Item[] = [
      { id: 'a', label: 'A1' },
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A2' },
    ]
    const out = reorderByPriority(dup, (i) => i.id, ['a'])
    expect(out.map((i) => i.label)).toEqual(['A1', 'A2', 'B'])
  })
})

// ---------------------------------------------------------------------------
// isFailClosedBlocked
// ---------------------------------------------------------------------------

describe('isFailClosedBlocked', () => {
  it('sin no-mapeables: nunca bloquea', () => {
    expect(isFailClosedBlocked(0, false)).toBe(false)
    expect(isFailClosedBlocked(0, true)).toBe(false)
  })

  it('con no-mapeables y sin override: bloquea (default fail-closed)', () => {
    expect(isFailClosedBlocked(1, false)).toBe(true)
  })

  it('con no-mapeables y override explicito: no bloquea', () => {
    expect(isFailClosedBlocked(3, true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildGroupLookup / mealExchangeBreakdown / declaredPortionsByGroupCode
// ---------------------------------------------------------------------------

const GROUP_C: ConversionExchangeGroup = {
  id: 'grp-c',
  code: 'C',
  name: 'Cereales',
  refCalories: 70,
  refProteinG: 2,
  refCarbsG: 15,
  refFatsG: 0,
  composedOf: null,
  macrosConfirmed: true,
  isSystem: true,
}
const GROUP_LEG: ConversionExchangeGroup = {
  id: 'grp-leg',
  code: 'LEG',
  name: 'Leguminosas',
  refCalories: 120,
  refProteinG: 8,
  refCarbsG: 15,
  refFatsG: 1,
  composedOf: [{ code: 'P', portions: 1 }, { code: 'C', portions: 1 }],
  macrosConfirmed: true,
  isSystem: true,
}

function meal(overrides: Partial<V1MealRow> & Pick<V1MealRow, 'id' | 'name'>): V1MealRow {
  return {
    description: null,
    order_index: 0,
    day_of_week: null,
    items: [],
    exchangeTargets: [],
    ...overrides,
  }
}

describe('buildGroupLookup', () => {
  it('indexa por id -> {code, name}', () => {
    const lookup = buildGroupLookup([GROUP_C, GROUP_LEG])
    expect(lookup.get('grp-c')).toEqual({ code: 'C', name: 'Cereales' })
    expect(lookup.get('grp-leg')).toEqual({ code: 'LEG', name: 'Leguminosas' })
    expect(lookup.get('nope')).toBeUndefined()
  })
})

describe('mealExchangeBreakdown', () => {
  it('sin exchangeTargets en ninguna comida: []', () => {
    const meals = [meal({ id: 'm1', name: 'Desayuno' }), meal({ id: 'm2', name: 'Almuerzo' })]
    expect(mealExchangeBreakdown(meals, buildGroupLookup([]), [])).toEqual([])
  })

  it('target con grupo resoluble y sin entrada en unmapped -> mapped=true', () => {
    const meals = [
      meal({
        id: 'm1',
        name: 'Almuerzo',
        exchangeTargets: [{ id: 't1', exchange_group_id: 'grp-c', portions: 2, notes: null }],
      }),
    ]
    const rows = mealExchangeBreakdown(meals, buildGroupLookup([GROUP_C]), [])
    expect(rows).toEqual([
      {
        mealId: 'm1',
        mealName: 'Almuerzo',
        groupId: 'grp-c',
        groupCode: 'C',
        groupName: 'Cereales',
        portionsV1: 2,
        mapped: true,
      },
    ])
  })

  it('target cuyo group_id no existe en el catalogo: groupCode/name fallback + cruza por group_id', () => {
    const meals = [
      meal({
        id: 'm1',
        name: 'Cena',
        exchangeTargets: [{ id: 't1', exchange_group_id: 'grp-missing', portions: 1, notes: null }],
      }),
    ]
    const unmapped = ['meal=m1 group_id=grp-missing']
    const rows = mealExchangeBreakdown(meals, buildGroupLookup([GROUP_C]), unmapped)
    expect(rows).toHaveLength(1)
    expect(rows[0].mapped).toBe(false)
    expect(rows[0].groupCode).toContain('desconocido')
  })

  it('target con grilla 0,5 invalida (mensaje con portions=): mapped=false', () => {
    const meals = [
      meal({
        id: 'm1',
        name: 'Colacion',
        exchangeTargets: [{ id: 't1', exchange_group_id: 'grp-c', portions: 0.3, notes: null }],
      }),
    ]
    const unmapped = ['meal=m1 group_id=grp-c portions=0.3']
    const rows = mealExchangeBreakdown(meals, buildGroupLookup([GROUP_C]), unmapped)
    expect(rows[0].mapped).toBe(false)
  })

  it('target con base de composed_of sin resolver (mensaje por codigo, no por id): mapped=false', () => {
    const meals = [
      meal({
        id: 'm1',
        name: 'Almuerzo',
        exchangeTargets: [{ id: 't1', exchange_group_id: 'grp-leg', portions: 1, notes: null }],
      }),
    ]
    // LEG existe en el catalogo, pero su base 'P' no -> conversion.ts emite `group=LEG base=P`.
    const unmapped = ['meal=m1 group=LEG base=P']
    const rows = mealExchangeBreakdown(meals, buildGroupLookup([GROUP_LEG]), unmapped)
    expect(rows[0].mapped).toBe(false)
  })

  it('no confunde comidas distintas con el mismo grupo (el prefijo incluye meal=<id>)', () => {
    const meals = [
      meal({
        id: 'm1',
        name: 'Desayuno',
        exchangeTargets: [{ id: 't1', exchange_group_id: 'grp-c', portions: 1, notes: null }],
      }),
      meal({
        id: 'm2',
        name: 'Almuerzo',
        exchangeTargets: [{ id: 't2', exchange_group_id: 'grp-c', portions: 2, notes: null }],
      }),
    ]
    // Solo la comida m2 esta no-mapeada.
    const unmapped = ['meal=m2 group_id=grp-c']
    const rows = mealExchangeBreakdown(meals, buildGroupLookup([GROUP_C]), unmapped)
    const byMeal = new Map(rows.map((r) => [r.mealId, r.mapped]))
    expect(byMeal.get('m1')).toBe(true)
    expect(byMeal.get('m2')).toBe(false)
  })
})

describe('declaredPortionsByGroupCode', () => {
  it('suma porciones V1 por codigo, incluye las no-mapeables', () => {
    const rows = [
      { mealId: 'm1', mealName: 'A', groupId: 'g1', groupCode: 'C', groupName: 'Cereales', portionsV1: 2, mapped: true },
      { mealId: 'm2', mealName: 'B', groupId: 'g1', groupCode: 'C', groupName: 'Cereales', portionsV1: 1, mapped: false },
      { mealId: 'm2', mealName: 'B', groupId: 'g2', groupCode: 'P', groupName: 'Proteinas', portionsV1: 1.5, mapped: true },
    ]
    expect(declaredPortionsByGroupCode(rows)).toEqual({ C: 3, P: 1.5 })
  })

  it('descarta portionsV1 no finito (NaN) sin reventar', () => {
    const rows = [
      { mealId: 'm1', mealName: 'A', groupId: 'g1', groupCode: 'C', groupName: 'Cereales', portionsV1: Number.NaN, mapped: false },
    ]
    expect(declaredPortionsByGroupCode(rows)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Render Markdown
// ---------------------------------------------------------------------------

describe('renderMealExchangeTable', () => {
  it('[] -> string vacio', () => {
    expect(renderMealExchangeTable([])).toBe('')
  })

  it('renderiza header + una fila por target, con estado mapeado/NO MAPEABLE', () => {
    const md = renderMealExchangeTable([
      { mealId: 'm1', mealName: 'Almuerzo', groupId: 'g1', groupCode: 'C', groupName: 'Cereales', portionsV1: 2, mapped: true },
      { mealId: 'm1', mealName: 'Almuerzo', groupId: 'g2', groupCode: 'LEG', groupName: 'Leguminosas', portionsV1: 1, mapped: false },
    ])
    expect(md).toContain('| Comida | Grupo | Porciones (V1) | Estado |')
    expect(md).toContain('| Almuerzo | C (Cereales) | 2 | mapeado |')
    expect(md).toContain('| Almuerzo | LEG (Leguminosas) | 1 | NO MAPEABLE |')
  })
})

describe('renderGroupComparisonLine', () => {
  it('sin grupos en ninguno de los dos lados: string vacio', () => {
    expect(renderGroupComparisonLine({}, {})).toBe('')
  })

  it('in==out: sin marca de drift', () => {
    const line = renderGroupComparisonLine({ C: 2 }, { C: 2 })
    expect(line).toBe('C: in=2 out=2')
  })

  it('in!=out (target no mapeable resto la salida): marca drift', () => {
    const line = renderGroupComparisonLine({ C: 3 }, { C: 2 })
    expect(line).toBe('C: in=3 out=2 ⚠ drift')
  })

  it('grupo presente solo del lado in (0 emitido) o solo del lado out: se muestra igual', () => {
    const line = renderGroupComparisonLine({ C: 2, LEG: 1 }, { C: 2 })
    expect(line).toBe('C: in=2 out=2 · LEG: in=1 out=0 ⚠ drift')
  })
})
