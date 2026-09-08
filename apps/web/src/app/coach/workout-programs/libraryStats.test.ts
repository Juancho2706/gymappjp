import { describe, expect, it } from 'vitest'
import {
    PROGRAM_STATUS_LABEL,
    getProgramStats,
    matchesProgramFilters,
    programDisplayName,
    programLineageLabel,
    programStatusLabel,
    type LibraryFilters,
    type ProgramListModel,
} from './libraryStats'

/**
 * Identidad y estado de la biblioteca del coach (SPEC plan-vivo-y-guardado, 07-09-2026).
 * Incidente: 105 de 122 copias heredan el nombre EXACTO de su plantilla y 78 de 207 asignados
 * están inactivos, así que nada distinguía la plantilla, el plan vivo del alumno y el que quedó
 * como historial. Estos casos fijan el copy y el comportamiento de los filtros.
 */

function program(over: Partial<ProgramListModel> = {}): ProgramListModel {
    return {
        id: 'p-base',
        name: 'Fuerza 3 días',
        client_id: null,
        weeks_to_repeat: 4,
        start_date: null,
        created_at: '2026-09-01T00:00:00.000Z',
        ...over,
    }
}

const template = program({ id: 't1', name: 'Fuerza 3 días' })

/** Copia viva de la plantilla, con el MISMO nombre heredado (el caso de los 105 de producción). */
const liveCopy = program({
    id: 'c1',
    name: 'Fuerza 3 días',
    client_id: 'cl1',
    is_active: true,
    source_template_id: 't1',
    client: { id: 'cl1', full_name: 'Ana Pérez' },
})

/** Copia que quedó como historial cuando al alumno se le asignó otra rutina. */
const retiredCopy = program({
    id: 'c2',
    name: 'Fuerza 3 días',
    client_id: 'cl1',
    is_active: false,
    source_template_id: 't1',
    client: { id: 'cl1', full_name: 'Ana Pérez' },
})

const filters = (over: Partial<LibraryFilters> = {}): LibraryFilters => ({
    search: '',
    filterType: 'all',
    filterStatus: 'all',
    filterStructure: 'all',
    filterHasPhases: 'all',
    ...over,
})

describe('programStatusLabel — copy único de estado', () => {
    it('sin alumno ⇒ «Plantilla»', () => {
        expect(programStatusLabel(template)).toBe('Plantilla')
        expect(PROGRAM_STATUS_LABEL.template).toBe('Plantilla')
    })

    it('copia activa del alumno ⇒ «En uso»', () => {
        expect(programStatusLabel(liveCopy)).toBe('En uso')
        expect(PROGRAM_STATUS_LABEL.active).toBe('En uso')
    })

    it('copia desactivada ⇒ «Ya no está en uso» (nunca «Inactivo»)', () => {
        expect(programStatusLabel(retiredCopy)).toBe('Ya no está en uso')
        expect(PROGRAM_STATUS_LABEL.inactive).toBe('Ya no está en uso')
    })

    it('asignado sin `is_active` en el payload se trata como fuera de uso', () => {
        expect(programStatusLabel(program({ client_id: 'cl1' }))).toBe('Ya no está en uso')
    })

    it('getProgramStats expone la misma etiqueta (antes era código muerto)', () => {
        expect(getProgramStats(template).statusLabel).toBe('Plantilla')
        expect(getProgramStats(liveCopy).statusLabel).toBe('En uso')
        expect(getProgramStats(retiredCopy).statusLabel).toBe('Ya no está en uso')
    })
})

describe('programDisplayName — identidad en pantalla, sin tocar la base (D3-A)', () => {
    it('la copia se rotula por su alumno aunque herede el nombre de la plantilla', () => {
        expect(programDisplayName(liveCopy)).toBe('Plan de Ana Pérez')
        expect(liveCopy.name).toBe(template.name)
    })

    it('la plantilla conserva su nombre', () => {
        expect(programDisplayName(template)).toBe('Fuerza 3 días')
    })

    it('asignado sin el alumno cargado cae al nombre guardado', () => {
        expect(programDisplayName(program({ client_id: 'cl1' }))).toBe('Fuerza 3 días')
    })
})

describe('programLineageLabel — cita a la plantilla madre de las filas ya cargadas', () => {
    const names = new Map([[template.id, template.name]])

    it('con la plantilla en la lista muestra «Copia de «…»»', () => {
        expect(programLineageLabel(liveCopy, names)).toBe('Copia de «Fuerza 3 días»')
    })

    it('sin `source_template_id` no hay linaje', () => {
        expect(programLineageLabel(template, names)).toBeNull()
    })

    it('plantilla madre ausente ⇒ se omite en silencio, nunca se muestra el id', () => {
        expect(programLineageLabel(liveCopy, new Map())).toBeNull()
        expect(programLineageLabel(liveCopy, undefined)).toBeNull()
    })
})

describe('matchesProgramFilters — filtro «Estado» real', () => {
    it('«todos» no filtra por estado', () => {
        const f = filters({ filterStatus: 'all' })
        expect([template, liveCopy, retiredCopy].filter((p) => matchesProgramFilters(p, f))).toEqual([
            template,
            liveCopy,
            retiredCopy,
        ])
    })

    it('«En uso» deja solo la copia viva (la plantilla no tiene estado)', () => {
        const f = filters({ filterStatus: 'active' })
        expect(matchesProgramFilters(template, f)).toBe(false)
        expect(matchesProgramFilters(liveCopy, f)).toBe(true)
        expect(matchesProgramFilters(retiredCopy, f)).toBe(false)
    })

    it('«Ya no está en uso» deja solo la copia retirada', () => {
        const f = filters({ filterStatus: 'inactive' })
        expect(matchesProgramFilters(template, f)).toBe(false)
        expect(matchesProgramFilters(liveCopy, f)).toBe(false)
        expect(matchesProgramFilters(retiredCopy, f)).toBe(true)
    })

    it('asignados + «Ya no está en uso» YA NO es un callejón vacío (antes exigía is_active)', () => {
        const f = filters({ filterType: 'assigned', filterStatus: 'inactive' })
        expect(matchesProgramFilters(retiredCopy, f)).toBe(true)
        expect(matchesProgramFilters(liveCopy, f)).toBe(false)
        expect(matchesProgramFilters(template, f)).toBe(false)
    })

    it('la pestaña Asignados incluye las copias retiradas, la de Plantillas ninguna', () => {
        const asignados = filters({ filterType: 'assigned' })
        expect([liveCopy, retiredCopy].every((p) => matchesProgramFilters(p, asignados))).toBe(true)
        expect(matchesProgramFilters(template, asignados)).toBe(false)

        const plantillas = filters({ filterType: 'templates' })
        expect(matchesProgramFilters(template, plantillas)).toBe(true)
        expect(matchesProgramFilters(retiredCopy, plantillas)).toBe(false)
    })

    it('el estado se combina con la búsqueda por nombre de alumno', () => {
        const f = filters({ search: 'ana', filterStatus: 'inactive' })
        expect(matchesProgramFilters(retiredCopy, f)).toBe(true)
        expect(matchesProgramFilters(program({ client_id: 'cl9', is_active: false }), f)).toBe(false)
    })
})
