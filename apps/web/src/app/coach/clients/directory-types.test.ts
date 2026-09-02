import { describe, expect, it } from 'vitest'
import { parseStatusDirectoryFilter, STATUS_DIRECTORY_FILTERS } from './directory-types'

/**
 * B8 — `?status=` siembra el filtro del directorio desde el server.
 *
 * Fail-closed a `'any'`: un valor que la UI no sabe pintar dejaría la lista vacía sin explicación
 * (`matchesStatusFilter` cae al `return true` final, pero el chip del ActionBar quedaría en un
 * estado fantasma). La query viene de fuera —links viejos, correos, copy/paste— así que se valida.
 */
describe('parseStatusDirectoryFilter', () => {
    it('acepta todos los valores del tipo', () => {
        for (const value of STATUS_DIRECTORY_FILTERS) {
            expect(parseStatusDirectoryFilter(value)).toBe(value)
        }
    })

    it('«archived» es el caso que motiva el deep link: las vistas por defecto lo esconden', () => {
        expect(parseStatusDirectoryFilter('archived')).toBe('archived')
    })

    it('valor desconocido, vacío, ausente o query repetida ⇒ any', () => {
        expect(parseStatusDirectoryFilter('ARCHIVED')).toBe('any')
        expect(parseStatusDirectoryFilter('borrados')).toBe('any')
        expect(parseStatusDirectoryFilter('')).toBe('any')
        expect(parseStatusDirectoryFilter(undefined)).toBe('any')
        expect(parseStatusDirectoryFilter(null)).toBe('any')
        expect(parseStatusDirectoryFilter(['archived', 'active'])).toBe('any')
    })
})
