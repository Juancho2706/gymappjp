export type WorkoutSection = 'warmup' | 'main' | 'cooldown' | 'other'

/**
 * Area de entrenamiento (workout_section_templates): system (7 fijas, solo-lectura),
 * custom de coach (coach_id) o custom de team (team_id). Expand-contract sobre
 * workout_blocks.section: el area es la fuente preferente, section queda como bucket legacy.
 */
export interface WorkoutArea {
    id: string
    name: string
    slug: string
    sort_order: number
    is_system: boolean
    coach_id: string | null
    team_id: string | null
}

export type SetType = 'normal' | 'superset' | 'circuit' | 'dropset' | 'amrap' | 'emom' | 'tabata'

/** @deprecated Huérfano pre-polimórfico; usar ExerciseType + ejes ortogonales del bloque. */
export type ExerciseUnit = 'reps' | 'time' | 'distance' | 'weight'

export type ProgramStatus = 'active' | 'inactive' | 'template'

// ─── Polimórfico (specs/movida-entrenamiento) ────────────────────────────────

/** Tipo del ejercicio (exercises.exercise_type) — decide qué formulario/ejes se muestran. */
export type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'roller'

export type SideMode = 'bilateral' | 'per_side' | 'alternating'
export type LoadType = 'weight' | 'time' | 'bodyweight' | 'none'
export type LoadUnit = 'kg' | 'lb' | 'sec'
export type DistanceUnit = 'm' | 'km'
export type RepsUnit = 'reps' | 'passes' | 'breaths'

/** Shape de workout_blocks.interval_config (jsonb) — espejo del IntervalConfigSchema de @eva/schemas. */
export interface IntervalConfig {
    warmup_sec?: number
    cooldown_sec?: number
    /** N repeticiones del paso work/recovery (M externo = block.sets). */
    repeats: number
    work: {
        duration_sec?: number
        distance_m?: number
        target?: {
            kind: 'hr_zone' | 'pace' | 'rpe' | 'none'
            hr_zone?: 1 | 2 | 3 | 4 | 5
            pace_sec_per_km?: number
            rpe?: number
        }
    }
    recovery?: {
        duration_sec?: number
        distance_m?: number
        mode?: 'rest' | 'jog' | 'walk'
    }
}
