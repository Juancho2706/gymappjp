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

export const WorkoutBlockSchema = z.object({
    exercise_id: z.string().uuid(),
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
    section: z.enum(['warmup', 'main', 'cooldown']).optional(),
    // z.guid(), NO z.uuid(): los UUIDs seed de las areas system (0000a5ec-*, version/variante 0)
    // no cumplen RFC 9562 y el .uuid() estricto de Zod 4 los rechaza (rompe el save de todo plan).
    section_template_id: z.guid().nullable().optional(),
    is_override: z.boolean().optional(),
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
})
export type WorkoutLogSetInput = z.infer<typeof WorkoutLogSetSchema>

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
