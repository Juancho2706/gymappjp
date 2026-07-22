import { describe, it, expect } from 'vitest'
import { buildWheelRange, nearestWheelIndex, WHEEL_KG_SPEC, WHEEL_REPS_SPEC } from './wheel-range'

describe('buildWheelRange — kg (paso 2,5 · radio ±20)', () => {
    it('centra en el anterior y extiende ±20 en pasos de 2,5', () => {
        const range = buildWheelRange({ center: 60, ...WHEEL_KG_SPEC })
        expect(range[0]).toBe(40)
        expect(range[range.length - 1]).toBe(80)
        expect(range).toContain(60)
        // 17 valores: 8 abajo + centro + 8 arriba.
        expect(range).toHaveLength(17)
    })

    it('clampa a min 0: nunca genera pesos negativos', () => {
        const range = buildWheelRange({ center: 5, ...WHEEL_KG_SPEC })
        expect(range[0]).toBe(0)
        expect(range.every((v) => v >= 0)).toBe(true)
    })

    it('snapea el centro a la grilla de 2,5', () => {
        const range = buildWheelRange({ center: 61, ...WHEEL_KG_SPEC })
        // 61 → snap a 60; el centro del rango es 60.
        expect(range).toContain(60)
        expect(range).not.toContain(61)
    })

    it('sin anterior usa el fallback (20 kg)', () => {
        const range = buildWheelRange({ center: null, ...WHEEL_KG_SPEC })
        expect(range).toContain(20)
        expect(range[0]).toBe(0)
    })

    it('no arrastra error de punto flotante en pasos de 2,5', () => {
        const range = buildWheelRange({ center: 12.5, ...WHEEL_KG_SPEC })
        expect(range).toContain(12.5)
        expect(range).toContain(2.5)
        expect(range.some((v) => v.toString().length > 6)).toBe(false)
    })
})

describe('buildWheelRange — reps (paso 1 · radio ±10)', () => {
    it('centra en el anterior con paso 1', () => {
        const range = buildWheelRange({ center: 10, ...WHEEL_REPS_SPEC })
        expect(range[0]).toBe(0)
        expect(range[range.length - 1]).toBe(20)
        expect(range).toHaveLength(21)
    })

    it('clampa reps a 0', () => {
        const range = buildWheelRange({ center: 3, ...WHEEL_REPS_SPEC })
        expect(range[0]).toBe(0)
    })
})

describe('buildWheelRange — parámetros inválidos', () => {
    it('paso ≤ 0 ⇒ []', () => {
        expect(buildWheelRange({ center: 10, step: 0, radius: 10 })).toEqual([])
    })
    it('radio < 0 ⇒ []', () => {
        expect(buildWheelRange({ center: 10, step: 1, radius: -1 })).toEqual([])
    })
    it('center NaN cae al fallback', () => {
        const range = buildWheelRange({ center: Number.NaN, step: 1, radius: 2, min: 0, fallback: 5 })
        expect(range).toEqual([3, 4, 5, 6, 7])
    })
})

describe('nearestWheelIndex', () => {
    const range = buildWheelRange({ center: 60, ...WHEEL_KG_SPEC })
    it('encuentra el índice exacto del anterior', () => {
        expect(range[nearestWheelIndex(range, 60)]).toBe(60)
    })
    it('cae al valor más cercano de la grilla', () => {
        expect(range[nearestWheelIndex(range, 61)]).toBe(60)
        expect(range[nearestWheelIndex(range, 63.7)]).toBe(62.5)
        expect(range[nearestWheelIndex(range, 64.5)]).toBe(65)
    })
    it('sin valor cae al centro del rango', () => {
        expect(nearestWheelIndex(range, null)).toBe(Math.floor(range.length / 2))
    })
    it('rango vacío ⇒ 0', () => {
        expect(nearestWheelIndex([], 5)).toBe(0)
    })
})
