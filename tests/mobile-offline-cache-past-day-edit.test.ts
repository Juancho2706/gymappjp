// Editor de día pasado RN — contrato de la COLA offline cuando la serie se encoló editando una fecha
// pasada (`target_date`). Tres invariantes que sostienen el modo solo-UPDATE en mobile:
//   (a) la ventana del drenaje es la de ESA fecha (no la del `queued_at`) y con fila existente hace UPDATE;
//   (b) sin fila ⇒ DESCARTE permanente + telemetría (reintentar contra una fila que no existe es un loop
//       infinito: la cola web mete `past_set_not_found` en PERMANENT_FAILURE_CODES por lo mismo);
//   (c) la clave de dedup separa fechas distintas del MISMO block:set (editar el martes no colapsa con la
//       serie de hoy);
//   (d) un item LEGACY sin `target_date` conserva el flujo actual (ventana del `queued_at` + INSERT).
//
// GOTCHA de resolución (mismo patrón que mobile-offline-cache-typed-axes.test.ts): apps/mobile declara su
// PROPIA dependencia de async-storage/@sentry/react-native; un vi.mock del specifier bare desde tests/ no
// intercepta el id que resuelve apps/mobile/lib. Se resuelve el path REAL con require.resolve({ paths })
// y se mockea ESE path con vi.doMock + import() dinámico del módulo bajo test.
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')

function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

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

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: asyncStorageMock,
}))

// offline-cache importa `./nutrition.queries` (cola de nutrición, que esta suite no toca); ese módulo
// arrastra la cadena react-native (sintaxis Flow que Rollup no parsea desde el contexto raíz).
vi.doMock(path.join(mobileDir, 'lib', 'nutrition.queries.ts'), () => ({
  toggleMealCompletion: vi.fn(async () => ({ success: true })),
}))

const captureMessage = vi.fn()
vi.doMock(resolveMobileDep('@sentry/react-native'), () => ({ captureMessage }))

const { enqueueLog, flushLogQueue, getPendingLogCount } = await import('../apps/mobile/lib/offline-cache')
// date-utils de mobile es PURO (sin imports) → se usa para computar la ventana esperada sin hardcodear el
// offset de Santiago (que cambia con el horario de verano).
const { getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay } = await import('../apps/mobile/lib/date-utils')

interface Recorded {
  window: { gte: string; lt: string }
  updates: { id: string; row: Record<string, unknown> }[]
  inserts: Record<string, unknown>[]
}

/** Supabase mínimo: el SELECT-por-día devuelve `existing` y se registran ventana/UPDATE/INSERT. */
function makeSupabase(existing: { id: string }[], rec: Recorded) {
  const query = {
    eq() { return this },
    gte(_col: string, value: string) { rec.window.gte = value; return this },
    lt(_col: string, value: string) { rec.window.lt = value; return this },
    order() { return Promise.resolve({ data: existing, error: null }) },
  }
  return {
    from: () => ({
      select: () => query,
      insert: (row: Record<string, unknown>) => {
        rec.inserts.push(row)
        return Promise.resolve({ error: null })
      },
      update: (row: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          rec.updates.push({ id, row })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
  } as never
}

function emptyRecorded(): Recorded {
  return { window: { gte: '', lt: '' }, updates: [], inserts: [] }
}

const TARGET = '2026-07-20'

beforeEach(() => {
  store.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('cola offline RN — item con `target_date` (editor de día pasado)', () => {
  it('(a) drena con la ventana de ESA fecha y hace UPDATE de la fila existente', async () => {
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 2,
      weight_kg: 82.5,
      reps_done: 8,
      rpe: 8,
      rir: 2,
      exercise_name_at_log: 'Sentadilla',
      target_date: TARGET,
    })

    const rec = emptyRecorded()
    const res = await flushLogQueue(makeSupabase([{ id: 'log-existente' }], rec))

    expect(res).toEqual({ flushed: 1, discarded: 0, remaining: 0 })
    // Ventana = [inicio, fin) del día EDITADO, no la del `queued_at` (que es hoy).
    const bounds = getSantiagoUtcBoundsForDay(TARGET)
    expect(rec.window).toEqual({ gte: bounds.startIso, lt: bounds.endIso })
    // Corrige la fila existente; jamás inserta una nueva.
    expect(rec.inserts).toHaveLength(0)
    expect(rec.updates).toHaveLength(1)
    expect(rec.updates[0].id).toBe('log-existente')
    expect(rec.updates[0].row).toMatchObject({ weight_kg: 82.5, reps_done: 8, rpe: 8, rir: 2 })
    // `target_date` y `queued_at` son metadato de la cola: NUNCA viajan como columnas (no existen en
    // `workout_logs` → PGRST204). `logged_at` tampoco se toca al editar (la serie no se mueve a hoy).
    expect(rec.updates[0].row.target_date).toBeUndefined()
    expect(rec.updates[0].row.queued_at).toBeUndefined()
    expect(rec.updates[0].row.logged_at).toBeUndefined()
  })

  it('(b) sin fila en esa fecha DESCARTA permanentemente (no reintenta) y reporta a Sentry', async () => {
    await enqueueLog({
      block_id: 'blk-fantasma',
      client_id: 'cli-1',
      set_number: 3,
      weight_kg: 60,
      reps_done: 10,
      exercise_name_at_log: 'Press banca',
      target_date: TARGET,
    })

    const rec = emptyRecorded()
    const res = await flushLogQueue(makeSupabase([], rec))

    // `remaining: 0` = NO quedó en backoff: es el bit que prueba que el descarte es permanente.
    expect(res).toEqual({ flushed: 0, discarded: 1, remaining: 0 })
    expect(rec.inserts).toHaveLength(0)
    expect(rec.updates).toHaveLength(0)
    expect(await getPendingLogCount()).toBe(0)

    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = captureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(msg).toBe('workout-offline-queue: descarte past_set_not_found')
    expect(opts).toMatchObject({
      level: 'warning',
      tags: { area: 'workout-offline-queue', platform: 'rn', discard_code: 'past_set_not_found' },
      extra: { blockId: 'blk-fantasma', setNumber: 3, targetDate: TARGET },
    })
  })

  it('(c) la clave de dedup separa fechas distintas del MISMO block:set', async () => {
    // Misma serie lógica (client:block:set) encolada dos veces: una editando el 20 y otra en la sesión
    // normal de hoy. Sin la fecha en la clave, la segunda REEMPLAZABA a la primera (last-wins) y la
    // corrección del día pasado se perdía.
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 70,
      reps_done: 10,
      exercise_name_at_log: 'Sentadilla',
      target_date: TARGET,
    })
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 75,
      reps_done: 9,
      exercise_name_at_log: 'Sentadilla',
    })

    expect(await getPendingLogCount()).toBe(2)

    // Re-encolar la MISMA fecha editada sí colapsa (last-wins dentro de su propia clave).
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 72.5,
      reps_done: 10,
      exercise_name_at_log: 'Sentadilla',
      target_date: TARGET,
    })
    expect(await getPendingLogCount()).toBe(2)

    // El drenaje aplica LOS DOS (el mock devuelve fila en cualquier ventana ⇒ dos UPDATE): sobreviven
    // tanto la corrección del día pasado (72.5, último valor de su clave) como la serie de hoy (75).
    const rec = emptyRecorded()
    const res = await flushLogQueue(makeSupabase([{ id: 'log-existente' }], rec))
    expect(res).toEqual({ flushed: 2, discarded: 0, remaining: 0 })
    expect(rec.updates).toHaveLength(2)
    expect(rec.updates.some((u) => (u.row as { weight_kg?: number }).weight_kg === 72.5)).toBe(true)
    expect(rec.updates.some((u) => (u.row as { weight_kg?: number }).weight_kg === 75)).toBe(true)
    expect(rec.updates.some((u) => (u.row as { weight_kg?: number }).weight_kg === 70)).toBe(false)
  })

  it('(d) un item LEGACY sin `target_date` conserva el flujo actual: ventana del encolado + INSERT', async () => {
    await enqueueLog({
      block_id: 'blk-9',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 40,
      reps_done: 12,
      exercise_name_at_log: 'Remo',
    })

    const rec = emptyRecorded()
    const res = await flushLogQueue(makeSupabase([], rec))

    expect(res).toEqual({ flushed: 1, discarded: 0, remaining: 0 })
    // Sin `target_date` el SELECT vacío sigue insertando (no hay descarte permanente) y `logged_at`
    // hereda el instante del encolado.
    expect(rec.updates).toHaveLength(0)
    expect(rec.inserts).toHaveLength(1)
    expect(typeof rec.inserts[0].logged_at).toBe('string')
    expect(rec.inserts[0].target_date).toBeUndefined()
    expect(captureMessage).not.toHaveBeenCalled()
    // La ventana es la del día-Santiago del encolado, no la de ninguna fecha editada.
    const queuedDay = getSantiagoIsoYmdForUtcInstant(rec.inserts[0].logged_at as string)
    expect(rec.window).toEqual(
      (({ startIso, endIso }) => ({ gte: startIso, lt: endIso }))(getSantiagoUtcBoundsForDay(queuedDay)),
    )
  })
})
