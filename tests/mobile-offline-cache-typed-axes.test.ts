// Deuda GRAVE #1 (specs/cardio-ejes-y-fixes): la cola offline RN perdía los ejes tipados — una
// ronda de cardio/movilidad encolada sin red subía con minutos/distancia/FC/pace/hold/lados en NULL
// (y sin sustitución). Esta suite fija el contrato del round-trip encolar → drenar: el INSERT que
// recibe Supabase debe traer TODOS los ejes que viajaron en el item, y un item LEGACY (pre-fix, sin
// las keys nuevas en AsyncStorage) debe drenar sin inventar columnas (protege contra PGRST204).
//
// GOTCHA de resolución (mismo patrón que mobile-nutrition-v2-cache.test.ts): apps/mobile declara su
// PROPIA dependencia de @react-native-async-storage/async-storage; un vi.mock del specifier bare
// desde tests/ (contexto raíz) no intercepta el id que resuelve apps/mobile/lib. Se resuelve el path
// REAL con require.resolve({ paths: [mobileDir] }) y se mockea ESE path con vi.doMock + import()
// dinámico del módulo bajo test.
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

// offline-cache importa `./nutrition.queries` (solo para la cola de nutrición, que esta suite no
// toca); ese módulo arrastra la cadena react-native (sintaxis Flow que Rollup no parsea desde el
// contexto raíz). Se mockea el archivo resuelto para cortar la cadena.
vi.doMock(path.join(mobileDir, 'lib', 'nutrition.queries.ts'), () => ({
  toggleMealCompletion: vi.fn(async () => ({ success: true })),
}))

// `@sentry/react-native` (telemetría del descarte 23503) arrastra la misma cadena react-native: se
// mockea por path resuelto igual que async-storage. El espía además fija el contrato del evento.
const captureMessage = vi.fn()
vi.doMock(resolveMobileDep('@sentry/react-native'), () => ({ captureMessage }))

const { enqueueLog, flushLogQueue } = await import('../apps/mobile/lib/offline-cache')

/** Supabase mínimo para el drain: SELECT-por-día vacío ⇒ camino INSERT; captura el payload. */
function makeSupabase(captured: Record<string, unknown>[]) {
  const query = {
    eq() { return this },
    gte() { return this },
    lt() { return this },
    order() { return Promise.resolve({ data: [], error: null }) },
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

/** Supabase que rechaza el INSERT con el código PG pedido (23503 = FK del bloque borrado por reseed). */
function makeSupabaseRejecting(code: string) {
  const query = {
    eq() { return this },
    gte() { return this },
    lt() { return this },
    order() { return Promise.resolve({ data: [], error: null }) },
  }
  return {
    from: () => ({
      select: () => query,
      insert: () => Promise.resolve({ error: { code } }),
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

describe('cola offline RN — ejes tipados (deuda GRAVE #1 cardio-ejes)', () => {
  it('una ronda de cardio encolada drena con TODOS los ejes + pace + FC', async () => {
    await enqueueLog({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: null,
      reps_done: null,
      rpe: null,
      rir: null,
      actual_duration_sec: 750,
      actual_distance_m: 3200,
      actual_pace_sec_per_km: 300,
      actual_avg_hr: 148,
      exercise_name_at_log: 'Cinta',
    })

    const captured: Record<string, unknown>[] = []
    const res = await flushLogQueue(makeSupabase(captured))

    // `flushLogQueue` devuelve el RESUMEN completo (antes sólo `flushed`): el `discarded` es el que
    // deja de mentir al chip del ejecutor.
    expect(res).toEqual({ flushed: 1, discarded: 0, remaining: 0 })
    expect(captured).toHaveLength(1)
    const row = captured[0]
    expect(row).toMatchObject({
      block_id: 'blk-1',
      client_id: 'cli-1',
      set_number: 1,
      actual_duration_sec: 750,
      actual_distance_m: 3200,
      actual_pace_sec_per_km: 300,
      actual_avg_hr: 148,
      exercise_name_at_log: 'Cinta',
    })
    // `queued_at` es metadato de la cola: JAMÁS viaja como columna; `logged_at` sí (hereda el
    // instante del encolado para que el índice único por día ancle al día real del entreno).
    expect(row.queued_at).toBeUndefined()
    expect(typeof row.logged_at).toBe('string')
  })

  it('movilidad per_side conserva metadata {left_sec,right_sec} + hold agregado y la sustitución', async () => {
    await enqueueLog({
      block_id: 'blk-2',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: null,
      reps_done: null,
      actual_hold_sec: 55,
      metadata: { left_sec: 30, right_sec: 25 },
      substituted_exercise_id: 'ex-9',
      substituted_exercise_name: 'Estiramiento banda',
      substitution_reason: 'ocupada',
      exercise_name_at_log: 'Psoas stretch',
    })

    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))

    expect(captured[0]).toMatchObject({
      actual_hold_sec: 55,
      metadata: { left_sec: 30, right_sec: 25 },
      substituted_exercise_id: 'ex-9',
      substituted_exercise_name: 'Estiramiento banda',
      substitution_reason: 'ocupada',
    })
  })

  it('un item LEGACY (solo campos de fuerza) drena sin inventar columnas nuevas', async () => {
    await enqueueLog({
      block_id: 'blk-3',
      client_id: 'cli-1',
      set_number: 2,
      weight_kg: 80,
      reps_done: 8,
      rpe: 8,
      rir: 2,
      exercise_name_at_log: 'Sentadilla',
    })

    const captured: Record<string, unknown>[] = []
    await flushLogQueue(makeSupabase(captured))

    const keys = Object.keys(captured[0]!)
    for (const nueva of [
      'actual_duration_sec',
      'actual_distance_m',
      'actual_pace_sec_per_km',
      'actual_hold_sec',
      'actual_avg_hr',
      'metadata',
      'substituted_exercise_id',
    ]) {
      expect(keys).not.toContain(nueva)
    }
    expect(captured[0]).toMatchObject({ weight_kg: 80, reps_done: 8 })
  })
})

// El descarte 23503 era la ÚNICA pérdida silenciosa real de la cola RN: `flushLogQueue` devolvía sólo
// `flushed` y nadie se enteraba. Ahora viaja en el resumen y deja rastro en Sentry.
describe('cola offline RN — descarte 23503 (telemetría + resumen honesto)', () => {
  it('un INSERT rechazado por FK descarta la serie, la reporta a Sentry y NO la cuenta como subida', async () => {
    await enqueueLog({
      block_id: 'blk-borrado',
      client_id: 'cli-1',
      set_number: 3,
      weight_kg: 60,
      reps_done: 10,
      exercise_name_at_log: 'Press banca',
    })

    const res = await flushLogQueue(makeSupabaseRejecting('23503'))

    expect(res).toEqual({ flushed: 0, discarded: 1, remaining: 0 })
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = captureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(msg).toBe('workout-offline-queue: descarte 23503')
    expect(opts).toMatchObject({
      level: 'warning',
      tags: { area: 'workout-offline-queue', platform: 'rn', discard_code: '23503' },
      extra: { blockId: 'blk-borrado', setNumber: 3 },
    })
  })

  it('un error transitorio (no 23503) NO descarta ni reporta: reintenta con backoff', async () => {
    await enqueueLog({
      block_id: 'blk-4',
      client_id: 'cli-1',
      set_number: 1,
      weight_kg: 40,
      reps_done: 12,
      exercise_name_at_log: 'Remo',
    })

    const res = await flushLogQueue(makeSupabaseRejecting('08006')) // connection_failure

    expect(res).toEqual({ flushed: 0, discarded: 0, remaining: 1 })
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
