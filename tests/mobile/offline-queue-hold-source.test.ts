/**
 * HOLD guardado por RELOJ en la cola offline RN (specs/cuenta-atras-en-pantalla, **W3.7 / W3.T4**).
 *
 * `apps/mobile/lib/offline-cache.ts` y `apps/mobile/lib/workout-session.ts` quedan con **cero diff de
 * código** en este tren: `PendingLog` ya declara `actual_hold_sec` (`:42`) y `metadata:
 * WorkoutLogMetadata` (`:51`), y el drain spreadea el ítem entero (`:130-133`). Lo que este test fija
 * es que esa promesa SE CUMPLE con la clave nueva: una serie cerrada por la cuenta atrás **en avión**
 * llega al drenado con `hold_source` en el jsonb **y con los dos lados en el mismo objeto** — el
 * UPDATE web reemplaza el jsonb entero, así que separar la marca del desglose perdería uno de los dos
 * y CA-28 (la métrica de adopción de §8.2) quedaría ciega justo en el caso sin red.
 *
 * Hermano de `tests/mobile/offline-queue-side-reps.test.ts`, del que copia el arnés (mismo mock de
 * AsyncStorage y mismo Supabase mínimo).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildStrengthTimePayload,
  buildTypedPayload,
  loggedSideSeconds,
  reconcileSessionLogs,
  type WorkoutOfflineLog,
} from '@eva/workout-engine'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const resolveMobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

const store = new Map<string, string>()
const asyncStorageMock = {
  getItem: vi.fn((key: string) => Promise.resolve(store.has(key) ? (store.get(key) as string) : null)),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value)
    return Promise.resolve()
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key)
    return Promise.resolve()
  }),
  getAllKeys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
}

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({ default: asyncStorageMock }))
vi.doMock(path.join(mobileDir, 'lib', 'nutrition.queries.ts'), () => ({
  toggleMealCompletion: vi.fn(async () => ({ success: true })),
}))
vi.doMock(resolveMobileDep('@sentry/react-native'), () => ({ captureMessage: vi.fn() }))

const { enqueueLog, flushLogQueue } = await import('../../apps/mobile/lib/offline-cache')

/** Supabase mínimo para el drain: el SELECT del día vuelve vacío ⇒ camino INSERT; captura el payload. */
function makeSupabase(captured: Record<string, unknown>[]) {
  const query = {
    eq() {
      return this
    },
    gte() {
      return this
    },
    lt() {
      return this
    },
    order() {
      return Promise.resolve({ data: [], error: null })
    },
  }
  return {
    from: () => ({
      select: () => query,
      insert: (row: Record<string, unknown>) => {
        captured.push(row)
        return Promise.resolve({ error: null })
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
  } as never
}

beforeEach(() => {
  store.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('cola offline RN · hold guardado por RELOJ (A3/CA-28)', () => {
  it('un hold `per_side` de movilidad encolado en avión drena con los DOS lados y `hold_source`', async () => {
    // El payload sale del MOTOR, exactamente como lo arma `use-hold-module` al llegar a 0.
    const payload = buildTypedPayload(
      'mobility',
      { hold_left_sec: '30', hold_right_sec: '28' },
      'blk-hold',
      1,
      { sideMode: 'per_side', holdSource: 'timer' },
    )
    expect(payload.metadata).toEqual({ left_sec: 30, right_sec: 28, hold_source: 'timer' })

    await enqueueLog({
      block_id: payload.blockId,
      client_id: 'cli-1',
      set_number: payload.setNumber,
      weight_kg: payload.weightKg ?? null,
      reps_done: payload.repsDone ?? null,
      actual_hold_sec: payload.actualHoldSec ?? null,
      metadata: payload.metadata,
      exercise_name_at_log: 'Estiramiento de psoas',
    })

    const captured: Record<string, unknown>[] = []
    const res = await flushLogQueue(makeSupabase(captured))

    expect(res).toEqual({ flushed: 1, discarded: 0, remaining: 0 })
    expect(captured[0]).toMatchObject({
      block_id: 'blk-hold',
      // `per_side` = UNA sola fila con la suma L+R.
      actual_hold_sec: 58,
      metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
    })
    // El desglose sigue legible por el consumidor de siempre: la marca no lo desplazó.
    expect(loggedSideSeconds((captured[0] as { metadata: unknown }).metadata)).toEqual({ left: 30, right: 28 })
    expect(captured[0]!.queued_at).toBeUndefined()
  })

  it('fuerza por tiempo: `reps_done` NULL, el disco intacto y la marca en el jsonb', async () => {
    const payload = buildStrengthTimePayload({ weight: '10', actual_hold_sec: '45', rir: '2' }, 'blk-plancha', 2, {
      sideMode: null,
      holdSource: 'timer',
    })

    await enqueueLog({
      block_id: payload.blockId,
      client_id: 'cli-1',
      set_number: payload.setNumber,
      weight_kg: payload.weightKg ?? null,
      reps_done: payload.repsDone ?? null,
      rir: payload.rir ?? null,
      actual_hold_sec: payload.actualHoldSec ?? null,
      metadata: payload.metadata,
      exercise_name_at_log: 'Plancha con disco',
    })

    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))

    expect(captured[0]).toMatchObject({
      weight_kg: 10,
      reps_done: null,
      rir: 2,
      actual_hold_sec: 45,
      metadata: { hold_source: 'timer' },
    })
    // `actual_duration_sec` es el eje de cardio/roller: un hold jamás lo escribe (W1.3).
    expect(captured[0]!.actual_duration_sec).toBeUndefined()
  })

  it('un hold MANUAL (sin reloj) drena con la marca `manual`, nunca sin marca', async () => {
    const payload = buildTypedPayload('mobility', { actual_hold_sec: '30' }, 'blk-m', 1, {
      sideMode: null,
      holdSource: 'manual',
    })
    await enqueueLog({
      block_id: 'blk-m',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: null,
      reps_done: null,
      actual_hold_sec: payload.actualHoldSec ?? null,
      metadata: payload.metadata,
      exercise_name_at_log: 'Movilidad de cadera',
    })
    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))
    expect(captured[0]).toMatchObject({ actual_hold_sec: 30, metadata: { hold_source: 'manual' } })
  })

  it('un hold ANTERIOR al tren sigue drenando SIN la key `metadata` (A3: undefined ≠ manual)', async () => {
    const payload = buildTypedPayload('mobility', { actual_hold_sec: '30' }, 'blk-viejo', 1, null)
    expect('metadata' in payload).toBe(false)
    await enqueueLog({
      block_id: 'blk-viejo',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: null,
      reps_done: null,
      actual_hold_sec: payload.actualHoldSec ?? null,
      exercise_name_at_log: 'Movilidad de cadera',
    })
    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))
    expect(Object.keys(captured[0]!)).not.toContain('metadata')
  })
})

describe('reconcile · el hold pendiente conserva la marca hasta que confirma el server', () => {
  const queued = (over: Partial<WorkoutOfflineLog>): WorkoutOfflineLog => ({
    blockId: 'blk-hold',
    setNumber: 1,
    weightKg: null,
    repsDone: null,
    rpe: null,
    rir: null,
    planId: 'plan-1',
    coachSlug: '',
    timestamp: 1,
    ...over,
  })

  it('la fila optimista llega con `hold_source` y los dos lados', () => {
    const [row] = reconcileSessionLogs(
      [],
      [queued({ actualHoldSec: 58, metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' } })],
    )
    expect(row).toMatchObject({ block_id: 'blk-hold', set_number: 1, _pending: true })
    expect(row!.metadata).toMatchObject({ hold_source: 'timer' })
    expect(loggedSideSeconds(row!.metadata)).toEqual({ left: 30, right: 28 })
  })
})
