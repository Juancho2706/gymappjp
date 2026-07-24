/**
 * E6.3 — helpers PUROS de los agregadores de salud (ventanas de tiempo + normalizacion de sueño).
 * No toca HealthKit / Health Connect (guardados tras el guard nativo).
 */
import { describe, expect, it } from 'vitest'
import {
  hoursBetween,
  lastNightWindow,
  nearestSleepOption,
  sumSleepHours,
  todayWindow,
} from '../../apps/mobile/lib/health-aggregators-pure'

const SLEEP_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9]

describe('todayWindow', () => {
  it('arranca a las 00:00 locales de hoy y termina ahora', () => {
    const now = new Date(2026, 6, 22, 14, 30, 0) // 22-jul 14:30 local
    const { start, end } = todayWindow(now)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getDate()).toBe(22)
    expect(end.getTime()).toBe(now.getTime())
    expect(start.getTime()).toBeLessThan(end.getTime())
  })
})

describe('lastNightWindow', () => {
  it('va de ayer 18:00 a hoy 12:00 cuando ya pasó mediodía', () => {
    const now = new Date(2026, 6, 22, 15, 0, 0) // 22-jul 15:00
    const { start, end } = lastNightWindow(now)
    expect(start.getDate()).toBe(21)
    expect(start.getHours()).toBe(18)
    expect(end.getDate()).toBe(22)
    expect(end.getHours()).toBe(12)
  })

  it('si aún no es mediodía, el fin es "ahora" (no adelanta al futuro)', () => {
    const now = new Date(2026, 6, 22, 9, 15, 0) // 22-jul 09:15
    const { start, end } = lastNightWindow(now)
    expect(start.getDate()).toBe(21)
    expect(start.getHours()).toBe(18)
    expect(end.getTime()).toBe(now.getTime())
  })
})

describe('hoursBetween', () => {
  it('calcula horas entre dos instantes', () => {
    expect(hoursBetween('2026-07-22T00:00:00Z', '2026-07-22T07:30:00Z')).toBeCloseTo(7.5, 5)
  })
  it('rango invalido o negativo → 0', () => {
    expect(hoursBetween('2026-07-22T08:00:00Z', '2026-07-22T07:00:00Z')).toBe(0)
    expect(hoursBetween('no-fecha', '2026-07-22T07:00:00Z')).toBe(0)
  })
})

describe('sumSleepHours', () => {
  it('suma tramos de sueño y redondea a 0.1h', () => {
    const samples = [
      { start: '2026-07-21T23:00:00Z', end: '2026-07-22T03:00:00Z' }, // 4h
      { start: '2026-07-22T03:30:00Z', end: '2026-07-22T06:48:00Z' }, // 3.3h
    ]
    expect(sumSleepHours(samples)).toBe(7.3)
  })
  it('sin muestras → null', () => {
    expect(sumSleepHours([])).toBeNull()
  })
})

describe('nearestSleepOption', () => {
  it('cae al chip más cercano dentro de la tolerancia', () => {
    expect(nearestSleepOption(7.3, SLEEP_OPTIONS)).toBe(7.5)
    expect(nearestSleepOption(6.8, SLEEP_OPTIONS)).toBe(7)
    expect(nearestSleepOption(8, SLEEP_OPTIONS)).toBe(8)
  })

  it('null cuando el dato es raro o fuera de tolerancia (no inventa chip)', () => {
    expect(nearestSleepOption(3, SLEEP_OPTIONS)).toBeNull() // muy lejos del 6
    expect(nearestSleepOption(13, SLEEP_OPTIONS)).toBeNull() // muy lejos del 9
    expect(nearestSleepOption(null, SLEEP_OPTIONS)).toBeNull()
    expect(nearestSleepOption(0, SLEEP_OPTIONS)).toBeNull()
  })

  it('respeta una tolerancia custom', () => {
    // 6.4 está a 0.1 de 6.5 → dentro de tolerancia por defecto
    expect(nearestSleepOption(6.4, SLEEP_OPTIONS)).toBe(6.5)
    // con tolerancia 0.05, 6.4 queda fuera
    expect(nearestSleepOption(6.4, SLEEP_OPTIONS, 0.05)).toBeNull()
  })
})
