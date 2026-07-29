import { describe, expect, it } from 'vitest'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  PORTIONS_MAX,
  PORTIONS_MIN,
  addPortionGroup,
  buildFrozenPortionGroups,
  clonePortionsForVariant,
  combineSubtotals,
  copySlotPortionsToVariants,
  derivePortionTotals,
  dropVariantPortions,
  esDecimal,
  formatPortionsEs,
  hasAnyPortions,
  livePortionKeys,
  portionsKey,
  removePortionGroup,
  toQuickEditPortionGroup,
  variantPortionKeys,
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
  type BuilderFood,
  type BuilderItem,
  type BuilderState,
} from '../apps/mobile/lib/nutrition-v2-builder'

// GUID-format ids: `NutritionExchangeTargetSchema` usa z.guid() (acepta seeds no-RFC), no
// strings arbitrarios; con ids falsos el schema del draft rechazaria las porciones.
const GROUP_C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_V = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GROUP_P = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_LEG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '33333333-3333-4333-8333-333333333333'

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
    variants: [
      {
        key: 'default',
        label: 'Todos los días',
        dayOfWeek: null,
        isDefault: true,
        targetsMode: 'inherit',
        targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
        slots: [{ key: 'slot-a', name: 'Desayuno', startTime: '08:00', items: [foodItem()] }],
      },
    ],
    activeVariantKey: 'default',
  }
}

/** Clave COMPUESTA del mapa de porciones del dia base (multi-dia, FD4). */
const BASE_SLOT_KEY = portionsKey('default', 'slot-a')

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
    const options = { clientId: CLIENT_ID, portionsBySlot: { [BASE_SLOT_KEY]: [{ exchangeGroupId: GROUP_C, portions: 2 }] } }
    const slot = assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]
    expect(slot.exchangeTargets).toEqual([{ exchangeGroupId: GROUP_C, portions: 2, notes: null, orderIndex: 0 }])
    expect(() => assembleAndValidateDraft(structuredState(), options)).not.toThrow()
  })

  it('porciones en 0 no cuentan: franja sin la clave', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { [BASE_SLOT_KEY]: [] } }
    expect('exchangeTargets' in assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]).toBe(false)
  })

  it('porciones de una franja inexistente no afectan la unica franja viva', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { 'slot-fantasma': [{ exchangeGroupId: GROUP_C, portions: 1 }] } }
    expect('exchangeTargets' in assembleDraft(structuredState(), options).dayVariants[0].mealSlots[0]).toBe(false)
  })

  // Multi-dia (FD4): la clave PLANA (`slot-a`) ya no alcanza. Con dos dias cuyas franjas se
  // clonaron del base, la clave plana haria que editar el sabado moviera el lunes; la compuesta
  // (`variantKey::slotKey`) las separa.
  it('la clave plana (sin variantKey) ya no cuelga porciones: se ignora', () => {
    const options = { clientId: CLIENT_ID, portionsBySlot: { 'slot-a': [{ exchangeGroupId: GROUP_C, portions: 2 }] } }
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
// NUT-005: el freeze de las porciones al publicar ocurre ahora SERVER-SIDE (el endpoint de
// mutaciones resuelve los grupos contra `exchange_groups` con el cliente RLS del coach y congela el
// snapshot en `plan-persistence.ts`). El dispositivo solo manda los `exchangeTargets` del draft.

// ---------------------------------------------------------------------------
// Multi-dia (FD4): clave COMPUESTA `variantKey::slotKey` + clonar/limpiar por dia.
// Espejo 1:1 de la web `_components/portions-state.ts`.
// ---------------------------------------------------------------------------

describe('claves compuestas por dia (portionsKey / variantPortionKeys / livePortionKeys)', () => {
  it('portionsKey separa dos dias con la MISMA franja homonima', () => {
    const base = portionsKey('default', 'slot-a')
    const sabado = portionsKey('sab', 'slot-a')
    expect(base).not.toBe(sabado)
    const map = addPortionGroup(addPortionGroup({}, base, GROUP_C), sabado, GROUP_V)
    expect(slotPortionTargets(map, base)).toEqual([{ exchangeGroupId: GROUP_C, portions: 1 }])
    expect(slotPortionTargets(map, sabado)).toEqual([{ exchangeGroupId: GROUP_V, portions: 1 }])
    // Editar el sabado NO mueve el base (el bug que la clave plana provocaba).
    const stepped = stepPortionValue(map, sabado, GROUP_V, 1)
    expect(slotPortionTargets(stepped, base)).toEqual([{ exchangeGroupId: GROUP_C, portions: 1 }])
    expect(slotPortionTargets(stepped, sabado)).toEqual([{ exchangeGroupId: GROUP_V, portions: 1.5 }])
  })

  it('variantPortionKeys queda alineada por indice con los dias y sus franjas', () => {
    const variants = [
      { key: 'default', slots: [{ key: 's1' }, { key: 's2' }] },
      { key: 'sab', slots: [{ key: 'sab~s1' }] },
    ]
    expect(variantPortionKeys(variants)).toEqual([['default::s1', 'default::s2'], ['sab::sab~s1']])
    expect(livePortionKeys(variants)).toEqual(['default::s1', 'default::s2', 'sab::sab~s1'])
  })
})

describe('clonePortionsForVariant / dropVariantPortions', () => {
  it('clona las porciones del dia origen a las franjas derivadas del destino', () => {
    const map: PortionsBySlot = {
      [portionsKey('default', 's1')]: [{ exchangeGroupId: GROUP_C, portions: 2 }],
      [portionsKey('default', 's2')]: [],
    }
    const cloned = clonePortionsForVariant(map, {
      sourceVariantKey: 'default',
      targetVariantKey: 'sab',
      slotKeyPairs: [
        { from: 's1', to: 'sab~s1' },
        { from: 's2', to: 'sab~s2' },
      ],
    })
    expect(slotPortionTargets(cloned, portionsKey('sab', 'sab~s1'))).toEqual([
      { exchangeGroupId: GROUP_C, portions: 2 },
    ])
    // Franja de origen SIN porciones => no se crea entrada basura en el destino.
    expect(portionsKey('sab', 'sab~s2') in cloned).toBe(false)
    // El clon es por VALOR: mover el destino no toca el origen.
    const moved = stepPortionValue(cloned, portionsKey('sab', 'sab~s1'), GROUP_C, -1)
    expect(slotPortionTargets(moved, portionsKey('default', 's1'))).toEqual([
      { exchangeGroupId: GROUP_C, portions: 2 },
    ])
  })

  it('sin nada que clonar devuelve el MISMO mapa (identidad, sin re-render)', () => {
    const map: PortionsBySlot = { [portionsKey('default', 's1')]: [] }
    const cloned = clonePortionsForVariant(map, {
      sourceVariantKey: 'default',
      targetVariantKey: 'sab',
      slotKeyPairs: [{ from: 's1', to: 'sab~s1' }],
    })
    expect(cloned).toBe(map)
  })

  it('dropVariantPortions borra SOLO las claves del dia eliminado', () => {
    const map: PortionsBySlot = {
      [portionsKey('default', 's1')]: [{ exchangeGroupId: GROUP_C, portions: 1 }],
      [portionsKey('sab', 'sab~s1')]: [{ exchangeGroupId: GROUP_V, portions: 3 }],
    }
    const dropped = dropVariantPortions(map, 'sab')
    expect(Object.keys(dropped)).toEqual([portionsKey('default', 's1')])
    // Dia inexistente => misma referencia.
    expect(dropVariantPortions(dropped, 'dom')).toBe(dropped)
  })
})

// ---------------------------------------------------------------------------
// CE-5: al copiar UNA franja a otros dias, sus porciones viajan con ella. Los destinos
// salen de `resolveSlotCopyTargets` (builder), aca solo se re-etiqueta el mapa.
// ---------------------------------------------------------------------------

describe('copySlotPortionsToVariants (la franja copiada se lleva sus porciones)', () => {
  const TARGETS = [
    { variantKey: 'sab', slotKey: 'sab~s1' },
    { variantKey: 'dom', slotKey: 'dom~s1' },
  ]

  it('replica los targets por VALOR en cada destino y deja el origen intacto', () => {
    const map: PortionsBySlot = {
      [portionsKey('default', 's1')]: [
        { exchangeGroupId: GROUP_C, portions: 2 },
        { exchangeGroupId: GROUP_V, portions: 1.5 },
      ],
    }
    const copied = copySlotPortionsToVariants(map, {
      sourceVariantKey: 'default',
      sourceSlotKey: 's1',
      targets: TARGETS,
    })
    expect(slotPortionTargets(copied, portionsKey('sab', 'sab~s1'))).toEqual([
      { exchangeGroupId: GROUP_C, portions: 2 },
      { exchangeGroupId: GROUP_V, portions: 1.5 },
    ])
    expect(slotPortionTargets(copied, portionsKey('dom', 'dom~s1'))).toHaveLength(2)
    const moved = stepPortionValue(copied, portionsKey('sab', 'sab~s1'), GROUP_C, -1)
    expect(slotPortionTargets(moved, portionsKey('default', 's1'))[0].portions).toBe(2)
    expect(slotPortionTargets(moved, portionsKey('dom', 'dom~s1'))[0].portions).toBe(2)
  })

  it('es REEMPLAZO: un origen sin porciones BORRA las del destino (queda igual al origen)', () => {
    const map: PortionsBySlot = {
      [portionsKey('default', 's1')]: [],
      [portionsKey('sab', 'sab~s1')]: [{ exchangeGroupId: GROUP_P, portions: 3 }],
    }
    const copied = copySlotPortionsToVariants(map, {
      sourceVariantKey: 'default',
      sourceSlotKey: 's1',
      targets: TARGETS,
    })
    expect(portionsKey('sab', 'sab~s1') in copied).toBe(false)
    // El destino sin porciones no genera entrada basura.
    expect(portionsKey('dom', 'dom~s1') in copied).toBe(false)
  })

  it('aplicar dos veces devuelve la MISMA referencia (idempotente, sin re-render)', () => {
    const map: PortionsBySlot = { [portionsKey('default', 's1')]: [{ exchangeGroupId: GROUP_C, portions: 2 }] }
    const params = { sourceVariantKey: 'default', sourceSlotKey: 's1', targets: TARGETS }
    const once = copySlotPortionsToVariants(map, params)
    expect(copySlotPortionsToVariants(once, params)).toBe(once)
    // Origen sin porciones y destinos limpios => nada que mover.
    expect(
      copySlotPortionsToVariants({}, { sourceVariantKey: 'default', sourceSlotKey: 's1', targets: TARGETS }),
    ).toEqual({})
    expect(copySlotPortionsToVariants(map, { ...params, targets: [] })).toBe(map)
  })
})

describe('toQuickEditPortionGroup (porciones propias FD6a)', () => {
  it('traduce un grupo del catalogo al dict del quick-edit sin compuestos', () => {
    expect(toQuickEditPortionGroup(CEREAL)).toEqual({
      exchangeGroupId: GROUP_C,
      groupCode: 'C',
      groupName: 'Cereales',
      color: null,
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
      composedOf: null,
      macrosConfirmed: true,
      sortOrder: 0,
    })
  })
})
