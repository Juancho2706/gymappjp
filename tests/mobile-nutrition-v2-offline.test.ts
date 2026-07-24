// A3 (roadmap Tanda 6): suite dedicada de la cola offline de Nutricion V2
// (apps/mobile/lib/nutrition-v2-offline.ts).
//
// Mismo gotcha de resolucion que en mobile-nutrition-v2-cache.test.ts: @react-native-async-storage y
// @react-native-community/netinfo son dependencias de apps/mobile (con su propia copia en node_modules,
// no necesariamente la misma que resuelve un test en tests/ contexto raiz). Se mockean por PATH ABSOLUTO
// resuelto tal como lo veria apps/mobile (`require.resolve(spec, { paths: [mobileDir] })`) via
// `vi.doMock` (no hoisteado) + `import()` dinamico del modulo bajo test.
//
// './nutrition-v2.api' y './api' SI son archivos locales del propio repo (mismo paquete, mismo path de
// resolucion sin importar el contexto), asi que esos se mockean con el `vi.mock` hoisteado normal.
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NutritionIntakeMutation } from '@eva/nutrition-v2'

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
  getAllKeys: vi.fn(() => Promise.resolve(Array.from(asyncStore.keys()))),
}

const netInfoFetchMock = vi.fn()

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: asyncStorageMock,
}))
vi.doMock(resolveMobileDep('@react-native-community/netinfo'), () => ({
  default: { fetch: netInfoFetchMock },
}))

class MockApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const recordNutritionIntakeV2Mock = vi.fn()
const correctNutritionIntakeV2Mock = vi.fn()

vi.mock('../apps/mobile/lib/api', () => ({ ApiError: MockApiError }))
vi.mock('../apps/mobile/lib/nutrition-v2.api', () => ({
  recordNutritionIntakeV2: recordNutritionIntakeV2Mock,
  correctNutritionIntakeV2: correctNutritionIntakeV2Mock,
}))

const {
  clearNutritionV2QueueForUser,
  enqueueNutritionV2Mutation,
  flushNutritionV2MutationQueue,
  getNutritionV2QueueStatus,
  getNutritionV2QueuedMutations,
} = await import('../apps/mobile/lib/nutrition-v2-offline')

const QUEUE_KEY = 'eva:nutrition-v2:mutations:v1'
const USER_A = 'coach-a'
const USER_B = 'coach-b'

function online(): void {
  netInfoFetchMock.mockResolvedValue({ isConnected: true, isInternetReachable: true })
}

function offline(): void {
  netInfoFetchMock.mockResolvedValue({ isConnected: false, isInternetReachable: false })
}

function mutation(overrides: Partial<NutritionIntakeMutation> = {}): NutritionIntakeMutation {
  return {
    clientId: overrides.clientId ?? '11111111-1111-4111-8111-111111111111',
    localDate: '2026-07-14',
    occurredAt: '2026-07-14T12:00:00.000Z',
    timezone: 'America/Santiago',
    foodId: null,
    customName: 'Manzana',
    quantity: 1,
    unit: 'porcion',
    mealSlot: null,
    source: 'manual',
    captureMethod: 'manual',
    daySnapshotId: null,
    planVersionId: null,
    prescriptionItemId: null,
    idempotencyKey: overrides.idempotencyKey ?? 'idem-key-0000001',
    note: null,
    snapshot: {
      name: 'Manzana',
      brand: null,
      calories: 95,
      proteinG: 0.5,
      carbsG: 25,
      fatsG: 0.3,
      fiberG: 4,
      servingSize: 1,
      servingUnit: 'unidad',
    },
    ...overrides,
  }
}

beforeEach(() => {
  asyncStore.clear()
  recordNutritionIntakeV2Mock.mockReset()
  correctNutritionIntakeV2Mock.mockReset()
  netInfoFetchMock.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('enqueue - dedup por idempotency key', () => {
  it('dos enqueue con misma userId+idempotencyKey colapsan en un solo item', async () => {
    const first = await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    expect(first).toEqual({ queued: true, deduplicated: false })

    const second = await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    expect(second).toEqual({ queued: true, deduplicated: true })

    const status = await getNutritionV2QueueStatus(USER_A)
    expect(status.pending).toBe(1)
  })

  it('idempotencyKey distinta agrega un segundo item', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'k1' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'k2' }) })
    const status = await getNutritionV2QueueStatus(USER_A)
    expect(status.pending).toBe(2)
  })

  it('dos enqueue simultáneos con keys distintas no pierden ninguna escritura', async () => {
    await Promise.all([
      enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'parallel-1' }) }),
      enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'parallel-2' }) }),
    ])

    const queued = await getNutritionV2QueuedMutations(USER_A)
    expect(queued.map((item) => item.idempotencyKey).sort()).toEqual(['parallel-1', 'parallel-2'])
  })

  it('misma idempotencyKey pero distinto usuario NO colapsa (aislado por usuario)', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'shared-key' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_B, payload: mutation({ idempotencyKey: 'shared-key' }) })
    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(1)
    expect((await getNutritionV2QueueStatus(USER_B)).pending).toBe(1)
  })

  it('la lectura user-scoped conserva íntegro el motivo de una corrección', async () => {
    await enqueueNutritionV2Mutation({
      action: 'correct',
      userId: USER_A,
      payload: {
        ...mutation({ idempotencyKey: 'correction-with-reason' }),
        correctsEntryId: '22222222-2222-4222-8222-222222222222',
        correctionReason: 'comí un poco menos',
      },
    })
    await enqueueNutritionV2Mutation({
      action: 'record',
      userId: USER_B,
      payload: mutation({ idempotencyKey: 'other-user' }),
    })

    const queued = await getNutritionV2QueuedMutations(USER_A)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.action).toBe('correct')
    if (queued[0]?.action === 'correct') {
      expect(queued[0].payload.correctionReason).toBe('comí un poco menos')
    }
  })
})

describe('flush - separacion por usuario', () => {
  it('flush de A no toca ni envia la cola de B', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'a-1' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_B, payload: mutation({ idempotencyKey: 'b-1' }) })
    recordNutritionIntakeV2Mock.mockResolvedValue({ ok: true, id: 'srv-1', action: 'record' })

    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.sent).toBe(1)
    expect(result.skippedOtherUser).toBe(1)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(1)

    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(0)
    expect((await getNutritionV2QueueStatus(USER_B)).pending).toBe(1)
  })

  it('flush simultáneos de usuarios distintos procesan ambos scopes', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'a-parallel' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_B, payload: mutation({ idempotencyKey: 'b-parallel' }) })
    recordNutritionIntakeV2Mock.mockResolvedValue({ ok: true, id: 'srv', action: 'record' })

    const [resultA, resultB] = await Promise.all([
      flushNutritionV2MutationQueue(USER_A),
      flushNutritionV2MutationQueue(USER_B),
    ])

    expect(resultA.sent).toBe(1)
    expect(resultB.sent).toBe(1)
    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(0)
    expect((await getNutritionV2QueueStatus(USER_B)).pending).toBe(0)
  })

  it('un enqueue durante el replay se conserva al aplicar el resultado del flush', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'replay-old' }) })

    let releaseReplay!: () => void
    let signalStarted!: () => void
    const replayStarted = new Promise<void>((resolve) => { signalStarted = resolve })
    const replayRelease = new Promise<void>((resolve) => { releaseReplay = resolve })
    recordNutritionIntakeV2Mock.mockImplementationOnce(async () => {
      signalStarted()
      await replayRelease
      return { ok: true, id: 'srv-old', action: 'record' }
    })

    const flushing = flushNutritionV2MutationQueue(USER_A)
    await replayStarted
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'replay-new' }) })
    releaseReplay()
    const result = await flushing

    expect(result.sent).toBe(1)
    const queued = await getNutritionV2QueuedMutations(USER_A)
    expect(queued.map((item) => item.idempotencyKey)).toEqual(['replay-new'])
  })
})

describe('retry en 408/429/5xx con backoff', () => {
  it('un 500 se retiene en la cola (retry) con backoff, no se descarta', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('fail', 500))

    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.sent).toBe(0)
    expect(result.terminal).toBe(0)
    expect(result.pending).toBe(1)
  })

  it('mientras dura el backoff, un flush inmediato NO reintenta (no vuelve a llamar la API)', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('fail', 500))
    await flushNutritionV2MutationQueue(USER_A)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(1)

    const secondFlush = await flushNutritionV2MutationQueue(USER_A)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(1) // aun en backoff: no se volvio a llamar
    expect(secondFlush.sent).toBe(0)
    expect(secondFlush.pending).toBe(1)
  })

  it('tras vencer el backoff, un flush posterior SI reintenta y puede completar', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('fail', 500))
    await flushNutritionV2MutationQueue(USER_A)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(3_000) // backoff del primer intento es 2_000ms
    recordNutritionIntakeV2Mock.mockResolvedValueOnce({ ok: true, id: 'srv-2', action: 'record' })
    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(1)
    expect(result.pending).toBe(0)
  })

  it('408 y 429 tambien son retryable (no terminal)', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'k-408' }) })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('timeout', 408))
    const r1 = await flushNutritionV2MutationQueue(USER_A)
    expect(r1.terminal).toBe(0)
    expect(r1.pending).toBe(1)

    vi.advanceTimersByTime(3_000)
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('rate limited', 429))
    const r2 = await flushNutritionV2MutationQueue(USER_A)
    expect(r2.terminal).toBe(0)
    expect(r2.pending).toBe(1)
  })

  it('una excepcion de red (no ApiError) tambien se trata como retryable', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new TypeError('Network request failed'))
    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.terminal).toBe(0)
    expect(result.pending).toBe(1)
  })
})

describe('error terminal 4xx - dead letter sin reintento', () => {
  it('un 400 descarta el item de la cola activa en el primer intento (sin retry)', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('bad request', 400))

    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.terminal).toBe(1)
    expect(result.sent).toBe(0)
    expect(result.pending).toBe(0)
    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(0)

    // Un flush posterior no vuelve a llamar la API: el item ya no esta en la cola activa.
    await flushNutritionV2MutationQueue(USER_A)
    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(1)
  })

  it('un 404 (tambien 4xx no-retryable) va a dead letter igual', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'correct', userId: USER_A, payload: { ...mutation(), correctsEntryId: '22222222-2222-4222-8222-222222222222', correctionReason: 'error de tipeo' } })
    correctNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('not found', 404))
    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.terminal).toBe(1)
    expect(result.pending).toBe(0)
  })
})

describe('maximo de intentos respetado', () => {
  it('tras agotar los reintentos, el item termina en dead letter (terminal) en vez de reintentar para siempre', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })

    // MAX_ATTEMPTS = 8 en el modulo bajo test (no exportado: se prueba el comportamiento observable).
    // Avanzamos el tiempo generosamente entre flushes para asegurar que el backoff siempre ya expiro.
    let lastResult: Awaited<ReturnType<typeof flushNutritionV2MutationQueue>> | null = null
    for (let attempt = 0; attempt < 8; attempt += 1) {
      recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('fail', 500))
      lastResult = await flushNutritionV2MutationQueue(USER_A)
      vi.advanceTimersByTime(40 * 60 * 1000) // 40min > cualquier backoff posible (cap 30min)
    }

    expect(recordNutritionIntakeV2Mock).toHaveBeenCalledTimes(8)
    expect(lastResult?.terminal).toBe(1)
    expect(lastResult?.pending).toBe(0)
    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(0)
  })

  it('con menos intentos que el maximo, el item sigue reintentando (no se da por vencido antes de tiempo)', async () => {
    online()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      recordNutritionIntakeV2Mock.mockRejectedValueOnce(new MockApiError('fail', 500))
      await flushNutritionV2MutationQueue(USER_A)
      vi.advanceTimersByTime(40 * 60 * 1000)
    }

    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(1) // aun vivo, no es terminal todavia
  })
})

describe('offline y replay tras reconectar procesa en orden', () => {
  it('offline: no se envia nada y todo queda pending', async () => {
    offline()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'ord-1' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'ord-2' }) })

    const result = await flushNutritionV2MutationQueue(USER_A)
    expect(result.offline).toBe(true)
    expect(result.sent).toBe(0)
    expect(result.pending).toBe(2)
    expect(recordNutritionIntakeV2Mock).not.toHaveBeenCalled()
  })

  it('al reconectar, el replay procesa los items en el orden FIFO en que se encolaron', async () => {
    offline()
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'ord-1', customName: 'Primero' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'ord-2', customName: 'Segundo' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'ord-3', customName: 'Tercero' }) })
    await flushNutritionV2MutationQueue(USER_A) // offline: no-op

    online()
    recordNutritionIntakeV2Mock.mockResolvedValue({ ok: true, id: 'srv', action: 'record' })
    const result = await flushNutritionV2MutationQueue(USER_A)

    expect(result.sent).toBe(3)
    expect(result.pending).toBe(0)
    const calledOrder = recordNutritionIntakeV2Mock.mock.calls.map((call) => (call[0] as NutritionIntakeMutation).customName)
    expect(calledOrder).toEqual(['Primero', 'Segundo', 'Tercero'])
  })
})

describe('persistencia corrupta no crashea', () => {
  it('JSON roto en AsyncStorage: la cola se lee como vacia (sin excepcion) y sigue operable', async () => {
    await asyncStorageMock.setItem(QUEUE_KEY, '{not-valid-json::')

    const status = await getNutritionV2QueueStatus(USER_A)
    expect(status).toEqual({ pending: 0, oldestQueuedAt: null })

    // Y sigue operable: encolar despues de la corrupcion reemplaza con una cola limpia.
    const enqueueResult = await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation() })
    expect(enqueueResult).toEqual({ queued: true, deduplicated: false })
    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(1)
  })

  it('un array JSON valido pero con items corruptos (no-objetos) no crashea el parseo', async () => {
    await asyncStorageMock.setItem(QUEUE_KEY, JSON.stringify(['garbage', 42, null]))
    const status = await getNutritionV2QueueStatus(USER_A)
    expect(status.pending).toBe(0)
  })
})

describe('clearNutritionV2QueueForUser - borra SOLO lo del usuario', () => {
  it('limpia la cola de A sin tocar la de B', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_A, payload: mutation({ idempotencyKey: 'a-1' }) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: USER_B, payload: mutation({ idempotencyKey: 'b-1' }) })

    await clearNutritionV2QueueForUser(USER_A)

    expect((await getNutritionV2QueueStatus(USER_A)).pending).toBe(0)
    expect((await getNutritionV2QueueStatus(USER_B)).pending).toBe(1)
  })
})
