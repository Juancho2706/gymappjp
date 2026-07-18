import { describe, expect, it } from 'vitest'
import {
  buildProfileActivityCalendar,
  checkInRegularityPercentAsOf,
  formatTrainingAgeLabel,
  longestActivityStreak,
} from './overview'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('buildProfileActivityCalendar + longestActivityStreak', () => {
  it('marca dias y calcula la racha mas larga', () => {
    const workoutDates = [isoDaysAgo(3), isoDaysAgo(2), isoDaysAgo(1)] // 3 consecutivos
    const cal = buildProfileActivityCalendar(workoutDates, [])
    const active = cal.filter((c) => c.count > 0)
    expect(active.length).toBe(3)
    expect(longestActivityStreak(cal)).toBe(3)
  })
  it('check-in suma 2 al conteo del dia', () => {
    const day = isoDaysAgo(1)
    const cal = buildProfileActivityCalendar([day], [day])
    const cell = cal.find((c) => c.date === day)!
    expect(cell.count).toBe(3)
  })
})

describe('formatTrainingAgeLabel', () => {
  it('reciente / dias / anios', () => {
    // `formatTrainingAgeLabel` usa `new Date()` interno → el conteo exacto de dias es sensible a la
    // hora del dia; se asertan las RAMAS (Reciente / "N días" / anios) sin fijar el numero exacto.
    expect(formatTrainingAgeLabel(null, isoDaysAgo(0))).toBe('Reciente')
    expect(formatTrainingAgeLabel(null, isoDaysAgo(5))).toMatch(/^\d+ días$/)
    expect(formatTrainingAgeLabel(isoDaysAgo(400), isoDaysAgo(1))).toMatch(/año/) // subscriptionStart (400d) tiene prioridad → anios
  })
  it('em dash sin base', () => {
    expect(formatTrainingAgeLabel(null, '')).toBe('—')
  })
})

describe('checkInRegularityPercentAsOf', () => {
  it('100% si el ultimo check-in es hoy', () => {
    const ref = new Date('2026-01-10T12:00:00Z')
    expect(checkInRegularityPercentAsOf(ref, [{ created_at: '2026-01-10T09:00:00Z' }])).toBe(100)
  })
  it('baja linealmente y 0 a los 7 dias', () => {
    const ref = new Date('2026-01-10T12:00:00Z')
    expect(checkInRegularityPercentAsOf(ref, [{ created_at: '2026-01-03T09:00:00Z' }])).toBe(0)
  })
  it('0 sin check-ins', () => {
    expect(checkInRegularityPercentAsOf(new Date(), [])).toBe(0)
  })
})
