import { describe, expect, it } from 'vitest'
import { getSantiagoUtcBoundsForDay, getTodayInSantiago } from '../apps/mobile/lib/date-utils'

// Regresion de Sentry EVA-MOBILE-1 ("RangeError: Date value out of bounds" en
// getSantiagoUtcBoundsForDay → toISOString). Un isoDate invalido/undefined hacia NaN toda la
// aritmetica y `new Date(NaN).toISOString()` lanzaba. La funcion debe: (1) para fechas validas
// devolver la ventana [start,end) exacta del dia de Santiago en UTC, INDEPENDIENTE de la TZ del
// runtime; (2) para basura no lanzar NUNCA y caer a HOY en Santiago.
describe('getSantiagoUtcBoundsForDay', () => {
  it('mapea un dia de invierno CL (UTC-4) a [04:00Z, 04:00Z del dia siguiente)', () => {
    const { startIso, endIso } = getSantiagoUtcBoundsForDay('2026-07-10')
    expect(startIso).toBe('2026-07-10T04:00:00.000Z')
    expect(endIso).toBe('2026-07-11T04:00:00.000Z')
    // Ventana de exactamente 24h.
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(86_400_000)
  })

  it('mapea un dia de verano CL con DST (UTC-3) a [03:00Z, 03:00Z del dia siguiente)', () => {
    const { startIso, endIso } = getSantiagoUtcBoundsForDay('2026-01-15')
    expect(startIso).toBe('2026-01-15T03:00:00.000Z')
    expect(endIso).toBe('2026-01-16T03:00:00.000Z')
  })

  it('normaliza un timestamp completo tomando solo su parte YYYY-MM-DD', () => {
    expect(getSantiagoUtcBoundsForDay('2026-07-10T23:59:59.000Z')).toEqual(
      getSantiagoUtcBoundsForDay('2026-07-10'),
    )
  })

  // La guarda: ninguna de estas entradas debe lanzar; todas caen a HOY en Santiago.
  const garbage: Array<string | undefined | null> = [
    'NaN-NaN-NaN',
    'not-a-date',
    '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    null as any,
    '2026-13-99',
  ]
  it.each(garbage)('no lanza y cae a HOY con entrada invalida: %s', (bad) => {
    const today = getTodayInSantiago().iso
    const expected = getSantiagoUtcBoundsForDay(today)
    let result: ReturnType<typeof getSantiagoUtcBoundsForDay> | null = null
    expect(() => {
      result = getSantiagoUtcBoundsForDay(bad as string)
    }).not.toThrow()
    expect(result).toEqual(expected)
    // Y el resultado es siempre un par de ISO validos (toISOString no lanzo).
    expect(() => new Date(result!.startIso).toISOString()).not.toThrow()
  })
})
