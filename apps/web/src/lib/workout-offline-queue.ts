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
    // ── Sustitución de máquina ocupada (Fase L · workstream C, DC-1) ──
    // Opcionales/aditivos: los items legacy encolados (sin estas keys) siguen parseando; el flush
    // last-wins reenvía la serie con su marca de sustitución intacta.
    substitutedExerciseId?: string | null
    substitutedExerciseName?: string | null
    substitutionReason?: string | null
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

/**
 * Encola una serie (write-through, dedup por (block,set): última gana). Devuelve `true` si quedó
 * RESPALDADA en localStorage, `false` si no se pudo respaldar.
 *
 * Gotcha forense (Safari private mode / quota llena): `setItem` LANZA (QuotaExceededError). El
 * `readWorkoutOfflineQueue` ya estaba protegido, pero este `setItem` NO — la excepción propagaba y,
 * como el call-site (LogSetForm) llama a enqueue ANTES de `formAction` (write-through), abortaba el
 * handleSubmit → la serie no llegaba NI a la cola NI al server: PÉRDIDA TOTAL SILENCIOSA. Ahora el
 * fallo se traga y se señaliza por el retorno; el call-site decide (si además está offline no hay
 * ningún camino → avisar al alumno).
 */
export function enqueueWorkoutLog(log: WorkoutOfflineLog): boolean {
    if (typeof localStorage === 'undefined') return false
    const q = readWorkoutOfflineQueue()
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(dedupeWorkoutQueue([...q, log])))
        return true
    } catch {
        return false
    }
}

/** Quita de la cola una serie ya confirmada por el server (write-through: guardó → sale). */
export function dequeueWorkoutLog(blockId: string, setNumber: number): void {
    if (typeof localStorage === 'undefined') return
    const key = workoutLogKey(blockId, setNumber)
    const q = readWorkoutOfflineQueue().filter((i) => workoutLogKey(i.blockId, i.setNumber) !== key)
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    } catch {
        // Best-effort: si `setItem` lanza (Safari private / quota), dejamos el item en la cola. El flush
        // es idempotente (last-wins) → reenviarlo de nuevo es inocuo; nunca propagar la excepción.
    }
}

export function writeWorkoutOfflineQueue(q: WorkoutOfflineLog[]): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    } catch {
        // Best-effort (mismo motivo que dequeue): si no logra persistir el remanente, el próximo ciclo
        // de flush reintenta; jamás lanzar (romper `flushWorkoutQueue` a mitad perdería series válidas).
    }
}

/** Items encolados de un plan concreto (para hidratar pendientes al montar la ejecución). */
export function readWorkoutOfflineQueueForPlan(planId: string): WorkoutOfflineLog[] {
    return readWorkoutOfflineQueue().filter((i) => i.planId === planId)
}

/** Serializa un item de la cola al FormData que espera `logSetAction` (mismo shape que el submit online). */
export function workoutLogToFormData(item: WorkoutOfflineLog): FormData {
    const fd = new FormData()
    fd.set('block_id', item.blockId)
    fd.set('set_number', String(item.setNumber))
    if (item.weightKg != null) fd.set('weight_kg', String(item.weightKg))
    if (item.repsDone != null) fd.set('reps_done', String(item.repsDone))
    if (item.rpe != null) fd.set('rpe', String(item.rpe))
    if (item.rir != null) fd.set('rir', String(item.rir))
    if (item.note != null && item.note !== '') fd.set('note', item.note)
    // Polimórfico (AC4): los items legacy no traen estas keys — no-op.
    if (item.actualDurationSec != null) fd.set('actual_duration_sec', String(item.actualDurationSec))
    if (item.actualDistanceM != null) fd.set('actual_distance_m', String(item.actualDistanceM))
    if (item.actualHoldSec != null) fd.set('actual_hold_sec', String(item.actualHoldSec))
    if (item.actualAvgHr != null) fd.set('actual_avg_hr', String(item.actualAvgHr))
    // Sustitución (Fase L · C): sólo viajan cuando la serie se logueó con sustitución activa.
    if (item.substitutedExerciseId != null && item.substitutedExerciseId !== '') fd.set('substituted_exercise_id', item.substitutedExerciseId)
    if (item.substitutedExerciseName != null && item.substitutedExerciseName !== '') fd.set('substituted_exercise_name', item.substitutedExerciseName)
    if (item.substitutionReason != null && item.substitutionReason !== '') fd.set('substitution_reason', item.substitutionReason)
    return fd
}

/** Resultado (parcial) de `logSetAction` que le importa al flush. */
export type WorkoutLogSendResult = { success?: boolean; code?: string; error?: string }
export type WorkoutLogSend = (item: WorkoutOfflineLog) => Promise<WorkoutLogSendResult>

/**
 * Flush transaccional de la cola (compartido por `OfflineWorkoutQueueSync` y por el gate de
 * "Finalizar" del ejecutor). Dedup ANTES de enviar (última intención gana); reintenta transitorios,
 * DESCARTA huérfanos (`invalid_block`), y RESUELVE el falso pendiente: una serie ya guardada en el
 * server cuya reconciliación local nunca corrió (la fila colapsó/desmontó antes de `state.success`)
 * queda huérfana en la cola — al reenviarla el upsert es last-wins/idempotente → `success` → sale de
 * la cola. `opts.planId` acota el envío a un plan (preserva intactos los items de otros planes).
 * `send` inyectado ⇒ testeable sin red. Escribe el remanente real de vuelta a localStorage.
 */
export async function flushWorkoutQueue(
    send: WorkoutLogSend,
    opts?: { planId?: string },
): Promise<{ flushed: number; discarded: number; remainingInScope: number; remaining: WorkoutOfflineLog[] }> {
    const all = dedupeWorkoutQueue(readWorkoutOfflineQueue())
    const inScope = opts?.planId ? all.filter((i) => i.planId === opts.planId) : all
    const outOfScope = opts?.planId ? all.filter((i) => i.planId !== opts.planId) : []
    const remainingInScope: WorkoutOfflineLog[] = []
    let flushed = 0
    let discarded = 0
    for (const item of inScope) {
        try {
            const res = await send(item)
            if (res.success) flushed++
            else if (res.code === 'invalid_block') discarded++
            else remainingInScope.push(item)
        } catch {
            // Excepción (red caída al enviar) → transitorio: se reintenta luego.
            remainingInScope.push(item)
        }
    }
    const remaining = [...outOfScope, ...remainingInScope]
    writeWorkoutOfflineQueue(remaining)
    return { flushed, discarded, remainingInScope: remainingInScope.length, remaining }
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
