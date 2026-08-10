// Tanda 6 (RN): el PRODUCTOR (builders de nutrition-v2-intake) -> la cola offline real
// (nutrition-v2-offline). Prueba que un intento construido por el productor encola con key ESTABLE y
// que un replay del MISMO intento (mismo operationId) NO duplica. Mismo gotcha de resolucion de deps
// nativas que mobile-nutrition-v2-offline.test.ts: async-storage/netinfo se mockean por PATH ABSOLUTO
// resuelto como lo veria apps/mobile (vi.doMock + import dinamico).
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NutritionPrescriptionItemRead } from '../apps/mobile/lib/nutrition-v2-intake'
import {
  buildAteAsPrescribedMutation,
  buildRecordIntakeMutation,
  prescribedIntentOperationId,
} from '../apps/mobile/lib/nutrition-v2-intake'

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

const {
  enqueueNutritionV2Mutation,
  getNutritionV2QueueStatus,
  removeNutritionV2QueuedMutation,
} = await import('../apps/mobile/lib/nutrition-v2-offline')

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

  // Alimento LIBRE: registrar dos veces el mismo alimento es una intencion valida, asi que cada
  // gesto conserva su operationId propio y encola una fila propia.
  it('alimento libre: intentos distintos (operationId distinto) encolan filas distintas', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload(OP) })
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: producedPayload('op-bbbbbbbb-2222-4222-8222-222222222222') })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })
})

// NUT-003: el camino PRESCRITO tiene identidad logica (alumno, dia, item). Dos toques de "Lo comí"
// sobre el mismo item el mismo dia son la MISMA intencion y deben colapsar en una sola escritura.
const PRESC_ITEM: NutritionPrescriptionItemRead = {
  id: '44444444-4444-4444-8444-444444444444',
  foodId: '22222222-2222-4222-8222-222222222222',
  recipeId: null,
  name: 'Pechuga de pollo',
  brand: null,
  quantity: 200,
  unit: 'g',
  minimumQuantity: null,
  maximumQuantity: null,
  optional: false,
  substitutionGroupId: null,
  notes: null,
  macros: { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7, fiberG: 0 },
}

function prescribedPayload(localDate: string, item = PRESC_ITEM) {
  return buildAteAsPrescribedMutation({
    clientId: CLIENT,
    deviceId: DEVICE,
    operationId: prescribedIntentOperationId({ localDate, prescriptionItemId: item.id }),
    localDate,
    occurredAt: `${localDate}T15:00:00.000Z`,
    timezone: 'America/Santiago',
    slotCode: 'lunch',
    planVersionId: null,
    daySnapshotId: null,
    item,
  })
}

describe('nutrition v2 - doble toque de "Lo comí" prescrito', () => {
  it('dos toques del MISMO item el mismo dia encolan UNA sola fila', async () => {
    const first = await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: prescribedPayload('2026-07-15') })
    const second = await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: prescribedPayload('2026-07-15') })
    expect(first.deduplicated).toBe(false)
    expect(second.deduplicated).toBe(true)
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })

  it('el MISMO item en dias distintos si encola dos filas', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: prescribedPayload('2026-07-15') })
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: prescribedPayload('2026-07-16') })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })

  it('items distintos del mismo dia encolan filas distintas', async () => {
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: prescribedPayload('2026-07-15') })
    await enqueueNutritionV2Mutation({
      action: 'record',
      userId: CLIENT,
      payload: prescribedPayload('2026-07-15', { ...PRESC_ITEM, id: '55555555-5555-4555-8555-555555555555' }),
    })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })
})

// NUT-019: el deshacer de una tanda debe poder CANCELAR lo que sigue en la cola (el mecanismo ya
// existia para porciones y no estaba cableado a intake).
describe('nutrition v2 - cancelar un intake encolado', () => {
  it('cancelar una de dos keys deja pending = 1', async () => {
    const a = prescribedPayload('2026-07-15')
    const b = prescribedPayload('2026-07-15', { ...PRESC_ITEM, id: '55555555-5555-4555-8555-555555555555' })
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: a })
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: b })

    expect(await removeNutritionV2QueuedMutation(CLIENT, a.idempotencyKey)).toBe(true)
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })

  it('cancelar una key que ya no esta en la cola devuelve false (la envio un flush)', async () => {
    const a = prescribedPayload('2026-07-15')
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: a })
    expect(await removeNutritionV2QueuedMutation(CLIENT, a.idempotencyKey)).toBe(true)
    expect(await removeNutritionV2QueuedMutation(CLIENT, a.idempotencyKey)).toBe(false)
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(0)
  })

  it('nunca toca la cola de otro usuario', async () => {
    const a = prescribedPayload('2026-07-15')
    await enqueueNutritionV2Mutation({ action: 'record', userId: CLIENT, payload: a })
    expect(await removeNutritionV2QueuedMutation('otro-usuario', a.idempotencyKey)).toBe(false)
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })
})

// T2.4: la SUSTITUCION encola la intencion (item + reemplazo + intento), no un intake armado. La
// clave la deriva la cola con el MISMO helper que usa el servidor, asi que dos taps del mismo gesto
// colapsan y, en cambio, deshacer + volver a registrar (attempt distinto) encola una fila propia.
const SUB_ITEM = '55555555-5555-4555-8555-555555555555'
const SUB_ID = '66666666-6666-4666-8666-666666666666'

function substitutionIntent(attempt: number, substitutionId = SUB_ID) {
  return {
    clientId: CLIENT,
    localDate: '2026-07-15',
    occurredAt: '2026-07-15T12:00:00.000Z',
    timezone: 'America/Santiago',
    prescriptionItemId: SUB_ITEM,
    substitutionId,
    attempt,
    quantity: null,
  }
}

describe('nutrition v2 - sustitucion -> cola offline', () => {
  it('dos taps del mismo reemplazo colapsan en una fila', async () => {
    const first = await enqueueNutritionV2Mutation({
      action: 'substitute',
      userId: CLIENT,
      payload: substitutionIntent(0),
    })
    const second = await enqueueNutritionV2Mutation({
      action: 'substitute',
      userId: CLIENT,
      payload: substitutionIntent(0),
    })

    expect(first).toEqual({ queued: true, deduplicated: false })
    expect(second).toEqual({ queued: true, deduplicated: true })
    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(1)
  })

  it('deshacer y volver a registrar (attempt distinto) encola una fila propia', async () => {
    await enqueueNutritionV2Mutation({ action: 'substitute', userId: CLIENT, payload: substitutionIntent(0) })
    await enqueueNutritionV2Mutation({ action: 'substitute', userId: CLIENT, payload: substitutionIntent(1) })

    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })

  it('cambiar de reemplazo sobre el mismo item encola una fila propia', async () => {
    await enqueueNutritionV2Mutation({ action: 'substitute', userId: CLIENT, payload: substitutionIntent(0) })
    await enqueueNutritionV2Mutation({
      action: 'substitute',
      userId: CLIENT,
      payload: substitutionIntent(1, '77777777-7777-4777-8777-777777777777'),
    })

    expect((await getNutritionV2QueueStatus(CLIENT)).pending).toBe(2)
  })
})
