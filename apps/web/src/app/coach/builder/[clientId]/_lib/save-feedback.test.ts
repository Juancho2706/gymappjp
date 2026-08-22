import { describe, expect, it } from 'vitest'
import { savedProgramToast } from './save-feedback'

/**
 * Confirmación del guardado del builder (QA del owner 22-08). Lo que se pinea es el CONTRATO del
 * copy: nombra lo guardado, distingue plan de alumno vs plantilla de biblioteca, y nunca deja el
 * separador colgando cuando el nombre viene vacío.
 */
describe('savedProgramToast', () => {
    it('nombra el plan del alumno', () => {
        expect(savedProgramToast({ programName: 'Fuerza 4 días', hasClient: true })).toBe(
            'Plan guardado: Fuerza 4 días',
        )
    })

    it('llama plantilla a lo que se guarda sin alumno', () => {
        expect(savedProgramToast({ programName: 'Full body', hasClient: false })).toBe(
            'Plantilla guardada: Full body',
        )
    })

    it('recorta el nombre', () => {
        expect(savedProgramToast({ programName: '  Hipertrofia  ', hasClient: true })).toBe(
            'Plan guardado: Hipertrofia',
        )
    })

    it('sin nombre utilizable deja el sustantivo solo (nunca un «:» colgando)', () => {
        expect(savedProgramToast({ programName: '   ', hasClient: true })).toBe('Plan guardado')
        expect(savedProgramToast({ programName: '', hasClient: false })).toBe('Plantilla guardada')
    })
})
