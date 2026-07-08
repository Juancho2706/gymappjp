import { describe, it, expect } from 'vitest'
import { clampScrollTop, resolveKeypadCloseScroll } from './keypad-scroll'

describe('clampScrollTop', () => {
    it('recorta al máximo cuando el objetivo lo supera', () => {
        expect(clampScrollTop(900, 200)).toBe(200)
    })

    it('respeta el objetivo cuando cae dentro del rango', () => {
        expect(clampScrollTop(120, 500)).toBe(120)
    })

    it('nunca devuelve un scroll negativo', () => {
        expect(clampScrollTop(-50, 500)).toBe(0)
    })

    it('máximo inválido / negativo ⇒ 0 (documento sin scroll)', () => {
        expect(clampScrollTop(300, -1)).toBe(0)
        expect(clampScrollTop(300, Number.NaN)).toBe(0)
    })
})

describe('resolveKeypadCloseScroll — ancla VIVA (cierre por "tocar fuera")', () => {
    it('el navegador clampó y la fila subió → scrollBy por el delta negativo para restaurar el top', () => {
        // Antes top=250; tras quitar el padding el navegador clampó y la fila subió a top=-70.
        const move = resolveKeypadCloseScroll({
            anchorAlive: true,
            anchorTopBefore: 250,
            anchorTopAfter: -70,
            prevScrollY: 520,
            maxScrollAfter: 200,
        })
        // scrollBy(top: delta) con delta = after - before = -320 → deja rect.top final = -70 - (-320) = 250.
        expect(move).toEqual({ kind: 'by', top: -320 })
    })

    it('la fila no se movió (había contenido debajo que absorbió el padding) → sin scroll', () => {
        const move = resolveKeypadCloseScroll({
            anchorAlive: true,
            anchorTopBefore: 300,
            anchorTopAfter: 300,
            prevScrollY: 400,
            maxScrollAfter: 900,
        })
        expect(move).toEqual({ kind: 'none' })
    })

    it('el signo del delta re-ancla el top exacto (invariante: rect.top_final == before)', () => {
        const anchorTopBefore = 180
        const anchorTopAfter = 40
        const move = resolveKeypadCloseScroll({
            anchorAlive: true,
            anchorTopBefore,
            anchorTopAfter,
            prevScrollY: 600,
            maxScrollAfter: 300,
        })
        expect(move.kind).toBe('by')
        // Simula el efecto de scrollBy sobre el rect: top_final = after - deltaAplicado.
        const applied = move.kind === 'by' ? move.top : 0
        expect(anchorTopAfter - applied).toBe(anchorTopBefore)
    })
})

describe('resolveKeypadCloseScroll — ancla MUERTA (cierre por "Listo", fila colapsada a chip)', () => {
    it('el scroll quedó fuera del nuevo máximo → scrollTo instantáneo al máximo (nosotros hacemos el clamp)', () => {
        const move = resolveKeypadCloseScroll({
            anchorAlive: false,
            anchorTopBefore: 0,
            anchorTopAfter: 0,
            prevScrollY: 520,
            maxScrollAfter: 200,
        })
        expect(move).toEqual({ kind: 'to', top: 200 })
    })

    it('el scroll seguía dentro del rango (sin clamp) → sin scroll', () => {
        const move = resolveKeypadCloseScroll({
            anchorAlive: false,
            anchorTopBefore: 0,
            anchorTopAfter: 0,
            prevScrollY: 150,
            maxScrollAfter: 900,
        })
        expect(move).toEqual({ kind: 'none' })
    })

    it('scroll exactamente en el límite ⇒ sin movimiento', () => {
        const move = resolveKeypadCloseScroll({
            anchorAlive: false,
            anchorTopBefore: 0,
            anchorTopAfter: 0,
            prevScrollY: 200,
            maxScrollAfter: 200,
        })
        expect(move).toEqual({ kind: 'none' })
    })
})
