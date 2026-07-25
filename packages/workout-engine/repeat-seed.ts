/**
 * Semilla de "repetir un día" — cálculo PURO (sin React, sin browser, sin fecha del sistema).
 *
 * Cuando el alumno repite un día ya entrenado, el ejecutor precarga cada serie con lo que registró
 * esa vez. Este helper indexa las filas de `workout_logs` de ese día por la MISMA identidad que usa
 * la cola offline y el upsert (`sessionLogKey(block_id, set_number)`, session-logs.reconcile), para
 * que la semilla caiga exactamente sobre la serie que corresponde y no por posición del arreglo.
 *
 * Decisiones del CEO:
 *  - La NOTA no se siembra. Una nota del lunes ("me dolió el hombro") no es un comentario de hoy:
 *    sembrarla haría que el alumno arrastre sin querer un comentario ajeno a la sesión actual.
 *  - Las series hechas con máquina SUSTITUIDA se DESCARTAN por defecto: sembrar el peso de una
 *    máquina sustituida sobre el ejercicio prescrito engañaría al alumno (cargas no comparables).
 *    Opt-in explícito con `keepSubstituted` para quien quiera verlas igual.
 *
 * El `rir` fuera de rango se normaliza a `null` (mismo criterio defensivo que el teclado tipado):
 * data histórica sucia no debe sembrar un valor que la UI no puede representar.
 */

import { sessionLogKey } from './session-logs.reconcile'
import type { WorkoutLogSideMetadata } from './session-logs.reconcile'

/**
 * Fila registrada de un día ya entrenado (snake_case = shape de `workout_logs` /
 * `ReconciledSessionLog`). Estructuralmente compatible con lo que devuelve el server, así el caller
 * pasa sus filas sin traducir nombres.
 */
export interface RepeatSeedRow {
    block_id: string
    set_number: number
    weight_kg?: number | null
    reps_done?: number | null
    rpe?: number | null
    rir?: number | null
    actual_duration_sec?: number | null
    actual_distance_m?: number | null
    actual_hold_sec?: number | null
    actual_avg_hr?: number | null
    /** Hold POR LADO: espejo del jsonb {left_sec, right_sec}. Viaja intacto a la semilla. */
    metadata?: WorkoutLogSideMetadata | null
    /** No nulo ⇒ la serie se hizo con otra máquina: se descarta salvo `keepSubstituted`. */
    substituted_exercise_id?: string | null
}

/** Valores con que se precarga una serie al repetir el día. Sin nota (decisión del CEO). */
export interface RepeatSeedEntry {
    weightKg: number | null
    repsDone: number | null
    rpe: number | null
    rir: number | null
    actualDurationSec: number | null
    actualDistanceM: number | null
    actualHoldSec: number | null
    actualAvgHr: number | null
    metadata: WorkoutLogSideMetadata | null
}

export interface RepeatSeedOptions {
    /** true ⇒ también siembra las series hechas con máquina sustituida. Por defecto `false`. */
    keepSubstituted?: boolean
    /** Piso válido de `rir`; fuera de `[rirMin..10]` se normaliza a `null`. Por defecto `0`. */
    rirMin?: number
}

/** Normaliza a `number | null`: descarta `undefined`, `null` y no-finitos (NaN/Infinity). */
function num(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** `rir` sólo sobrevive dentro de `[rirMin..10]`; cualquier otra cosa es data sucia ⇒ `null`. */
function clampRir(value: number | null | undefined, rirMin: number): number | null {
    const rir = num(value)
    if (rir === null) return null
    return rir >= rirMin && rir <= 10 ? rir : null
}

/**
 * Indexa las series registradas de un día por `(block_id, set_number)` para precargar el ejecutor.
 *
 * Filas sin peso pero CON reps (o con métricas polimórficas: duración, distancia, hold, pulso) se
 * conservan — un ejercicio de peso corporal o de cardio no tiene kg y su semilla igual sirve. Ante
 * claves repetidas gana la ÚLTIMA fila (mismo criterio last-wins del flush de la cola).
 */
export function buildRepeatSeedMap(
    rows: readonly RepeatSeedRow[],
    opts: RepeatSeedOptions = {},
): Map<string, RepeatSeedEntry> {
    const { keepSubstituted = false, rirMin = 0 } = opts
    const byKey = new Map<string, RepeatSeedEntry>()

    for (const row of rows) {
        if (!keepSubstituted && row.substituted_exercise_id != null) continue
        byKey.set(sessionLogKey(row.block_id, row.set_number), {
            weightKg: num(row.weight_kg),
            repsDone: num(row.reps_done),
            rpe: num(row.rpe),
            rir: clampRir(row.rir, rirMin),
            actualDurationSec: num(row.actual_duration_sec),
            actualDistanceM: num(row.actual_distance_m),
            actualHoldSec: num(row.actual_hold_sec),
            actualAvgHr: num(row.actual_avg_hr),
            metadata: row.metadata ?? null,
        })
    }

    return byKey
}
