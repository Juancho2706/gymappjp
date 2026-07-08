import type { WorkoutOfflineLog } from '@/lib/workout-offline-queue'

/**
 * Log de una serie tal como lo consume la UI de ejecución (`sessionLogs`, `blockLogs`, `existingLog`).
 * Fuente de verdad única del shape — `WorkoutExecutionClient` re-exporta este tipo como
 * `WorkoutSessionLog` (evita drift). Estructuralmente idéntico al elemento inline de `Props['logs']`.
 *
 * `_pending`: marca de "esta serie está en la cola offline pero el server AÚN no la confirmó". Sólo la
 * setea la reconciliación (nunca el server ni el optimismo). La usa el chip para pintar la serie como
 * "sin sincronizar" (ámbar) en vez de un check verde mentiroso — sin ella, una serie merge-eada desde
 * la cola se vería como guardada aunque no esté en la DB.
 */
export type ReconciledSessionLog = {
    block_id: string
    set_number: number
    weight_kg: number | null
    reps_done: number | null
    rpe: number | null
    rir?: number | null
    note?: string | null
    actual_duration_sec?: number | null
    actual_distance_m?: number | null
    actual_hold_sec?: number | null
    actual_avg_hr?: number | null
    // Sustitución de máquina ocupada (Fase L · C): rehidratan `substitutionByBlock` tras reload.
    substituted_exercise_id?: string | null
    substituted_exercise_name?: string | null
    substitution_reason?: string | null
    /** true ⇒ en la cola offline, sin confirmar por el server (ver doc del tipo). */
    _pending?: boolean
}

/** Clave de identidad de una serie: (block_id, set_number) — mismo motor que la cola y el upsert. */
export function sessionLogKey(blockId: string, setNumber: number): string {
    return `${blockId}:${setNumber}`
}

/**
 * Reconcilia los logs VISIBLES de la sesión a partir del server (fuente de verdad) UNIDO a la cola
 * offline pendiente y al SNAPSHOT LOCAL de series confirmadas. Función PURA (testeable sin
 * React/localStorage).
 *
 * Motivación (informe forense 2026-07-04): `sessionLogs` estaba congelado en `useState(logs)` al
 * montar; cuando el prop `logs` llega fresco (back/forward re-monta con un snapshot viejo del client
 * Router Cache; o un `router.refresh`), la UI no lo repintaba → el alumno veía VACÍO/"a medias"
 * aunque la DB estaba íntegra. Este merge es lo que pinta la data fresca.
 *
 * Ampliación MONOTÓNICA (forense RC3/RC4, 2026-07-07): con red mala Next podía remontar con `logs=[]`
 * (Router Cache stale / SW stale-while-revalidate) Y la cola ya drenada → `reconcile([], [])` daba `[]`
 * y la pantalla colapsaba a vacío pese a la DB íntegra. El tercer argumento `snapshotRows` (persistido
 * en localStorage por `session-logs.snapshot.ts`) re-inyecta las series ya confirmadas en ESTA sesión
 * como confirmadas, SÓLO donde ni el server ni la cola aportan nada. Así el server stale nunca borra la
 * pantalla, pero un server FRESCO siempre gana (el snapshot sólo rellena huecos).
 *
 * Reglas (dedupe por (block_id, set_number), precedencia server > cola > snapshot):
 *  - El server confirmado GANA: si una serie ya volvió del server, esa es la verdad (marca
 *    `_pending: false`). Un huérfano que siga en la cola (fila que colapsó antes de `state.success`)
 *    queda representado por la fila del server → se ve como guardado, y el flush idempotente lo drena.
 *  - Una serie que SÓLO está en la cola (aún sin confirmar) se conserva con sus valores y `_pending:
 *    true` → NUNCA se pisa un log local pendiente por su ausencia en server, y el chip la muestra
 *    "sin sincronizar" al reentrar.
 *  - Una serie que SÓLO está en el snapshot (ni server ni cola la reportan) entra como CONFIRMADA
 *    (`_pending: false`): ya fue confirmada por el server en esta sesión, el server stale simplemente
 *    aún no la devuelve. El snapshot nunca resucita una fila que el server SÍ reporta (distinta o no).
 *
 * SIN efectos de UX: sólo produce el arreglo (no dispara celebraciones ni auto-avance).
 */
export function reconcileSessionLogs(
    serverLogs: readonly ReconciledSessionLog[],
    queued: readonly WorkoutOfflineLog[],
    snapshotRows: readonly ReconciledSessionLog[] = [],
): ReconciledSessionLog[] {
    const byKey = new Map<string, ReconciledSessionLog>()
    for (const l of serverLogs) {
        byKey.set(sessionLogKey(l.block_id, l.set_number), { ...l, _pending: false })
    }
    for (const q of queued) {
        const key = sessionLogKey(q.blockId, q.setNumber)
        if (byKey.has(key)) continue // el server confirmado gana
        byKey.set(key, {
            block_id: q.blockId,
            set_number: q.setNumber,
            weight_kg: q.weightKg,
            reps_done: q.repsDone,
            rpe: q.rpe,
            rir: q.rir,
            note: q.note ?? null,
            actual_duration_sec: q.actualDurationSec ?? null,
            actual_distance_m: q.actualDistanceM ?? null,
            actual_hold_sec: q.actualHoldSec ?? null,
            actual_avg_hr: q.actualAvgHr ?? null,
            substituted_exercise_id: q.substitutedExerciseId ?? null,
            substituted_exercise_name: q.substitutedExerciseName ?? null,
            substitution_reason: q.substitutionReason ?? null,
            _pending: true,
        })
    }
    // Snapshot local: rellena SÓLO los huecos que ni el server ni la cola cubren (precedencia más baja).
    // Entra como confirmada — ya fue guardada por el server en esta sesión; el server stale aún no la
    // reporta. La marca `_pending:false` explícita descarta cualquier `_pending` viejo del snapshot.
    for (const s of snapshotRows) {
        const key = sessionLogKey(s.block_id, s.set_number)
        if (byKey.has(key)) continue // server o cola ganan sobre el snapshot
        byKey.set(key, { ...s, _pending: false })
    }
    return [...byKey.values()]
}
