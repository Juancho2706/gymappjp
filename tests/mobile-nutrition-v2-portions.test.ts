// Porciones V2 (RN) — lógica pura + contador attempt persistido + glue de cola
// (apps/mobile/lib/nutrition-v2-portions.ts). SPEC nutrition-portions R4/R5/UX-c,
// hallazgos B2/M1 (attempt por ordinal), F1-front (reconciliación del delta) y
// M3 (buckets con referencia estable).
//
// Mismo gotcha de resolución que mobile-nutrition-v2-offline.test.ts:
// @react-native-async-storage y @react-native-community/netinfo se mockean por PATH
// ABSOLUTO resuelto desde apps/mobile via `vi.doMock` + import() dinámico.
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNutritionPortionIntakeKey } from '@eva/nutrition-v2'
// Import SOLO de tipos (se borra en compilación: no ejecuta el módulo antes de los mocks).
import type { PendingPortionMark } from '../apps/mobile/lib/nutrition-v2-portions'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')

function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

const asyncStore = new Map<string, string>()
const asyncStorageMock = {
  getItem: vi.fn((key: string) => Promise.resolve(asyncStore.has(key) ? (asyncStore.get(key) as string) : null)),
  setItem: vi.fn((key: string, value: string) => {
    asyncStore.set(key, value)
    return Promise.resolve()
  }),
  removeItem: vi.fn((key: string) => {
    asyncStore.delete(key)
    return Promise.resolve()
  }),
}

const netInfoFetchMock = vi.fn(() =>
  Promise.resolve({ isConnected: true, isInternetReachable: true }),
)

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: asyncStorageMock,
}))
vi.doMock(resolveMobileDep('@react-native-community/netinfo'), () => ({
  default: { fetch: netInfoFetchMock },
}))

class MockApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
vi.mock('../apps/mobile/lib/api', () => ({ ApiError: MockApiError }))
vi.mock('../apps/mobile/lib/nutrition-v2.api', () => ({
  recordNutritionIntakeV2: vi.fn(),
  correctNutritionIntakeV2: vi.fn(),
}))

const portions = await import('../apps/mobile/lib/nutrition-v2-portions')
const offline = await import('../apps/mobile/lib/nutrition-v2-offline')

const {
  allocatePortionAttempt,
  allocatePortionOrdinal,
  buildDayCoverageView,
  buildPortionCoverageView,
  buildPortionMarkMutation,
  cancelQueuedPortionMark,
  floorHalf,
  formatPortionsCl,
  getQueuedPortionKeys,
  nextPortionStep,
  pendingPortionsFor,
  pickLastSyntheticIntake,
  PORTION_SEGMENT_CAP,
  portionBarFractions,
  portionChipIsCompact,
  prunePortionAttemptDates,
  reconcilePendingPortionMarks,
  registerPortionUndo,
  registerPortionUndoOrdinal,
  stablePortionBuckets,
} = portions

const USER = 'alumno-1'
const DATE = '2026-07-18'

beforeEach(() => {
  asyncStore.clear()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Contador attempt por ordinal (B2/M1)
// ---------------------------------------------------------------------------

describe('allocatePortionOrdinal / registerPortionUndoOrdinal (puro)', () => {
  it('marca secuencial: ordinales 0,1,2 con attempt 1', () => {
    let cell = undefined as ReturnType<typeof allocatePortionOrdinal>['cell'] | undefined
    const seen: Array<[number, number]> = []
    for (let i = 0; i < 3; i += 1) {
      const next = allocatePortionOrdinal(cell)
      cell = next.cell
      seen.push([next.ordinal, next.attempt])
    }
    expect(seen).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ])
  })

  it('deshacer → re-marcar reusa el ordinal con attempt incrementado (key nueva, jamás colisiona)', () => {
    const first = allocatePortionOrdinal(undefined) // ordinal 0, attempt 1
    const undone = registerPortionUndoOrdinal(first.cell) // ordinal 0 → attempt 2
    expect(undone.ordinal).toBe(0)
    expect(undone.attempt).toBe(2)
    const again = allocatePortionOrdinal(undone.cell)
    expect(again.ordinal).toBe(0)
    expect(again.attempt).toBe(2)

    const keyOf = (ordinal: number, attempt: number) =>
      buildNutritionPortionIntakeKey({
        clientId: 'c1',
        deviceId: 'd1',
        localDate: DATE,
        slotCode: 'almuerzo',
        groupCode: 'C',
        ordinal,
        attempt,
      })
    expect(keyOf(first.ordinal, first.attempt)).not.toBe(keyOf(again.ordinal, again.attempt))
  })

  it('deshacer sobre celda vacía no baja de 0 y deja attempt 2 para el ordinal 0', () => {
    const undone = registerPortionUndoOrdinal(undefined)
    expect(undone.ordinal).toBe(0)
    expect(undone.attempt).toBe(2)
    expect(undone.cell.next).toBe(0)
  })
})

describe('allocatePortionAttempt / registerPortionUndo (persistido)', () => {
  it('persiste entre llamadas y separa celdas por (franja, grupo)', async () => {
    const a = await allocatePortionAttempt({ userId: USER, localDate: DATE, slotCode: 'almuerzo', groupCode: 'C' })
    const b = await allocatePortionAttempt({ userId: USER, localDate: DATE, slotCode: 'almuerzo', groupCode: 'C' })
    const otherCell = await allocatePortionAttempt({ userId: USER, localDate: DATE, slotCode: 'cena', groupCode: 'C' })
    expect([a.ordinal, a.attempt]).toEqual([0, 1])
    expect([b.ordinal, b.attempt]).toEqual([1, 1])
    expect([otherCell.ordinal, otherCell.attempt]).toEqual([0, 1])

    const undo = await registerPortionUndo({ userId: USER, localDate: DATE, slotCode: 'almuerzo', groupCode: 'C' })
    expect([undo.ordinal, undo.attempt]).toEqual([1, 2])
    const remark = await allocatePortionAttempt({ userId: USER, localDate: DATE, slotCode: 'almuerzo', groupCode: 'C' })
    expect([remark.ordinal, remark.attempt]).toEqual([1, 2])
  })

  it('serializa taps concurrentes (sin pisarse el read-modify-write)', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        allocatePortionAttempt({ userId: USER, localDate: DATE, slotCode: 'almuerzo', groupCode: 'P' }),
      ),
    )
    expect(results.map((r) => r.ordinal).sort((x, y) => x - y)).toEqual([0, 1, 2, 3])
  })

  it('prunePortionAttemptDates retiene solo las fechas más recientes', () => {
    const pruned = prunePortionAttemptDates(
      {
        '2026-07-10': {},
        '2026-07-15': {},
        '2026-07-16': {},
        '2026-07-17': {},
        '2026-07-18': {},
      },
      4,
    )
    expect(Object.keys(pruned).sort()).toEqual(['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18'])
  })
})

// ---------------------------------------------------------------------------
// Payload del intake sintético (R4/B1)
// ---------------------------------------------------------------------------

describe('buildPortionMarkMutation', () => {
  const target = {
    groupCode: 'C',
    groupName: 'Cereales',
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0.5 },
    macrosConfirmed: true,
  }
  const base = {
    clientId: '11111111-1111-4111-8111-111111111111',
    deviceId: 'ios-abc',
    localDate: DATE,
    occurredAt: '2026-07-18T13:00:00.000Z',
    timezone: 'America/Santiago',
    slotCode: 'almuerzo',
    planVersionId: null,
    daySnapshotId: null,
    target,
    portions: 0.5 as const,
    ordinal: 0,
    attempt: 1,
  }

  it('emite la key por el helper canónico (ordinal+attempt) y transporta porción en el snapshot', () => {
    const { payload, idempotencyKey } = buildPortionMarkMutation(base)
    expect(idempotencyKey).toBe(
      buildNutritionPortionIntakeKey({
        clientId: base.clientId,
        deviceId: base.deviceId,
        localDate: DATE,
        slotCode: 'almuerzo',
        groupCode: 'C',
        ordinal: 0,
        attempt: 1,
      }),
    )
    expect(payload.idempotencyKey).toBe(idempotencyKey)
    expect(payload.source).toBe('prescription')
    expect(payload.foodId).toBeNull()
    expect(payload.customName).toBe('Cereales')
    expect(payload.mealSlot).toBe('almuerzo')
    // p_snapshot (SPEC B1): los 2 valores viajan DENTRO del snapshot.
    expect(payload.snapshot.exchangeGroupCode).toBe('C')
    expect(payload.snapshot.exchangePortions).toBe(0.5)
    // Macros = ref por porción; quantity = porciones con unidad no-g/ml ⇒ el factor
    // del servidor produce totales ref × porciones.
    expect(payload.quantity).toBe(0.5)
    expect(payload.unit).toBe('porción')
    expect(payload.snapshot.calories).toBe(70)
    expect(payload.snapshot.proteinG).toBe(2)
    expect(payload.snapshot.servingSize).toBeNull()
  })

  it('re-marcar tras deshacer (attempt 2) produce una key distinta', () => {
    const first = buildPortionMarkMutation(base)
    const second = buildPortionMarkMutation({ ...base, attempt: 2 })
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
  })
})

// ---------------------------------------------------------------------------
// Cobertura, segmentos y paso siguiente (R5/UX-b)
// ---------------------------------------------------------------------------

describe('buildPortionCoverageView', () => {
  it('llena por floor(x·2)/2 en orden marcadas → derivadas → pendientes', () => {
    const view = buildPortionCoverageView({
      prescribed: 3,
      marcadas: 1,
      derivadas: 0.8, // floor(1.6)/2 = 0.5 ⇒ 1 media derivada
      pendingMarcadas: 0.5,
      pendingUnsynced: true,
    })
    expect(view.segments).toHaveLength(3)
    expect(view.segments[0]).toMatchObject({ left: 'marked', right: 'marked' })
    expect(view.segments[1]).toMatchObject({ left: 'derived', right: 'pending' })
    expect(view.segments[2]).toMatchObject({ left: 'empty', right: 'empty' })
    expect(view.coverage).toBe(2.3)
    expect(view.complete).toBe(false)
    expect(view.excess).toBe(0)
    expect(view.unsynced).toBe(true)
  })

  it('media porción prescrita final = segmento semicírculo (right null)', () => {
    const view = buildPortionCoverageView({
      prescribed: 1.5,
      marcadas: 1.5,
      derivadas: 0,
      pendingMarcadas: 0,
      pendingUnsynced: false,
    })
    expect(view.segments).toHaveLength(2)
    expect(view.segments[1].right).toBeNull()
    expect(view.complete).toBe(true)
  })

  it('exceso "+n" cuantizado a 0,5 y voids optimistas descuentan marcadas (clamp ≥ 0)', () => {
    const excess = buildPortionCoverageView({
      prescribed: 2,
      marcadas: 3,
      derivadas: 0,
      pendingMarcadas: 0,
      pendingUnsynced: false,
    })
    expect(excess.excess).toBe(1)
    const voided = buildPortionCoverageView({
      prescribed: 2,
      marcadas: 1,
      derivadas: 0,
      pendingMarcadas: 0,
      pendingUnsynced: false,
      voidedPortions: 2,
    })
    expect(voided.marcadas).toBe(0)
    expect(voided.coverage).toBe(0)
  })
})

describe('nextPortionStep / formato', () => {
  it('paso 1 con resto ≥ 1; 0,5 si es lo que queda; confirmación con lo prescrito completo', () => {
    expect(nextPortionStep({ prescribed: 2, coverage: 0 })).toEqual({ portions: 1, requiresConfirm: false })
    expect(nextPortionStep({ prescribed: 1.5, coverage: 1 })).toEqual({ portions: 0.5, requiresConfirm: false })
    expect(nextPortionStep({ prescribed: 2, coverage: 2 })).toEqual({ portions: 1, requiresConfirm: true })
  })

  it('formatPortionsCl usa coma decimal es-CL y floorHalf cuantiza a medias', () => {
    expect(formatPortionsCl(1.5)).toBe('1,5')
    expect(formatPortionsCl(2)).toBe('2')
    expect(formatPortionsCl(0.75)).toBe('0,8')
    expect(floorHalf(0.9)).toBe(0.5)
    expect(floorHalf(1.5)).toBe(1.5)
  })
})

describe('buildDayCoverageView', () => {
  it('suma el delta pendiente del grupo y marca completo/exceso', () => {
    const row = {
      groupCode: 'C',
      groupName: 'Cereales',
      color: '#F59E0B',
      prescribed: 2,
      marcadas: 1,
      derivadas: 0.5,
      coverage: 1.5,
    }
    const view = buildDayCoverageView(row, { C: 0.5 }, {})
    expect(view.coverage).toBe(2)
    expect(view.complete).toBe(true)
    expect(view.excess).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Delta optimista + reconciliación (F1-front) y buckets estables (M3)
// ---------------------------------------------------------------------------

function markFixture(over: Partial<PendingPortionMark>): PendingPortionMark {
  return {
    idempotencyKey: 'k',
    slotCode: 'almuerzo',
    groupCode: 'C',
    portions: 1,
    ordinal: 0,
    attempt: 1,
    status: 'inflight',
    entryId: null,
    confirmedAt: null,
    createdAt: 100,
    ...over,
  }
}

describe('reconcilePendingPortionMarks', () => {
  it('descarta confirmadas ANTES del fetch, conserva confirmadas después y las inflight', () => {
    const oldConfirmed = markFixture({ idempotencyKey: 'a', status: 'confirmed', confirmedAt: 500 })
    const newConfirmed = markFixture({ idempotencyKey: 'b', status: 'confirmed', confirmedAt: 2000 })
    const inflight = markFixture({ idempotencyKey: 'c', status: 'inflight' })
    const result = reconcilePendingPortionMarks([oldConfirmed, newConfirmed, inflight], {
      fetchStartedAt: 1000,
      queuedKeys: new Set(),
    })
    expect(result.map((m) => m.idempotencyKey)).toEqual(['b', 'c'])
  })

  it('queued: se conserva mientras siga en la cola; sale si fue flusheada antes del fetch', () => {
    const stillQueued = markFixture({ idempotencyKey: 'q1', status: 'queued', createdAt: 100 })
    const flushed = markFixture({ idempotencyKey: 'q2', status: 'queued', createdAt: 100 })
    const flushedButNew = markFixture({ idempotencyKey: 'q3', status: 'queued', createdAt: 5000 })
    const result = reconcilePendingPortionMarks([stillQueued, flushed, flushedButNew], {
      fetchStartedAt: 1000,
      queuedKeys: new Set(['q1']),
    })
    expect(result.map((m) => m.idempotencyKey)).toEqual(['q1', 'q3'])
  })
})

describe('stablePortionBuckets (M3)', () => {
  it('reutiliza la referencia del bucket de las franjas NO afectadas', () => {
    const a1 = markFixture({ idempotencyKey: 'a1', slotCode: 'desayuno' })
    const b1 = markFixture({ idempotencyKey: 'b1', slotCode: 'almuerzo' })
    const first = stablePortionBuckets({}, [a1, b1])
    const b2 = markFixture({ idempotencyKey: 'b2', slotCode: 'almuerzo' })
    const second = stablePortionBuckets(first, [a1, b1, b2])
    expect(second.desayuno).toBe(first.desayuno) // referencia intacta ⇒ memo no re-renderiza
    expect(second.almuerzo).not.toBe(first.almuerzo)
    expect(second.almuerzo).toHaveLength(2)
  })

  it('pendingPortionsFor suma solo el grupo y detecta sin-sincronizar', () => {
    const marks = [
      markFixture({ idempotencyKey: 'x', groupCode: 'C', portions: 1, status: 'confirmed', confirmedAt: 1 }),
      markFixture({ idempotencyKey: 'y', groupCode: 'C', portions: 0.5, status: 'queued' }),
      markFixture({ idempotencyKey: 'z', groupCode: 'P', portions: 1 }),
    ]
    expect(pendingPortionsFor(marks, 'C')).toEqual({ portions: 1.5, unsynced: true })
    expect(pendingPortionsFor(marks, 'V')).toEqual({ portions: 0, unsynced: false })
  })
})

describe('pickLastSyntheticIntake', () => {
  const entry = (over: Record<string, unknown>) => ({
    id: 'e1',
    status: 'active',
    occurredAt: '2026-07-18T12:00:00Z',
    exchangeGroupCode: 'C',
    exchangePortions: 1,
    ...over,
  })

  it('elige el último ACTIVO del grupo por columnas dedicadas (nunca por nombre)', () => {
    const items = [
      entry({ id: 'a', occurredAt: '2026-07-18T10:00:00Z' }),
      entry({ id: 'b', occurredAt: '2026-07-18T14:00:00Z' }),
      entry({ id: 'c', occurredAt: '2026-07-18T15:00:00Z', status: 'corrected' }),
      entry({ id: 'd', occurredAt: '2026-07-18T16:00:00Z', exchangeGroupCode: 'P' }),
      entry({ id: 'e', occurredAt: '2026-07-18T17:00:00Z', exchangePortions: null }),
    ]
    expect(pickLastSyntheticIntake(items as never, 'C')?.id).toBe('b')
    expect(pickLastSyntheticIntake(items as never, 'V')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Glue de cola: cancelar-en-cola (M1) + keys para reconciliar
// ---------------------------------------------------------------------------

describe('cancelQueuedPortionMark / getQueuedPortionKeys', () => {
  const payload = (idempotencyKey: string) =>
    ({ clientId: 'c1', idempotencyKey }) as never

  it('cancela SOLO la entrada apuntada por key y reporta true', async () => {
    await offline.enqueueNutritionV2Mutation({ action: 'record', userId: USER, payload: payload('key-1') })
    await offline.enqueueNutritionV2Mutation({ action: 'record', userId: USER, payload: payload('key-2') })
    expect(await getQueuedPortionKeys(USER)).toEqual(new Set(['key-1', 'key-2']))

    await expect(cancelQueuedPortionMark(USER, 'key-1')).resolves.toBe(true)
    expect(await getQueuedPortionKeys(USER)).toEqual(new Set(['key-2']))
    const status = await offline.getNutritionV2QueueStatus(USER)
    expect(status.pending).toBe(1)
  })

  it('key inexistente (ya flusheada) ⇒ false: el caller la trata como sincronizada', async () => {
    await expect(cancelQueuedPortionMark(USER, 'nope')).resolves.toBe(false)
  })

  it('no toca la cola de OTRO usuario', async () => {
    await offline.enqueueNutritionV2Mutation({ action: 'record', userId: 'otro', payload: payload('key-x') })
    await expect(cancelQueuedPortionMark(USER, 'key-x')).resolves.toBe(false)
    expect(await getQueuedPortionKeys('otro')).toEqual(new Set(['key-x']))
  })
})

// ---------------------------------------------------------------------------
// Cap visual de segmentos (H4) — espejo del web portion-marks.logic
// ---------------------------------------------------------------------------

describe('portionChipIsCompact / portionBarFractions (H4)', () => {
  it('segmentos discretos hasta 8; barra compacta con más de 8', () => {
    expect(PORTION_SEGMENT_CAP).toBe(8)
    expect(portionChipIsCompact(1)).toBe(false)
    expect(portionChipIsCompact(8)).toBe(false)
    // 8,5 porciones = 9 segmentos (8 enteros + semicírculo) ⇒ compacta.
    expect(portionChipIsCompact(8.5)).toBe(true)
    expect(portionChipIsCompact(10)).toBe(true)
    expect(portionChipIsCompact(99)).toBe(true)
    expect(portionChipIsCompact(0)).toBe(false)
  })

  it('portionBarFractions cuantiza como los segmentos: floor(x·2)/2 y cap al prescrito', () => {
    expect(portionBarFractions(10, 3, 2)).toEqual({ marked: 0.3, derived: 0.2 })
    // 0,7 derivadas pintan 0,5 (misma regla de display que los segmentos).
    expect(portionBarFractions(10, 0, 0.7)).toEqual({ marked: 0, derived: 0.05 })
    // El exceso NO entra a la barra (va al badge "+n").
    expect(portionBarFractions(10, 12, 3)).toEqual({ marked: 1, derived: 0 })
    expect(portionBarFractions(0, 2, 1)).toEqual({ marked: 0, derived: 0 })
  })
})
