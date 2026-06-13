import { describe, expect, it } from 'vitest'
import {
  getNutritionDayOfWeekFromIsoYmdInSantiago,
  getSantiagoIsoYmdForUtcInstant,
  getSantiagoUtcBoundsForDay,
  nutritionMealAppliesOnIsoYmdInSantiago,
} from './date-utils'

describe('date-utils — nutrition day_of_week (Santiago)', () => {
  it('maps 2026-04-27 to Monday (1) in America/Santiago', () => {
    expect(getNutritionDayOfWeekFromIsoYmdInSantiago('2026-04-27')).toBe(1)
  })

  it('treats null day_of_week as every day', () => {
    expect(nutritionMealAppliesOnIsoYmdInSantiago({}, '2026-04-28')).toBe(true)
    expect(nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: null }, '2026-04-28')).toBe(true)
  })

  it('restricts meal to matching weekday only', () => {
    const iso = '2026-04-27'
    const dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)
    expect(nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: dow }, iso)).toBe(true)
    expect(nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: dow === 1 ? 2 : 1 }, iso)).toBe(false)
  })

  it('maps 2026-04-28 to Tuesday (2) in America/Santiago', () => {
    expect(getNutritionDayOfWeekFromIsoYmdInSantiago('2026-04-28')).toBe(2)
    expect(nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: 2 }, '2026-04-28')).toBe(true)
    expect(nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: 2 }, '2026-04-27')).toBe(false)
  })
})

describe('date-utils — Santiago calendar day from UTC instant', () => {
  it('maps UTC midnight 2026-04-30 to local YMD in Santiago (not naive UTC prefix)', () => {
    const ymd = getSantiagoIsoYmdForUtcInstant('2026-04-30T00:00:00.000Z')
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ymd.length).toBe(10)
  })

  it('returns same YMD for noon local reference', () => {
    const ymd = getSantiagoIsoYmdForUtcInstant('2026-04-27T15:00:00.000Z')
    expect(ymd).toBeTruthy()
  })
})

describe('date-utils — getSantiagoUtcBoundsForDay (independiente de la TZ del host)', () => {
  // Estos valores son ABSOLUTOS: deben dar lo mismo corriendo en UTC (Vercel/CI)
  // que en un host en hora chilena (dev local). Regresión del bug 2026-06-10:
  // en host UTC-4 la ventana quedaba [00:00Z, 24:00Z) y los registros de
  // 20:00-24:00 hora local desaparecían del día.
  it('invierno (UTC-4): 2026-06-10 cubre [2026-06-10T04:00Z, 2026-06-11T04:00Z)', () => {
    const { startIso, endIso } = getSantiagoUtcBoundsForDay('2026-06-10')
    expect(startIso).toBe('2026-06-10T04:00:00.000Z')
    expect(endIso).toBe('2026-06-11T04:00:00.000Z')
  })

  it('verano (UTC-3): 2026-01-15 cubre [2026-01-15T03:00Z, 2026-01-16T03:00Z)', () => {
    const { startIso, endIso } = getSantiagoUtcBoundsForDay('2026-01-15')
    expect(startIso).toBe('2026-01-15T03:00:00.000Z')
    expect(endIso).toBe('2026-01-16T03:00:00.000Z')
  })

  it('un set de las 20:14 hora chilena cae DENTRO del día local', () => {
    const { startIso, endIso } = getSantiagoUtcBoundsForDay('2026-06-10')
    const lateSet = '2026-06-11T00:14:00.000Z' // 20:14 del 10-jun en Chile
    expect(lateSet >= startIso && lateSet < endIso).toBe(true)
  })
})
