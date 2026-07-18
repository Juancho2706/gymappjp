/**
 * offline-queue — cola offline GENERALIZADA e idempotente (E4-23 / G11 §1.6).
 *
 * Problema que resuelve (informe G11): las dos colas ad-hoc previas hacían select-then-update/insert
 * SIN clave idempotente estable y SIN candado de flush → dos flushes disparados casi a la vez (reconnect
 * de NetInfo + focus/foreground de la tab) podían aplicar la MISMA operación dos veces y duplicar filas
 * antes de que el SELECT viera la primera. Web ya migró a optimistic+reconcile con el índice único de
 * PR #113 (`workout_logs_unique_set_per_day` sobre la CLAVE NATURAL client+block+set+día-Santiago). Acá
 * replicamos esa robustez en mobile con un enqueue/flush único parametrizado.
 *
 * Garantías:
 *  - **Idempotencia por clave natural** (`dedupKey`): re-encolar la misma operación lógica REEMPLAZA
 *    (last-wins), nunca apila. Cada op lleva además un `opId` de cliente estable (identidad para backoff
 *    y para futuras claves de idempotencia server-side).
 *  - **Candado de flush** (coalescing por `storageKey`): dos `flushQueue` concurrentes del mismo runtime
 *    JS comparten la MISMA promesa → jamás se drena la cola dos veces en paralelo (raíz del duplicado).
 *  - **Reintentos con backoff exponencial**: una op que falla transitoriamente se conserva con
 *    `attempts++` y `nextAttemptAt = now + backoff(attempts)`; el flush la salta hasta que vence.
 *  - **Clasificación de resultado** por operación: `ok` (drena), `retry` (backoff), `discard` (descarta —
 *    p.ej. FK 23503, bloque borrado; el consumidor decide).
 *
 * PURO: no importa React Native ni AsyncStorage. El storage entra por `AsyncKV` (adaptador inyectado por
 * el consumidor; los tests inyectan uno en memoria). Tolera items legacy (payload plano sin envoltura)
 * para un upgrade sin pérdida del APK viejo.
 */

/** Adaptador mínimo de almacenamiento clave-valor async (AsyncStorage en runtime; in-memory en tests). */
export interface AsyncKV {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

/** Resultado de aplicar una operación contra el server. */
export type FlushOutcome = 'ok' | 'retry' | 'discard'

/** Envoltura persistida de una operación encolada. */
export interface QueuedOp<P> {
  /** Identidad de cliente estable (idempotencia + tracking de backoff). */
  opId: string
  /** Clave natural de dedup: re-encolar con la misma clave reemplaza (last-wins). '' = sin dedup. */
  dedupKey: string
  payload: P
  enqueuedAt: string
  attempts: number
  /** epoch ms; el flush salta la op hasta que `now >= nextAttemptAt` (backoff). */
  nextAttemptAt: number
}

export interface FlushSummary {
  flushed: number
  discarded: number
  remaining: number
}

/** Genera un id de operación estable. crypto.randomUUID si existe; si no, timestamp+random (basta: la
 *  corrección se apoya en `dedupKey`, no en `opId`). */
export function makeOpId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      /* Hermes sin polyfill → fallback */
    }
  }
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Backoff exponencial acotado: base·2^(attempts-1), tope `maxMs`. */
export function backoffMs(attempts: number, baseMs = 2_000, maxMs = 5 * 60_000): number {
  const n = Math.max(1, attempts)
  return Math.min(baseMs * 2 ** (n - 1), maxMs)
}

async function readRaw(kv: AsyncKV, storageKey: string): Promise<unknown> {
  try {
    const s = await kv.getItem(storageKey)
    if (!s) return []
    return JSON.parse(s)
  } catch {
    return []
  }
}

function isEnvelope(item: unknown): item is QueuedOp<unknown> {
  return (
    typeof item === 'object' &&
    item !== null &&
    'opId' in item &&
    'payload' in item &&
    'dedupKey' in item
  )
}

/**
 * Normaliza la cola cruda a envolturas `QueuedOp`. Tolera items legacy (payload plano encolado por la
 * versión anterior del APK): los envuelve derivando su `dedupKey` con `deriveKey` (si se pasa) para que
 * hereden la idempotencia. Descarta items no-objeto corruptos.
 */
export function normalizeQueue<P>(
  raw: unknown,
  deriveKey?: (p: P) => string,
  now: number = Date.now(),
): QueuedOp<P>[] {
  if (!Array.isArray(raw)) return []
  const out: QueuedOp<P>[] = []
  for (const item of raw) {
    if (isEnvelope(item)) {
      const o = item as QueuedOp<P>
      out.push({
        opId: o.opId,
        dedupKey: o.dedupKey ?? '',
        payload: o.payload,
        enqueuedAt: o.enqueuedAt ?? new Date(now).toISOString(),
        attempts: typeof o.attempts === 'number' ? o.attempts : 0,
        nextAttemptAt: typeof o.nextAttemptAt === 'number' ? o.nextAttemptAt : 0,
      })
      continue
    }
    if (item === null || typeof item !== 'object') continue // corrupto → descartar
    const payload = item as P
    out.push({
      opId: makeOpId(),
      dedupKey: deriveKey ? deriveKey(payload) : '',
      payload,
      enqueuedAt: (payload as { queued_at?: string })?.queued_at ?? new Date(now).toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
    })
  }
  return out
}

/** Lee la cola normalizada (envolturas + legacy migrados). */
export async function readQueue<P>(
  kv: AsyncKV,
  storageKey: string,
  deriveKey?: (p: P) => string,
): Promise<QueuedOp<P>[]> {
  return normalizeQueue<P>(await readRaw(kv, storageKey), deriveKey)
}

/** Cantidad de operaciones pendientes (incluye no-vencidas). */
export async function queueCount(kv: AsyncKV, storageKey: string): Promise<number> {
  const raw = await readRaw(kv, storageKey)
  return Array.isArray(raw) ? raw.length : 0
}

/**
 * Encola una operación. Si ya existe una con el mismo `dedupKey` (≠ ''), la REEMPLAZA con el nuevo
 * payload y reinicia el backoff (last-wins) preservando el `opId` estable original; si no, la agrega.
 */
export async function enqueueOp<P>(
  kv: AsyncKV,
  storageKey: string,
  dedupKey: string,
  payload: P,
  deriveKey?: (p: P) => string,
): Promise<void> {
  const queue = normalizeQueue<P>(await readRaw(kv, storageKey), deriveKey)
  const op: QueuedOp<P> = {
    opId: makeOpId(),
    dedupKey,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  }
  const idx = dedupKey ? queue.findIndex((q) => q.dedupKey === dedupKey) : -1
  if (idx >= 0) queue[idx] = { ...op, opId: queue[idx].opId }
  else queue.push(op)
  await kv.setItem(storageKey, JSON.stringify(queue))
}

// Candado de flush: coalescing por storageKey. Dos flushes concurrentes del mismo runtime comparten la
// misma promesa → nunca se drena la cola dos veces en paralelo (raíz del duplicado de logs, G11 §1.6).
const inFlight = new Map<string, Promise<FlushSummary>>()

/**
 * Drena la cola aplicando `apply` por operación vencida. Serializado por `storageKey` (candado). Cada op
 * resuelta como `ok`/`discard` sale; `retry` (o excepción) se conserva con backoff. Devuelve el resumen.
 */
export function flushQueue<P>(
  kv: AsyncKV,
  storageKey: string,
  apply: (payload: P, op: QueuedOp<P>) => Promise<FlushOutcome>,
  opts?: { deriveKey?: (p: P) => string; now?: () => number },
): Promise<FlushSummary> {
  const existing = inFlight.get(storageKey)
  if (existing) return existing
  const run = doFlush(kv, storageKey, apply, opts).finally(() => {
    inFlight.delete(storageKey)
  })
  inFlight.set(storageKey, run)
  return run
}

async function doFlush<P>(
  kv: AsyncKV,
  storageKey: string,
  apply: (payload: P, op: QueuedOp<P>) => Promise<FlushOutcome>,
  opts?: { deriveKey?: (p: P) => string; now?: () => number },
): Promise<FlushSummary> {
  const nowMs = (opts?.now ?? (() => Date.now()))()
  const queue = normalizeQueue<P>(await readRaw(kv, storageKey), opts?.deriveKey, nowMs)
  if (queue.length === 0) return { flushed: 0, discarded: 0, remaining: 0 }

  let flushed = 0
  let discarded = 0
  const remaining: QueuedOp<P>[] = []
  for (const op of queue) {
    if (op.nextAttemptAt > nowMs) {
      remaining.push(op) // aún en backoff → conservar sin tocar
      continue
    }
    let outcome: FlushOutcome
    try {
      outcome = await apply(op.payload, op)
    } catch {
      outcome = 'retry'
    }
    if (outcome === 'ok') {
      flushed++
      continue
    }
    if (outcome === 'discard') {
      discarded++
      continue
    }
    const attempts = op.attempts + 1
    remaining.push({ ...op, attempts, nextAttemptAt: nowMs + backoffMs(attempts) })
  }
  await kv.setItem(storageKey, JSON.stringify(remaining))
  return { flushed, discarded, remaining: remaining.length }
}

/** Sólo para tests: limpia el registro de flushes en vuelo entre casos. */
export function __resetFlushLocks(): void {
  inFlight.clear()
}
