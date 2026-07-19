import { describe, it, expect } from 'vitest'
import { GROUP_REFS } from '../../scripts/nutrition-portions/heuristics'
import {
  verifyGroupRefs,
  systemGroupIdByCode,
  parseTiersFlag,
  filterForApply,
  buildUpdatePayload,
  buildBackupRow,
  classifyDataset,
  summarizeDataset,
  stampDate,
  backupTableName,
  backupFileName,
  type ExchangeGroupDbRow,
  type FoodDbRow,
  type ClassifiedRow,
} from '../../scripts/nutrition-portions/classify-lib'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** DB rows que ESPEJAN exactamente el fixture GROUP_REFS (caso "todo coincide"). */
function dbGroupsMatchingFixture(): ExchangeGroupDbRow[] {
  return GROUP_REFS.map((g, i) => ({
    id: `id-${g.code}-${i}`,
    code: g.code,
    name: g.name,
    is_system: true,
    // PostgREST devuelve numeric como STRING: se prueba la coercion.
    ref_calories: String(g.refCalories),
    ref_protein_g: String(g.refProteinG),
    ref_carbs_g: String(g.refCarbsG),
    ref_fats_g: String(g.refFatsG),
    deleted_at: null,
  }))
}

function food(partial: Partial<FoodDbRow> & Pick<FoodDbRow, 'id' | 'name'>): FoodDbRow {
  return {
    category: null,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fats_g: 0,
    serving_size: 100,
    serving_unit: 'g',
    is_liquid: false,
    exchange_group_id: null,
    exchange_portion_grams: null,
    exchange_portion_label: null,
    ...partial,
  }
}

function classified(partial: Partial<ClassifiedRow> & Pick<ClassifiedRow, 'foodId' | 'group' | 'tier' | 'grams'>): ClassifiedRow {
  return {
    name: 'x',
    category: null,
    label: partial.grams == null ? null : `${partial.grams} g`,
    signals: { category: null, keyword: null, macro: null },
    reason: '',
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// verifyGroupRefs
// ---------------------------------------------------------------------------

describe('verifyGroupRefs', () => {
  it('ok cuando la DB espeja el fixture (con numeric como string)', () => {
    const res = verifyGroupRefs(dbGroupsMatchingFixture())
    expect(res.ok).toBe(true)
    expect(res.mismatches).toHaveLength(0)
  })

  it('detecta un ref_* drifteado', () => {
    const groups = dbGroupsMatchingFixture()
    const c = groups.find((g) => g.code === 'C')!
    c.ref_carbs_g = 999
    const res = verifyGroupRefs(groups)
    expect(res.ok).toBe(false)
    expect(res.mismatches).toContainEqual(expect.objectContaining({ code: 'C', field: 'ref_carbs_g', db: 999 }))
  })

  it('detecta un grupo system faltante en la DB', () => {
    const groups = dbGroupsMatchingFixture().filter((g) => g.code !== 'LEG')
    const res = verifyGroupRefs(groups)
    expect(res.ok).toBe(false)
    expect(res.mismatches).toContainEqual(expect.objectContaining({ code: 'LEG', field: 'missing_in_db' }))
  })

  it('detecta un grupo system nuevo en la DB que el fixture no conoce', () => {
    const groups = dbGroupsMatchingFixture()
    groups.push({
      id: 'id-XX', code: 'XX', name: 'nuevo', is_system: true,
      ref_calories: 1, ref_protein_g: 1, ref_carbs_g: 1, ref_fats_g: 1, deleted_at: null,
    })
    const res = verifyGroupRefs(groups)
    expect(res.ok).toBe(false)
    expect(res.mismatches).toContainEqual(expect.objectContaining({ code: 'XX', field: 'missing_in_fixture' }))
  })

  it('ignora grupos custom (no system) y system soft-borrados', () => {
    const groups = dbGroupsMatchingFixture()
    // Un custom con refs basura no debe romper.
    groups.push({ id: 'c1', code: 'C', name: 'custom C', is_system: false, ref_calories: 0, ref_protein_g: 0, ref_carbs_g: 0, ref_fats_g: 0, deleted_at: null })
    // Un system soft-borrado con refs basura tampoco.
    groups.push({ id: 'sd', code: 'ZZ', name: 'borrado', is_system: true, ref_calories: 0, ref_protein_g: 0, ref_carbs_g: 0, ref_fats_g: 0, deleted_at: '2026-01-01' })
    const res = verifyGroupRefs(groups)
    expect(res.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// systemGroupIdByCode
// ---------------------------------------------------------------------------

describe('systemGroupIdByCode', () => {
  it('mapea code -> id solo de system vivos', () => {
    const groups = dbGroupsMatchingFixture()
    groups.push({ id: 'custom', code: 'C', name: 'x', is_system: false, ref_calories: 0, ref_protein_g: 0, ref_carbs_g: 0, ref_fats_g: 0, deleted_at: null })
    const map = systemGroupIdByCode(groups)
    expect(map.size).toBe(GROUP_REFS.length)
    // El id de 'C' es el system, no el custom.
    expect(map.get('C')).not.toBe('custom')
    expect(map.get('C')).toMatch(/^id-C-/)
  })
})

// ---------------------------------------------------------------------------
// parseTiersFlag
// ---------------------------------------------------------------------------

describe('parseTiersFlag', () => {
  it('default = solo alto', () => {
    expect(Array.from(parseTiersFlag(undefined))).toEqual(['alto'])
    expect(Array.from(parseTiersFlag(''))).toEqual(['alto'])
  })
  it('alto,medio', () => {
    const s = parseTiersFlag('alto,medio')
    expect(s.has('alto')).toBe(true)
    expect(s.has('medio')).toBe(true)
    expect(s.size).toBe(2)
  })
  it('normaliza espacios y mayusculas', () => {
    const s = parseTiersFlag(' Alto , MEDIO ')
    expect(s.has('alto')).toBe(true)
    expect(s.has('medio')).toBe(true)
  })
  it('lanza en bajo o token invalido (fail-closed)', () => {
    expect(() => parseTiersFlag('bajo')).toThrow()
    expect(() => parseTiersFlag('alto,zzz')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// filterForApply
// ---------------------------------------------------------------------------

describe('filterForApply', () => {
  const foods = new Map<string, FoodDbRow>([
    ['a', food({ id: 'a', name: 'a' })], // null group -> elegible por el food
    ['b', food({ id: 'b', name: 'b' })],
    ['c', food({ id: 'c', name: 'c' })],
    ['manual', food({ id: 'manual', name: 'ya clasificado', exchange_group_id: 'g-existente' })],
  ])

  it('incluye alto (default) y excluye medio si no esta aprobado', () => {
    const rows = [
      classified({ foodId: 'a', group: 'C', tier: 'alto', grams: 50 }),
      classified({ foodId: 'b', group: 'P', tier: 'medio', grams: 30 }),
    ]
    const out = filterForApply(rows, new Set(['alto']), foods)
    expect(out.map((r) => r.foodId)).toEqual(['a'])
  })

  it('incluye medio cuando esta aprobado', () => {
    const rows = [classified({ foodId: 'b', group: 'P', tier: 'medio', grams: 30 })]
    const out = filterForApply(rows, new Set(['alto', 'medio']), foods)
    expect(out.map((r) => r.foodId)).toEqual(['b'])
  })

  it('excluye group=null, grams=null, tier bajo y foods ya clasificados a mano (D3)', () => {
    const rows = [
      classified({ foodId: 'a', group: null, tier: 'bajo', grams: null }),
      classified({ foodId: 'b', group: 'C', tier: 'alto', grams: null }), // sin porcion
      classified({ foodId: 'c', group: 'C', tier: 'bajo', grams: 50 }), // tier bajo
      classified({ foodId: 'manual', group: 'C', tier: 'alto', grams: 50 }), // ya clasificado
    ]
    const out = filterForApply(rows, new Set(['alto', 'medio']), foods)
    expect(out).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// buildUpdatePayload / buildBackupRow
// ---------------------------------------------------------------------------

describe('buildUpdatePayload', () => {
  const codeToId = new Map([['C', 'gid-C'], ['P', 'gid-P']])
  it('arma el payload resolviendo el grupo a su id', () => {
    const row = classified({ foodId: 'a', group: 'C', tier: 'alto', grams: 54, label: '54 g' })
    expect(buildUpdatePayload(row, codeToId)).toEqual({
      exchange_group_id: 'gid-C',
      exchange_portion_grams: 54,
      exchange_portion_label: '54 g',
    })
  })
  it('null si el grupo no resuelve o falta la porcion', () => {
    expect(buildUpdatePayload(classified({ foodId: 'x', group: null, tier: 'bajo', grams: null }), codeToId)).toBeNull()
    expect(buildUpdatePayload(classified({ foodId: 'x', group: 'C', tier: 'alto', grams: null }), codeToId)).toBeNull()
    expect(buildUpdatePayload(classified({ foodId: 'x', group: 'V', tier: 'alto', grams: 10 }), codeToId)).toBeNull() // V no esta en el mapa
  })
})

describe('buildBackupRow', () => {
  it('captura valores previos y coerce numeric string -> number', () => {
    const f = food({ id: 'a', name: 'a', exchange_group_id: null, exchange_portion_grams: '54' as unknown as number, exchange_portion_label: 'x' })
    expect(buildBackupRow(f)).toEqual({ foodId: 'a', exchange_group_id: null, exchange_portion_grams: 54, exchange_portion_label: 'x' })
  })
  it('nulls cuando no habia porcion previa', () => {
    expect(buildBackupRow(food({ id: 'b', name: 'b' }))).toEqual({
      foodId: 'b', exchange_group_id: null, exchange_portion_grams: null, exchange_portion_label: null,
    })
  })
})

// ---------------------------------------------------------------------------
// classifyDataset / summarizeDataset
// ---------------------------------------------------------------------------

describe('classifyDataset + summarizeDataset', () => {
  it('clasifica y resume un mini catalogo', () => {
    const foods = [
      food({ id: '1', name: 'Arroz blanco cocido', category: 'carbohidrato', calories: 130, protein_g: 2.7, carbs_g: 28, fats_g: 0.3 }),
      food({ id: '2', name: 'Agua mineral', category: 'bebida', calories: 0 }),
    ]
    const rows = classifyDataset(foods)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ foodId: '1', group: 'C' })
    const summary = summarizeDataset(rows)
    expect(summary.total).toBe(2)
    expect(summary.classified + summary.unclassified).toBe(2)
    expect(summary.byGroup.C).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Naming del respaldo
// ---------------------------------------------------------------------------

describe('naming del respaldo', () => {
  it('stampDate es determinista con fecha fija (UTC)', () => {
    expect(stampDate(new Date(Date.UTC(2026, 6, 17)))).toBe('20260717')
  })
  it('backupTableName/backupFileName siguen el patron _bak', () => {
    expect(backupTableName('20260717')).toBe('_bak_foods_portions_20260717')
    expect(backupFileName('20260717')).toBe('foods-portions-bak-20260717.json')
  })
})
