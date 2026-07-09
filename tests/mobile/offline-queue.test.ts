// Tests puros de la cola offline generalizada e idempotente (E4-23 / G11 §1.6).
// El módulo bajo test (apps/mobile/lib/offline-queue) es PURO (no importa RN/AsyncStorage/supabase):
// el storage entra por un adaptador `AsyncKV` inyectado. Acá inyectamos uno en memoria.
// Verifica: dedup por clave natural (idempotencia), backoff de reintentos, descarte, migración de items
// legacy, y — crítico — el CANDADO de flush que impide que dos flushes concurrentes dupliquen.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetFlushLocks,
  backoffMs,
  enqueueOp,
  flushQueue,
  makeOpId,
  normalizeQueue,
  queueCount,
  readQueue,
  type AsyncKV,
  type FlushOutcome,
  type QueuedOp,
} from '../../apps/mobile/lib/offline-queue'

const KEY = 'test_queue'

function memKV(seed?: Record<string, string>): AsyncKV & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    store,
    getItem: (k) => Promise.resolve(store.get(k) ?? null),
    setItem: (k, v) => {
      store.set(k, v)
      return Promise.resolve()
    },
  }
}

type Toggle = { mealId: string; date: string; completed: boolean }
const toggleKey = (t: Toggle) => `${t.mealId}:${t.date}`

async function raw(kv: AsyncKV, key = KEY): Promise<QueuedOp<unknown>[]> {
  const s = await kv.getItem(key)
  return s ? (JSON.parse(s) as QueuedOp<unknown>[]) : []
}

afterEach(() => {
  __resetFlushLocks()
  vi.restoreAllMocks()
})

describe('makeOpId', () => {
  it('produces distinct non-empty ids', () => {
    const a = makeOpId()
    const b = makeOpId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('backoffMs', () => {
  it('grows exponentially and caps at maxMs', () => {
    expect(backoffMs(1)).toBe(2_000)
    expect(backoffMs(2)).toBe(4_000)
    expect(backoffMs(3)).toBe(8_000)
    expect(backoffMs(100)).toBe(5 * 60_000) // capped
  })
  it('treats attempts < 1 as the first attempt', () => {
    expect(backoffMs(0)).toBe(2_000)
  })
})

describe('enqueueOp — idempotencia por clave natural', () => {
  it('collapses re-enqueues of the same dedupKey (last-wins), never stacks', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, toggleKey({ mealId: 'm1', date: 'd1', completed: true }), { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    await enqueueOp<Toggle>(kv, KEY, toggleKey({ mealId: 'm1', date: 'd1', completed: false }), { mealId: 'm1', date: 'd1', completed: false }, toggleKey)
    const q = await readQueue<Toggle>(kv, KEY, toggleKey)
    expect(q).toHaveLength(1)
    expect(q[0].payload.completed).toBe(false)
  })

  it('preserves the stable opId across a last-wins replace', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    const first = (await readQueue<Toggle>(kv, KEY, toggleKey))[0].opId
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: false }, toggleKey)
    expect((await readQueue<Toggle>(kv, KEY, toggleKey))[0].opId).toBe(first)
  })

  it('keeps distinct dedupKeys as separate ops', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    await enqueueOp<Toggle>(kv, KEY, 'm2:d1', { mealId: 'm2', date: 'd1', completed: true }, toggleKey)
    await enqueueOp<Toggle>(kv, KEY, 'm1:d2', { mealId: 'm1', date: 'd2', completed: true }, toggleKey)
    expect(await queueCount(kv, KEY)).toBe(3)
  })

  it('resets backoff/attempts when an op is re-enqueued (fresh intention)', async () => {
    const kv = memKV()
    // seed an item already backed off with attempts
    const seeded: QueuedOp<Toggle> = { opId: 'x', dedupKey: 'm1:d1', payload: { mealId: 'm1', date: 'd1', completed: true }, enqueuedAt: 'now', attempts: 3, nextAttemptAt: 9e15 }
    await kv.setItem(KEY, JSON.stringify([seeded]))
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: false }, toggleKey)
    const q = await readQueue<Toggle>(kv, KEY, toggleKey)
    expect(q[0].attempts).toBe(0)
    expect(q[0].nextAttemptAt).toBe(0)
  })
})

describe('normalizeQueue — legacy migration & resilience', () => {
  it('wraps legacy bare payloads and derives their dedupKey', () => {
    const legacy = [{ mealId: 'm1', date: 'd1', completed: true }]
    const q = normalizeQueue<Toggle>(legacy, toggleKey)
    expect(q).toHaveLength(1)
    expect(q[0].dedupKey).toBe('m1:d1')
    expect(q[0].opId).toBeTruthy()
    expect(q[0].payload.completed).toBe(true)
  })

  it('adopts queued_at as enqueuedAt for legacy workout items', () => {
    const legacy = [{ block_id: 'b', client_id: 'c', set_number: 1, queued_at: '2026-07-08T10:00:00.000Z' }]
    const q = normalizeQueue<{ queued_at: string }>(legacy)
    expect(q[0].enqueuedAt).toBe('2026-07-08T10:00:00.000Z')
  })

  it('returns [] for non-array / corrupt input', () => {
    expect(normalizeQueue<Toggle>({ a: 1 } as unknown)).toEqual([])
    expect(normalizeQueue<Toggle>(null as unknown)).toEqual([])
  })

  it('drops corrupt non-object entries but keeps valid ones', () => {
    const q = normalizeQueue<Toggle>(['garbage', 42, { mealId: 'm', date: 'd', completed: true }], toggleKey)
    expect(q).toHaveLength(1)
    expect(q[0].dedupKey).toBe('m:d')
  })

  it('readQueue returns [] on corrupt stored JSON', async () => {
    const kv = memKV({ [KEY]: '{not json' })
    expect(await readQueue<Toggle>(kv, KEY, toggleKey)).toEqual([])
  })
})

describe('flushQueue — outcomes', () => {
  it('drains ok items and reports flushed', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    const seen: string[] = []
    const res = await flushQueue<Toggle>(kv, KEY, async (p) => {
      seen.push(p.mealId)
      return 'ok'
    })
    expect(seen).toEqual(['m1'])
    expect(res.flushed).toBe(1)
    expect(res.remaining).toBe(0)
    expect(await queueCount(kv, KEY)).toBe(0)
  })

  it('keeps retry items with an incremented attempt and future nextAttemptAt (backoff)', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    const res = await flushQueue<Toggle>(kv, KEY, async () => 'retry', { now: () => 1_000 })
    expect(res.flushed).toBe(0)
    expect(res.remaining).toBe(1)
    const q = await raw(kv)
    expect(q[0].attempts).toBe(1)
    expect(q[0].nextAttemptAt).toBe(1_000 + 2_000)
  })

  it('treats a thrown apply as retry (network exception)', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    const res = await flushQueue<Toggle>(kv, KEY, async () => {
      throw new Error('Network request failed')
    })
    expect(res.remaining).toBe(1)
    expect((await raw(kv))[0].attempts).toBe(1)
  })

  it('discards items the handler rejects permanently (e.g. FK 23503)', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    const res = await flushQueue<Toggle>(kv, KEY, async () => 'discard')
    expect(res.discarded).toBe(1)
    expect(res.remaining).toBe(0)
    expect(await queueCount(kv, KEY)).toBe(0)
  })

  it('skips items still in backoff without applying them', async () => {
    const kv = memKV()
    const seeded: QueuedOp<Toggle> = { opId: 'x', dedupKey: 'm1:d1', payload: { mealId: 'm1', date: 'd1', completed: true }, enqueuedAt: 'now', attempts: 1, nextAttemptAt: 10_000 }
    await kv.setItem(KEY, JSON.stringify([seeded]))
    const seen: string[] = []
    const res = await flushQueue<Toggle>(kv, KEY, async (p) => {
      seen.push(p.mealId)
      return 'ok'
    }, { now: () => 5_000 }) // before nextAttemptAt
    expect(seen).toEqual([]) // not applied
    expect(res.flushed).toBe(0)
    expect(res.remaining).toBe(1)
  })

  it('applies items whose backoff has elapsed', async () => {
    const kv = memKV()
    const seeded: QueuedOp<Toggle> = { opId: 'x', dedupKey: 'm1:d1', payload: { mealId: 'm1', date: 'd1', completed: true }, enqueuedAt: 'now', attempts: 1, nextAttemptAt: 10_000 }
    await kv.setItem(KEY, JSON.stringify([seeded]))
    const res = await flushQueue<Toggle>(kv, KEY, async () => 'ok', { now: () => 10_000 })
    expect(res.flushed).toBe(1)
  })

  it('per-item resilience: one retry does not block a sibling ok', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'bad:d1', { mealId: 'bad', date: 'd1', completed: true }, toggleKey)
    await enqueueOp<Toggle>(kv, KEY, 'good:d1', { mealId: 'good', date: 'd1', completed: true }, toggleKey)
    const res = await flushQueue<Toggle>(kv, KEY, async (p) => (p.mealId === 'bad' ? 'retry' : 'ok'))
    expect(res.flushed).toBe(1)
    expect(res.remaining).toBe(1)
    expect((await raw(kv))[0].payload).toMatchObject({ mealId: 'bad' })
  })

  it('empty queue is a no-op', async () => {
    const kv = memKV()
    const res = await flushQueue<Toggle>(kv, KEY, async () => 'ok')
    expect(res).toEqual({ flushed: 0, discarded: 0, remaining: 0 })
  })
})

describe('flushQueue — CANDADO (raíz del duplicado, G11 §1.6)', () => {
  it('coalesces two concurrent flushes into one drain (apply runs once per op)', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)

    let resolveApply: (() => void) | null = null
    const gate = new Promise<void>((r) => { resolveApply = () => r() })
    let applyCalls = 0
    const apply = async (): Promise<FlushOutcome> => {
      applyCalls++
      await gate // hold the first flush open so the second overlaps it
      return 'ok'
    }

    const p1 = flushQueue<Toggle>(kv, KEY, apply)
    const p2 = flushQueue<Toggle>(kv, KEY, apply) // concurrent — must coalesce
    expect(p2).toBe(p1) // same in-flight promise
    resolveApply?.()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(applyCalls).toBe(1) // NOT 2 → no duplicate application
    expect(r1).toEqual(r2)
    expect(r1.flushed).toBe(1)
    expect(await queueCount(kv, KEY)).toBe(0)
  })

  it('a second flush AFTER the first settles runs independently on the fresh queue', async () => {
    const kv = memKV()
    await enqueueOp<Toggle>(kv, KEY, 'm1:d1', { mealId: 'm1', date: 'd1', completed: true }, toggleKey)
    let calls = 0
    await flushQueue<Toggle>(kv, KEY, async () => { calls++; return 'retry' })
    // still queued; a later flush (lock released) applies again
    await flushQueue<Toggle>(kv, KEY, async () => { calls++; return 'ok' }, { now: () => 9e15 })
    expect(calls).toBe(2)
    expect(await queueCount(kv, KEY)).toBe(0)
  })
})
