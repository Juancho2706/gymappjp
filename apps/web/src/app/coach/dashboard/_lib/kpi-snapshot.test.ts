import { describe, expect, it } from 'vitest'
import { averageAdherence, countUniqueClientDays, KPI_SNAPSHOT_LOOKBACK_DAYS, santiagoYmd, ymdMinusDays } from './kpi-snapshot'

/**
 * La aritmética del snapshot diario. Son cuatro funciones chicas, pero cada una decide si el delta
 * de «En riesgo» compara la fila correcta: un día corrido por el huso o un redondeo distinto al del
 * KPI vivo producen un delta falso que nadie puede auditar desde la UI.
 */

describe('santiagoYmd — el día es el calendario chileno, no el UTC del runtime', () => {
    it('medianoche pasada en UTC sigue siendo el día anterior en Santiago', () => {
        // Santiago va en UTC−4 el 1 de septiembre de 2026 (el cambio a UTC−3 es el 6 de septiembre):
        // las 03:00 UTC del 2 son las 23:00 del 1 en Chile.
        expect(santiagoYmd(new Date('2026-09-02T03:00:00.000Z'))).toBe('2026-09-01')
    })

    it('mediodía UTC del mismo día', () => {
        expect(santiagoYmd(new Date('2026-09-01T12:00:00.000Z'))).toBe('2026-09-01')
    })
})

describe('ymdMinusDays — resta de calendario, cruzando mes y año', () => {
    it('dentro del mismo mes vecino', () => {
        expect(ymdMinusDays('2026-09-01', 7)).toBe('2026-08-25')
    })

    it('cruza a febrero', () => {
        expect(ymdMinusDays('2026-03-03', 7)).toBe('2026-02-24')
    })

    it('cruza el año', () => {
        expect(ymdMinusDays('2027-01-03', 7)).toBe('2026-12-27')
    })

    it('la ventana del delta es de 7 dias', () => {
        expect(KPI_SNAPSHOT_LOOKBACK_DAYS).toBe(7)
    })
})

describe('countUniqueClientDays — una sesion es alumno + dia', () => {
    const dayKeyOf = (d: Date) => santiagoYmd(d)

    it('el mismo alumno dos veces el mismo dia cuenta una', () => {
        const logs = [
            { client_id: 'a', logged_at: '2026-09-01T12:00:00.000Z' },
            { client_id: 'a', logged_at: '2026-09-01T18:00:00.000Z' },
        ]
        expect(countUniqueClientDays(logs, dayKeyOf)).toBe(1)
    })

    it('dos alumnos el mismo dia cuentan dos', () => {
        const logs = [
            { client_id: 'a', logged_at: '2026-09-01T12:00:00.000Z' },
            { client_id: 'b', logged_at: '2026-09-01T13:00:00.000Z' },
        ]
        expect(countUniqueClientDays(logs, dayKeyOf)).toBe(2)
    })

    it('el mismo alumno en dos dias cuenta dos', () => {
        const logs = [
            { client_id: 'a', logged_at: '2026-09-01T12:00:00.000Z' },
            { client_id: 'a', logged_at: '2026-08-31T12:00:00.000Z' },
        ]
        expect(countUniqueClientDays(logs, dayKeyOf)).toBe(2)
    })

    it('sin logs, cero', () => {
        expect(countUniqueClientDays([], dayKeyOf)).toBe(0)
    })

    it('client_id null es una clave propia, no se pierde ni se funde con otro alumno', () => {
        const logs = [
            { client_id: null, logged_at: '2026-09-01T12:00:00.000Z' },
            { client_id: null, logged_at: '2026-09-01T15:00:00.000Z' },
            { client_id: 'a', logged_at: '2026-09-01T15:00:00.000Z' },
        ]
        expect(countUniqueClientDays(logs, dayKeyOf)).toBe(2)
    })
})

describe('averageAdherence — el mismo redondeo que avgAdherence del dashboard', () => {
    it('sin filas, cero (no NaN)', () => {
        expect(averageAdherence([])).toBe(0)
    })

    it('.5 va hacia arriba', () => {
        expect(averageAdherence([{ percentage: 50 }, { percentage: 51 }])).toBe(51)
    })

    it('promedio simple', () => {
        expect(averageAdherence([{ percentage: 40 }, { percentage: 80 }])).toBe(60)
    })
})
