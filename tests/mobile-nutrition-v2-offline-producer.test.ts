// Tanda 6 (RN): el PRODUCTOR (builders de nutrition-v2-intake) -> la cola offline real
// (nutrition-v2-offline). Prueba que un intento construido por el productor encola con key ESTABLE y
// que un replay del MISMO intento (mismo operationId) NO duplica. Mismo gotcha de resolucion de deps
// nativas que mobile-nutrition-v2-offline.test.ts: async-storage/netinfo se mockean por PATH ABSOLUTO
// resuelto como lo veria apps/mobile (vi.doMock + import dinamico).
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRecordIntakeMutation } from '../apps/mobile/lib/nutrition-v2-intake'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')
function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

const asyncStore = new Map<string, string>()
vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: {
    getItem: (k: string) => Promise.resolve(asyncStore.has(k) ? (asyncStore.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      asyncStore.set(k, v)
      return Promise.resolve()
    },
    removeItem: (k: string) => {
      asyncStore.delete(k)
      return Promise.resolve()
    },
    getAllKeys: () => Promise.resolve(Array.from(asyncStore.keys())),
  },
}))
vi.doMock(resolveMobileDep('@react-native-community/netinfo'), () => ({
  default: { fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }) },
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

const { enqueueNutritionV2Mutation, getNutritionV2QueueStatus } = await import(
  '../apps/mobile/lib/nutrition-v2-offline'
)

const CLIENT = '11111111-1111-4111-8111-111111111111'
const DEVICE = 'android-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OP = 'op-aaaaaaaa-1111-4111-8111-111111111111'

function producedPayload(operationId: string) {
  return buildRecordIntakeMutation({
    clientId: CLIENT,
    deviceId: DEVICE,
    operationId,
    localDate: '2026-07-15',
    occurredAt: '2026-07-15T12:00:00.000Z',
    timezone: 'America/Santiago',
    foodId: '22222222-2222-4222-8222-222222222222',
    quantity: 150,
    unit: 'g',
    mealSlot: 'lunch',
    source: 'offplan',
    captureMethod: 'search',
    snapshot: { name: 'Arroz', calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4, servingSize: 100, servingUnit: 'g' },
  })
}

beforeEach(() => {
  asyncStore.clear()
})

describe('nutrition v2 - productor -> cola offline', () => {
  it('encola con key estable (un intento = una fila)', async () => {
    const first = await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload(OP) })
    expect(first).toEqual({ queued: true, deduplicated: false })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })

  it('replay del mismo intento (mismo operationId) NO duplica', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload(OP) })
    const second = await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload(OP) })
    expect(second).toEqual({ queued: true, deduplicated: true })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })

  it('intentos distintos (operationId distinto) encolan filas distintas', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload(OP) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload('op-bbbbbbbb-2222-4222-8222-222222222222') })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })
})
