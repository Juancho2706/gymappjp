import { describe, it, expect } from 'vitest'
import {
    MOVEMENT_PATTERN_VALUES,
    MovementDeleteSchema,
    MovementDraftUpsertSchema,
    MovementFinalizeSchema,
    MovementItemInputSchema,
    hasClearingPattern,
    isPerSidePattern,
} from './screening'
import { MOVEMENT_PATTERNS_V1 } from '../calc/src/movement'

const UUID = '7f6f4a8e-1d2b-4c3d-9e8f-0a1b2c3d4e5f'

describe('contrato catalogo schemas <-> calc', () => {
    it('los 7 patrones y sus flags coinciden con MOVEMENT_PATTERNS_V1', () => {
        expect(MOVEMENT_PATTERN_VALUES).toEqual(MOVEMENT_PATTERNS_V1.map((p) => p.slug))
        for (const def of MOVEMENT_PATTERNS_V1) {
            expect(isPerSidePattern(def.slug)).toBe(def.isPerSide)
            expect(hasClearingPattern(def.slug)).toBe(def.hasClearing)
        }
    })
})

describe('MovementItemInputSchema', () => {
    it('acepta item por-lado valido con clearing', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'shoulder_mobility',
            score_left: 2,
            score_right: 3,
            pain: false,
            clearing_positive: false,
            comment: 'leve restriccion derecha',
        })
        expect(res.success).toBe(true)
    })

    it('acepta item de puntaje unico valido', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'deep_squat',
            score_single: 2,
            pain: false,
        })
        expect(res.success).toBe(true)
    })

    it('rechaza por-lado sin ambos lados', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'hurdle_step',
            score_left: 2,
            pain: false,
        })
        expect(res.success).toBe(false)
    })

    it('rechaza puntaje unico en patron por-lado', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'inline_lunge',
            score_left: 2,
            score_right: 2,
            score_single: 2,
            pain: false,
        })
        expect(res.success).toBe(false)
    })

    it('rechaza lados en patron de puntaje unico', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'deep_squat',
            score_single: 2,
            score_left: 2,
            pain: false,
        })
        expect(res.success).toBe(false)
    })

    it('rechaza clearing en patron sin prueba de descarte', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'hurdle_step',
            score_left: 2,
            score_right: 2,
            pain: false,
            clearing_positive: true,
        })
        expect(res.success).toBe(false)
    })

    it('rechaza puntaje fuera de rango o no entero', () => {
        for (const bad of [4, -1, 1.5]) {
            const res = MovementItemInputSchema.safeParse({
                pattern: 'deep_squat',
                score_single: bad,
                pain: false,
            })
            expect(res.success).toBe(false)
        }
    })

    it('rechaza patron desconocido', () => {
        const res = MovementItemInputSchema.safeParse({
            pattern: 'overhead_press',
            score_single: 2,
            pain: false,
        })
        expect(res.success).toBe(false)
    })
})

describe('MovementDraftUpsertSchema / MovementFinalizeSchema / MovementDeleteSchema', () => {
    it('upsert valido', () => {
        const res = MovementDraftUpsertSchema.safeParse({
            client_id: UUID,
            item: { pattern: 'deep_squat', score_single: 1, pain: true },
        })
        expect(res.success).toBe(true)
    })

    it('upsert rechaza client_id no uuid', () => {
        const res = MovementDraftUpsertSchema.safeParse({
            client_id: 'nope',
            item: { pattern: 'deep_squat', score_single: 1, pain: false },
        })
        expect(res.success).toBe(false)
    })

    it('finalize valido y default de consent_attested=false', () => {
        const res = MovementFinalizeSchema.safeParse({
            client_id: UUID,
            assessment_id: UUID,
            notes: 'priorizar movilidad de cadera',
        })
        expect(res.success).toBe(true)
        if (res.success) expect(res.data.consent_attested).toBe(false)
    })

    it('finalize rechaza notes > 2000', () => {
        const res = MovementFinalizeSchema.safeParse({
            client_id: UUID,
            assessment_id: UUID,
            notes: 'x'.repeat(2001),
        })
        expect(res.success).toBe(false)
    })

    it('delete exige ambos uuid', () => {
        expect(MovementDeleteSchema.safeParse({ client_id: UUID, assessment_id: UUID }).success).toBe(true)
        expect(MovementDeleteSchema.safeParse({ client_id: UUID }).success).toBe(false)
    })
})
