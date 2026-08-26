import { describe, expect, it } from 'vitest'
import {
    clientStatusInputFromRow,
    getClientStatusMeta,
    type ClientStatusInput,
} from './client-status'

const base: ClientStatusInput = {
    isArchived: false,
    isActive: true,
    firstLoginAt: null,
    forcePasswordChange: false,
}

describe('getClientStatusMeta', () => {
    it('archivado gana sobre cualquier otro estado y conserva su copy', () => {
        const meta = getClientStatusMeta({
            ...base,
            isArchived: true,
            isActive: false,
            forcePasswordChange: true,
        })
        expect(meta.key).toBe('archived')
        expect(meta.label).toBe('Archivado')
        expect(meta.cls).toBe('bg-surface-sunken text-subtle')
    })

    it('inactivo gana sobre el pendiente de clave y conserva su copy', () => {
        const meta = getClientStatusMeta({ ...base, isActive: false, forcePasswordChange: true })
        expect(meta.key).toBe('paused')
        expect(meta.label).toBe('Pausado')
    })

    it('con force_password_change dice lo que el dato dice, no «entró»', () => {
        const meta = getClientStatusMeta({ ...base, forcePasswordChange: true })
        expect(meta.key).toBe('pending_sync')
        expect(meta.label).toBe('Todavía no cambió su clave')
        expect(meta.label).not.toMatch(/entr[óo]/i)
        // Y tampoco la abreviatura vieja, que no significaba nada para el coach.
        expect(meta.label).not.toMatch(/sync/i)
    })

    it('el resto es Activo', () => {
        const meta = getClientStatusMeta(base)
        expect(meta.key).toBe('active')
        expect(meta.label).toBe('Activo')
    })

    it('firstLoginAt todavía no altera el resultado (la columna no existe hasta W1)', () => {
        const sinColumna = getClientStatusMeta({ ...base, forcePasswordChange: true })
        const conColumna = getClientStatusMeta({
            ...base,
            forcePasswordChange: true,
            firstLoginAt: '2026-08-26T10:00:00.000Z',
        })
        expect(conColumna).toEqual(sinColumna)
    })
})

describe('clientStatusInputFromRow', () => {
    it('trata la fila sin flags como alumno activo', () => {
        expect(clientStatusInputFromRow({})).toEqual({
            isArchived: false,
            isActive: true,
            firstLoginAt: null,
            forcePasswordChange: false,
        })
    })

    it('mapea los flags crudos del roster', () => {
        expect(
            clientStatusInputFromRow({
                is_archived: true,
                is_active: false,
                force_password_change: true,
            })
        ).toEqual({
            isArchived: true,
            isActive: false,
            firstLoginAt: null,
            forcePasswordChange: true,
        })
    })

    it('is_active null NO significa pausado (el default de la fila es activo)', () => {
        expect(clientStatusInputFromRow({ is_active: null }).isActive).toBe(true)
    })
})
