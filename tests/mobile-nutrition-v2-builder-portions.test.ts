import { describe, expect, it } from 'vitest'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  PORTIONS_MAX,
  PORTIONS_MIN,
  addPortionGroup,
  buildFrozenPortionGroups,
  combineSubtotals,
  derivePortionTotals,
  esDecimal,
  formatPortionsEs,
  hasAnyPortions,
  removePortionGroup,
  setPortionValue,
  slotPortionTargets,
  slotPortionTotals,
  snapPortions,
  sortGroupsForPicker,
  stepPortionValue,
  type PortionsBySlot,
} from '../apps/mobile/lib/nutrition-v2-builder-portions'
import {
  assembleAndValidateDraft,
  assembleDraft,
  createEmptyItem,
  persistAndPublishDraft,
  type BuilderFood,
  type BuilderItem,
  type BuilderState,
  type NutritionV2WriteClient,
} from '../apps/mobile/lib/nutrition-v2-builder'

// GUID-format ids: `NutritionExchangeTargetSchema` usa z.guid() (acepta seeds no-RFC), no
// strings arbitrarios; con ids falsos el schema del draft rechazaria las porciones.
const GROUP_C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_V = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GROUP_P = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_LEG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'
const PUBLISHED_ID = '44444444-4444-4444-8444-444444444444'

function group(overrides: Partial<ExchangeGroup> & Pick<ExchangeGroup, 'id' | 'code' | 'name'>): ExchangeGroup {
  return {
    slug: overrides.code.toLowerCase(),
    coachId: null,
    teamId: null,
    isSystem: true,
    refCalories: 0,
    refProteinG: 0,
    refCarbsG: 0,
    refFatsG: 0,
    color: null,
    sortOrder: 0,
    composedOf: null,
    macrosConfirmed: true,
    ...overrides,
  }
}

const CEREAL = group({ id: GROUP_C, code: 'C', name: 'Cereales', refCalories: 70, refProteinG: 2, refCarbsG: 15, refFatsG: 0, sortOrder: 0 })
const VERDURA = group({ id: GROUP_V, code: 'V', name: 'Verduras', refCalories: 25, refProteinG: 2, refCarbsG: 5, refFatsG: 0, sortOrder: 1 })
const PROTEINA = group({ id: GROUP_P, code: 'P', name: 'Proteina', refCalories: 75, refProteinG: 7, refCarbsG: 0, refFatsG: 5, sortOrder: 2 })
const LEGUMBRE = group({
  id: GROUP_LEG,
  code: 'LEG',
  name: 'Legumbres',
  refCalories: 145,
  refProteinG: 9,
  refCarbsG: 15,
  refFatsG: 5,
  sortOrder: 3,
  composedOf: [
    { code: 'P', portions: 1 },
    { code: 'C', portions: 1 },
  ],
})
const CATALOG: ExchangeGroup[] = [CEREAL, VERDURA, PROTEINA, LEGUMBRE]

const FOOD: BuilderFood = {
  id: FOOD_ID,
  name: 'Pollo',
  brand: null,
  calories: 100,
  proteinG: 10,
  carbsG: 20,
  fatsG: 5,
  fiberG: 2,
  servingSize: 50,
  servingUnit: 'g',
  category: null,
  media: null,
}

function foodItem(): BuilderItem {
  return { ...createEmptyItem('i1'), food: FOOD, customName: null, quantity: '200', unit: 'g' }
}

function structuredState(): BuilderState {
  return {
    step: 3,
    strategy: 'structured',
    planName: 'Plan con porciones',
    effectiveFrom: '2026-07-20',
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: true, canSubstitute: false },
    slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [foodItem()] }],
  }
}

describe('snap / paso-rango (espejo del CHECK y del schema)', () => {
  it('snapPortions ajusta al 0,5 mas cercano y clampa a [0,5; 99]', () => {
    expect(snapPortions(1.3)).toBe(1.5)
    expect(snapPortions(1.24)).toBe(1)
    expect(snapPortions(0)).toBe(PORTIONS_MIN)
    expect(snapPortions(200)).toBe(PORTIONS_MAX)
  })

  it('formatPortionsEs usa coma decimal es-CL', () => {
    expect(formatPortionsEs(1.5)).toBe('1,5')
    expect(formatPortionsEs(2)).toBe('2')
  })

  it('esDecimal convierte solo digito.digito', () => {
    expect(esDecimal('2C · 1.5V')).toBe('2C · 1,5V')
  })
})

describe('operaciones del mapa (puras, reglas del web)', () => {
  it('addPortionGroup arranca en 1 porcion y es no-op si el grupo ya esta', () => {
    const a = addPortionGroup({}, 'slot-a', GROUP_C)
    expect(slotPortionTargets(a, 'slot-a')).toEqual([{ exchangeGroupId: GROUP_C, portions: 1 }])
    const b = addPortionGroup(a, 'slot-a', GROUP_C)
    expect(b).toBe(a) // misma referencia: no-op (UNIQUE franja+grupo)
  })

  it('removePortionGroup quita el grupo; no-op si no estaba', () => {
    const a = addPortionGroup({}, 'slot-a', GROUP_C)
    const b = removePortionGroup(a, 'slot-a', GROUP_C)
    expect(slotPortionTargets(b, 'slot-a')).toEqual([])
    expect(removePortionGroup(a, 'slot-a', GROUP_V)).toBe(a)
  })

  it('stepPortionValue ±0,5 con clamp; no baja de 0,5 ni sube de 99', () => {
    let map: PortionsBySlot = addPortionGroup({}, 'slot-a', GROUP_C)
    map = stepPortionValue(map, 'slot-a', GROUP_C, 1)
    expect(slotPortionTargets(map, 'slot-a')[0].portions).toBe(1.5)
    map = stepPortionValue(map, 'slot-a', GROUP_C, -1)
    map = stepPortionValue(map, 'slot-a', GROUP_C, -1)
    expect(slotPortionTargets(map, 'slot-a')[0].portions).toBe(PORTIONS_MIN)
    // ya en el minimo: otro -1 lo deja en 0,5 (la baja del grupo es eliminar).
    map = stepPortionValue(map, 'slot-a', GROUP_C, -1)
    expect(slotPortionTargets(map, 'slot-a')[0].portions).toBe(PORTIONS_MIN)
  })

  it('setPortionValue ajusta a paso/rango', () => {
    let map: PortionsBySlot = addPortionGroup({}, 'slot-a', GROUP_C)
    map = setPortionValue(map, 'slot-a', GROUP_C, 2.3)
    expect(slotPortionTargets(map, 'slot-a')[0].portions).toBe(2.5)
  })

  it('hasAnyPortions solo cuenta franjas VIVAS', () => {
    const map = addPortionGroup({}, 'slot-a', GROUP_C)
    expect(hasAnyPortions(map, ['slot-a'])).toBe(true)
    expect(hasAnyPortions(map, ['slot-b'])).toBe(false) // clave huerfana no cuenta
  })

  it('sortGroupsForPicker pone los system primero por sortOrder/code', () => {
    const custom = group({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', code: 'X', name: 'Custom', isSystem: false, sortOrder: 0 })
    const sorted = sortGroupsForPicker([custom, VERDURA, CEREAL])
    expect(sorted.map((g) => g.code)).toEqual(['C', 'V', 'X'])
  })
})

describe('derivacion de macros (motor compartido, jamas NaN)', () => {
  it('slotPortionTotals suma Σ porciones × ref del grupo', () => {
    const map = { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] }
    expect(slotPortionTotals(map, 'slot-a', CATALOG)).toEqual({ calories: 140, proteinG: 4, carbsG: 30, fatsG: 0 })
  })

  it('slotPortionTotals devuelve null sin catalogo o sin porciones', () => {
    const map = { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] }
    expect(slotPortionTotals(map, 'slot-a', null)).toBeNull()
    expect(slotPortionTotals({}, 'slot-a', CATALOG)).toBeNull()
  })

  it('combineSubtotals suma items + porciones; sin porciones devuelve la MISMA referencia', () => {
    const items = { calories: 100, proteinG: 10, carbsG: 20, fatsG: 5, fiberG: 2 }
    const portion = slotPortionTotals({ 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] }, 'slot-a', CATALOG)
    expect(combineSubtotals(items, portion)).toEqual({ calories: 240, proteinG: 14, carbsG: 50, fatsG: 5, fiberG: 2 })
    expect(combineSubtotals(items, null)).toBe(items)
  })

  it('derivePortionTotals expande compuestos (LEG = 1P + 1C)', () => {
    const map = { 'slot-a': [{ exchangeGroupId: GROUP_LEG, portions: 1 }] }
    // 1 LEG = 1P (75/7/0/5) + 1C (70/2/15/0) = 145 kcal, 9 P, 15 C, 5 G
    expect(derivePortionTotals(['slot-a'], map, CATALOG)).toEqual({ calories: 145, proteinG: 9, carbsG: 15, fatsG: 5 })
  })
})

describe('assembleDraft cuelga exchangeTargets condicional', () => {
  it('sin porciones: NO emite la clave (byte-identico a hoy) y valida contra el schema', () => {
    const draft = assembleDraft(structuredState(), { clientId: CLIENT_ID })
    expect('exchangeTargets' in draft.dayVariants[0].mealSlots[0]).toBe(false)
    expect(() => assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })).not.toThrow()
  })

  it('con ≥1 porcion: emite exchangeTargets mapeado al contrato y valida', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] } }
    const slot = assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]
    expect(slot.exchangeTargets).toEqual([{ exchangeGroupId: GROUP_C, portions: 2, notes: null, orderIndex: 0 }])
    expect(() => assembleAndValidateDraft(structuredState(), options)).not.toThrow()
  })

  it('porciones en 0 no cuentan: franja sin la clave', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { 'slot-a': [] } }
    expect('exchangeTargets' in assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]).toBe(false)
  })

  it('porciones de una franja inexistente no afectan la unica franja viva', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { 'slot-fantasma': [{ exchangeGroupId: GROUP_C, portions: 1 }] } }
    expect('exchangeTargets' in assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]).toBe(false)
  })
})

describe('buildFrozenPortionGroups (snapshot congelado por valor)', () => {
  it('congela ref/code/name del grupo simple (composed_of null)', () => {
    const dict = buildFrozenPortionGroups(CATALOG)
    const c = dict.get(GROUP_C)
    expect(c).toMatchObject({
      exchangeGroupId: GROUP_C,
      groupCode: 'C',
      groupName: 'Cereales',
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
      composedOf: null,
      macrosConfirmed: true,
    })
  })

  it('ENRIQUECE composed_of (LEG = 1P + 1C) con los ref_* de cada base', () => {
    const leg = buildFrozenPortionGroups(CATALOG).get(GROUP_LEG)
    expect(leg?.composedOf).toEqual([
      { code: 'P', portions: 1, ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ])
  })

  it('OMITE del dict un compuesto cuya base no resuelve (corta el publish, no snapshot NULL)', () => {
    const orphan = group({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      code: 'ORP',
      name: 'Huerfano',
      composedOf: [{ code: 'ZZ', portions: 1 }],
    })
    const dict = buildFrozenPortionGroups([orphan])
    expect(dict.has('ffffffff-ffff-4fff-8fff-ffffffffffff')).toBe(false)
  })
})

// -- fake write client (registra inserts + rpc) --
function makeClient() {
  const inserts: Array<{ table: string; rows: unknown }> = []
  let counter = 0
  const client = {
    from(table: string) {
      return {
        select() {
          const chain: any = {
            eq() { return chain },
            order() { return chain },
            limit() { return chain },
            async maybeSingle() {
              if (table === 'clients') return { data: { coach_id: 'coach-1', org_id: null, team_id: null }, error: null }
              if (table === 'foods') {
                return {
                  data: { id: FOOD_ID, name: 'Pollo', brand: null, calories: 100, protein_g: 10, carbs_g: 20, fats_g: 5, fiber_g: 2, serving_size: 50, serving_unit: 'g' },
                  error: null,
                }
              }
              return { data: null, error: null }
            },
            then(resolve: (v: unknown) => void) { resolve({ data: [], error: null }) },
          }
          return chain
        },
        insert(rows: unknown) {
          inserts.push({ table, rows })
          return {
            select() { return { async single() { counter += 1; return { data: { id: table + '-' + counter }, error: null } } } },
            then(resolve: (v: unknown) => void) { resolve({ data: null, error: null }) },
          }
        },
      }
    },
    async rpc() { return { data: PUBLISHED_ID, error: null } },
  }
  return { client: client as unknown as NutritionV2WriteClient, inserts }
}

describe('persistAndPublishDraft inserta las porciones con snapshot congelado', () => {
  it('emite la fila de nutrition_slot_exchange_targets_v2 solo con porciones', async () => {
    const draft = assembleAndValidateDraft(structuredState(), {
      clientId: CLIENT_ID,
      portionsBySlot: { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] },
    })
    const { client, inserts } = makeClient()
    const res = await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft,
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-20',
      portionGroups: CATALOG,
    })
    expect(res.ok).toBe(true)
    const targetInsert = inserts.find((i) => i.table === 'nutrition_slot_exchange_targets_v2')
    expect(targetInsert).toBeDefined()
    const rows = targetInsert!.rows as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      exchange_group_id: GROUP_C,
      portions: 2,
      order_index: 0,
      snapshot_group_code: 'C',
      snapshot_group_name: 'Cereales',
      snapshot_ref_calories: 70,
      snapshot_composed_of: null,
      snapshot_macros_confirmed: true,
    })
  })

  it('un draft sin porciones no toca la tabla (byte-identico a hoy)', async () => {
    const draft = assembleAndValidateDraft(structuredState(), { clientId: CLIENT_ID })
    const { client, inserts } = makeClient()
    const res = await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft,
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-20',
      portionGroups: CATALOG,
    })
    expect(res.ok).toBe(true)
    expect(inserts.some((i) => i.table === 'nutrition_slot_exchange_targets_v2')).toBe(false)
  })

  it('corta el publish si un grupo no resuelve contra el catalogo (jamas snapshot NULL)', async () => {
    const draft = assembleAndValidateDraft(structuredState(), {
      clientId: CLIENT_ID,
      portionsBySlot: { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 1 }] },
    })
    const { client } = makeClient()
    // Catalogo SIN el grupo C: buildPortionTargetInsertRows devuelve null → EXCHANGE_GROUP_UNRESOLVED.
    const res = await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft,
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-20',
      portionGroups: [VERDURA],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EXCHANGE_GROUP_UNRESOLVED')
  })
})
