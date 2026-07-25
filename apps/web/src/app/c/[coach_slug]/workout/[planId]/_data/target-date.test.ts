import { describe, expect, it } from 'vitest'
import { resolveRepeatDate, validateTargetDate } from './target-date'

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

/**
 * `repetir` = repetir HOY un día hecho en OTRA fecha. A diferencia de `fecha`, HOY MISMO se descarta:
 * el índice único de logs es por día, así que sembrar hoy sobre hoy pisaría la misma fila.
 */
describe('resolveRepeatDate', () => {
    const TODAY = '2026-07-22'

    it('devuelve la fecha cuando es un día pasado válido', () => {
        expect(resolveRepeatDate('2026-07-20', TODAY)).toBe('2026-07-20')
    })

    it('devuelve null cuando la fecha es HOY (pisaría la fila del día por el índice único)', () => {
        expect(resolveRepeatDate(TODAY, TODAY)).toBeNull()
    })

    it('devuelve null cuando la fecha es futura', () => {
        expect(resolveRepeatDate('2026-07-23', TODAY)).toBeNull()
    })

    it.each([
        '2026-7-20',   // formato inválido
        '2026-02-30',  // calendario inexistente
        'ayer',        // texto
    ])('devuelve null para entrada inválida: %s', (bad) => {
        expect(resolveRepeatDate(bad, TODAY)).toBeNull()
    })

    it.each([
        ['vacía', ''],
        ['indefinida', undefined],
        ['nula', null],
    ])('devuelve null para entrada %s', (_label, input) => {
        expect(resolveRepeatDate(input, TODAY)).toBeNull()
    })
})
