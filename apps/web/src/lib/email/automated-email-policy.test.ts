import { describe, expect, it } from 'vitest'
import {
    AUTOMATED_EMAIL_WEEKLY_MAX,
    chileHour,
    evaluateAutomatedEmailQuota,
    isWithinAhaQuiet,
    isWithinCapSweepGrace,
    isWithinSendWindow,
} from './automated-email-policy'

/**
 * Regla compartida de los correos automáticos (plan «Correos y activación», 01-10): horario de Chile,
 * cupo de 1 cada 24 h y 3 por semana, y los dos frenos del barrido de cupo.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('horario de Chile (09:00–20:00, America/Santiago)', () => {
    // Verano (UTC−3) e invierno (UTC−4): la regla sigue la hora local, no un offset fijo.
    it('lee la hora local en verano y en invierno', () => {
        expect(chileHour(new Date('2026-12-10T12:00:00Z'))).toBe(9)
        expect(chileHour(new Date('2026-07-15T13:00:00Z'))).toBe(9)
    })

    it('09:00 entra y 08:59 no', () => {
        expect(isWithinSendWindow(new Date('2026-12-10T12:00:00Z'))).toBe(true)
        expect(isWithinSendWindow(new Date('2026-12-10T11:59:00Z'))).toBe(false)
    })

    it('19:59 entra y 20:00 ya no', () => {
        expect(isWithinSendWindow(new Date('2026-12-10T22:59:00Z'))).toBe(true)
        expect(isWithinSendWindow(new Date('2026-12-10T23:00:00Z'))).toBe(false)
    })

    it('de madrugada no sale nada', () => {
        expect(isWithinSendWindow(new Date('2026-12-11T06:00:00Z'))).toBe(false)
    })

    it('un reloj ilegible no deja salir nada (fail-closed)', () => {
        expect(isWithinSendWindow(new Date('no-es-una-fecha'))).toBe(false)
    })
})

describe('cupo compartido', () => {
    const NOW = new Date('2026-12-10T15:00:00Z')
    const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

    it('sin historial, sale', () => {
        expect(evaluateAutomatedEmailQuota([], NOW)).toBeNull()
    })

    it('uno de hace menos de 24 h frena (`gap_24h`)', () => {
        expect(evaluateAutomatedEmailQuota([ago(23 * HOUR)], NOW)).toBe('gap_24h')
    })

    it('a las 24 h exactas ya puede salir', () => {
        expect(evaluateAutomatedEmailQuota([ago(24 * HOUR)], NOW)).toBeNull()
    })

    it(`${AUTOMATED_EMAIL_WEEKLY_MAX} en la semana frenan (\`weekly_max\`); los de hace más de 7 días no cuentan`, () => {
        expect(evaluateAutomatedEmailQuota([ago(2 * DAY), ago(4 * DAY), ago(6 * DAY)], NOW)).toBe('weekly_max')
        expect(evaluateAutomatedEmailQuota([ago(2 * DAY), ago(4 * DAY), ago(8 * DAY)], NOW)).toBeNull()
    })

    it('un correo agendado a futuro cuenta como recién enviado', () => {
        expect(evaluateAutomatedEmailQuota([new Date(NOW.getTime() + HOUR).toISOString()], NOW)).toBe('gap_24h')
    })

    it('una fecha ilegible se ignora', () => {
        expect(evaluateAutomatedEmailQuota(['basura'], NOW)).toBeNull()
    })
})

describe('frenos del barrido de cupo', () => {
    const NOW = new Date('2026-12-10T15:00:00Z')
    const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

    it('72 h de silencio tras «Tu alumno ya está adentro»', () => {
        expect(isWithinAhaQuiet(ago(71 * HOUR), NOW)).toBe(true)
        expect(isWithinAhaQuiet(ago(72 * HOUR), NOW)).toBe(false)
        expect(isWithinAhaQuiet(null, NOW)).toBe(false)
    })

    it('la primera semana de la cuenta es de W6', () => {
        expect(isWithinCapSweepGrace(ago(6 * DAY), NOW)).toBe(true)
        expect(isWithinCapSweepGrace(ago(7 * DAY), NOW)).toBe(false)
        expect(isWithinCapSweepGrace(null, NOW)).toBe(false)
    })
})
