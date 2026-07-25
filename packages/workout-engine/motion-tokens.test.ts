import { describe, expect, it } from 'vitest'

import {
    MOTION_DURATION_MS,
    SPRING_EFFECT,
    SPRING_SPATIAL,
    resolveSpring,
    springDampingRatio,
    springHasBounce,
    type ReducedMotionContext,
} from './motion-tokens'

describe('MOTION_DURATION_MS', () => {
    it('mantiene la escala instant/fast/base/slow del ejecutor v3', () => {
        expect(MOTION_DURATION_MS).toEqual({ instant: 100, fast: 200, base: 300, slow: 450 })
    })

    it('es monotonicamente creciente', () => {
        const { instant, fast, base, slow } = MOTION_DURATION_MS
        expect(instant).toBeLessThan(fast)
        expect(fast).toBeLessThan(base)
        expect(base).toBeLessThan(slow)
    })
})

describe('springs spatial vs effect', () => {
    it('spatial es sub-amortiguado (rebota): damping ratio < 1', () => {
        expect(springDampingRatio(SPRING_SPATIAL)).toBeLessThan(1)
        expect(springHasBounce(SPRING_SPATIAL)).toBe(true)
    })

    it('effect no rebota: damping ratio >= 1', () => {
        expect(springDampingRatio(SPRING_EFFECT)).toBeGreaterThanOrEqual(1)
        expect(springHasBounce(SPRING_EFFECT)).toBe(false)
    })

    it('springDampingRatio calcula c / (2·√(k·m)) (critico = 1)', () => {
        // k=100, m=1 → critico c = 2·√100 = 20.
        expect(springDampingRatio({ damping: 20, stiffness: 100, mass: 1 })).toBe(1)
        expect(springDampingRatio({ damping: 10, stiffness: 100, mass: 1 })).toBe(0.5)
        expect(springDampingRatio({ damping: 40, stiffness: 100, mass: 1 })).toBe(2)
    })
})

describe('resolveSpring (contrato reduced-motion)', () => {
    const on: ReducedMotionContext = { reducedMotion: true }
    const off: ReducedMotionContext = { reducedMotion: false }

    it('sin reduced-motion devuelve el spring tal cual', () => {
        expect(resolveSpring(SPRING_SPATIAL, off)).toEqual({ kind: 'spring', spring: SPRING_SPATIAL })
    })

    it('con reduced-motion degrada a un fade fast por default', () => {
        expect(resolveSpring(SPRING_SPATIAL, on)).toEqual({ kind: 'fade', durationMs: MOTION_DURATION_MS.fast })
    })

    it('con reduced-motion respeta el fadeToken elegido', () => {
        expect(resolveSpring(SPRING_EFFECT, on, 'instant')).toEqual({
            kind: 'fade',
            durationMs: MOTION_DURATION_MS.instant,
        })
        expect(resolveSpring(SPRING_EFFECT, on, 'slow')).toEqual({
            kind: 'fade',
            durationMs: MOTION_DURATION_MS.slow,
        })
    })
})
