import { describe, it, expect } from 'vitest'
import {
    MOVEMENT_PATTERNS_V1,
    MOVEMENT_PATTERN_SLUGS,
    compositeScore,
    finalItemScore,
    hasAsymmetry,
    hasPain,
    priorityBand,
    summarizeAssessment,
    type MovementItemInput,
    type MovementPatternSlug,
} from './movement'

/**
 * Golden tests del plan 03 §A (specs/movida-screening AC2) + bordes.
 * Protocolo v1: 7 patrones, compuesto /21, banda de prioridad de trabajo correctivo.
 */

type Overrides = Partial<Record<MovementPatternSlug, Partial<MovementItemInput>>>

/** Set completo de 7 items con puntaje uniforme, con overrides por patron. */
function buildItems(score: number, overrides: Overrides = {}): MovementItemInput[] {
    return MOVEMENT_PATTERNS_V1.map((def) => ({
        pattern: def.slug,
        isPerSide: def.isPerSide,
        scoreLeft: def.isPerSide ? score : null,
        scoreRight: def.isPerSide ? score : null,
        scoreSingle: def.isPerSide ? null : score,
        pain: false,
        clearingPositive: def.hasClearing ? false : null,
        ...overrides[def.slug],
    }))
}

describe('catalogo v1', () => {
    it('tiene los 7 patrones, 5 por-lado y clearing en hombro/tronco/rotatoria', () => {
        expect(MOVEMENT_PATTERNS_V1.map((p) => p.slug)).toEqual([...MOVEMENT_PATTERN_SLUGS])
        expect(MOVEMENT_PATTERNS_V1.filter((p) => p.isPerSide).map((p) => p.slug)).toEqual([
            'hurdle_step',
            'inline_lunge',
            'shoulder_mobility',
            'active_straight_leg_raise',
            'rotary_stability',
        ])
        expect(MOVEMENT_PATTERNS_V1.filter((p) => p.hasClearing).map((p) => p.slug)).toEqual([
            'shoulder_mobility',
            'trunk_stability_pushup',
            'rotary_stability',
        ])
    })
})

describe('golden tests AC2 (plan 03 §A)', () => {
    it('G1 — todo 3 => compuesto 21, banda low, sin banderas', () => {
        const summary = summarizeAssessment(buildItems(3))
        expect(summary).toEqual({ composite: 21, hasPain: false, hasAsymmetry: false, band: 'low' })
    })

    it('G2 — dolor en un patron => item forzado a 0 y banda high', () => {
        const items = buildItems(3, { deep_squat: { pain: true } })
        const item = items.find((i) => i.pattern === 'deep_squat')!
        expect(finalItemScore(item)).toBe(0)
        const summary = summarizeAssessment(items)
        expect(summary.composite).toBe(18) // 21 - 3 del patron con dolor
        expect(summary.hasPain).toBe(true)
        expect(summary.band).toBe('high')
    })

    it('G3 — clearing de hombro positivo => item de hombro forzado a 0', () => {
        const items = buildItems(3, { shoulder_mobility: { clearingPositive: true } })
        const item = items.find((i) => i.pattern === 'shoulder_mobility')!
        expect(finalItemScore(item)).toBe(0)
        // Clearing positivo = prueba de provocacion de dolor positiva => cuenta como dolor.
        const summary = summarizeAssessment(items)
        expect(summary.composite).toBe(18)
        expect(summary.hasPain).toBe(true)
        expect(summary.band).toBe('high')
    })

    it('G4 — L3/R1 => final 1 y asimetria detectada', () => {
        const items = buildItems(3, { hurdle_step: { scoreLeft: 3, scoreRight: 1 } })
        const item = items.find((i) => i.pattern === 'hurdle_step')!
        expect(finalItemScore(item)).toBe(1)
        expect(hasAsymmetry(items)).toBe(true)
        // composite 19 (>= 17) pero asimetria => moderate
        expect(summarizeAssessment(items).band).toBe('moderate')
    })

    it('G5 — compuesto 14 => banda high', () => {
        // 7 items de 2 = 14, simetricos y sin dolor.
        const summary = summarizeAssessment(buildItems(2))
        expect(summary.composite).toBe(14)
        expect(summary.band).toBe('high')
    })

    it('G6 — compuesto 16 => banda moderate', () => {
        // base 14 (todo 2) + deep_squat 3 + trunk 3 => 16 sin asimetria.
        const items = buildItems(2, {
            deep_squat: { scoreSingle: 3 },
            trunk_stability_pushup: { scoreSingle: 3 },
        })
        const summary = summarizeAssessment(items)
        expect(summary.composite).toBe(16)
        expect(summary.hasAsymmetry).toBe(false)
        expect(summary.band).toBe('moderate')
    })

    it('G7 — compuesto 17 sin asimetria ni dolor => banda low', () => {
        // todo 2 + deep_squat 3 + trunk 3 + ASLR 3/3 => 17 simetrico.
        const items = buildItems(2, {
            deep_squat: { scoreSingle: 3 },
            trunk_stability_pushup: { scoreSingle: 3 },
            active_straight_leg_raise: { scoreLeft: 3, scoreRight: 3 },
        })
        const summary = summarizeAssessment(items)
        expect(summary.composite).toBe(17)
        expect(summary.band).toBe('low')
    })

    it('G8 — compuesto 16 con asimetria => banda moderate (no escala a high)', () => {
        // inline_lunge L2/R1 => final 1; resto ajustado para compuesto 16.
        const items = buildItems(2, {
            inline_lunge: { scoreLeft: 2, scoreRight: 1 },
            deep_squat: { scoreSingle: 3 },
            trunk_stability_pushup: { scoreSingle: 3 },
            hurdle_step: { scoreLeft: 3, scoreRight: 3 },
        })
        const summary = summarizeAssessment(items)
        expect(summary.composite).toBe(16)
        expect(summary.hasAsymmetry).toBe(true)
        expect(summary.band).toBe('moderate')
    })
})

describe('bordes', () => {
    it('falta un patron => compositeScore lanza', () => {
        const items = buildItems(3).slice(0, 6)
        expect(() => compositeScore(items)).toThrow(/Protocolo incompleto/)
    })

    it('patron duplicado => lanza', () => {
        const items = [...buildItems(3), buildItems(3)[0]]
        expect(() => compositeScore(items)).toThrow(/sin duplicados/)
    })

    it('item por-lado sin un lado => lanza', () => {
        const items = buildItems(3, { rotary_stability: { scoreRight: null } })
        expect(() => compositeScore(items)).toThrow(/requiere puntaje izquierdo y derecho/)
    })

    it('puntaje fuera de rango => lanza', () => {
        expect(() =>
            finalItemScore({ pattern: 'deep_squat', isPerSide: false, scoreSingle: 4, pain: false })
        ).toThrow(/Puntaje invalido/)
        expect(() =>
            finalItemScore({ pattern: 'deep_squat', isPerSide: false, scoreSingle: 1.5, pain: false })
        ).toThrow(/Puntaje invalido/)
    })

    it('los 3 clearings positivos => los 3 items en 0 y compuesto 12', () => {
        const items = buildItems(3, {
            shoulder_mobility: { clearingPositive: true },
            trunk_stability_pushup: { clearingPositive: true },
            rotary_stability: { clearingPositive: true },
        })
        expect(compositeScore(items)).toBe(12)
        expect(hasPain(items)).toBe(true)
    })

    it('clearing negativo NO fuerza 0', () => {
        const item: MovementItemInput = {
            pattern: 'trunk_stability_pushup',
            isPerSide: false,
            scoreSingle: 2,
            pain: false,
            clearingPositive: false,
        }
        expect(finalItemScore(item)).toBe(2)
    })

    it('L=R no genera asimetria; dolor tampoco', () => {
        expect(hasAsymmetry(buildItems(2))).toBe(false)
        const withPain = buildItems(2, { hurdle_step: { pain: true } })
        expect(hasAsymmetry(withPain)).toBe(false)
    })

    it('asimetria se evalua sobre crudos aunque el item este forzado a 0 por dolor', () => {
        const items = buildItems(2, { hurdle_step: { scoreLeft: 3, scoreRight: 1, pain: true } })
        const item = items.find((i) => i.pattern === 'hurdle_step')!
        expect(finalItemScore(item)).toBe(0)
        expect(hasAsymmetry(items)).toBe(true)
    })

    it('priorityBand: matriz de cortes', () => {
        expect(priorityBand(14, false, false)).toBe('high')
        expect(priorityBand(15, false, false)).toBe('moderate')
        expect(priorityBand(16, false, false)).toBe('moderate')
        expect(priorityBand(17, false, false)).toBe('low')
        expect(priorityBand(21, false, false)).toBe('low')
        expect(priorityBand(21, true, false)).toBe('high')
        expect(priorityBand(21, false, true)).toBe('moderate')
        expect(priorityBand(15, false, true)).toBe('moderate')
        expect(priorityBand(14, false, true)).toBe('high')
    })
})
