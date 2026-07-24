import type { ReconciledSessionLog, WorkoutLogSideMetadata } from './session-logs.reconcile'

/**
 * Payload de "serie recién confirmada localmente" que el hijo (`LogSetForm` / `TypedLogSetRow`)
 * reporta al padre (`onLogged`) para el optimismo de `sessionLogs`. Fuente de verdad ÚNICA del shape
 * (lo reusan LogSetForm.Props.onLogged, WorkoutExecutionClient.handleLogged y SingleExerciseCard).
 *
 * Los ejes polimórficos (cardio/movilidad/roller) son OPCIONALES: el camino strength no los manda; el
 * tipado (mobility hold, cardio, roller) SÍ. Antes se caían acá → bug forense (ver abajo).
 */
export type OptimisticLogPayload = {
    blockId: string
    setNumber: number
    weightKg: number | null
    repsDone: number | null
    rpe: number | null
    rir: number | null
    note?: string | null
    actualDurationSec?: number | null
    actualDistanceM?: number | null
    actualHoldSec?: number | null
    actualAvgHr?: number | null
    // Hold POR LADO (E0.5): metadata jsonb {left_sec, right_sec}. Opcional — el camino strength/tipado
    // bilateral no lo manda; solo el flujo per_side. Debe PRESERVARSE (mismo bug forense del hold).
    metadata?: WorkoutLogSideMetadata | null
}

/**
 * Construye el log optimista de una serie recién confirmada, PRESERVANDO los ejes polimórficos.
 *
 * Bug forense hold (2026-07-04): el optimismo previo sólo copiaba weight/reps/rpe/rir/note. Para una
 * serie de HOLD (movilidad, o fuerza con reps "45s") esos ejes son NULL y el valor real vive en
 * `actual_hold_sec`. El log optimista viajaba SIN ese eje → al confirmar, la fila tipada recibía un
 * `existingLog` sin `actual_hold_sec`, su `<input>` (uncontrolled) leía `defaultValue = ''` y su
 * `key` del form cambiaba (remount) → el "45s" recién tipeado DESAPARECÍA de la pantalla. Preservar
 * los actual_* acá hace que el input remonte con el valor correcto y la serie se vea guardada.
 */
export function buildOptimisticSessionLog(payload: OptimisticLogPayload): ReconciledSessionLog {
    return {
        block_id: payload.blockId,
        set_number: payload.setNumber,
        weight_kg: payload.weightKg,
        reps_done: payload.repsDone,
        rpe: payload.rpe,
        rir: payload.rir,
        note: payload.note ?? null,
        actual_duration_sec: payload.actualDurationSec ?? null,
        actual_distance_m: payload.actualDistanceM ?? null,
        actual_hold_sec: payload.actualHoldSec ?? null,
        actual_avg_hr: payload.actualAvgHr ?? null,
        // Preserva el hold por lado (E0.5) igual que los demás ejes: sin esto, un optimismo sobre una
        // serie per_side viajaría sin {left_sec, right_sec} y la fila tipada los perdería al confirmar.
        metadata: payload.metadata ?? null,
    }
}

/**
 * Aplica un log optimista a la lista visible (dedup por (block_id, set_number), última intención
 * gana — mismo motor que la cola y el upsert-por-día). Función PURA (testeable sin React).
 */
export function applyOptimisticSessionLog<T extends { block_id: string; set_number: number }>(
    prev: T[],
    payload: OptimisticLogPayload,
): T[] {
    const next = prev.filter((log) => !(log.block_id === payload.blockId && log.set_number === payload.setNumber))
    next.push(buildOptimisticSessionLog(payload) as unknown as T)
    return next
}
