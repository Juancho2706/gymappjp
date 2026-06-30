import { describe, it, expect } from 'vitest'
import { resolveEffectiveWeekVariant, programWeekIndex1Based } from './programWeekVariant'

// `planCurrentWeekFromCompliance` fija la semana del ciclo de forma determinista:
// 1 (impar) → variante A, 2 (par) → variante B. Evita depender de la fecha.
const abProgram = { ab_mode: true, start_date: '2026-05-31', weeks_to_repeat: 4 }
const planA = { week_variant: 'A' }
const planB = { week_variant: 'B' }

describe('resolveEffectiveWeekVariant', () => {
    it('sin ab_mode siempre devuelve A', () => {
        expect(resolveEffectiveWeekVariant({ ab_mode: false }, [planB], 2)).toBe('A')
    })

    it('A/B bien armado: respeta la variante del ciclo (cero cambio de comportamiento)', () => {
        expect(resolveEffectiveWeekVariant(abProgram, [planA, planB], 2)).toBe('B')
        expect(resolveEffectiveWeekVariant(abProgram, [planA, planB], 1)).toBe('A')
    })

    it('solo planes A en semana B → cae a A (fix del dead-end: no deja al alumno con el programa vacío)', () => {
        expect(resolveEffectiveWeekVariant(abProgram, [planA], 2)).toBe('A')
    })

    it('solo planes B en semana A → cae a B', () => {
        expect(resolveEffectiveWeekVariant(abProgram, [planB], 1)).toBe('B')
    })

    it('sin planes → devuelve la variante del ciclo (empty legítimo, el coach no cargó nada)', () => {
        expect(resolveEffectiveWeekVariant(abProgram, [], 2)).toBe('B')
    })

    it('plan sin week_variant cuenta como A', () => {
        expect(resolveEffectiveWeekVariant(abProgram, [{ week_variant: null }], 2)).toBe('A')
    })
})

describe('programWeekIndex1Based', () => {
    const prog = { start_date: '2026-05-31', weeks_to_repeat: 4 }

    it('semana transcurrida desde el inicio (14 días → semana 2)', () => {
        expect(programWeekIndex1Based(prog, new Date('2026-06-14T00:00:00Z'))).toBe(2)
    })

    it('día de inicio → semana 1', () => {
        expect(programWeekIndex1Based(prog, new Date('2026-05-31T00:00:00Z'))).toBe(1)
    })

    it('start FUTURO → semana 1 (no infla el peso objetivo antes de arrancar)', () => {
        // Antes (Math.abs) devolvía semana 5 → el alumno veía base + 4×incremento pre-arranque.
        expect(programWeekIndex1Based(prog, new Date('2026-05-01T00:00:00Z'))).toBe(1)
    })

    it('capa a weeks_to_repeat', () => {
        expect(programWeekIndex1Based(prog, new Date('2026-12-31T00:00:00Z'))).toBe(4)
    })

    it('sin start_date → null', () => {
        expect(programWeekIndex1Based({ weeks_to_repeat: 4 }, new Date('2026-06-14T00:00:00Z'))).toBeNull()
    })
})
