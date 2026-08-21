import { describe, expect, it } from 'vitest'
import { buildLeadContactFilter, leadDedupSince, LEAD_DEDUP_WINDOW_DAYS } from './lead-dedup'

describe('buildLeadContactFilter', () => {
    it('busca por teléfono o correo', () => {
        expect(buildLeadContactFilter('+56 9 1234 5678', 'ana@example.com')).toBe(
            'phone.eq."+56 9 1234 5678",email.eq."ana@example.com"'
        )
    })

    it('sin correo filtra solo por teléfono', () => {
        expect(buildLeadContactFilter('+56 9 1234 5678')).toBe('phone.eq."+56 9 1234 5678"')
        expect(buildLeadContactFilter('+56 9 1234 5678', null)).toBe('phone.eq."+56 9 1234 5678"')
    })

    // El valor lo escribe un desconocido: una coma suelta partiría el `or` en dos condiciones.
    it('escapa comillas y backslashes de la entrada del usuario', () => {
        expect(buildLeadContactFilter('9 1234,5678')).toBe('phone.eq."9 1234,5678"')
        expect(buildLeadContactFilter('a"b\\c')).toBe('phone.eq."a\\"b\\\\c"')
    })
})

describe('leadDedupSince', () => {
    it('retrocede exactamente la ventana declarada', () => {
        const now = new Date('2026-08-21T03:00:00.000Z')
        expect(leadDedupSince(now)).toBe('2026-08-14T03:00:00.000Z')
        expect(LEAD_DEDUP_WINDOW_DAYS).toBe(7)
    })
})
