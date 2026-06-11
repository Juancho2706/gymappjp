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

export type ExerciseUnit = 'reps' | 'time' | 'distance' | 'weight'

export type ProgramStatus = 'active' | 'inactive' | 'template'
