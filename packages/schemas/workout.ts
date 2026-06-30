import { z } from 'zod'

function preprocessOptionalFiniteKg(val: unknown): number | null | undefined {
    if (val === null) return null
    if (val === undefined || val === '') return undefined
    if (typeof val === 'string') {
        const t = val.trim().replace(',', '.')
        if (t === '') return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
    }
    if (typeof val === 'number') return Number.isFinite(val) ? val : null
    const n = Number(val)
    return Number.isFinite(n) ? n : null
}

function preprocessOptionalFiniteProgression(val: unknown): number | null | undefined {
    if (val === null) return null
    if (val === undefined || val === '') return undefined
    const n = typeof val === 'number' ? val : Number(val)
    return Number.isFinite(n) ? n : null
}

function preprocessSets(val: unknown): number {
    const n = typeof val === 'number' ? val : Number(val)
    if (!Number.isFinite(n)) return 3
    return Math.min(20, Math.max(1, Math.round(n)))
}

function preprocessDayOfWeek(val: unknown): number {
    const n = typeof val === 'number' ? val : Number(val)
    if (!Number.isFinite(n)) return 1
    return Math.min(28, Math.max(1, Math.round(n)))
}

function preprocessIntInRange(min: number, max: number, fallback: number) {
    return (val: unknown) => {
        if (val === null || val === undefined || val === '') return fallback
        const n = typeof val === 'number' ? val : Number(val)
        if (!Number.isFinite(n)) return fallback
        return Math.min(max, Math.max(min, Math.round(n)))
    }
}

const optionalKg = z.union([z.number().min(0), z.null()]).optional()
const optionalProgression = z.union([z.number().min(0).max(1000), z.null()]).optional()

// ─── Prescripción polimórfica (specs/movida-entrenamiento) ──────────────────
// Ejes ortogonales (research Hevy): reps/duración/distancia/carga/lado coexisten.
// TODOS los campos nuevos son nullable/opcionales: un payload clásico de hoy
// (solo sets/reps/target_weight_kg) valida EXACTAMENTE igual que antes (AC3).

export const EXERCISE_TYPE_VALUES = ['strength', 'cardio', 'mobility', 'roller'] as const
export const SIDE_MODE_VALUES = ['bilateral', 'per_side', 'alternating'] as const
export const LOAD_TYPE_VALUES = ['weight', 'time', 'bodyweight', 'none'] as const
export const LOAD_UNIT_VALUES = ['kg', 'lb', 'sec'] as const
export const DISTANCE_UNIT_VALUES = ['m', 'km'] as const
export const REPS_UNIT_VALUES = ['reps', 'passes', 'breaths'] as const

const IntervalTargetSchema = z.object({
    kind: z.enum(['hr_zone', 'pace', 'rpe', 'none']),
    hr_zone: z.number().int().min(1).max(5).optional(),
    pace_sec_per_km: z.number().int().positive().max(3600).optional(),
    rpe: z.number().min(1).max(10).optional(),
})

/** Shape de workout_blocks.interval_config (jsonb) — validado en app layer (decisión M2). */
export const IntervalConfigSchema = z.object({
    warmup_sec: z.number().int().min(0).max(7200).optional(),
    cooldown_sec: z.number().int().min(0).max(7200).optional(),
    /** N repeticiones del paso work/recovery (M externo = block.sets). */
    repeats: z.number().int().min(1).max(100),
    work: z.object({
        duration_sec: z.number().int().min(1).max(14400).optional(),
        distance_m: z.number().min(1).max(100000).optional(),
        target: IntervalTargetSchema.optional(),
    }),
    recovery: z
        .object({
            duration_sec: z.number().int().min(0).max(7200).optional(),
            distance_m: z.number().min(0).max(100000).optional(),
            mode: z.enum(['rest', 'jog', 'walk']).optional(),
        })
        .optional(),
})

export type IntervalConfigInput = z.infer<typeof IntervalConfigSchema>

/**
 * Completitud de un bloque cardio: necesita al menos una prescripción de carga aeróbica
 * (duración, distancia o intervalos). Fuente de verdad ÚNICA — la usa el superRefine del
 * schema (cuando el bloque declara `exercise_type_override === 'cardio'`) y debe usarla el
 * server action que resuelve el tipo EFECTIVO desde el catálogo (`effectiveExerciseType`),
 * porque el schema NO conoce `exercise.exercise_type` (no viaja en el payload del bloque).
 * Pura, sin imports de Next/Supabase — segura para web y mobile.
 */
export function isCardioBlockComplete(block: {
    duration_sec?: number | null
    distance_value?: number | null
    interval_config?: unknown
}): boolean {
    const hasDuration = block.duration_sec != null && block.duration_sec > 0
    const hasDistance = block.distance_value != null && block.distance_value > 0
    const hasInterval = block.interval_config != null
    return hasDuration || hasDistance || hasInterval
}

const optionalNonNegativeInt = (max: number) =>
    z.union([z.number().int().min(0).max(max), z.null()]).optional()
const optionalNonNegativeNumber = (max: number) =>
    z.union([z.number().min(0).max(max), z.null()]).optional()
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
    z.union([z.enum(values), z.null()]).optional()

export const WorkoutBlockSchema = z.object({
    // z.guid(), NO z.uuid(): los ejercicios seed de cardio/mobility/roller usan UUIDs
    // deterministas (00000000-0000-0000-0ca0-*, version/variante 0) que NO cumplen RFC 9562;
    // el .uuid() estricto de Zod 4 los rechaza ("Invalid UUID") y rompe el save de cualquier
    // plan que incluya un bloque cardio/movilidad/roller (mismo caso que section_template_id).
    exercise_id: z.guid(),
    sets: z.preprocess(preprocessSets, z.number().int().min(1, 'Mínimo 1 serie').max(20, 'Máximo 20 series')),
    reps: z.string().min(1, 'Las repeticiones son obligatorias').max(20, 'Máximo 20 caracteres en repeticiones'),
    target_weight_kg: z.preprocess(preprocessOptionalFiniteKg, optionalKg),
    tempo: z.string().max(20, 'Máximo 20 caracteres en tempo').nullable().optional(),
    rir: z.string().max(10, 'Máximo 10 caracteres en RIR').nullable().optional(),
    rest_time: z.string().max(20, 'Máximo 20 caracteres en recuperación').nullable().optional(),
    notes: z.string().max(1000, 'Las notas del ejercicio no pueden superar 1000 caracteres').nullable().optional(),
    superset_group: z.string().max(10).nullable().optional(),
    progression_type: z.enum(['weight', 'reps']).nullable().optional(),
    progression_value: z.preprocess(preprocessOptionalFiniteProgression, optionalProgression),
    progression_mode: z.enum(['weekly_linear', 'double', 'session_linear', 'adaptive']).nullable().optional(),
    section: z.enum(['warmup', 'main', 'cooldown']).optional(),
    // z.guid(), NO z.uuid(): los UUIDs seed de las areas system (0000a5ec-*, version/variante 0)
    // no cumplen RFC 9562 y el .uuid() estricto de Zod 4 los rechaza (rompe el save de todo plan).
    section_template_id: z.guid().nullable().optional(),
    is_override: z.boolean().optional(),
    // ── Campos polimórficos (todos opcionales — retrocompatibilidad TOTAL) ──
    is_unilateral: z.union([z.boolean(), z.null()]).optional(),
    side_mode: optionalEnum(SIDE_MODE_VALUES),
    reps_value: optionalNonNegativeInt(10000),
    reps_unit: optionalEnum(REPS_UNIT_VALUES),
    load_type: optionalEnum(LOAD_TYPE_VALUES),
    load_value: optionalNonNegativeNumber(10000),
    load_unit: optionalEnum(LOAD_UNIT_VALUES),
    distance_value: optionalNonNegativeNumber(1000000),
    distance_unit: optionalEnum(DISTANCE_UNIT_VALUES),
    duration_sec: optionalNonNegativeInt(86400),
    target_pace_sec_per_km: z.union([z.number().int().positive().max(3600), z.null()]).optional(),
    hr_zone: z.union([z.number().int().min(1).max(5), z.null()]).optional(),
    instructions: z.string().max(2000, 'Máximo 2000 caracteres en instrucciones').nullable().optional(),
    exercise_type_override: optionalEnum(EXERCISE_TYPE_VALUES),
    interval_config: z.union([IntervalConfigSchema, z.null()]).optional(),
    extra_targets: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
}).superRefine((block, ctx) => {
    // Solo aplica cuando el bloque declara explícitamente cardio (override):
    // un bloque legacy (sin override) jamás entra acá — cero regresión (AC3).
    if (block.exercise_type_override === 'cardio') {
        if (!isCardioBlockComplete(block)) {
            ctx.addIssue({
                code: 'custom',
                message: 'Un bloque cardio necesita duración, distancia o intervalos',
                path: ['duration_sec'],
            })
        }
    }
})

export const ProgramPhaseSchema = z.object({
    name: z.string().min(1, 'El nombre de la fase es obligatorio').max(80, 'Máximo 80 caracteres en nombre de fase'),
    weeks: z.preprocess(preprocessIntInRange(1, 52, 1), z.number().int().min(1, 'Mínimo 1 semana por fase').max(52, 'Máximo 52 semanas por fase')),
    color: z.string().max(32).optional(),
})

export const WorkoutDaySchema = z.object({
    day_of_week: z.preprocess(preprocessDayOfWeek, z.number().int().min(1).max(28)),
    title: z.string().max(100, 'Máximo 100 caracteres en el título del día').optional(),
    week_variant: z.enum(['A', 'B']).optional().default('A'),
    blocks: z.array(WorkoutBlockSchema).min(1, 'Agrega al menos un ejercicio'),
})

export const WorkoutProgramSchema = z.object({
    programId: z.string().uuid().optional(),
    clientId: z.string().uuid().nullable().optional(),
    programName: z.string().min(2, 'El nombre del programa es requerido').max(100),
    weeksToRepeat: z.preprocess(preprocessIntInRange(1, 52, 4), z.number().int().min(1).max(52)),
    startDate: z.string().nullable().optional(),
    duration_type: z.enum(['weeks', 'async', 'calendar_days']).optional(),
    duration_days: z.preprocess(
        (v) => {
            if (v === null || v === undefined || v === '') return null
            const n = typeof v === 'number' ? v : Number(v)
            if (!Number.isFinite(n)) return null
            return Math.min(365, Math.max(1, Math.round(n)))
        },
        z.union([z.null(), z.number().int().min(1).max(365)]).optional()
    ),
    program_structure_type: z.enum(['weekly', 'cycle']).optional(),
    cycle_length: z.preprocess(
        (v) => {
            if (v === null || v === undefined || v === '') return undefined
            const n = typeof v === 'number' ? v : Number(v)
            if (!Number.isFinite(n)) return 7
            return Math.min(28, Math.max(1, Math.round(n)))
        },
        z.number().int().min(1).max(28).optional()
    ),
    start_date_flexible: z.boolean().optional(),
    program_notes: z.string().max(2000).nullable().optional(),
    ab_mode: z.boolean().optional(),
    program_phases: z.array(ProgramPhaseSchema).max(24).optional(),
    source_template_id: z.string().uuid().nullable().optional(),
    days: z.array(WorkoutDaySchema).min(1, 'Agrega al menos un día de entrenamiento'),
})

export const WorkoutLogSetSchema = z.object({
    block_id: z.string().uuid(),
    set_number: z.coerce.number().int().min(1),
    weight_kg: z.coerce.number().min(0).optional(),
    reps_done: z.coerce.number().int().min(0).optional(),
    rpe: z.coerce.number().min(1).max(10).optional(),
    rir: z.coerce.number().int().min(0).max(10).optional(),
    // ── Espejo polimórfico (M3) — opcionales, el log strength de hoy no cambia ──
    actual_duration_sec: z.coerce.number().int().min(0).max(86400).optional(),
    actual_distance_m: z.coerce.number().min(0).max(1000000).optional(),
    actual_pace_sec_per_km: z.coerce.number().int().positive().max(3600).optional(),
    actual_hold_sec: z.coerce.number().int().min(0).max(86400).optional(),
    actual_avg_hr: z.coerce.number().int().min(25).max(250).optional(),
})
export type WorkoutLogSetInput = z.infer<typeof WorkoutLogSetSchema>

// ─── Perfil cardio del cliente (M4, módulo `cardio`) ─────────────────────────

function preprocessNullableInt(val: unknown): number | null | undefined {
    if (val === undefined) return undefined
    if (val === null || val === '') return null
    const n = typeof val === 'number' ? val : Number(String(val).trim())
    if (!Number.isFinite(n)) return null
    return Math.round(n)
}

export const CardioProfileUpdateSchema = z.object({
    clientId: z.string().uuid(),
    birth_date: z
        .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)'), z.null()])
        .optional(),
    resting_hr: z.preprocess(
        preprocessNullableInt,
        z.union([z.number().int().min(25, 'FC reposo mínima 25').max(120, 'FC reposo máxima 120'), z.null()]).optional()
    ),
    max_hr_override: z.preprocess(
        preprocessNullableInt,
        z.union([z.number().int().min(120, 'FCmax mínima 120').max(230, 'FCmax máxima 230'), z.null()]).optional()
    ),
    ref_5k_time_sec: z.preprocess(
        preprocessNullableInt,
        z.union([z.number().int().min(600, 'Mínimo 10:00').max(7200, 'Máximo 2:00:00'), z.null()]).optional()
    ),
})
export type CardioProfileUpdateInput = z.infer<typeof CardioProfileUpdateSchema>

export type WorkoutBlockInput = z.infer<typeof WorkoutBlockSchema>
export type WorkoutDayInput = z.infer<typeof WorkoutDaySchema>
export type WorkoutProgramInput = z.infer<typeof WorkoutProgramSchema>

// ─── Areas custom del builder (workout_section_templates) ───────────────────

export const WorkoutAreaCreateSchema = z.object({
    name: z.string().trim().min(2, 'El nombre necesita al menos 2 caracteres').max(40, 'Máximo 40 caracteres'),
})

export const WorkoutAreaUpdateSchema = z.object({
    id: z.guid(),
    name: z.string().trim().min(2, 'El nombre necesita al menos 2 caracteres').max(40, 'Máximo 40 caracteres').optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
})

export const WorkoutAreaDeleteSchema = z.object({
    id: z.guid(),
})

export type WorkoutAreaCreateInput = z.infer<typeof WorkoutAreaCreateSchema>
export type WorkoutAreaUpdateInput = z.infer<typeof WorkoutAreaUpdateSchema>
export type WorkoutAreaDeleteInput = z.infer<typeof WorkoutAreaDeleteSchema>
