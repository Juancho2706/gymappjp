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
