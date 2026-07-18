/**
 * @eva/plan-builder — tipos del estado del builder de programas (web + mobile).
 *
 * Fuente de verdad única extraída de apps/web/src/app/coach/builder/[clientId]/types.ts
 * (E5-01). Web reexporta estos tipos desde su `types.ts`; mobile los reexporta desde
 * `lib/plan-builder/types.ts`. Mantener la MISMA forma garantiza paridad funcional +
 * persistencia idéntica.
 *
 * TypeScript puro (sin React / Next / Supabase / React Native).
 */
import type { ExerciseType, IntervalConfig } from '@eva/workout-engine'

// Ejes ortogonales del bloque polimórfico (specs/movida-entrenamiento). Espejo EXACTO de
// `@/domain/workout/types` (web) — re-declarados acá para que el paquete quede
// self-contained (mismo criterio que @eva/workout-engine con WorkoutArea/IntervalConfig).
// Uniones de string idénticas ⇒ compatibles estructuralmente con las del dominio web.
export type SideMode = 'bilateral' | 'per_side' | 'alternating'
export type LoadType = 'weight' | 'time' | 'bodyweight' | 'none'
export type LoadUnit = 'kg' | 'lb' | 'sec'
export type DistanceUnit = 'm' | 'km'
export type RepsUnit = 'reps' | 'passes' | 'breaths'

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
    // ── Mobile passthrough (lib/plan-builder/serialize.ts) ──
    // Fila DB original completa (todas las columnas, incl. las que el editor mobile no conoce:
    // section_template_id + polimórficos). Se conserva al cargar y se usa como base del
    // passthrough al guardar. Undefined en web y en bloques nuevos agregados del catálogo.
    _raw?: Record<string, unknown>
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

// ── Estructura a nivel programa (usada por el builder mobile) ──
export type ProgramStructureType = 'weekly' | 'cycle'
export type DurationType = 'weeks' | 'async' | 'calendar_days'

export interface ProgramMeta {
    structure_type: ProgramStructureType
    duration_type: DurationType
    weeks_to_repeat: number
    uses_week_variants: boolean
}
