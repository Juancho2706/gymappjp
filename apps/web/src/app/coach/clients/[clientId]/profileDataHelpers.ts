/** Agregaciones puras para datos de perfil (B0). */

export type PersonalRecordRow = {
    exerciseId: string
    exerciseName: string
    muscleGroup: string
    maxWeightKg: number
    repsAtMax: number
}

export type MuscleVolumeRow = {
    muscleGroup: string
    volume: number
}

export function buildPersonalRecordsFromLogs(rows: unknown[] | null): PersonalRecordRow[] {
    if (!rows?.length) return []
    const best = new Map<string, PersonalRecordRow>()

    for (const raw of rows) {
        const row = raw as {
            weight_kg: number | null
            reps_done: number | null
            workout_blocks?: {
                exercise_id?: string
                exercises?: { name?: string; muscle_group?: string } | null
            } | null
        }
        const w = row.weight_kg
        if (w == null || w <= 0) continue
        const block = row.workout_blocks
        const exId = block?.exercise_id
        if (!exId) continue
        const prev = best.get(exId)
        if (prev && w < prev.maxWeightKg) continue
        const ex = block.exercises
        best.set(exId, {
            exerciseId: exId,
            exerciseName: ex?.name ?? 'Ejercicio',
            muscleGroup: ex?.muscle_group ?? '—',
            maxWeightKg: w,
            repsAtMax: row.reps_done ?? 0,
        })
    }

    return [...best.values()].sort((a, b) => b.maxWeightKg - a.maxWeightKg)
}

export function buildMuscleVolumeFromLogs(rows: unknown[] | null): MuscleVolumeRow[] {
    if (!rows?.length) return []
    const vol = new Map<string, number>()

    for (const raw of rows) {
        const row = raw as {
            weight_kg: number | null
            reps_done: number | null
            workout_blocks?: {
                exercises?: { muscle_group?: string } | null
            } | null
        }
        const w = row.weight_kg ?? 0
        const r = row.reps_done ?? 0
        const mg = row.workout_blocks?.exercises?.muscle_group?.trim() || 'Otro'
        const add = w * r
        if (add <= 0) continue
        vol.set(mg, (vol.get(mg) ?? 0) + add)
    }

    return [...vol.entries()]
        .map(([muscleGroup, volume]) => ({ muscleGroup, volume }))
        .sort((a, b) => b.volume - a.volume)
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC mappers (Postgres ya agrega) — sustituyen el cálculo JS sobre miles de filas.
// Mantienen la MISMA forma de salida que los `build*FromLogs` de arriba.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila de `get_client_exercise_prs` (1 fila por ejercicio, ya es el PR de peso máx). */
export type ExercisePrRpcRow = {
    exercise_id: string
    name: string
    muscle_group: string
    max_weight_kg: number
    reps_at_max: number
}

/** `get_client_exercise_prs` → `PersonalRecordRow[]` (orden por peso máx DESC). */
export function mapExercisePrsRpc(rows: ExercisePrRpcRow[] | null): PersonalRecordRow[] {
    if (!rows?.length) return []
    return rows
        .filter((r) => (r.max_weight_kg ?? 0) > 0)
        .map((r) => ({
            exerciseId: r.exercise_id,
            exerciseName: r.name ?? 'Ejercicio',
            muscleGroup: r.muscle_group ?? '—',
            maxWeightKg: r.max_weight_kg,
            repsAtMax: r.reps_at_max ?? 0,
        }))
        .sort((a, b) => b.maxWeightKg - a.maxWeightKg)
}

/** Fila de `get_client_muscle_volume` (ya agregada por grupo, orden volume DESC). */
export type MuscleVolumeRpcRow = {
    muscle_group: string
    volume: number
}

/** `get_client_muscle_volume` → `MuscleVolumeRow[]` (orden volume DESC). */
export function mapMuscleVolumeRpc(rows: MuscleVolumeRpcRow[] | null): MuscleVolumeRow[] {
    if (!rows?.length) return []
    return rows
        .map((r) => ({
            muscleGroup: r.muscle_group?.trim() || 'Otro',
            volume: r.volume ?? 0,
        }))
        .filter((r) => r.volume > 0)
        .sort((a, b) => b.volume - a.volume)
}
