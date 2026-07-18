import { describe, expect, it } from 'vitest'
import type {
  NutritionIntakeReadItem,
  NutritionMealSlotRead,
  NutritionSlotExchangeTargetRead,
  NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import {
  activeSyntheticMarks,
  attemptFor,
  bumpAttempt,
  collectTodayIntakeIds,
  dayCoverageWithPending,
  derivedFoodNames,
  dupPortionInfo,
  effectiveTargetCoverage,
  extraPortionsValue,
  formatPortionsEs,
  getOrCreateNutritionDeviceId,
  loadPortionAttemptMap,
  nextMarkForTarget,
  nextPortionOrdinal,
  NUTRITION_DEVICE_ID_STORAGE_KEY,
  pendingInCell,
  pendingPortionsSum,
  portionAttemptKey,
  portionAttemptStorageKey,
  portionsCountLabelEs,
  prunePortionAttemptMap,
  reconcilePendingMarks,
  savePortionAttemptMap,
  segmentsForTarget,
  slotHasPortionTargets,
  slotsWithPrescribedContent,
  splitRetryCopy,
  type PendingPortionMark,
  type StringStorageLike,
} from './portion-marks.logic'

// ---------------------------------------------------------------------------
// Fixtures mínimos
// ---------------------------------------------------------------------------

function makeIntake(overrides: Partial<NutritionIntakeReadItem> = {}): NutritionIntakeReadItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    foodId: null,
    customName: null,
    quantity: 1,
    unit: 'porción',
    mealSlot: 'almuerzo',
    source: 'prescription',
    captureMethod: 'prescription',
    occurredAt: '2026-07-18T12:00:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: null,
    snapshot: {
      name: 'Cereales',
      brand: null,
      calories: 70,
      proteinG: 2,
      carbsG: 15,
      fatsG: 0,
      fiberG: null,
      servingSize: 1,
      servingUnit: 'porción',
    },
    totals: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0, fiberG: null },
    ...overrides,
  } as NutritionIntakeReadItem
}

function makeTarget(
  overrides: Partial<NutritionSlotExchangeTargetRead> = {},
): NutritionSlotExchangeTargetRead {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    exchangeGroupId: '33333333-3333-4333-8333-333333333333',
    groupCode: 'C',
    groupName: 'Cereales',
    color: '#f59e0b',
    portions: 2,
    notes: null,
    orderIndex: 0,
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
    composedOf: null,
    macrosConfirmed: true,
    ...overrides,
  }
}

function makeSlot(overrides: Partial<NutritionMealSlotRead> = {}): NutritionMealSlotRead {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    code: 'almuerzo',
    name: 'Almuerzo',
    startTime: '13:00',
    endTime: null,
    mode: 'anchor',
    required: true,
    instructions: null,
    targets: {},
    prescriptionItems: [],
    intakeItems: [],
    ...overrides,
  } as NutritionMealSlotRead
}

function mark(overrides: Partial<PendingPortionMark> = {}): PendingPortionMark {
  return {
    key: 'k1',
    slotCode: 'almuerzo',
    groupCode: 'C',
    groupName: 'Cereales',
    portions: 1,
    ordinal: 0,
    attempt: 1,
    entryId: null,
    ...overrides,
  }
}

class FakeStorage implements StringStorageLike {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

describe('formatPortionsEs / portionsCountLabelEs', () => {
  it('usa coma decimal es-CL', () => {
    expect(formatPortionsEs(1.5)).toBe('1,5')
    expect(formatPortionsEs(2)).toBe('2')
  })

  it('singular/plural para dupWarning', () => {
    expect(portionsCountLabelEs(1)).toBe('1 porción')
    expect(portionsCountLabelEs(2.5)).toBe('2,5 porciones')
  })
})

describe('splitRetryCopy', () => {
  it('separa mensaje y label de la acción sin duplicar strings del copy canónico', () => {
    const { message, retryLabel } = splitRetryCopy('No se pudo marcar la porción. Reintentar')
    expect(message).toBe('No se pudo marcar la porción.')
    expect(retryLabel).toBe('Reintentar')
  })

  it('degrada sin punto separador', () => {
    expect(splitRetryCopy('Reintentar')).toEqual({ message: 'Reintentar', retryLabel: 'Reintentar' })
  })
})

// ---------------------------------------------------------------------------
// Próximo tap / segmentos / exceso
// ---------------------------------------------------------------------------

describe('nextMarkForTarget', () => {
  it('marca 1 porción cuando resta 1 o más', () => {
    expect(nextMarkForTarget(4, 2)).toEqual({ extra: false, portions: 1 })
  })

  it('marca 0,5 cuando es lo que resta al target', () => {
    expect(nextMarkForTarget(1.5, 1)).toEqual({ extra: false, portions: 0.5 })
  })

  it('pasa a flujo extra con lo prescrito completo (y nunca descuenta)', () => {
    expect(nextMarkForTarget(2, 2)).toEqual({ extra: true, portions: 1 })
    expect(nextMarkForTarget(2, 3.5)).toEqual({ extra: true, portions: 1 })
  })
})

describe('segmentsForTarget', () => {
  it('un segmento por porción prescrita; media = capacidad 0,5 al final', () => {
    const segments = segmentsForTarget(1.5, 0, 0)
    expect(segments.map((s) => s.capacity)).toEqual([1, 0.5])
  })

  it('llena marcadas primero y derivadas después, de izquierda a derecha', () => {
    const segments = segmentsForTarget(3, 1, 1)
    expect(segments).toEqual([
      { capacity: 1, marked: 1, derived: 0 },
      { capacity: 1, marked: 0, derived: 1 },
      { capacity: 1, marked: 0, derived: 0 },
    ])
  })

  it('el llenado va por floor(x·2)/2 (derivadas 0,7 pintan 0,5)', () => {
    const segments = segmentsForTarget(2, 0, 0.7)
    expect(segments[0]).toEqual({ capacity: 1, marked: 0, derived: 0.5 })
    expect(segments[1]).toEqual({ capacity: 1, marked: 0, derived: 0 })
  })

  it('capea al prescrito (el exceso va como badge, no como segmentos)', () => {
    const segments = segmentsForTarget(2, 3, 0)
    expect(segments.reduce((sum, s) => sum + s.marked + s.derived, 0)).toBe(2)
  })

  it('media porción marcada llena medio círculo', () => {
    const segments = segmentsForTarget(2, 0.5, 0)
    expect(segments[0]).toEqual({ capacity: 1, marked: 0.5, derived: 0 })
  })
})

describe('extraPortionsValue', () => {
  it('devuelve el exceso con 1 decimal máx', () => {
    expect(extraPortionsValue(2, 3)).toBe(1)
    expect(extraPortionsValue(2, 3.57)).toBe(1.6)
    expect(extraPortionsValue(2, 1.5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Cobertura efectiva + delta optimista + reconciliación (F1-front)
// ---------------------------------------------------------------------------

describe('delta optimista y reconciliación', () => {
  it('effectiveTargetCoverage suma el delta SOLO a marcadas', () => {
    const cov = effectiveTargetCoverage(makeTarget({ marcadas: 1, derivadas: 0.5 }), 1)
    expect(cov).toEqual({ marcadas: 2, derivadas: 0.5, coverage: 2.5 })
  })

  it('target sin cobertura del server arranca en 0', () => {
    const cov = effectiveTargetCoverage(makeTarget(), 0.5)
    expect(cov).toEqual({ marcadas: 0.5, derivadas: 0, coverage: 0.5 })
  })

  it('pendingInCell/pendingPortionsSum filtran por celda (franja, grupo)', () => {
    const pending = [
      mark({ key: 'a', portions: 1 }),
      mark({ key: 'b', portions: 0.5 }),
      mark({ key: 'c', slotCode: 'cena', portions: 1 }),
      mark({ key: 'd', groupCode: 'V', portions: 1 }),
    ]
    const cell = pendingInCell(pending, 'almuerzo', 'C')
    expect(cell.map((m) => m.key)).toEqual(['a', 'b'])
    expect(pendingPortionsSum(cell)).toBe(1.5)
  })

  it('reconcilePendingMarks saca SOLO las confirmadas que ya llegaron en el read-model', () => {
    const pending = [
      mark({ key: 'confirmada', entryId: 'e1' }),
      mark({ key: 'confirmada-sin-llegar', entryId: 'e2' }),
      mark({ key: 'en-vuelo', entryId: null }),
    ]
    const next = reconcilePendingMarks(pending, new Set(['e1']))
    expect(next.map((m) => m.key)).toEqual(['confirmada-sin-llegar', 'en-vuelo'])
  })

  it('collectTodayIntakeIds junta franjas y sin-franja', () => {
    const today = {
      mealSlots: [makeSlot({ intakeItems: [makeIntake({ id: 'a'.repeat(8) as string })] })],
      unassignedIntake: [makeIntake({ id: 'b'.repeat(8) as string })],
    } as unknown as NutritionTodayReadModel
    const ids = collectTodayIntakeIds(today)
    expect(ids.has('a'.repeat(8))).toBe(true)
    expect(ids.has('b'.repeat(8))).toBe(true)
  })

  it('dayCoverageWithPending suma el delta por grupo solo a marcadas/coverage', () => {
    const rows = dayCoverageWithPending(
      [
        { groupCode: 'C', groupName: 'Cereales', color: null, prescribed: 4, marcadas: 1, derivadas: 0.5, coverage: 1.5 },
        { groupCode: 'V', groupName: 'Verduras', color: null, prescribed: 2, marcadas: 0, derivadas: 0, coverage: 0 },
      ],
      [mark({ portions: 1 }), mark({ key: 'k2', slotCode: 'cena', portions: 0.5 })],
    )
    expect(rows[0]).toMatchObject({ marcadas: 2.5, derivadas: 0.5, coverage: 3 })
    expect(rows[1]).toMatchObject({ marcadas: 0, coverage: 0 })
  })
})

// ---------------------------------------------------------------------------
// Ordinal + attempt (B2/M1)
// ---------------------------------------------------------------------------

describe('ordinal y attempt', () => {
  it('activeSyntheticMarks cuenta solo sintéticos ACTIVOS del grupo, ordenados', () => {
    const items = [
      makeIntake({ id: '1', exchangeGroupCode: 'C', exchangePortions: 1, occurredAt: '2026-07-18T14:00:00Z' }),
      makeIntake({ id: '2', exchangeGroupCode: 'C', exchangePortions: 0.5, occurredAt: '2026-07-18T12:00:00Z' }),
      makeIntake({ id: '3', exchangeGroupCode: 'C', exchangePortions: 1, status: 'corrected' }),
      makeIntake({ id: '4', exchangeGroupCode: 'V', exchangePortions: 1 }),
      makeIntake({ id: '5', foodId: '55555555-5555-4555-8555-555555555555' }),
    ]
    const marks = activeSyntheticMarks(items, 'C')
    expect(marks.map((m) => m.id)).toEqual(['2', '1'])
  })

  it('nextPortionOrdinal = activos del server + pendientes locales (0-based)', () => {
    expect(nextPortionOrdinal(0, 0)).toBe(0)
    expect(nextPortionOrdinal(2, 1)).toBe(3)
  })

  it('attempt arranca en 1 y sube con CADA deshacer del ordinal', () => {
    const key = portionAttemptKey('2026-07-18', 'almuerzo', 'C', 0)
    let map = {}
    expect(attemptFor(map, key)).toBe(1)
    map = bumpAttempt(map, key)
    expect(attemptFor(map, key)).toBe(2)
    map = bumpAttempt(map, key)
    expect(attemptFor(map, key)).toBe(3)
  })

  it('el bump de un ordinal no toca otros ordinales de la celda', () => {
    const k0 = portionAttemptKey('2026-07-18', 'almuerzo', 'C', 0)
    const k1 = portionAttemptKey('2026-07-18', 'almuerzo', 'C', 1)
    const map = bumpAttempt({}, k1)
    expect(attemptFor(map, k0)).toBe(1)
    expect(attemptFor(map, k1)).toBe(2)
  })

  it('prunePortionAttemptMap conserva solo el día vigente y valores válidos', () => {
    const map = {
      [portionAttemptKey('2026-07-18', 'almuerzo', 'C', 0)]: 2,
      [portionAttemptKey('2026-07-17', 'almuerzo', 'C', 0)]: 5,
      [portionAttemptKey('2026-07-18', 'cena', 'V', 1)]: 0,
    }
    expect(prunePortionAttemptMap(map, '2026-07-18')).toEqual({
      [portionAttemptKey('2026-07-18', 'almuerzo', 'C', 0)]: 2,
    })
  })

  it('load/save redondean el ciclo por localStorage (y podan fechas viejas)', () => {
    const storage = new FakeStorage()
    const clientId = 'client-1'
    const key = portionAttemptKey('2026-07-18', 'almuerzo', 'C', 0)
    savePortionAttemptMap(storage, clientId, { [key]: 2, [portionAttemptKey('2026-07-10', 'x', 'C', 0)]: 9 })
    const loaded = loadPortionAttemptMap(storage, clientId, '2026-07-18')
    expect(loaded).toEqual({ [key]: 2 })
  })

  it('load degrada a {} con JSON corrupto o storage nulo', () => {
    const storage = new FakeStorage()
    storage.setItem(portionAttemptStorageKey('c'), '{no-json')
    expect(loadPortionAttemptMap(storage, 'c', '2026-07-18')).toEqual({})
    expect(loadPortionAttemptMap(null, 'c', '2026-07-18')).toEqual({})
  })
})

describe('getOrCreateNutritionDeviceId', () => {
  it('genera con prefijo web-, persiste y reusa', () => {
    const storage = new FakeStorage()
    const first = getOrCreateNutritionDeviceId(storage, () => 'uuid-1')
    expect(first).toBe('web-uuid-1')
    expect(storage.getItem(NUTRITION_DEVICE_ID_STORAGE_KEY)).toBe('web-uuid-1')
    const second = getOrCreateNutritionDeviceId(storage, () => 'uuid-2')
    expect(second).toBe('web-uuid-1')
  })

  it('sin storage devuelve un id efímero válido', () => {
    expect(getOrCreateNutritionDeviceId(null, () => 'uuid-3')).toBe('web-uuid-3')
  })
})

// ---------------------------------------------------------------------------
// Vistas derivadas del read-model
// ---------------------------------------------------------------------------

describe('franjas y equivalencias', () => {
  it('slotsWithPrescribedContent incluye franjas solo-porciones (Q2) y no inventa nada sin porciones (Q1)', () => {
    const withItems = makeSlot({ id: '44444444-4444-4444-8444-444444444401', code: 'desayuno', prescriptionItems: [{} as never] })
    const onlyPortions = makeSlot({ id: '44444444-4444-4444-8444-444444444402', code: 'almuerzo', exchangeTargets: [makeTarget()] })
    const emptySlot = makeSlot({ id: '44444444-4444-4444-8444-444444444403', code: 'cena' })
    const today = { mealSlots: [withItems, onlyPortions, emptySlot] } as unknown as NutritionTodayReadModel
    expect(slotsWithPrescribedContent(today).map((s) => s.code)).toEqual(['desayuno', 'almuerzo'])
    expect(slotHasPortionTargets(emptySlot)).toBe(false)
  })

  it('derivedFoodNames lista alimentos reales ACTIVOS del grupo, sin duplicar', () => {
    const foodId = '55555555-5555-4555-8555-555555555555'
    const foods = [
      { foodId, exchangeGroupId: '33333333-3333-4333-8333-333333333333', groupCode: 'C', name: 'Arroz integral', brand: null, portionLabel: null, portionGrams: 50 },
    ]
    const items = [
      makeIntake({ id: '1', foodId, snapshot: { ...makeIntake().snapshot, name: 'Arroz integral' } }),
      makeIntake({ id: '2', foodId, snapshot: { ...makeIntake().snapshot, name: 'Arroz integral' } }),
      makeIntake({ id: '3', foodId, status: 'corrected' }),
      makeIntake({ id: '4', exchangeGroupCode: 'C', exchangePortions: 1 }), // sintético ⇒ no derivada
    ]
    expect(derivedFoodNames(items, foods, 'C')).toEqual(['Arroz integral'])
    expect(derivedFoodNames(items, foods, 'V')).toEqual([])
  })
})

describe('dupPortionInfo (aviso anti-duplicado)', () => {
  const foodId = '55555555-5555-4555-8555-555555555555'
  const foods = [
    { foodId, exchangeGroupId: '33333333-3333-4333-8333-333333333333', groupCode: 'C', name: 'Arroz', brand: null, portionLabel: null, portionGrams: 50 },
  ]

  it('avisa con marcadas efectivas (server + delta) del grupo en la franja', () => {
    const today = {
      mealSlots: [makeSlot({ exchangeTargets: [makeTarget({ marcadas: 1 })] })],
      exchangeFoods: foods,
    } as unknown as NutritionTodayReadModel
    const info = dupPortionInfo({ foodId, mealSlotCode: 'almuerzo', today, pending: [mark({ portions: 0.5 })] })
    expect(info).toEqual({ groupCode: 'C', groupName: 'Cereales', marcadas: 1.5 })
  })

  it('no avisa sin marcadas, sin franja o con alimento sin clasificar', () => {
    const today = {
      mealSlots: [makeSlot({ exchangeTargets: [makeTarget()] })],
      exchangeFoods: foods,
    } as unknown as NutritionTodayReadModel
    expect(dupPortionInfo({ foodId, mealSlotCode: 'almuerzo', today, pending: [] })).toBeNull()
    expect(dupPortionInfo({ foodId, mealSlotCode: null, today, pending: [mark()] })).toBeNull()
    expect(
      dupPortionInfo({ foodId: '66666666-6666-4666-8666-666666666666', mealSlotCode: 'almuerzo', today, pending: [mark()] }),
    ).toBeNull()
  })
})
