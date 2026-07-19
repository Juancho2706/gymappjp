import { describe, it, expect } from 'vitest'
import {
  parseFkRefsToFoods,
  isNonLatinName,
  isSupplementCompound,
  junkCategory,
  tokenizeName,
  normalizeKeyPart,
  dupKey,
  groupExactDuplicates,
  chooseCanonical,
  decideDisposition,
  buildCleanupPlan,
  stripGeneratedColumns,
  stampDate,
  backupFileName,
  backupTableName,
  type FoodFullRow,
  type PostgrestOpenApi,
} from '../../scripts/nutrition-portions/cleanup-lib'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function food(partial: Partial<FoodFullRow> & Pick<FoodFullRow, 'id'>): FoodFullRow {
  return { name: null, brand: null, exchange_group_id: null, ...partial }
}

// ---------------------------------------------------------------------------
// parseFkRefsToFoods
// ---------------------------------------------------------------------------

describe('parseFkRefsToFoods', () => {
  const spec: PostgrestOpenApi = {
    definitions: {
      foods: { properties: { id: { description: 'Note: This is a Primary Key.<pk/>' } } },
      recipe_ingredients: {
        properties: {
          id: { description: '' },
          food_id: { description: "Note: This is a Foreign Key to `foods.id`.<fk table='foods' column='id'/>" },
        },
      },
      nutrition_meal_food_swaps: {
        properties: {
          original_food_id: { description: "<fk table='foods' column='id'/>" },
          swapped_food_id: { description: "<fk table='foods' column='id'/>" },
        },
      },
      // Texto libre que menciona foods.id pero NO es FK (sin marcador maquina): se ignora.
      client_food_notes: {
        properties: { note: { description: 'talks about foods.id in prose but no fk marker' } },
      },
      // FK a OTRA tabla: se ignora.
      other: { properties: { user_id: { description: "<fk table='users' column='id'/>" } } },
    },
  }

  it('enumera solo columnas con el marcador FK a foods.id y excluye foods misma', () => {
    const refs = parseFkRefsToFoods(spec)
    expect(refs).toEqual([
      { table: 'nutrition_meal_food_swaps', column: 'original_food_id' },
      { table: 'nutrition_meal_food_swaps', column: 'swapped_food_id' },
      { table: 'recipe_ingredients', column: 'food_id' },
    ])
  })

  it('no pesca texto libre con foods.id ni FKs a otras tablas', () => {
    const refs = parseFkRefsToFoods(spec)
    expect(refs.some((r) => r.table === 'client_food_notes')).toBe(false)
    expect(refs.some((r) => r.table === 'other')).toBe(false)
  })

  it('spec vacio -> lista vacia', () => {
    expect(parseFkRefsToFoods({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Junk: no-latinos
// ---------------------------------------------------------------------------

describe('isNonLatinName', () => {
  it('detecta CJK, coreano, thai, cirilico, arabe', () => {
    expect(isNonLatinName('美味酥-什锦烍烤味')).toBe(true) // chino
    expect(isNonLatinName('막국슨')).toBe(true) // coreano
    expect(isNonLatinName('시원한 메밀소바')).toBe(true) // coreano
    expect(isNonLatinName('ไก่ย่างจิ้มแจ่ว')).toBe(true) // thai
    expect(isNonLatinName('Молоко')).toBe(true) // cirilico
    expect(isNonLatinName('حليب')).toBe(true) // arabe
  })
  it('acepta nombres latinos (con tildes y n)', () => {
    expect(isNonLatinName('Pure de papas')).toBe(false)
    expect(isNonLatinName('Leche Nestlé descremada')).toBe(false)
    expect(isNonLatinName('Piña colada')).toBe(false)
    expect(isNonLatinName('')).toBe(false)
    expect(isNonLatinName(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Junk: suplementos compuestos
// ---------------------------------------------------------------------------

describe('isSupplementCompound', () => {
  it('detecta aminoacidos como token completo (ES/EN)', () => {
    expect(isSupplementCompound('L-tryptophan Lean')).toBe(true)
    expect(isSupplementCompound('L tryptophan')).toBe(true)
    expect(isSupplementCompound('Glutamina en polvo')).toBe(true)
    expect(isSupplementCompound('Beta-Alanine 3000')).toBe(true)
    expect(isSupplementCompound('BCAA 2:1:1')).toBe(true)
    expect(isSupplementCompound('HMB capsulas')).toBe(true)
    expect(isSupplementCompound('L-Carnitine liquida')).toBe(true)
  })
  it('NO pesca substrings dentro de palabras legitimas', () => {
    // 'taurina' es token; pero no debe matchear si esta pegado en otra palabra sin frontera
    expect(isSupplementCompound('Restaurante')).toBe(false)
    expect(isSupplementCompound('Arroz blanco')).toBe(false)
    expect(isSupplementCompound('Milo Nestle')).toBe(false)
    expect(isSupplementCompound('')).toBe(false)
    expect(isSupplementCompound(null)).toBe(false)
  })
})

describe('tokenizeName / junkCategory', () => {
  it('tokeniza por no-letras', () => {
    expect(tokenizeName('L-tryptophan Lean 500mg')).toEqual(['l', 'tryptophan', 'lean', '500mg'])
  })
  it('no-latino gana sobre suplemento y null cuando no es junk', () => {
    expect(junkCategory('美味酥')).toBe('non-latin')
    expect(junkCategory('L tryptophan')).toBe('supplement')
    expect(junkCategory('Pechuga de pollo')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

describe('normalizeKeyPart / dupKey', () => {
  it('lower + btrim y coalesce brand a ""', () => {
    expect(normalizeKeyPart('  Milo  ')).toBe('milo')
    expect(normalizeKeyPart(null)).toBe('')
    expect(dupKey(food({ id: '1', name: '  Milo ', brand: ' Nestle ' }))).toBe(dupKey(food({ id: '2', name: 'milo', brand: 'nestle' })))
  })
  it('nombre igual pero brand distinto -> claves distintas', () => {
    expect(dupKey(food({ id: '1', name: 'Milo', brand: 'Nestle' }))).not.toBe(dupKey(food({ id: '2', name: 'Milo', brand: 'Otra' })))
  })
})

describe('groupExactDuplicates', () => {
  it('agrupa solo grupos con 2+ e ignora nombre vacio', () => {
    const rows = [
      food({ id: 'a', name: 'Milo', brand: 'Nestle' }),
      food({ id: 'b', name: 'milo', brand: 'NESTLE' }),
      food({ id: 'c', name: 'Milo', brand: 'Nestle' }),
      food({ id: 'd', name: 'Unico', brand: null }),
      food({ id: 'e', name: '  ', brand: null }), // nombre vacio: ignorado
      food({ id: 'f', name: '   ', brand: 'x' }),
    ]
    const groups = groupExactDuplicates(rows)
    expect(groups.size).toBe(1)
    const g = [...groups.values()][0]
    expect(g.map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('chooseCanonical', () => {
  it('gana el de mas referencias', () => {
    const group = [food({ id: 'a' }), food({ id: 'b' }), food({ id: 'c' })]
    const refs = new Map([['a', 1], ['b', 5], ['c', 0]])
    const { canonical, others } = chooseCanonical(group, refs)
    expect(canonical.id).toBe('b')
    expect(others.map((r) => r.id).sort()).toEqual(['a', 'c'])
  })
  it('empate en refs -> el que tiene exchange_group_id no nulo', () => {
    const group = [food({ id: 'a' }), food({ id: 'b', exchange_group_id: 'g1' })]
    const refs = new Map([['a', 0], ['b', 0]])
    expect(chooseCanonical(group, refs).canonical.id).toBe('b')
  })
  it('empate total -> id mas bajo (created_at ausente)', () => {
    const group = [food({ id: 'zzz' }), food({ id: 'aaa' }), food({ id: 'mmm' })]
    const refs = new Map<string, number>()
    expect(chooseCanonical(group, refs).canonical.id).toBe('aaa')
  })
  it('no muta el arreglo de entrada', () => {
    const group = [food({ id: 'b' }), food({ id: 'a' })]
    const snapshot = group.map((r) => r.id)
    chooseCanonical(group, new Map())
    expect(group.map((r) => r.id)).toEqual(snapshot)
  })
})

describe('decideDisposition', () => {
  it('0 refs -> delete, 1+ -> blocked', () => {
    expect(decideDisposition(0)).toBe('delete')
    expect(decideDisposition(3)).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// buildCleanupPlan (integracion de las 3 dimensiones)
// ---------------------------------------------------------------------------

describe('buildCleanupPlan', () => {
  it('duplicados: canonico = mas referencias; borra sin-refs, reporta con-refs', () => {
    const foods = [
      food({ id: 'canon', name: 'Milo', brand: 'Nestle' }), // 5 refs -> canonico
      food({ id: 'dup0', name: 'milo', brand: 'nestle' }), // 0 refs -> delete
      food({ id: 'dupR', name: 'MILO', brand: 'Nestle' }), // 2 refs -> requiere merge
    ]
    const refs = new Map([['canon', 5], ['dup0', 0], ['dupR', 2]])
    const plan = buildCleanupPlan(foods, refs)
    expect(plan.duplicates.groupCount).toBe(1)
    expect(plan.duplicates.extraRows).toBe(2)
    expect(plan.duplicates.groups[0].canonicalId).toBe('canon')
    expect(plan.deletableIds).toEqual(['dup0'])
    expect(plan.requiresMerge).toEqual([
      { id: 'dupR', name: 'MILO', brand: 'Nestle', reason: 'duplicate', refCount: 2, canonicalId: 'canon' },
    ])
  })

  it('junk sin refs -> delete; con refs -> requiere merge', () => {
    const foods = [
      food({ id: 'cjk', name: '美味酥' }),
      food({ id: 'supp', name: 'L tryptophan' }),
      food({ id: 'suppR', name: 'Glutamina', brand: 'X' }),
    ]
    const refs = new Map([['cjk', 0], ['supp', 0], ['suppR', 4]])
    const plan = buildCleanupPlan(foods, refs)
    expect(plan.junk.nonLatin.map((r) => r.id)).toEqual(['cjk'])
    expect(plan.junk.supplement.map((r) => r.id).sort()).toEqual(['supp', 'suppR'])
    expect(plan.deletableIds.sort()).toEqual(['cjk', 'supp'])
    expect(plan.requiresMerge).toContainEqual(
      expect.objectContaining({ id: 'suppR', reason: 'supplement', refCount: 4 }),
    )
  })

  it('fila junk que es canonico de un grupo dup NO se borra por junk', () => {
    const foods = [
      food({ id: 'a', name: 'Glutamina', brand: 'X', exchange_group_id: 'g1' }), // junk + canonico
      food({ id: 'b', name: 'glutamina', brand: 'x' }), // dup sin refs -> delete
    ]
    const refs = new Map([['a', 0], ['b', 0]])
    const plan = buildCleanupPlan(foods, refs)
    // 'a' es canonico (tiene grupo) -> no borrable; 'b' si.
    expect(plan.deletableIds).toEqual(['b'])
    const junkA = plan.junk.supplement.find((r) => r.id === 'a')!
    expect(junkA.isCanonicalOfDupGroup).toBe(true)
    expect(junkA.disposition).toBe('blocked')
    expect(plan.requiresMerge.some((r) => r.id === 'a' && r.reason === 'supplement')).toBe(true)
  })

  it('deletableIds es union unica (fila junk Y dup no-canonico no se duplica)', () => {
    const foods = [
      food({ id: 'canon', name: 'Glutamina', brand: 'X', exchange_group_id: 'g1' }),
      food({ id: 'both', name: 'glutamina', brand: 'x' }), // dup no-canonico (0 refs) + junk
    ]
    const refs = new Map([['canon', 0], ['both', 0]])
    const plan = buildCleanupPlan(foods, refs)
    expect(plan.deletableIds).toEqual(['both'])
    expect(plan.deletableIds.filter((id) => id === 'both')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Respaldo / naming
// ---------------------------------------------------------------------------

describe('stripGeneratedColumns', () => {
  it('quita name_search y conserva el resto', () => {
    const row = { id: 'a', name: 'x', name_search: 'x', brand: 'y', calories: 10 }
    const out = stripGeneratedColumns(row)
    expect(out).toEqual({ id: 'a', name: 'x', brand: 'y', calories: 10 })
    expect('name_search' in out).toBe(false)
  })
})

describe('naming del respaldo', () => {
  it('stampDate determinista UTC', () => {
    expect(stampDate(new Date(Date.UTC(2026, 6, 18)))).toBe('20260718')
  })
  it('backupFileName/backupTableName siguen el patron _bak', () => {
    expect(backupFileName('20260718')).toBe('foods-cleanup-bak-20260718.json')
    expect(backupTableName('20260718')).toBe('_bak_foods_cleanup_20260718')
  })
})
