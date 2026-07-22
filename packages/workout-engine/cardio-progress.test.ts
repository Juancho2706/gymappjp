import { describe, expect, it } from 'vitest'

import { computeCardioProgress } from './cardio-progress'

describe('computeCardioProgress — objetivo por tiempo', () => {
    it('mitad del tiempo = 50%, restante y no done', () => {
        expect(computeCardioProgress({ duration_sec: 1200 }, { elapsed_sec: 600 })).toEqual({
            kind: 'time',
            pct: 0.5,
            remaining: 600,
            done: false,
        })
    })

    it('sin avance = 0% y restante completo', () => {
        expect(computeCardioProgress({ duration_sec: 300 }, {})).toEqual({
            kind: 'time',
            pct: 0,
            remaining: 300,
            done: false,
        })
    })

    it('exactamente en el objetivo = 100% y done', () => {
        expect(computeCardioProgress({ duration_sec: 300 }, { elapsed_sec: 300 })).toEqual({
            kind: 'time',
            pct: 1,
            remaining: 0,
            done: true,
        })
    })

    it('pasado del objetivo clampa pct a 1 y remaining a 0', () => {
        expect(computeCardioProgress({ duration_sec: 300 }, { elapsed_sec: 420 })).toEqual({
            kind: 'time',
            pct: 1,
            remaining: 0,
            done: true,
        })
    })
})

describe('computeCardioProgress — objetivo por distancia', () => {
    it('mitad de la distancia = 50%', () => {
        expect(computeCardioProgress({ distance_m: 5000 }, { distance_m: 2500 })).toEqual({
            kind: 'distance',
            pct: 0.5,
            remaining: 2500,
            done: false,
        })
    })

    it('distancia alcanzada = done', () => {
        expect(computeCardioProgress({ distance_m: 1000 }, { distance_m: 1000 })).toEqual({
            kind: 'distance',
            pct: 1,
            remaining: 0,
            done: true,
        })
    })
})

describe('computeCardioProgress — precedencia y bordes', () => {
    it('con tiempo Y distancia, el tiempo manda (eje cronometrable)', () => {
        const r = computeCardioProgress({ duration_sec: 600, distance_m: 5000 }, { elapsed_sec: 300, distance_m: 100 })
        expect(r?.kind).toBe('time')
        expect(r?.pct).toBe(0.5)
    })

    it('sin objetivo valido devuelve null', () => {
        expect(computeCardioProgress({}, { elapsed_sec: 100 })).toBeNull()
        expect(computeCardioProgress({ duration_sec: 0, distance_m: 0 }, {})).toBeNull()
        expect(computeCardioProgress({ duration_sec: null, distance_m: null }, {})).toBeNull()
    })

    it('objetivo no finito o negativo se ignora', () => {
        expect(computeCardioProgress({ duration_sec: Number.NaN }, {})).toBeNull()
        expect(computeCardioProgress({ distance_m: -100 }, {})).toBeNull()
    })

    it('avance basura (NaN / negativo / null) cuenta como 0', () => {
        expect(computeCardioProgress({ duration_sec: 300 }, { elapsed_sec: Number.NaN })?.pct).toBe(0)
        expect(computeCardioProgress({ duration_sec: 300 }, { elapsed_sec: -50 })?.pct).toBe(0)
        expect(computeCardioProgress({ distance_m: 1000 }, { distance_m: null })?.remaining).toBe(1000)
    })
})
