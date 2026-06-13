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
    WorkoutLogSetSchema,
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
