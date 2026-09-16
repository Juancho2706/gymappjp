import { describe, expect, it } from 'vitest'
import {
    daysInMonth,
    dossierFileStem,
    formatDayMonth,
    formatMonthLabel,
    formatMonthLong,
    monthPeriod,
    monthRangeFrom,
    slugifyClientName,
    toMonthKey,
} from './months'

describe('monthRangeFrom', () => {
    it('devuelve las claves ascendentes entre bounds (acepta YYYY-MM-DD de get_client_report_bounds)', () => {
        expect(monthRangeFrom('2026-06-01', '2026-09-01')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09'])
    })

    it('acepta claves YYYY-MM y cruza el año', () => {
        expect(monthRangeFrom('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    })

    it('un solo mes cuando first == current', () => {
        expect(monthRangeFrom('2026-09-01', '2026-09-01')).toEqual(['2026-09'])
    })

    it('dato raro (first posterior a current) ⇒ solo el mes actual, nunca rango invertido', () => {
        expect(monthRangeFrom('2026-12-01', '2026-09-01')).toEqual(['2026-09'])
    })

    it('sin bounds ⇒ lista vacía (el diálogo no dibuja chips)', () => {
        expect(monthRangeFrom(null, null)).toEqual([])
        expect(monthRangeFrom('2026-06-01', 'basura')).toEqual([])
    })

    it('first inválido ⇒ cae al mes actual', () => {
        expect(monthRangeFrom(null, '2026-09-01')).toEqual(['2026-09'])
    })
})

describe('rótulos de mes', () => {
    it('formatMonthLabel', () => {
        expect(formatMonthLabel('2026-07')).toBe('jul 2026')
        expect(formatMonthLabel('2026-01-01')).toBe('ene 2026')
        expect(formatMonthLabel('2026-12')).toBe('dic 2026')
        expect(formatMonthLabel(null)).toBe('—')
    })

    it('formatMonthLong', () => {
        expect(formatMonthLong('2026-07')).toBe('Julio 2026')
        expect(formatMonthLong('2026-09-01')).toBe('Septiembre 2026')
        expect(formatMonthLong('nada')).toBe('—')
    })

    it('formatDayMonth', () => {
        expect(formatDayMonth('2026-07-17')).toBe('17 jul')
        expect(formatDayMonth('2026-05-28T13:00:00.000Z')).toBe('28 may')
        expect(formatDayMonth(null)).toBe('—')
    })

    it('toMonthKey normaliza cualquier fecha', () => {
        expect(toMonthKey('2026-07-31T23:59:59Z')).toBe('2026-07')
        expect(toMonthKey('2026-7')).toBe('')
    })
})

describe('monthPeriod', () => {
    it('mes cerrado ⇒ del 1 al último día (31, 30 y febrero bisiesto)', () => {
        expect(monthPeriod('2026-07', '2026-09-15')).toEqual({ fromIso: '2026-07-01', toIso: '2026-07-31' })
        expect(monthPeriod('2026-06', '2026-09-15')).toEqual({ fromIso: '2026-06-01', toIso: '2026-06-30' })
        expect(monthPeriod('2024-02', '2026-09-15')).toEqual({ fromIso: '2024-02-01', toIso: '2024-02-29' })
        expect(monthPeriod('2026-02', '2026-09-15')).toEqual({ fromIso: '2026-02-01', toIso: '2026-02-28' })
    })

    it('mes EN CURSO ⇒ corta en hoy', () => {
        expect(monthPeriod('2026-09', '2026-09-15')).toEqual({ fromIso: '2026-09-01', toIso: '2026-09-15' })
    })

    it('acepta un timestamp como "hoy" (usa solo la parte de fecha)', () => {
        expect(monthPeriod('2026-09', '2026-09-03T21:40:00.000Z')).toEqual({
            fromIso: '2026-09-01',
            toIso: '2026-09-03',
        })
    })

    it('daysInMonth cubre el bisiesto secular', () => {
        expect(daysInMonth(2000, 2)).toBe(29)
        expect(daysInMonth(2100, 2)).toBe(28)
    })
})

describe('slug y nombre de archivo', () => {
    it('slugify: NFD, sin diacríticos, tope 60 (misma receta que los dos generadores)', () => {
        expect(slugifyClientName('Constanza Salgado')).toBe('constanza-salgado')
        expect(slugifyClientName('José Ñuñez  Pérez')).toBe('jose-nunez-perez')
        expect(slugifyClientName('  ')).toBe('alumno')
        expect(slugifyClientName('a'.repeat(80))).toHaveLength(60)
    })

    it('dossierFileStem: sin meses, un mes y rango', () => {
        expect(dossierFileStem('Constanza Salgado', [])).toBe('dossier-constanza-salgado')
        expect(dossierFileStem('Constanza Salgado', ['2026-07'])).toBe('dossier-constanza-salgado-2026-07')
        expect(dossierFileStem('Constanza Salgado', ['2026-07', '2026-08', '2026-09'])).toBe(
            'dossier-constanza-salgado-2026-07_2026-09'
        )
    })

    it('dossierFileStem ordena y normaliza los meses recibidos', () => {
        expect(dossierFileStem('Joaco', ['2026-09-01', '2026-07-01'])).toBe('dossier-joaco-2026-07_2026-09')
    })
})
