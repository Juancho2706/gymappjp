import { describe, expect, it } from 'vitest'
import { firstName, primeraPautaCards, resolveNutritionPrimeraEntry } from './primera-pauta'

describe('resolveNutritionPrimeraEntry — plan activo vs plan nuevo', () => {
    it('sin ?primera=1 no hay entrada guiada: el editor es el de siempre', () => {
        expect(
            resolveNutritionPrimeraEntry({ primera: false, hasActivePlan: true, hasRequestedOrigin: false }),
        ).toBeNull()
        expect(
            resolveNutritionPrimeraEntry({ primera: false, hasActivePlan: false, hasRequestedOrigin: true }),
        ).toBeNull()
    })

    it('con pauta vigente EDITA la vigente y avisa (jamás aplica una plantilla encima: 23505)', () => {
        expect(
            resolveNutritionPrimeraEntry({ primera: true, hasActivePlan: true, hasRequestedOrigin: false }),
        ).toEqual({ mode: 'edit', notice: 'plan_activo', usesRequestedOrigin: false })
    })

    it('sin pauta vigente arma una nueva, en blanco', () => {
        expect(
            resolveNutritionPrimeraEntry({ primera: true, hasActivePlan: false, hasRequestedOrigin: false }),
        ).toEqual({ mode: 'create', notice: null, usesRequestedOrigin: false })
    })

    it('un ?from= explícito manda incluso con pauta vigente (reemplazo con CAS)', () => {
        expect(
            resolveNutritionPrimeraEntry({ primera: true, hasActivePlan: true, hasRequestedOrigin: true }),
        ).toEqual({ mode: 'create', notice: null, usesRequestedOrigin: true })
    })
})

describe('firstName', () => {
    it('devuelve el primer nombre', () => {
        expect(firstName('Ana Riquelme Soto')).toBe('Ana')
    })

    it('null / vacío / solo espacios devuelven null (nunca un «undefined ya tiene»)', () => {
        expect(firstName(null)).toBeNull()
        expect(firstName('')).toBeNull()
        expect(firstName('   ')).toBeNull()
    })
})

describe('primeraPautaCards — las tres tarjetas embebidas', () => {
    it('con pauta vigente el primer verbo es CAMBIAR y el sujeto es el alumno', () => {
        const cards = primeraPautaCards({ hasActivePlan: true, name: 'Ana' })
        expect(cards.map((card) => card.id)).toEqual(['cambia-alimento', 'ajusta-porcion', 'publica'])
        expect(cards[0].body).toContain('Ana')
        expect(cards[2].body).toContain('Ana')
    })

    it('sin pauta vigente el primer verbo es AGREGAR (no hay nada que cambiar todavía)', () => {
        const cards = primeraPautaCards({ hasActivePlan: false, name: 'Ana' })
        expect(cards[0].id).toBe('agrega-alimento')
    })

    it('sin nombre habla sin sujeto propio, nunca de «null»', () => {
        const cards = primeraPautaCards({ hasActivePlan: true, name: null })
        for (const card of cards) {
            expect(card.body).not.toContain('null')
            expect(card.body).not.toContain('undefined')
        }
        expect(cards[2].body).toContain('tu alumno')
    })
})
