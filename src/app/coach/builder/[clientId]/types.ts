export interface BuilderBlock {
    uid: string
    exercise_id: string
    exercise_name: string
    muscle_group: string
    gif_url?: string
    video_url?: string
    dayId?: number
    sets?: number
    reps?: string
    target_weight_kg?: string
    tempo?: string
    rir?: string
    rest_time?: string
    notes?: string
    superset_group?: string | null
    progression_type?: 'weight' | 'reps' | null
    progression_value?: number | null
}

export interface DayState {
    id: number
    name: string
    title: string
    blocks: BuilderBlock[]
    is_rest?: boolean
    week_variant?: 'A' | 'B'
}
