import { describe, expect, it } from 'vitest'
import {
    clientStatusInputFromRow,
    getClientStatusMeta,
    FIRST_LOGIN_SIGNAL_CUTOVER,
    type ClientStatusInput,
} from './client-status'

const base: ClientStatusInput = {
    isArchived: false,
    isActive: true,
    firstLoginAt: null,
    createdAt: null,
    forcePasswordChange: false,
}

// Reloj fijo. Las fechas van SIN sufijo `Z` a propósito: así el runtime las lee como hora local y
// el test da lo mismo en la máquina del worker que en CI, sin depender de TZ.
const NOW = new Date('2026-08-26T12:00:00')

// Corte YA PASADO: simula el mundo posterior al deploy que empezó a escribir `first_login_at`.
const CUTOVER_PASADO = '2026-08-20T00:00:00'

describe('getClientStatusMeta · precedencia', () => {
    it('archivado gana sobre cualquier otro estado y conserva su copy', () => {
        const meta = getClientStatusMeta({
            ...base,
            isArchived: true,
            isActive: false,
            firstLoginAt: '2026-08-26T11:00:00',
            forcePasswordChange: true,
        })
        expect(meta.key).toBe('archived')
        expect(meta.label).toBe('Archivado')
        expect(meta.cls).toBe('bg-surface-sunken text-subtle')
    })

    it('pausado gana sobre el login y sobre el pendiente de clave', () => {
        const meta = getClientStatusMeta({
            ...base,
            isActive: false,
            firstLoginAt: '2026-08-26T11:00:00',
            forcePasswordChange: true,
        })
        expect(meta.key).toBe('paused')
        expect(meta.label).toBe('Pausado')
    })

    it('el login gana sobre el pendiente de clave (entró y abandonó esa pantalla)', () => {
        const meta = getClientStatusMeta(
            { ...base, firstLoginAt: '2026-08-26T11:57:00', forcePasswordChange: true },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.key).toBe('entered')
        expect(meta.label).toBe('Entró hace 3 min')
    })
})

describe('getClientStatusMeta · con first_login_at (el chip que dice «entró»)', () => {
    it('menos de 1 h: minutos enteros', () => {
        const meta = getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T11:17:00' }, NOW)
        expect(meta.key).toBe('entered')
        expect(meta.label).toBe('Entró hace 43 min')
    })

    it('recién entrado nunca dice «0 min» (mínimo 1)', () => {
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T12:00:00' }, NOW).label).toBe(
            'Entró hace 1 min'
        )
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T11:59:30' }, NOW).label).toBe(
            'Entró hace 1 min'
        )
    })

    it('más de 1 h pero el MISMO día calendario: «Entró hoy»', () => {
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T08:00:00' }, NOW).label).toBe(
            'Entró hoy'
        )
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T00:05:00' }, NOW).label).toBe(
            'Entró hoy'
        )
    })

    it('ayer es 1 d aunque hayan pasado menos de 24 h (día calendario, no ventana)', () => {
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-25T23:00:00' }, NOW).label).toBe(
            'Entró hace 1 d'
        )
    })

    it('varios días: «Entró hace N d»', () => {
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-08-24T10:00:00' }, NOW).label).toBe(
            'Entró hace 2 d'
        )
        expect(getClientStatusMeta({ ...base, firstLoginAt: '2026-07-27T10:00:00' }, NOW).label).toBe(
            'Entró hace 30 d'
        )
    })

    it('el chip «entró» usa el tono de éxito y se muestra en el roster (key propia, no «active»)', () => {
        const meta = getClientStatusMeta({ ...base, firstLoginAt: '2026-08-26T08:00:00' }, NOW)
        expect(meta.key).toBe('entered')
        // El gate de DirRowCard oculta SOLO `active`; `entered` lo atraviesa y se pinta.
        expect(meta.key).not.toBe('active')
        expect(meta.cls).toBe('bg-[var(--success-100)] text-[var(--success-700)]')
    })

    it('un timestamp basura no inventa un login: cae al fallback honesto', () => {
        const meta = getClientStatusMeta(
            { ...base, firstLoginAt: 'no-es-una-fecha', forcePasswordChange: true },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.key).toBe('pending_sync')
        expect(meta.label).not.toMatch(/^Entró/)
    })
})

describe('getClientStatusMeta · sin first_login_at (el corte decide qué se puede afirmar)', () => {
    it('fila NUEVA (creada después del corte) y sin login: «Todavía no entró»', () => {
        const meta = getClientStatusMeta(
            { ...base, createdAt: '2026-08-26T09:00:00', forcePasswordChange: true },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.label).toBe('Todavía no entró')
        // La key NO se renombra: el filtro `pending_sync` del directorio la espeja.
        expect(meta.key).toBe('pending_sync')
    })

    it('esa MISMA fila, con el corte todavía en el futuro, degrada al fallback W0 (no es un bug)', () => {
        const meta = getClientStatusMeta({
            ...base,
            createdAt: '2026-08-26T09:00:00',
            forcePasswordChange: true,
        })
        expect(meta.label).toBe('Todavía no cambió su clave')
        expect(meta.key).toBe('pending_sync')
    })

    it('fila VIEJA (anterior al corte) con force=true sigue diciendo «Todavía no cambió su clave»', () => {
        const meta = getClientStatusMeta(
            { ...base, createdAt: '2026-01-15T10:00:00', forcePasswordChange: true },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.label).toBe('Todavía no cambió su clave')
        // Pudo entrar sin dejar timestamp: jamás le afirmamos que no entró.
        expect(meta.label).not.toBe('Todavía no entró')
    })

    it('fila VIEJA con force=false es «Activo»', () => {
        const meta = getClientStatusMeta(
            { ...base, createdAt: '2026-01-15T10:00:00' },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.key).toBe('active')
        expect(meta.label).toBe('Activo')
    })

    it('sin createdAt tampoco se afirma la ausencia de login', () => {
        const meta = getClientStatusMeta(
            { ...base, createdAt: null, forcePasswordChange: true },
            NOW,
            CUTOVER_PASADO
        )
        expect(meta.label).toBe('Todavía no cambió su clave')
    })

    it('ningún fallback usa la abreviatura vieja «sync»', () => {
        expect(
            getClientStatusMeta({ ...base, forcePasswordChange: true }, NOW).label
        ).not.toMatch(/sync/i)
    })
})

describe('FIRST_LOGIN_SIGNAL_CUTOVER', () => {
    it('es un ISO parseable (el jefe de la ola la fija al ISO del deploy web)', () => {
        expect(Number.isNaN(new Date(FIRST_LOGIN_SIGNAL_CUTOVER).getTime())).toBe(false)
    })
})

describe('clientStatusInputFromRow', () => {
    it('trata la fila sin flags como alumno activo', () => {
        expect(clientStatusInputFromRow({})).toEqual({
            isArchived: false,
            isActive: true,
            firstLoginAt: null,
            createdAt: null,
            forcePasswordChange: false,
        })
    })

    it('mapea los flags crudos del roster, incluidas las dos columnas de W1', () => {
        expect(
            clientStatusInputFromRow({
                is_archived: true,
                is_active: false,
                force_password_change: true,
                first_login_at: '2026-08-26T10:00:00.000Z',
                created_at: '2026-08-25T10:00:00.000Z',
            })
        ).toEqual({
            isArchived: true,
            isActive: false,
            firstLoginAt: '2026-08-26T10:00:00.000Z',
            createdAt: '2026-08-25T10:00:00.000Z',
            forcePasswordChange: true,
        })
    })

    it('is_active null NO significa pausado (el default de la fila es activo)', () => {
        expect(clientStatusInputFromRow({ is_active: null }).isActive).toBe(true)
    })
})
