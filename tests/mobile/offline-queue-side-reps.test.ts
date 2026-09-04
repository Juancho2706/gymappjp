/**
 * Fuerza POR LADO en la cola offline RN y en la reconciliación (tren «Ciclo real y por lado»,
 * tarea W3.2; hermano del caso de movilidad de `tests/mobile-offline-cache-typed-axes.test.ts:143`).
 *
 * Con R3 `workout_logs.reps_done` guarda el MÍNIMO de los dos lados y el desglose viaja en
 * `metadata {left_reps, right_reps}`. Si la cola pierde ese jsonb, una serie registrada sin red sube
 * como bilateral: el alumno ve «10» donde hizo «10 / 10» y el tonelaje queda a la mitad. Acá se fija
 * el round-trip encolar → drenar con los dos lados, que el hold por lado de movilidad
 * (`{left_sec, right_sec}`) sigue intacto, y que una metadata BASURA no rompe el reconcile ni
 * inventa reps (el `ELSE reps_done` del `CASE`, R27).
 *
 * GOTCHA de resolución: mismo patrón que `tests/mobile-offline-cache-typed-axes.test.ts` — los
 * módulos que arrastran la cadena react-native se mockean por su path REAL resuelto desde
 * `apps/mobile` (`vi.doMock` + `import()` dinámico).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileSessionLogs, sideRepsFromMetadata, type WorkoutOfflineLog } from '@eva/workout-engine'

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

describe('cola offline RN · fuerza por lado (R3/R27)', () => {
  it('una serie 10 / 10 encolada drena con los DOS lados y `reps_done` = mínimo', async () => {
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 20,
      // R3: la columna guarda el lado más bajo; el desglose vive en el jsonb.
      reps_done: 10,
      rpe: 8,
      rir: null,
      metadata: { left_reps: 10, right_reps: 12 },
      exercise_name_at_log: 'Zancada búlgara',
    })

    const captured: Record<string, unknown>[] = []
    const res = await flushLogQueue(makeSupabase(captured))

    expect(res).toEqual({ flushed: 1, discarded: 0, remaining: 0 })
    expect(captured[0]).toMatchObject({
      block_id: 'blk-1',
      weight_kg: 20,
      reps_done: 10,
      metadata: { left_reps: 10, right_reps: 12 },
    })
    // El jsonb que llega al server es el que lee el tonelaje: los dos lados, sin traducción.
    expect(sideRepsFromMetadata((captured[0] as { metadata: unknown }).metadata)).toEqual({ left: 10, right: 12 })
    // `queued_at` sigue siendo metadato de la cola: jamás viaja como columna.
    expect(captured[0]!.queued_at).toBeUndefined()
  })

  it('el hold POR LADO de movilidad sigue intacto (no lo pisó la fuerza por lado)', async () => {
    await enqueueLog({
      block_id: 'blk-2',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: null,
      reps_done: null,
      actual_hold_sec: 55,
      metadata: { left_sec: 30, right_sec: 25 },
      exercise_name_at_log: 'Psoas stretch',
    })

    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))

    expect(captured[0]).toMatchObject({ actual_hold_sec: 55, metadata: { left_sec: 30, right_sec: 25 } })
    // Y `sideRepsFromMetadata` NO confunde segundos con reps: sin los dos lados de FUERZA ⇒ null.
    expect(sideRepsFromMetadata((captured[0] as { metadata: unknown }).metadata)).toBeNull()
  })

  it('una serie de fuerza SIN lados drena exactamente como antes (sin la key `metadata`)', async () => {
    await enqueueLog({
      block_id: 'blk-3',
      client_id: 'cli-1',
      set_number: 2,
      weight_kg: 80,
      reps_done: 8,
      exercise_name_at_log: 'Sentadilla',
    })

    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))

    expect(Object.keys(captured[0]!)).not.toContain('metadata')
    expect(captured[0]).toMatchObject({ weight_kg: 80, reps_done: 8 })
  })
})

describe('reconcile · la metadata sobrevive y la basura no rompe nada', () => {
  const queued = (over: Partial<WorkoutOfflineLog>): WorkoutOfflineLog => ({
    blockId: 'blk-1',
    setNumber: 1,
    weightKg: 20,
    repsDone: 10,
    rpe: null,
    rir: null,
    planId: 'plan-1',
    coachSlug: '',
    timestamp: 1,
    ...over,
  })

  it('una serie pendiente conserva `{left_reps, right_reps}` al reconciliarse', async () => {
    const [row] = reconcileSessionLogs([], [queued({ metadata: { left_reps: 10, right_reps: 10 } })])

    expect(row).toMatchObject({ block_id: 'blk-1', set_number: 1, reps_done: 10, _pending: true })
    expect(sideRepsFromMetadata(row!.metadata)).toEqual({ left: 10, right: 10 })
  })

  it('metadata BASURA no rompe el reconcile: la fila entra y el desglose cae a null', async () => {
    const basuras: unknown[] = [
      { left_reps: 10 }, // un solo lado
      { left_reps: 10, right_reps: null },
      { left_reps: -1, right_reps: 10 },
      { left_reps: 1.5, right_reps: 10 },
      { left_reps: 'abc', right_reps: '10' },
      { left_reps: 1e30, right_reps: 10 },
      'no soy un objeto',
      [],
      null,
    ]

    for (const metadata of basuras) {
      const [row] = reconcileSessionLogs([], [queued({ metadata: metadata as WorkoutOfflineLog['metadata'] })])
      // La serie NUNCA se pierde…
      expect(row).toMatchObject({ block_id: 'blk-1', set_number: 1, reps_done: 10 })
      // …y el consumidor cae a `reps_done` tal cual (el `ELSE` del `CASE` del SQL).
      expect(sideRepsFromMetadata(row!.metadata)).toBeNull()
    }
  })

  it('el server confirmado gana y su metadata es la que queda', async () => {
    const [row] = reconcileSessionLogs(
      [{ block_id: 'blk-1', set_number: 1, weight_kg: 20, reps_done: 10, rpe: null, metadata: { left_reps: 10, right_reps: 11 } }],
      [queued({ metadata: { left_reps: 9, right_reps: 9 } })],
    )

    expect(row).toMatchObject({ _pending: false })
    expect(sideRepsFromMetadata(row!.metadata)).toEqual({ left: 10, right: 11 })
  })
})
