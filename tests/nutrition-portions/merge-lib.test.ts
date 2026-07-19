import { describe, it, expect } from 'vitest'
import {
  parsePrimaryKeys,
  keyColsForRemap,
  uniqueKeysFor,
  buildRemapTuple,
  classifyReferencingRows,
  computeEnrichment,
  isPresent,
  buildMergeGroups,
  mergeBackupFileName,
  mergeBackupTableName,
  renderMergeReportMarkdown,
  ENRICHABLE_COLUMNS,
  UNIQUE_KEYS_WITH_FOOD_FK,
  type FoodFullRow,
  type PostgrestOpenApi,
  type MergeSummary,
} from '../../scripts/nutrition-portions/merge-lib'

function food(partial: Partial<FoodFullRow> & Pick<FoodFullRow, 'id'>): FoodFullRow {
  return { name: null, brand: null, exchange_group_id: null, ...partial }
}

// ---------------------------------------------------------------------------
// parsePrimaryKeys
// ---------------------------------------------------------------------------

describe('parsePrimaryKeys', () => {
  const spec: PostgrestOpenApi = {
    definitions: {
      food_items: {
        properties: {
          id: { description: 'Note: This is a Primary Key.<pk/>' },
          food_id: { description: "<fk table='foods' column='id'/>" },
        },
      },
      client_food_preferences: {
        properties: {
          client_id: { description: 'Note: This is a Primary Key.<pk/>' },
          food_id: { description: "Primary Key.<pk/> also <fk table='foods' column='id'/>" },
          rating: { description: '' },
        },
      },
      // Tabla sin PK marcada: no aparece.
      logs: { properties: { note: { description: '' } } },
    },
  }
  it('enumera PKs simples y COMPUESTAS preservando el orden', () => {
    const pks = parsePrimaryKeys(spec)
    expect(pks.get('food_items')).toEqual(['id'])
    expect(pks.get('client_food_preferences')).toEqual(['client_id', 'food_id'])
  })
  it('omite tablas sin PK', () => {
    expect(parsePrimaryKeys(spec).has('logs')).toBe(false)
  })
  it('spec vacio -> mapa vacio', () => {
    expect(parsePrimaryKeys({}).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// keyColsForRemap
// ---------------------------------------------------------------------------

describe('keyColsForRemap', () => {
  it('quita la columna FK de la PK (PK id suelta -> [id])', () => {
    expect(keyColsForRemap(['id'], 'food_id')).toEqual(['id'])
  })
  it('PK compuesta que incluye la FK -> resto de la PK', () => {
    expect(keyColsForRemap(['client_id', 'food_id'], 'food_id')).toEqual(['client_id'])
  })
  it('si la PK es solo la FK, cae a la PK completa (no pierde unicidad)', () => {
    expect(keyColsForRemap(['food_id'], 'food_id')).toEqual(['food_id'])
  })
})

// ---------------------------------------------------------------------------
// uniqueKeysFor / UNIQUE_KEYS_WITH_FOOD_FK
// ---------------------------------------------------------------------------

describe('uniqueKeysFor', () => {
  it('devuelve las claves de las tablas conflictivas conocidas', () => {
    expect(uniqueKeysFor('client_food_preferences', 'food_id')).toEqual([['client_id', 'food_id']])
    expect(uniqueKeysFor('food_media', 'food_id')).toEqual([['food_id', 'object_path']])
    expect(uniqueKeysFor('nutrition_meal_food_swaps', 'original_food_id')).toEqual([
      ['daily_log_id', 'meal_id', 'original_food_id'],
    ])
  })
  it('tablas no conflictivas -> vacio', () => {
    expect(uniqueKeysFor('recipe_ingredients', 'food_id')).toEqual([])
    expect(uniqueKeysFor('nutrition_meal_food_swaps', 'swapped_food_id')).toEqual([])
  })
  it('el snapshot solo cubre columnas FK a foods', () => {
    for (const s of UNIQUE_KEYS_WITH_FOOD_FK) {
      for (const key of s.uniqueKeys) expect(key).toContain(s.column)
    }
  })
})

// ---------------------------------------------------------------------------
// buildRemapTuple (semantica NULL de Postgres)
// ---------------------------------------------------------------------------

describe('buildRemapTuple', () => {
  it('proyecta la columna FK al valor destino', () => {
    const row = { client_id: 'u1', food_id: 'copy' }
    expect(buildRemapTuple(row, ['client_id', 'food_id'], 'food_id', 'canon')).toBe(
      JSON.stringify(['u1', 'canon']),
    )
  })
  it('cualquier componente null -> tupla no colisionable (null)', () => {
    const row = { food_id: 'copy', object_path: null }
    expect(buildRemapTuple(row, ['food_id', 'object_path'], 'food_id', 'canon')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// classifyReferencingRows
// ---------------------------------------------------------------------------

describe('classifyReferencingRows', () => {
  it('sin claves unicas -> todo UPDATE', () => {
    const copyRows = [{ id: 'r1', food_id: 'c1' }, { id: 'r2', food_id: 'c2' }]
    const res = classifyReferencingRows({ copyRows, canonRows: [], column: 'food_id', canonicalId: 'K', uniqueKeys: [] })
    expect(res.updates).toHaveLength(2)
    expect(res.deletes).toHaveLength(0)
  })

  it('conflicto con fila existente del canonico -> DELETE de la copia', () => {
    // favoritos unique(client_id, food_id): el user u1 ya tiene el canonico.
    const copyRows = [{ client_id: 'u1', food_id: 'copy' }]
    const canonRows = [{ client_id: 'u1', food_id: 'canon' }]
    const res = classifyReferencingRows({
      copyRows,
      canonRows,
      column: 'food_id',
      canonicalId: 'canon',
      uniqueKeys: [['client_id', 'food_id']],
    })
    expect(res.deletes).toHaveLength(1)
    expect(res.updates).toHaveLength(0)
  })

  it('sin fila previa del canonico -> UPDATE', () => {
    const copyRows = [{ client_id: 'u2', food_id: 'copy' }]
    const res = classifyReferencingRows({
      copyRows,
      canonRows: [],
      column: 'food_id',
      canonicalId: 'canon',
      uniqueKeys: [['client_id', 'food_id']],
    })
    expect(res.updates).toHaveLength(1)
    expect(res.deletes).toHaveLength(0)
  })

  it('dos copias que colisionarian entre si -> la segunda se DELETE', () => {
    // u3 tiene favorito en copyA y copyB; ambos remapean al canonico -> uno sobra.
    const copyRows = [
      { client_id: 'u3', food_id: 'copyA' },
      { client_id: 'u3', food_id: 'copyB' },
    ]
    const res = classifyReferencingRows({
      copyRows,
      canonRows: [],
      column: 'food_id',
      canonicalId: 'canon',
      uniqueKeys: [['client_id', 'food_id']],
    })
    expect(res.updates).toHaveLength(1)
    expect(res.deletes).toHaveLength(1)
  })

  it('NULL en la clave -> nunca colisiona (dos object_path null conviven)', () => {
    const copyRows = [{ id: 'm1', food_id: 'copy', object_path: null }]
    const canonRows = [{ id: 'm0', food_id: 'canon', object_path: null }]
    const res = classifyReferencingRows({
      copyRows,
      canonRows,
      column: 'food_id',
      canonicalId: 'canon',
      uniqueKeys: [['food_id', 'object_path']],
    })
    expect(res.updates).toHaveLength(1)
    expect(res.deletes).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computeEnrichment
// ---------------------------------------------------------------------------

describe('isPresent', () => {
  it('null/undefined/"" ausentes; 0 y valores presentes', () => {
    expect(isPresent(null)).toBe(false)
    expect(isPresent(undefined)).toBe(false)
    expect(isPresent('')).toBe(false)
    expect(isPresent(0)).toBe(true)
    expect(isPresent('x')).toBe(true)
  })
})

describe('computeEnrichment', () => {
  it('rellena solo columnas vacias del canonico desde la primera copia con dato', () => {
    const canonical = food({ id: 'K', exchange_group_id: null, exchange_portion_grams: null })
    const copies = [
      food({ id: 'c1', exchange_group_id: null }),
      food({ id: 'c2', exchange_group_id: 'g9', exchange_portion_grams: 30, exchange_portion_label: '1 taza' }),
    ]
    const res = computeEnrichment(canonical, copies)
    expect(res.updates).toEqual({ exchange_group_id: 'g9', exchange_portion_grams: 30, exchange_portion_label: '1 taza' })
    expect(res.fields.map((f) => f.column).sort()).toEqual(
      ['exchange_group_id', 'exchange_portion_grams', 'exchange_portion_label'].sort(),
    )
    expect(res.fields.every((f) => f.fromId === 'c2')).toBe(true)
  })

  it('NO pisa columnas que el canonico ya tiene', () => {
    const canonical = food({ id: 'K', exchange_group_id: 'gK', product_image_path: 'foto.jpg' })
    const copies = [food({ id: 'c1', exchange_group_id: 'gX', product_image_path: 'otra.jpg' })]
    const res = computeEnrichment(canonical, copies)
    expect('exchange_group_id' in res.updates).toBe(false)
    expect('product_image_path' in res.updates).toBe(false)
  })

  it('sin copias con dato -> sin updates', () => {
    const canonical = food({ id: 'K' })
    const copies = [food({ id: 'c1' })]
    expect(computeEnrichment(canonical, copies).updates).toEqual({})
  })

  it('solo toca columnas enriquecibles', () => {
    const canonical = food({ id: 'K', name: null })
    const copies = [food({ id: 'c1', name: 'Otro', calories: 999 })]
    const res = computeEnrichment(canonical, copies)
    for (const k of Object.keys(res.updates)) expect(ENRICHABLE_COLUMNS).toContain(k)
  })
})

// ---------------------------------------------------------------------------
// buildMergeGroups
// ---------------------------------------------------------------------------

describe('buildMergeGroups', () => {
  it('canonico = mas refs; copias ordenadas por id; enriquecimiento incluido', () => {
    const foods = [
      food({ id: 'aaa', name: 'Milo', brand: 'Nestle' }), // 1 ref
      food({ id: 'ccc', name: 'milo', brand: 'nestle', exchange_group_id: 'g1', exchange_portion_grams: 20 }), // 5 refs -> canonico
      food({ id: 'bbb', name: 'MILO', brand: 'Nestle' }), // 2 refs
    ]
    const refs = new Map([['aaa', 1], ['ccc', 5], ['bbb', 2]])
    const groups = buildMergeGroups(foods, refs)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.canonicalId).toBe('ccc')
    expect(g.copyIds).toEqual(['aaa', 'bbb'])
    expect(g.name).toBe('milo')
    // canonico ya tiene exchange_group_id -> no se enriquece esa columna.
    expect('exchange_group_id' in g.enrichment.updates).toBe(false)
  })

  it('enriquece el canonico cuando esta vacio y una copia tiene el dato', () => {
    // canonico gana por REFERENCIAS aunque no tenga exchange; la copia con menos refs
    // aporta el exchange_group_id/portion. (Si empataran en refs, ganaria la copia con
    // exchange y no habria nada que enriquecer.)
    const foods = [
      food({ id: 'canon', name: 'Pan', brand: '' }), // 4 refs -> canonico, sin exchange
      food({ id: 'zdup', name: 'PAN', brand: '', exchange_group_id: 'g7', exchange_portion_grams: 50 }), // 1 ref
    ]
    const refs = new Map([['canon', 4], ['zdup', 1]])
    const g = buildMergeGroups(foods, refs)[0]
    expect(g.canonicalId).toBe('canon')
    expect(g.enrichment.updates.exchange_group_id).toBe('g7')
    expect(g.enrichment.updates.exchange_portion_grams).toBe(50)
  })

  it('ignora filas sin duplicado (grupos de 1)', () => {
    const foods = [food({ id: 'x', name: 'Unico', brand: 'A' }), food({ id: 'y', name: 'Otro', brand: 'B' })]
    expect(buildMergeGroups(foods, new Map())).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// naming del respaldo
// ---------------------------------------------------------------------------

describe('naming del respaldo', () => {
  it('sigue el patron _bak de fusion', () => {
    expect(mergeBackupFileName('20260718')).toBe('foods-merge-bak-20260718.json')
    expect(mergeBackupTableName('20260718')).toBe('_bak_foods_merge_20260718')
  })
})

// ---------------------------------------------------------------------------
// renderMergeReportMarkdown
// ---------------------------------------------------------------------------

describe('renderMergeReportMarkdown', () => {
  it('emite un MD con los totales y las tablas de remapeo', () => {
    const summary: MergeSummary = {
      totalFoods: 4778,
      groupCount: 2,
      copyCount: 3,
      remapByTable: [
        { table: 'food_items', column: 'food_id', updates: 10, deletes: 0, conflictProne: false },
        { table: 'client_food_preferences', column: 'food_id', updates: 2, deletes: 1, conflictProne: true },
      ],
      totalUpdates: 12,
      totalConflictDeletes: 1,
      enrichedGroupCount: 1,
      groups: [
        { canonicalId: 'K1', name: 'Milo', brand: 'Nestle', copyIds: ['a', 'b'], enrichmentFields: ['exchange_group_id'] },
        { canonicalId: 'K2', name: 'Pan', brand: '', copyIds: ['c'], enrichmentFields: [] },
      ],
    }
    const md = renderMergeReportMarkdown(summary, {
      generatedAt: '2026-07-18T00:00:00.000Z',
      target: 'https://x.supabase.co',
      mode: 'DRY-RUN',
    })
    expect(md).toContain('Grupos a fusionar: 2')
    expect(md).toContain('Filas a remapear (UPDATE): 12')
    expect(md).toContain('Filas duplicadas a borrar por conflicto de unica (DELETE): 1')
    expect(md).toContain('client_food_preferences')
    expect(md).toContain('| K1 |')
  })
})
