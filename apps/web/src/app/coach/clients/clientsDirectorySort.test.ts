import { describe, expect, it } from 'vitest'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { sortClientsByKey, withDemoLast } from './clientsDirectorySort'

const pulse = (clientId: string, attentionScore: number): DirectoryPulseRow =>
    ({ clientId, attentionScore }) as DirectoryPulseRow

describe('withDemoLast (onboarding v2 F3.7)', () => {
    it('empuja al alumno de ejemplo al final y conserva el orden de los reales', () => {
        const rows = [
            { id: 'demo', is_demo: true },
            { id: 'a' },
            { id: 'b', is_demo: false },
        ]
        expect(withDemoLast(rows).map((r) => r.id)).toEqual(['a', 'b', 'demo'])
    })

    it('sin demo devuelve la MISMA referencia (no reordena ni copia por gusto)', () => {
        const rows = [
            { id: 'a', is_demo: false },
            { id: 'b', is_demo: false },
        ]
        expect(withDemoLast(rows)).toBe(rows)
    })

    it('acepta un predicado propio para filas ya proyectadas', () => {
        const rows = [{ id: 'demo', isDemo: true }, { id: 'a', isDemo: false }]
        expect(withDemoLast(rows, (r) => r.isDemo).map((r) => r.id)).toEqual(['a', 'demo'])
    })
})

describe('sortClientsByKey', () => {
    it('el demo queda último aunque su urgencia lo pondría primero', () => {
        const clients = [
            { id: 'demo', full_name: 'Matías', is_demo: true },
            { id: 'real', full_name: 'Sofía' },
        ]
        const pulses = { demo: pulse('demo', 99), real: pulse('real', 10) }

        const sorted = sortClientsByKey(clients, pulses, 'attention_score', 'desc')

        expect(sorted.map((c) => c.id)).toEqual(['real', 'demo'])
    })

    it('sin demo el orden por urgencia manda como siempre', () => {
        const clients = [
            { id: 'baja', full_name: 'Ana' },
            { id: 'alta', full_name: 'Beto' },
        ]
        const pulses = { baja: pulse('baja', 5), alta: pulse('alta', 80) }

        const sorted = sortClientsByKey(clients, pulses, 'attention_score', 'desc')

        expect(sorted.map((c) => c.id)).toEqual(['alta', 'baja'])
    })
})
