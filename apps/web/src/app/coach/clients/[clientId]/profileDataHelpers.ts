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

// ─────────────────────────────────────────────────────────────────────────────
// Cosecha de datos del alumno (fase render) — helpers PUROS. No tocan Supabase.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila cruda de `daily_habits` (subset que trae el loader de la ficha). */
export type DailyHabitRow = {
    log_date: string
    water_ml: number | null
    steps: number | null
    sleep_hours: number | null
    fasting_hours: number | null
    supplements: string[] | null
    notes: string | null
}

/** Resumen de hábitos: valores de HOY + promedios de los días CON registro en la ventana. */
export type DailyHabitsSummary = {
    /** Fila de hoy (si el alumno registró hoy), o null. */
    today: DailyHabitRow | null
    /** Nº de días con al menos un hábito registrado en la ventana (denominador de los promedios). */
    daysLogged: number
    /** Promedios sobre los días con dato (null si ningún día tiene ese hábito). */
    avg: {
        water_ml: number | null
        steps: number | null
        sleep_hours: number | null
        fasting_hours: number | null
    }
}

const _avgOf = (nums: number[]): number | null =>
    nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null

/**
 * Resume las filas de `daily_habits` (ventana 7d) en el mini-widget del Resumen.
 * Promedia SOLO los días donde el hábito tiene valor (no cuenta null como 0).
 */
export function summarizeDailyHabits(
    rows: DailyHabitRow[] | null | undefined,
    todayIso: string
): DailyHabitsSummary {
    const list = rows ?? []
    const pick = (k: 'water_ml' | 'steps' | 'sleep_hours' | 'fasting_hours') =>
        _avgOf(list.map((r) => r[k]).filter((v): v is number => typeof v === 'number'))
    const daysLogged = list.filter(
        (r) =>
            r.water_ml != null ||
            r.steps != null ||
            r.sleep_hours != null ||
            r.fasting_hours != null ||
            (r.supplements?.length ?? 0) > 0
    ).length
    return {
        today: list.find((r) => r.log_date === todayIso) ?? null,
        daysLogged,
        avg: {
            water_ml: pick('water_ml'),
            steps: pick('steps'),
            sleep_hours: pick('sleep_hours'),
            fasting_hours: pick('fasting_hours'),
        },
    }
}

/**
 * Porción realmente consumida (0-100) de un meal log. `consumed_quantity` es un
 * porcentaje explícito; ausencia/null en una comida COMPLETADA = 100% (modo binario).
 * Devuelve null si la comida no está completada (no se consumió nada medible).
 */
export function mealConsumedPct(mealLog: {
    is_completed?: boolean | null
    consumed_quantity?: number | null
}): number | null {
    if (!mealLog.is_completed) return null
    const n = mealLog.consumed_quantity
    if (n == null || Number.isNaN(Number(n))) return 100
    return Math.min(100, Math.max(0, Math.round(Number(n))))
}

/** Promedio de satisfacción (1-5) sobre los meal logs que tienen score. null si ninguno. */
export function avgSatisfaction(
    mealLogs: ReadonlyArray<{ satisfaction_score?: number | null }> | null | undefined
): number | null {
    const scores = (mealLogs ?? [])
        .map((m) => m.satisfaction_score)
        .filter((v): v is number => typeof v === 'number' && v > 0)
    return scores.length
        ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10
        : null
}
