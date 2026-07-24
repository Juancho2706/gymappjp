import { describe, it, expect } from 'vitest'
import { buildWheelRange, nearestWheelIndex, WHEEL_KG_SPEC, WHEEL_REPS_SPEC } from './wheel-range'

describe('buildWheelRange — kg (0 a 400, paso 2,5)', () => {
    const range = buildWheelRange(WHEEL_KG_SPEC)

    it('cubre el rango completo 0..400 en pasos de 2,5 (161 topes)', () => {
        expect(range[0]).toBe(0)
        expect(range[range.length - 1]).toBe(400)
        expect(range).toHaveLength(161)
    })

    it('nunca genera pesos negativos y sube en pasos de 2,5', () => {
        expect(range.every((v) => v >= 0)).toBe(true)
        expect(range).toContain(2.5)
        expect(range).toContain(57.5)
        expect(range).toContain(60)
    })

    it('no arrastra error de punto flotante en pasos de 2,5', () => {
        expect(range.some((v) => v.toString().length > 6)).toBe(false)
    })
})

describe('buildWheelRange — reps (0 a 100, paso 1)', () => {
    const range = buildWheelRange(WHEEL_REPS_SPEC)

    it('cubre el rango completo 0..100 en pasos de 1 (101 topes)', () => {
        expect(range[0]).toBe(0)
        expect(range[range.length - 1]).toBe(100)
        expect(range).toHaveLength(101)
    })

    it('clampa reps a 0', () => {
        expect(range.every((v) => v >= 0)).toBe(true)
    })
})

describe('buildWheelRange — parámetros inválidos', () => {
    it('paso ≤ 0 ⇒ []', () => {
        expect(buildWheelRange({ step: 0, min: 0, max: 100 })).toEqual([])
    })
    it('max < min ⇒ []', () => {
        expect(buildWheelRange({ step: 1, min: 10, max: 5 })).toEqual([])
    })
    it('rango mínimo (min = max) ⇒ un solo valor', () => {
        expect(buildWheelRange({ step: 1, min: 5, max: 5 })).toEqual([5])
    })
})

describe('nearestWheelIndex — abre CENTRADA en el anterior sobre el rango completo', () => {
    const range = buildWheelRange(WHEEL_KG_SPEC)
    it('encuentra el índice exacto del anterior', () => {
        expect(range[nearestWheelIndex(range, 60)]).toBe(60)
        expect(range[nearestWheelIndex(range, 400)]).toBe(400)
        expect(range[nearestWheelIndex(range, 0)]).toBe(0)
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
