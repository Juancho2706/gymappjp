import { describe, expect, it } from 'vitest'
import { effectivePeriodEndIso, wholeDaysUntil } from './period-end'

describe('effectivePeriodEndIso — fin REAL de lo pagado', () => {
    it('MercadoPago: la columna ya es el instante del próximo cobro, se respeta', () => {
        expect(effectivePeriodEndIso('2026-09-26T15:14:07.123+00:00', 'mercadopago')).toBe('2026-09-26T15:14:07.123Z')
    })

    it('Flow (caso Movens/MDR 30-09): día 01-10 guardado como UTC ⇒ cobro 02-10 00:00 de Chile (UTC-3 en primavera)', () => {
        expect(effectivePeriodEndIso('2026-10-01T00:00:00+00:00', 'flow')).toBe('2026-10-02T03:00:00.000Z')
    })

    it('Flow en invierno (UTC-4): 04-07 ⇒ 05-07 04:00Z', () => {
        expect(effectivePeriodEndIso('2026-07-04T00:00:00+00:00', 'flow')).toBe('2026-07-05T04:00:00.000Z')
    })

    it('Flow cruzando fin de mes y de año', () => {
        expect(effectivePeriodEndIso('2026-12-31T00:00:00+00:00', 'flow')).toBe('2027-01-01T03:00:00.000Z')
    })

    it('Flow con hora ≠ 00:00Z no viene de Flow (p. ej. «Reactivar +30 días» del admin) ⇒ tal cual', () => {
        expect(effectivePeriodEndIso('2026-10-12T18:42:10.000Z', 'flow')).toBe('2026-10-12T18:42:10.000Z')
    })

    it('sin fecha o fecha inválida ⇒ null', () => {
        expect(effectivePeriodEndIso(null, 'flow')).toBeNull()
        expect(effectivePeriodEndIso(undefined, 'mercadopago')).toBeNull()
        expect(effectivePeriodEndIso('no-es-fecha', 'flow')).toBeNull()
    })
})

describe('wholeDaysUntil — misma regla que EXTRACT(day FROM end - now())', () => {
    const now = Date.parse('2026-09-30T21:00:00Z')

    it('trunca hacia cero en ambos sentidos', () => {
        expect(wholeDaysUntil('2026-10-02T03:00:00.000Z', now)).toBe(1) // 30 h
        expect(wholeDaysUntil('2026-09-30T23:00:00.000Z', now)).toBe(0) // 2 h
        expect(wholeDaysUntil('2026-09-29T19:00:00.000Z', now)).toBe(-1) // −26 h
    })
})
