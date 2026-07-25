import { describe, expect, it } from 'vitest'
import { validateTargetDate } from './target-date'

/**
 * Validación pura de la fecha objetivo para editar un día pasado (Ola 1, E1.5). El "hoy Santiago"
 * se inyecta (`todayIso`) → determinista, sin depender del reloj del runner.
 */
describe('validateTargetDate', () => {
    const TODAY = '2026-07-22'

    it('acepta una fecha pasada', () => {
        expect(validateTargetDate('2026-07-20', TODAY)).toEqual({ ok: true, iso: '2026-07-20' })
    })

    it('acepta hoy (borde permitido)', () => {
        expect(validateTargetDate(TODAY, TODAY)).toEqual({ ok: true, iso: TODAY })
    })

    it('rechaza una fecha futura', () => {
        expect(validateTargetDate('2026-07-23', TODAY)).toEqual({ ok: false, reason: 'future' })
    })

    it('rechaza el futuro aunque sea el día siguiente inmediato al cierre de mes', () => {
        expect(validateTargetDate('2026-08-01', '2026-07-31')).toEqual({ ok: false, reason: 'future' })
    })

    it('acepta un día pasado cruzando cierre de mes/año (comparación lexicográfica correcta)', () => {
        expect(validateTargetDate('2025-12-31', '2026-01-01')).toEqual({ ok: true, iso: '2025-12-31' })
    })

    it.each([
        '2026-7-22',      // mes sin zero-pad
        '2026-07-2',      // día sin zero-pad
        '26-07-22',       // año de 2 dígitos
        '2026/07/22',     // separador inválido
        '2026-07-22T00:00', // con hora
        '',               // vacío
        'hoy',            // texto
        ' 2026-07-22',    // espacio inicial
    ])('rechaza formato inválido: %s', (bad) => {
        expect(validateTargetDate(bad, TODAY)).toEqual({ ok: false, reason: 'format' })
    })

    it.each([
        '2026-02-30', // febrero no tiene 30
        '2026-13-01', // mes 13
        '2026-00-10', // mes 0
        '2026-04-31', // abril no tiene 31
        '2026-07-00', // día 0
    ])('rechaza fecha de calendario inexistente: %s', (bad) => {
        expect(validateTargetDate(bad, TODAY)).toEqual({ ok: false, reason: 'format' })
    })
})
