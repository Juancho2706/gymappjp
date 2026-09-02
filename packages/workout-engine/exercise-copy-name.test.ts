import { describe, expect, it } from 'vitest'
import {
    EXERCISE_NAME_MAX_LENGTH,
    resolveExerciseCopyName,
    stripExerciseCopySuffix,
} from './exercise-copy-name'

/**
 * Regla del duplicado: el nombre NO tiene unique en DB (solo indices btree no unicos en el
 * baseline). La unicidad la impone la app con un `ilike` scopeado al owner, asi que este helper
 * tiene que elegir un nombre que ese `ilike` NO encuentre — de ahi la comparacion
 * case-insensitive y el trim.
 */
describe('resolveExerciseCopyName', () => {
    it('sin choque ⇒ «{nombre} (copia)»', () => {
        expect(resolveExerciseCopyName('Press banca', [])).toBe('Press banca (copia)')
        expect(resolveExerciseCopyName('Press banca', ['Sentadilla', 'Remo'])).toBe('Press banca (copia)')
    })

    it('choque simple (el original propio) ⇒ igual devuelve «(copia)», que esta libre', () => {
        expect(resolveExerciseCopyName('Press banca', ['Press banca'])).toBe('Press banca (copia)')
    })

    it('ya existe «(copia)» ⇒ «(copia 2)», y despues «(copia 3)»', () => {
        expect(resolveExerciseCopyName('Press banca', ['Press banca', 'Press banca (copia)']))
            .toBe('Press banca (copia 2)')
        expect(
            resolveExerciseCopyName('Press banca', [
                'Press banca',
                'Press banca (copia)',
                'Press banca (copia 2)',
            ])
        ).toBe('Press banca (copia 3)')
    })

    it('salta los huecos ocupados aunque no sean consecutivos', () => {
        expect(
            resolveExerciseCopyName('Press banca', [
                'Press banca (copia)',
                'Press banca (copia 2)',
                'Press banca (copia 4)',
            ])
        ).toBe('Press banca (copia 3)')
    })

    it('el choque es CASE-INSENSITIVE (espeja el `ilike` de Postgres) y ignora espacios de borde', () => {
        expect(resolveExerciseCopyName('Press banca', ['PRESS BANCA (COPIA)']))
            .toBe('Press banca (copia 2)')
        expect(resolveExerciseCopyName('Press banca', ['  press Banca (Copia)  ']))
            .toBe('Press banca (copia 2)')
    })

    it('duplicar una copia NO encadena sufijos: «X (copia)» ⇒ «X (copia 2)»', () => {
        expect(resolveExerciseCopyName('Press banca (copia)', ['Press banca', 'Press banca (copia)']))
            .toBe('Press banca (copia 2)')
        expect(
            resolveExerciseCopyName('Press banca (copia 2)', [
                'Press banca',
                'Press banca (copia)',
                'Press banca (copia 2)',
            ])
        ).toBe('Press banca (copia 3)')
    })

    it('nombres nulos/vacios del catalogo no cuentan como ocupados', () => {
        expect(resolveExerciseCopyName('Press banca', [null, undefined, '   ', 'Press banca']))
            .toBe('Press banca (copia)')
    })

    it('respeta el tope de largo recortando la BASE, no el sufijo', () => {
        const largo = 'A'.repeat(EXERCISE_NAME_MAX_LENGTH)
        const copia = resolveExerciseCopyName(largo, [])
        expect(copia.length).toBeLessThanOrEqual(EXERCISE_NAME_MAX_LENGTH)
        expect(copia.endsWith(' (copia)')).toBe(true)

        const segunda = resolveExerciseCopyName(largo, [copia])
        expect(segunda.length).toBeLessThanOrEqual(EXERCISE_NAME_MAX_LENGTH)
        expect(segunda.endsWith(' (copia 2)')).toBe(true)
        expect(segunda).not.toBe(copia)
    })

    it('siempre devuelve un nombre libre aunque el catalogo tenga toda la serie', () => {
        const ocupados = ['Press banca', ...Array.from({ length: 30 }, (_, i) =>
            i === 0 ? 'Press banca (copia)' : `Press banca (copia ${i + 1})`)]
        const libre = resolveExerciseCopyName('Press banca', ocupados)
        expect(libre).toBe('Press banca (copia 31)')
        expect(ocupados.map((n) => n.toLowerCase())).not.toContain(libre.toLowerCase())
    })
})

describe('stripExerciseCopySuffix', () => {
    it('quita «(copia)» y «(copia N)» con cualquier capitalizacion', () => {
        expect(stripExerciseCopySuffix('Press banca (copia)')).toBe('Press banca')
        expect(stripExerciseCopySuffix('Press banca (Copia 3)')).toBe('Press banca')
        expect(stripExerciseCopySuffix('Press banca (COPIA 12)')).toBe('Press banca')
    })

    it('quita sufijos encadenados (nombres viejos de RN, que concatenaba a ciegas)', () => {
        expect(stripExerciseCopySuffix('Press banca (copia) (copia)')).toBe('Press banca')
    })

    it('no toca un nombre sin sufijo ni deja cadena vacia', () => {
        expect(stripExerciseCopySuffix('Press banca')).toBe('Press banca')
        expect(stripExerciseCopySuffix('Copia de press')).toBe('Copia de press')
        expect(stripExerciseCopySuffix('(copia)')).toBe('(copia)')
    })
})
