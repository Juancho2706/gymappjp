const QUEUE_KEY = 'eva:workout-offline-queue'

export type WorkoutOfflineLog = {
    blockId: string
    setNumber: number
    weightKg: number | null
    repsDone: number | null
    rpe: number | null
    rir: number | null
    /** Nota rápida por serie (quick-win E2-6) — opcional: los items legacy siguen parseando. */
    note?: string | null
    planId: string
    coachSlug: string
    timestamp: number
    // ── Espejo polimórfico (specs/movida-entrenamiento, AC4) ──
    // Opcionales: los items legacy ya encolados en localStorage siguen parseando.
    actualDurationSec?: number | null
    actualDistanceM?: number | null
    actualHoldSec?: number | null
    actualAvgHr?: number | null
}

/** Clave de identidad de una serie encolada: el motor es (block_id, set_number). */
export function workoutLogKey(blockId: string, setNumber: number): string {
    return `${blockId}:${setNumber}`
}

export function readWorkoutOfflineQueue(): WorkoutOfflineLog[] {
    if (typeof localStorage === 'undefined') return []
    try {
        const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
        return Array.isArray(parsed) ? (parsed as WorkoutOfflineLog[]) : []
    } catch {
        return []
    }
}

/**
 * Dedupe por (block_id, set_number) — ÚLTIMA intención gana (misma semántica que
 * `nutrition-offline-queue` y que el upsert-por-día de `logSetAction`). Preserva el orden
 * de la ÚLTIMA aparición de cada clave. Pura → testeable sin localStorage.
 *
 * Bug que arregla (forense 2026-07-03): la cola vieja hacía `q.push(log)` sin dedup, así que
 * cada re-submit offline de la MISMA serie apilaba un item nuevo. El flush los reproducía TODOS
 * en secuencia (35×3 → 36×3 → …), el server hacía last-wins, y la UI post-reload mostraba una
 * mezcla distinta en cada entrada (fantasmas encolados que se escribían minutos después).
 */
export function dedupeWorkoutQueue(q: WorkoutOfflineLog[]): WorkoutOfflineLog[] {
    const byKey = new Map<string, WorkoutOfflineLog>()
    for (const item of q) {
        // Set + delete → la clave se reubica al final (la última intención queda al final de la cola).
        const key = workoutLogKey(item.blockId, item.setNumber)
        byKey.delete(key)
        byKey.set(key, item)
    }
    return [...byKey.values()]
}

/**
 * Descarta items cuyo `block_id` ya no exista (huérfanos de reseed): tras recrear los bloques,
 * la cola local puede tener series apuntando a bloques MUERTOS → el INSERT tiraría FK 23503 en
 * loop infinito. Solo poda si conocemos el universo de bloques válidos (validBlockIds no vacío);
 * si está vacío (no sabemos), NO poda (fail-safe: nunca borra por ignorancia).
 */
export function pruneOrphanWorkoutLogs(
    q: WorkoutOfflineLog[],
    validBlockIds: ReadonlySet<string> | readonly string[],
): { kept: WorkoutOfflineLog[]; dropped: WorkoutOfflineLog[] } {
    const valid = validBlockIds instanceof Set ? validBlockIds : new Set(validBlockIds)
    if (valid.size === 0) return { kept: q, dropped: [] }
    const kept: WorkoutOfflineLog[] = []
    const dropped: WorkoutOfflineLog[] = []
    for (const item of q) {
        if (valid.has(item.blockId)) kept.push(item)
        else dropped.push(item)
    }
    return { kept, dropped }
}

export function enqueueWorkoutLog(log: WorkoutOfflineLog): void {
    if (typeof localStorage === 'undefined') return
    const q = readWorkoutOfflineQueue()
    localStorage.setItem(QUEUE_KEY, JSON.stringify(dedupeWorkoutQueue([...q, log])))
}

/** Quita de la cola una serie ya confirmada por el server (write-through: guardó → sale). */
export function dequeueWorkoutLog(blockId: string, setNumber: number): void {
    if (typeof localStorage === 'undefined') return
    const key = workoutLogKey(blockId, setNumber)
    const q = readWorkoutOfflineQueue().filter((i) => workoutLogKey(i.blockId, i.setNumber) !== key)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export function writeWorkoutOfflineQueue(q: WorkoutOfflineLog[]): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

/** Items encolados de un plan concreto (para hidratar pendientes al montar la ejecución). */
export function readWorkoutOfflineQueueForPlan(planId: string): WorkoutOfflineLog[] {
    return readWorkoutOfflineQueue().filter((i) => i.planId === planId)
}

/**
 * Heurística de "esto fue la red, no un rechazo del server" (espejo de nutrition-offline-queue):
 * en 4G/5G inestable `navigator.onLine` suele ser `true` (hay interfaz, no hay conectividad), así
 * que un fetch de server action puede fallar aunque el guard de `!navigator.onLine` no dispare.
 * En ese caso conviene tratar el submit como offline (encolar) en vez de perder el valor tipeado.
 */
export function isLikelyOfflineError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
    const msg = err instanceof Error ? err.message : String(err)
    return /failed to fetch|networkerror|network request failed|load failed|fetch|connection|timeout|aborted/i.test(msg)
}
