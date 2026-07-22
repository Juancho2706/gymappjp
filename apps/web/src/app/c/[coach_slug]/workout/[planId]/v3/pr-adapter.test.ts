import { describe, it, expect } from 'vitest'
import { classifyThresholdPr } from './pr-adapter'

describe('classifyThresholdPr — eje del PR en vivo (adaptador de borde, engine intacto)', () => {
    it('superar el peso máximo ⇒ kind weight', () => {
        const res = classifyThresholdPr(62.5, 8, 60)
        expect(res.isPR).toBe(true)
        expect(res.kind).toBe('weight')
        expect(res.prevBest?.weightKg).toBe(60)
    })

    it('igualar el peso con más reps ⇒ kind e1rm (mismo peso, 1RM estimado mayor)', () => {
        const res = classifyThresholdPr(60, 10, 60)
        expect(res.isPR).toBe(true)
        expect(res.kind).toBe('e1rm')
    })

    it('igualar el peso con 1 rep (empate exacto) ⇒ sin eje (la UI rotula peso por defecto)', () => {
        const res = classifyThresholdPr(60, 1, 60)
        expect(res.isPR).toBe(false)
        expect(res.kind).toBeNull()
    })

    it('serie sin reps válidas ⇒ kind null (no rompe el disparo del umbral)', () => {
        const res = classifyThresholdPr(65, null, 60)
        expect(res.kind).toBeNull()
    })
})
