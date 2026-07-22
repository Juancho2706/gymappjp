/**
 * Contrato Zod del builder por areas (specs/movida-areas): el payload de save lleva
 * section_template_id y los UUIDs seed de las areas system (0000a5ec-*, version/variante 0)
 * NO cumplen RFC 9562 — el .uuid() estricto de Zod 4 los rechazaria y romperia el save de
 * TODOS los planes existentes (backfill 4004/4004). Este test fija el round-trip.
 */
import { describe, it, expect } from 'vitest'
import {
    CardioProfileUpdateSchema,
    IntervalConfigSchema,
    WorkoutBlockSchema,
    WorkoutDaySchema,
    WorkoutLogSetSchema,
    WorkoutProgramSchema,
    isCardioBlockComplete,
} from './workout'

const baseBlock = {
    exercise_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', // v4 real
    sets: 3,
    reps: '8-12',
    section: 'main' as const,
}

const SYSTEM_SEED_IDS = [
    '0000a5ec-0000-0000-0000-000000000001', // warmup
    '0000a5ec-0000-0000-0000-000000000010', // main
    '0000a5ec-0000-0000-0000-000000000020', // cooldown
    '0000a5ec-0000-0000-0000-000000000005', // mobility
    '0000a5ec-0000-0000-0000-000000000030', // conditioning
]

const programDay = (day: number, variant: 'A' | 'B' = 'A') => ({
    day_of_week: day,
    week_variant: variant,
    blocks: [baseBlock],
})

const programPayload = (overrides: Record<string, unknown> = {}) => ({
    programName: 'Programa de prueba',
    weeksToRepeat: 4,
    days: [programDay(1)],
    ...overrides,
})

describe('WorkoutProgramSchema — límites de estructura', () => {
    it('acepta un ciclo de 14 días, incluido día 14', () => {
        const result = WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            cycle_length: 14,
            days: [programDay(1), programDay(14)],
        }))

        expect(result.success).toBe(true)
    })

    it('rechaza day_of_week y cycle_length sobre 14', () => {
        const invalidDay = WorkoutDaySchema.safeParse(programDay(15))
        const invalidCycle = WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            cycle_length: 15,
        }))

        expect(invalidDay.success).toBe(false)
        expect(invalidCycle.success).toBe(false)
        if (!invalidDay.success) {
            expect(invalidDay.error.issues[0]?.message).toBe('El día del programa no puede superar 14')
        }
        if (!invalidCycle.success) {
            expect(invalidCycle.error.issues[0]?.message).toBe('La longitud del ciclo no puede superar 14 días')
        }
    })

    it('trata estructura omitida como weekly y rechaza días 8-14', () => {
        const result = WorkoutProgramSchema.safeParse(programPayload({ days: [programDay(8)] }))

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.issues).toContainEqual(expect.objectContaining({
                path: ['days', 0, 'day_of_week'],
                message: 'Los programas semanales solo permiten días del 1 al 7',
            }))
        }
    })

    it('rechaza un día mayor que cycle_length', () => {
        const result = WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            cycle_length: 4,
            days: [programDay(5)],
        }))

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.issues).toContainEqual(expect.objectContaining({
                path: ['days', 0, 'day_of_week'],
                message: 'El día 5 supera la longitud del ciclo (4 días)',
            }))
        }
    })

    it('preserva variantes A/B del mismo día en weekly y cycle', () => {
        const weekly = WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'weekly',
            ab_mode: true,
            days: [programDay(7, 'A'), programDay(7, 'B')],
        }))
        const cycle = WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            cycle_length: 10,
            ab_mode: true,
            days: [programDay(10, 'A'), programDay(10, 'B')],
        }))

        expect(weekly.success).toBe(true)
        expect(cycle.success).toBe(true)
    })

    it('mantiene el fallback legacy de 7 días para ciclos sin cycle_length', () => {
        expect(WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            days: [programDay(7)],
        })).success).toBe(true)
        expect(WorkoutProgramSchema.safeParse(programPayload({
            program_structure_type: 'cycle',
            days: [programDay(8)],
        })).success).toBe(false)
    })
})

describe('WorkoutBlockSchema.section_template_id', () => {
    it.each(SYSTEM_SEED_IDS)('acepta el UUID seed system %s', id => {
        const result = WorkoutBlockSchema.safeParse({ ...baseBlock, section_template_id: id })
        expect(result.success).toBe(true)
    })

    it('acepta un uuid v4 normal (area custom gen_random_uuid)', () => {
        const result = WorkoutBlockSchema.safeParse({
            ...baseBlock,
            section_template_id: '9b2cdb30-7c4e-4c92-9d6a-1f1b54a9c3d2',
        })
        expect(result.success).toBe(true)
    })

    it('acepta null y omitido (bloques legacy)', () => {
        expect(WorkoutBlockSchema.safeParse({ ...baseBlock, section_template_id: null }).success).toBe(true)
        expect(WorkoutBlockSchema.safeParse(baseBlock).success).toBe(true)
    })

    it('rechaza strings que no son GUID', () => {
        const result = WorkoutBlockSchema.safeParse({ ...baseBlock, section_template_id: 'not-a-uuid' })
        expect(result.success).toBe(false)
    })
})

describe('WorkoutBlockSchema.exercise_id', () => {
    // Ejercicios seed de cardio/mobility/roller usan UUIDs deterministas
    // (00000000-0000-0000-0ca0-*, version/variante 0) que NO cumplen RFC 9562.
    // Con .uuid() estricto el save de cualquier plan con un bloque de esos tipos
    // tiraba "Invalid UUID". Este test fija que .guid() los acepta.
    it.each([
        '00000000-0000-0000-0ca0-000000000001', // cardio
        '00000000-0000-0000-0f80-000000000001', // mobility/roller
    ])('acepta el UUID seed no-RFC %s', id => {
        const result = WorkoutBlockSchema.safeParse({ ...baseBlock, exercise_id: id })
        expect(result.success).toBe(true)
    })

    it('rechaza un exercise_id que no es GUID', () => {
        const result = WorkoutBlockSchema.safeParse({ ...baseBlock, exercise_id: 'not-a-uuid' })
        expect(result.success).toBe(false)
    })
})

// ─── Polimórfico (specs/movida-entrenamiento, F2) ────────────────────────────
// Baseline anti-regresión (AC3): el payload clásico de hoy valida idéntico y
// NO gana campos nuevos; los campos polimórficos hacen round-trip.

describe('WorkoutBlockSchema — coexistencia legacy (AC3)', () => {
    it('un bloque legacy puro pasa sin cambios y sin campos nuevos inyectados', () => {
        const result = WorkoutBlockSchema.safeParse(baseBlock)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.reps).toBe('8-12')
            expect(result.data.sets).toBe(3)
            expect(result.data).not.toHaveProperty('duration_sec', expect.anything())
            expect(result.data.duration_sec).toBeUndefined()
            expect(result.data.hr_zone).toBeUndefined()
            expect(result.data.interval_config).toBeUndefined()
            expect(result.data.exercise_type_override).toBeUndefined()
        }
    })

    it('reps no numéricos (AMRAP, al fallo) siguen pasando', () => {
        expect(WorkoutBlockSchema.safeParse({ ...baseBlock, reps: 'AMRAP' }).success).toBe(true)
        expect(WorkoutBlockSchema.safeParse({ ...baseBlock, reps: 'al fallo' }).success).toBe(true)
    })

    it('campos nuevos en null (filas DB legacy) pasan', () => {
        const result = WorkoutBlockSchema.safeParse({
            ...baseBlock,
            duration_sec: null,
            distance_value: null,
            distance_unit: null,
            hr_zone: null,
            side_mode: null,
            load_type: null,
            load_unit: null,
            interval_config: null,
            exercise_type_override: null,
        })
        expect(result.success).toBe(true)
    })
})

describe('WorkoutBlockSchema — prescripción polimórfica', () => {
    it('AC1: bloque cardio con duración, distancia, zona e intervalos hace round-trip', () => {
        const cardio = {
            ...baseBlock,
            reps: '8×400m @ Z4',
            exercise_type_override: 'cardio' as const,
            duration_sec: 1200,
            distance_value: 400,
            distance_unit: 'm' as const,
            hr_zone: 4,
            target_pace_sec_per_km: 300,
            interval_config: {
                repeats: 8,
                work: { distance_m: 400, target: { kind: 'hr_zone' as const, hr_zone: 4 as const } },
                recovery: { duration_sec: 90, mode: 'rest' as const },
            },
        }
        const result = WorkoutBlockSchema.safeParse(cardio)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.hr_zone).toBe(4)
            expect(result.data.duration_sec).toBe(1200)
            expect(result.data.distance_value).toBe(400)
            expect(result.data.interval_config?.repeats).toBe(8)
            expect(result.data.interval_config?.recovery?.duration_sec).toBe(90)
        }
    })

    it('AC2: farmer carry tri-eje (carga lb + distancia + por lado) coexiste', () => {
        const result = WorkoutBlockSchema.safeParse({
            ...baseBlock,
            load_type: 'weight',
            load_value: 50,
            load_unit: 'lb',
            distance_value: 7.5,
            distance_unit: 'm',
            side_mode: 'per_side',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.load_unit).toBe('lb')
            expect(result.data.distance_value).toBe(7.5)
            expect(result.data.side_mode).toBe('per_side')
        }
    })

    it('cardio explícito sin duración/distancia/intervalos es rechazado', () => {
        const result = WorkoutBlockSchema.safeParse({
            ...baseBlock,
            exercise_type_override: 'cardio',
        })
        expect(result.success).toBe(false)
    })

    it('hr_zone fuera de 1-5 y side_mode inválido se rechazan', () => {
        expect(WorkoutBlockSchema.safeParse({ ...baseBlock, hr_zone: 6 }).success).toBe(false)
        expect(WorkoutBlockSchema.safeParse({ ...baseBlock, side_mode: 'left' }).success).toBe(false)
    })
})

describe('isCardioBlockComplete (fuente de verdad compartida)', () => {
    it('es true con duración, distancia o intervalos', () => {
        expect(isCardioBlockComplete({ duration_sec: 1200 })).toBe(true)
        expect(isCardioBlockComplete({ distance_value: 5000 })).toBe(true)
        expect(isCardioBlockComplete({ interval_config: { repeats: 4 } })).toBe(true)
    })

    it('es false sin ninguna prescripción de carga aeróbica', () => {
        expect(isCardioBlockComplete({})).toBe(false)
        expect(isCardioBlockComplete({ duration_sec: 0, distance_value: 0, interval_config: null })).toBe(false)
        expect(isCardioBlockComplete({ duration_sec: null, distance_value: null })).toBe(false)
    })

    it('coincide con el veredicto del superRefine para cardio explícito', () => {
        // Mismo bloque incompleto: el schema lo rechaza y el helper lo marca incompleto.
        const incomplete = { ...baseBlock, exercise_type_override: 'cardio' as const }
        expect(WorkoutBlockSchema.safeParse(incomplete).success).toBe(false)
        expect(isCardioBlockComplete(incomplete)).toBe(false)
    })
})

describe('IntervalConfigSchema', () => {
    it('acepta el shape del PLAN (8×400m @ Z4 r90s)', () => {
        const result = IntervalConfigSchema.safeParse({
            warmup_sec: 300,
            repeats: 8,
            work: { distance_m: 400, target: { kind: 'hr_zone', hr_zone: 4 } },
            recovery: { duration_sec: 90, mode: 'rest' },
            cooldown_sec: 300,
        })
        expect(result.success).toBe(true)
    })

    it('rechaza repeats 0 o ausente', () => {
        expect(IntervalConfigSchema.safeParse({ repeats: 0, work: { duration_sec: 60 } }).success).toBe(false)
        expect(IntervalConfigSchema.safeParse({ work: { duration_sec: 60 } }).success).toBe(false)
    })
})

describe('WorkoutLogSetSchema — espejo polimórfico (AC4)', () => {
    const baseLog = { block_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', set_number: 1 }

    it('log strength de hoy (weight/reps/rpe/rir) pasa idéntico', () => {
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, weight_kg: '60', reps_done: '10', rpe: '8' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.weight_kg).toBe(60)
            expect(result.data.actual_duration_sec).toBeUndefined()
        }
    })

    it('log cardio con duración/distancia/FC promedio pasa con coerción', () => {
        const result = WorkoutLogSetSchema.safeParse({
            ...baseLog,
            actual_duration_sec: '1500',
            actual_distance_m: '5000',
            actual_avg_hr: '152',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.actual_duration_sec).toBe(1500)
            expect(result.data.actual_distance_m).toBe(5000)
            expect(result.data.actual_avg_hr).toBe(152)
        }
    })

    it('rechaza FC promedio absurda', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, actual_avg_hr: 300 }).success).toBe(false)
    })

    // Escalas executor-v3 (corrección CEO 2026-07-22): RPE 1-10; RIR 0-10 (0 = al fallo).
    it('acepta los bordes válidos: RPE 1 y 10, RIR 0 y 10', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rpe: '1', rir: '0' }).success).toBe(true)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rpe: '10', rir: '10' }).success).toBe(true)
    })

    it('rechaza RPE 0 pero acepta RIR 0 (coaccionado a número, no descartado como falsy)', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rpe: '0' }).success).toBe(false)
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, rir: '0' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.rir).toBe(0)
        }
    })

    it('rechaza RPE/RIR fuera de rango (RPE 0 y 11, RIR -1 y 11)', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rpe: '0' }).success).toBe(false)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rir: '-1' }).success).toBe(false)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rpe: '11' }).success).toBe(false)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, rir: '11' }).success).toBe(false)
    })

    it('acepta RPE/RIR ausentes (undefined es válido — el esfuerzo es opcional)', () => {
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, weight_kg: '60', reps_done: '10' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.rpe).toBeUndefined()
            expect(result.data.rir).toBeUndefined()
        }
    })

    // Sustitución de máquina ocupada (Fase L · workstream C) — 3 campos opcionales/aditivos.
    it('log legacy SIN campos de sustitución sigue siendo válido', () => {
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, weight_kg: '60', reps_done: '10' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.substituted_exercise_id).toBeUndefined()
            expect(result.data.substituted_exercise_name).toBeUndefined()
            expect(result.data.substitution_reason).toBeUndefined()
        }
    })

    it('acepta los 3 campos de sustitución cuando el bloque está sustituido', () => {
        const result = WorkoutLogSetSchema.safeParse({
            ...baseLog,
            weight_kg: '40',
            reps_done: '12',
            substituted_exercise_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
            substituted_exercise_name: 'Press con mancuernas',
            substitution_reason: 'machine_busy',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.substituted_exercise_id).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
            expect(result.data.substituted_exercise_name).toBe('Press con mancuernas')
            expect(result.data.substitution_reason).toBe('machine_busy')
        }
    })

    it('rechaza un substituted_exercise_id que no es uuid', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, substituted_exercise_id: 'no-es-uuid' }).success).toBe(false)
    })

    // ── Hold POR LADO (E0.5) — metadata jsonb {left_sec, right_sec} ──
    it('log SIN metadata pasa idéntico y no gana la key', () => {
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, weight_kg: '60', reps_done: '10' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.metadata).toBeUndefined()
        }
    })

    it('acepta metadata {left_sec, right_sec} con coerción de strings', () => {
        const result = WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: { left_sec: '30', right_sec: '25' } })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.metadata).toEqual({ left_sec: 30, right_sec: 25 })
        }
    })

    it('acepta metadata parcial (un solo lado), null y objeto vacío', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: { left_sec: 40 } }).success).toBe(true)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: { left_sec: null, right_sec: null } }).success).toBe(true)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: null }).success).toBe(true)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: {} }).success).toBe(true)
    })

    it('rechaza segundos por lado fuera de rango (negativo o > 86400)', () => {
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: { left_sec: -1 } }).success).toBe(false)
        expect(WorkoutLogSetSchema.safeParse({ ...baseLog, metadata: { right_sec: 86401 } }).success).toBe(false)
    })
})

describe('CardioProfileUpdateSchema (AC9)', () => {
    const clientId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

    it('acepta perfil completo y normaliza strings de form', () => {
        const result = CardioProfileUpdateSchema.safeParse({
            clientId,
            birth_date: '1996-04-12',
            resting_hr: '60',
            max_hr_override: '',
            ref_5k_time_sec: '1500',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.resting_hr).toBe(60)
            expect(result.data.max_hr_override).toBeNull()
            expect(result.data.ref_5k_time_sec).toBe(1500)
        }
    })

    it('rechaza resting_hr fuera de rango y fecha mal formada', () => {
        expect(CardioProfileUpdateSchema.safeParse({ clientId, resting_hr: 20 }).success).toBe(false)
        expect(CardioProfileUpdateSchema.safeParse({ clientId, birth_date: '12-04-1996' }).success).toBe(false)
    })
})
