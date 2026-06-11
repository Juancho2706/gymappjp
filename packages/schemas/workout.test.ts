/**
 * Contrato Zod del builder por areas (specs/movida-areas): el payload de save lleva
 * section_template_id y los UUIDs seed de las areas system (0000a5ec-*, version/variante 0)
 * NO cumplen RFC 9562 — el .uuid() estricto de Zod 4 los rechazaria y romperia el save de
 * TODOS los planes existentes (backfill 4004/4004). Este test fija el round-trip.
 */
import { describe, it, expect } from 'vitest'
import { WorkoutBlockSchema } from './workout'

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
