import type {
    DistanceUnit,
    ExerciseType,
    IntervalConfig,
    LoadType,
    LoadUnit,
    RepsUnit,
    SideMode,
} from '@/domain/workout/types'
import type { HrZoneRange } from '@/domain/cardio/types'

/** Contexto del módulo `cardio` resuelto server-side (RSC) para chips/plantillas del builder. */
export interface BuilderCardioContext {
    /** Módulo cardio ON para el contexto del alumno (team manda; OFF ⇒ sin chips ni plantillas). */
    enabled: boolean
    /** Zonas personalizadas del alumno (null sin perfil ⇒ chips solo "Z4" + CTA). */
    zones: HrZoneRange[] | null
}

export type BuilderSection = 'warmup' | 'main' | 'cooldown'

export interface BuilderBlock {
    uid: string
    exercise_id: string
    exercise_name: string
    muscle_group: string
    gif_url?: string
    video_url?: string
    thumbnail_url?: string
    dayId?: number
    sets?: number
    reps?: string
    target_weight_kg?: string
    tempo?: string
    rir?: string
    rest_time?: string
    /** Descanso de las series de aproximación (Fase M — 8b). Vacío ⇒ mismo descanso que rest_time. */
    warmup_rest_time?: string
    notes?: string
    superset_group?: string | null
    progression_type?: 'weight' | 'reps' | null
    progression_value?: number | null
    progression_mode?: 'weekly_linear' | 'double' | 'session_linear' | 'adaptive' | null
    section?: BuilderSection
    /** Area (workout_section_templates.id) — preferente sobre section legacy (expand-contract) */
    section_template_id?: string | null
    is_override?: boolean
    // ── Polimórfico (specs/movida-entrenamiento) — todo opcional, legacy intacto ──
    /** Tipo del ejercicio del catálogo (exercises.exercise_type); null en data legacy. */
    exercise_type?: ExerciseType | null
    /** Override explícito del coach a nivel bloque (manda sobre exercise_type). */
    exercise_type_override?: ExerciseType | null
    side_mode?: SideMode | null
    reps_value?: number | null
    reps_unit?: RepsUnit | null
    load_type?: LoadType | null
    /** String para input (igual que target_weight_kg); se parsea al guardar. */
    load_value?: string
    load_unit?: LoadUnit | null
    /** String para input; se parsea al guardar. */
    distance_value?: string
    distance_unit?: DistanceUnit | null
    duration_sec?: number | null
    target_pace_sec_per_km?: number | null
    hr_zone?: number | null
    instructions?: string
    interval_config?: IntervalConfig | null
    /** Por-lado (movilidad/cardio unilateral). Faltaba en el round-trip → se perdía al guardar. */
    is_unilateral?: boolean | null
    /** Metadata de targets secundarios. Faltaba en el round-trip → se perdía al guardar. */
    extra_targets?: Record<string, unknown> | null
}

export interface ProgramPhase {
    name: string
    weeks: number
    color: string
}

export interface DayState {
    id: number
    name: string
    title: string
    blocks: BuilderBlock[]
    is_rest?: boolean
    week_variant?: 'A' | 'B'
}
