import { describe, expect, it } from 'vitest'

import { detectPR, type PrSet } from './pr-detect'

/** Historico base: mejor peso 105 kg, mejor 1RM Epley 116.7 (100×5). */
const historico: PrSet[] = [
    { weight_kg: 100, reps_done: 5 }, // e1rm 116.7
    { weight_kg: 105, reps_done: 3 }, // e1rm 115.5
]

describe('detectPR — PR por peso', () => {
    it('mas kg que nunca es PR de peso', () => {
        expect(detectPR({ weight_kg: 110, reps_done: 5 }, historico)).toEqual({
            isPR: true,
            kind: 'weight',
            prevBest: { weightKg: 105, e1rm: 116.7 },
        })
    })
})

describe('detectPR — PR por 1RM estimado', () => {
    it('mismo/menos peso pero mas reps supera el 1RM historico', () => {
        // 100×10 → Epley 133.3 > 116.7, pero 100 kg no supera los 105 kg historicos.
        expect(detectPR({ weight_kg: 100, reps_done: 10 }, historico)).toEqual({
            isPR: true,
            kind: 'e1rm',
            prevBest: { weightKg: 105, e1rm: 116.7 },
        })
    })
})

describe('detectPR — sin PR', () => {
    it('ni peso ni 1RM superan el historico', () => {
        expect(detectPR({ weight_kg: 90, reps_done: 5 }, historico)).toEqual({
            isPR: false,
            kind: null,
            prevBest: { weightKg: 105, e1rm: 116.7 },
        })
    })

    it('empatar el 1RM no es PR (exige superar, no igualar)', () => {
        expect(detectPR({ weight_kg: 100, reps_done: 5 }, [{ weight_kg: 100, reps_done: 5 }])).toEqual({
            isPR: false,
            kind: null,
            prevBest: { weightKg: 100, e1rm: 116.7 },
        })
    })
})

describe('detectPR — sin historico comparable (no es PR real)', () => {
    it('historico vacio → isPR false, prevBest null', () => {
        expect(detectPR({ weight_kg: 120, reps_done: 5 }, [])).toEqual({
            isPR: false,
            kind: null,
            prevBest: null,
        })
    })

    it('historico solo con series invalidas/sustituidas → prevBest null', () => {
        const dirty: PrSet[] = [
            { weight_kg: 0, reps_done: 5 },
            { weight_kg: 200, reps_done: 1, substituted: true },
            { weight_kg: 100, reps_done: 0 },
        ]
        expect(detectPR({ weight_kg: 120, reps_done: 5 }, dirty)).toEqual({
            isPR: false,
            kind: null,
            prevBest: null,
        })
    })
})

describe('detectPR — anti-PR-falso (sustitucion)', () => {
    it('serie actual sustituida nunca es PR (peso no comparable)', () => {
        expect(detectPR({ weight_kg: 999, reps_done: 5, substituted: true }, historico)).toEqual({
            isPR: false,
            kind: null,
            prevBest: { weightKg: 105, e1rm: 116.7 },
        })
    })

    it('el historico ignora las series sustituidas al calcular el mejor', () => {
        const conSustituida: PrSet[] = [
            { weight_kg: 200, reps_done: 1, substituted: true }, // maquina distinta → se ignora
            { weight_kg: 100, reps_done: 5 },
        ]
        // 102 kg supera los 100 kg reales (no los 200 sustituidos) → PR de peso.
        expect(detectPR({ weight_kg: 102, reps_done: 5 }, conSustituida)).toEqual({
            isPR: true,
            kind: 'weight',
            prevBest: { weightKg: 100, e1rm: 116.7 },
        })
    })
})

describe('detectPR — serie actual invalida', () => {
    it('peso o reps <= 0 no puede ser PR', () => {
        expect(detectPR({ weight_kg: 0, reps_done: 5 }, historico).isPR).toBe(false)
        expect(detectPR({ weight_kg: 100, reps_done: 0 }, historico).isPR).toBe(false)
        expect(detectPR({ weight_kg: null, reps_done: null }, historico)).toEqual({
            isPR: false,
            kind: null,
            prevBest: { weightKg: 105, e1rm: 116.7 },
        })
    })
})
