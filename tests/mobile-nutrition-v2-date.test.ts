// NUT-018: la fecha del dia del alumno se congelaba al montar (`useMemo(todayInSantiago, [])`).
// Estos casos fijan las funciones PURAS que ahora la resuelven: el dia local en America/Santiago y
// el delta hasta el proximo cambio de dia, ambos con reloj falso e incluyendo un salto DST.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NUTRITION_TZ,
  localDayIn,
  msUntilNextLocalDay,
  todayInSantiago,
} from '../apps/mobile/lib/nutrition-v2-date'

afterEach(() => {
  vi.useRealTimers()
})

/** Santiago es UTC-4 en verano austral (enero) y UTC-3 en invierno (julio). */
describe('localDayIn / todayInSantiago', () => {
  it('resuelve el dia local, no el del host ni el UTC', () => {
    // 2026-07-16T02:30Z = 2026-07-15 22:30 en Santiago (UTC-4 en invierno austral).
    vi.setSystemTime(new Date('2026-07-16T02:30:00.000Z'))
    expect(todayInSantiago()).toBe('2026-07-15')
    expect(localDayIn(NUTRITION_TZ)).toBe('2026-07-15')
  })

  it('cruza medianoche local: 23:59:59 -> 00:00:01 cambia de dia', () => {
    vi.setSystemTime(new Date('2026-07-16T03:59:59.000Z')) // 23:59:59 local
    expect(todayInSantiago()).toBe('2026-07-15')
    vi.setSystemTime(new Date('2026-07-16T04:00:01.000Z')) // 00:00:01 local
    expect(todayInSantiago()).toBe('2026-07-16')
  })

  it('sobrevive al salto DST (Santiago pasa a UTC-3 en septiembre)', () => {
    // 2026-01-15T02:30Z = 2026-01-14 23:30 local con horario de verano (UTC-3).
    vi.setSystemTime(new Date('2026-01-15T02:30:00.000Z'))
    expect(todayInSantiago()).toBe('2026-01-14')
    vi.setSystemTime(new Date('2026-01-15T03:30:00.000Z'))
    expect(todayInSantiago()).toBe('2026-01-15')
  })
})

describe('msUntilNextLocalDay', () => {
  it('a las 23:59:59 locales faltan ~1 s para el cambio de dia', () => {
    vi.setSystemTime(new Date('2026-07-16T03:59:59.000Z'))
    expect(msUntilNextLocalDay(NUTRITION_TZ)).toBeLessThanOrEqual(1000)
  })

  it('a las 00:00 locales falta casi un dia entero', () => {
    vi.setSystemTime(new Date('2026-07-16T04:00:00.000Z'))
    const ms = msUntilNextLocalDay(NUTRITION_TZ)
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('nunca devuelve un delta que degenere en un timer caliente', () => {
    vi.setSystemTime(new Date('2026-07-16T03:59:59.900Z'))
    expect(msUntilNextLocalDay(NUTRITION_TZ)).toBeGreaterThanOrEqual(1000)
  })
})
