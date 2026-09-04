import { describe, expect, it } from 'vitest'

import { programDayLabel } from './program-day-label'

const FORMS = ['short', 'long', 'chip'] as const

describe('programDayLabel — weekly (identidad con lo que se pinta hoy)', () => {
    it('lunes: Lun / Lunes / Lun (R31: el chip weekly NO cambia)', () => {
        expect(programDayLabel(1, 'weekly', null, { form: 'short' })).toBe('Lun')
        expect(programDayLabel(1, 'weekly', null, { form: 'long' })).toBe('Lunes')
        expect(programDayLabel(1, 'weekly', null, { form: 'chip' })).toBe('Lun')
    })

    it('domingo: Dom / Domingo / Dom', () => {
        expect(programDayLabel(7, 'weekly', null, { form: 'short' })).toBe('Dom')
        expect(programDayLabel(7, 'weekly', null, { form: 'long' })).toBe('Domingo')
        expect(programDayLabel(7, 'weekly', null, { form: 'chip' })).toBe('Dom')
    })

    it('miércoles y sábado llevan tilde en las TRES formas (muere la deuda "Mie"/"Sab")', () => {
        expect(programDayLabel(3, 'weekly', null, { form: 'short' })).toBe('Mié')
        expect(programDayLabel(3, 'weekly', null, { form: 'long' })).toBe('Miércoles')
        expect(programDayLabel(3, 'weekly', null, { form: 'chip' })).toBe('Mié')
        expect(programDayLabel(6, 'weekly', null, { form: 'chip' })).toBe('Sáb')
        expect(programDayLabel(3, 'weekly', null, { form: 'chip' })).toContain('é')
        expect(programDayLabel(6, 'weekly', null, { form: 'chip' })).toContain('á')
    })

    it('estructura omitida (null) se comporta como weekly', () => {
        expect(programDayLabel(2, null, null, { form: 'short' })).toBe('Mar')
        expect(programDayLabel(2, null, 3, { form: 'long' })).toBe('Martes')
    })

    it('el chip weekly conserva 3 letras y la inicial de hoy — nunca la inicial suelta (R31)', () => {
        const hoy = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
        for (let dow = 1; dow <= 7; dow++) {
            const chip = programDayLabel(dow, 'weekly', null, { form: 'chip' })
            expect(chip).toHaveLength(3)
            expect(chip[0]).toBe(hoy[dow - 1])
        }
    })

    it('fuera de rango (0, 8, null, no entero) => cadena vacía, nunca lanza', () => {
        for (const form of FORMS) {
            expect(programDayLabel(0, 'weekly', null, { form })).toBe('')
            expect(programDayLabel(8, 'weekly', null, { form })).toBe('')
            expect(programDayLabel(null, 'weekly', null, { form })).toBe('')
            expect(programDayLabel(2.5, 'weekly', null, { form })).toBe('')
        }
    })
})

describe('programDayLabel — cycle (índice del ciclo, no día de la semana)', () => {
    it('día 2 de un ciclo de 3: Día 2 / Día 2 de 3 / D2', () => {
        expect(programDayLabel(2, 'cycle', 3, { form: 'short' })).toBe('Día 2')
        expect(programDayLabel(2, 'cycle', 3, { form: 'long' })).toBe('Día 2 de 3')
        expect(programDayLabel(2, 'cycle', 3, { form: 'chip' })).toBe('D2')
    })

    it('ciclo de 1 día: Día 1 de 1', () => {
        expect(programDayLabel(1, 'cycle', 1, { form: 'short' })).toBe('Día 1')
        expect(programDayLabel(1, 'cycle', 1, { form: 'long' })).toBe('Día 1 de 1')
        expect(programDayLabel(1, 'cycle', 1, { form: 'chip' })).toBe('D1')
    })

    it('índices 8..14 soportados (R8): Día 8 de 14 y Día 14 de 14', () => {
        expect(programDayLabel(8, 'cycle', 14, { form: 'short' })).toBe('Día 8')
        expect(programDayLabel(8, 'cycle', 14, { form: 'long' })).toBe('Día 8 de 14')
        expect(programDayLabel(8, 'cycle', 14, { form: 'chip' })).toBe('D8')
        expect(programDayLabel(14, 'cycle', 14, { form: 'long' })).toBe('Día 14 de 14')
    })

    it('sin cycle_length no explota: fallback legacy de 7', () => {
        expect(programDayLabel(3, 'cycle', null, { form: 'long' })).toBe('Día 3 de 7')
        expect(programDayLabel(3, 'cycle', null, { form: 'short' })).toBe('Día 3')
        expect(programDayLabel(3, 'cycle', null, { form: 'chip' })).toBe('D3')
    })

    it('índice mayor que el largo del ciclo: se muestra el día sin mentir el total', () => {
        expect(programDayLabel(8, 'cycle', null, { form: 'long' })).toBe('Día 8')
        expect(programDayLabel(9, 'cycle', 3, { form: 'long' })).toBe('Día 9')
    })

    it('fuera de rango (0, 15, null) => cadena vacía, nunca lanza ni interpola undefined', () => {
        for (const form of FORMS) {
            expect(programDayLabel(0, 'cycle', 3, { form })).toBe('')
            expect(programDayLabel(15, 'cycle', 14, { form })).toBe('')
            expect(programDayLabel(null, 'cycle', 3, { form })).toBe('')
        }
    })

    it('la tilde de "Día" está en short y long (el chip usa D1, sin tilde)', () => {
        expect(programDayLabel(1, 'cycle', 3, { form: 'short' })).toContain('í')
        expect(programDayLabel(1, 'cycle', 3, { form: 'long' })).toContain('í')
        expect(programDayLabel(1, 'cycle', 3, { form: 'chip' })).not.toContain('í')
    })

    it('REGRESIÓN DURA: ningún input cycle (N 1..14, índices 1..14, 3 formas) pinta un día de la semana', () => {
        for (let n = 1; n <= 14; n++) {
            for (let idx = 1; idx <= 14; idx++) {
                for (const form of FORMS) {
                    expect(programDayLabel(idx, 'cycle', n, { form })).not.toMatch(/Lun|Mar|Mié|Jue|Vie|Sáb|Dom/)
                }
            }
        }
    })
})
