import { describe, expect, it } from 'vitest'
import {
  daysSinceSantiagoInstant,
  formatNutritionShortDate,
  getNutritionDayOfWeekFromIsoYmdInSantiago,
  getSantiagoIsoYmdForUtcInstant,
  getSantiagoUtcBoundsForDay,
  getSantiagoMonthPrefix,
  formatSantiagoMonthLabel,
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

describe('date-utils — getSantiagoMonthPrefix (bordes de mes en Santiago, independiente del host)', () => {
  it('invierno (UTC-4): 01-ago 02:00Z aún es JULIO en Santiago (jul-31 22:00)', () => {
    // 2026-08-01T02:00:00Z → 2026-07-31 22:00 en Santiago (UTC-4) → mes = julio.
    expect(getSantiagoMonthPrefix(new Date('2026-08-01T02:00:00.000Z'))).toBe('2026-07')
  })

  it('invierno (UTC-4): 01-ago 05:00Z ya es AGOSTO en Santiago (ago-01 01:00)', () => {
    // 2026-08-01T05:00:00Z → 2026-08-01 01:00 en Santiago (UTC-4) → mes = agosto.
    expect(getSantiagoMonthPrefix(new Date('2026-08-01T05:00:00.000Z'))).toBe('2026-08')
  })

  it('verano (UTC-3): 01-feb 02:00Z aún es ENERO en Santiago (ene-31 23:00)', () => {
    // 2026-02-01T02:00:00Z → 2026-01-31 23:00 en Santiago (UTC-3) → mes = enero.
    expect(getSantiagoMonthPrefix(new Date('2026-02-01T02:00:00.000Z'))).toBe('2026-01')
  })

  it('mediodía UTC del 15-jul cae en julio', () => {
    expect(getSantiagoMonthPrefix(new Date('2026-07-15T12:00:00.000Z'))).toBe('2026-07')
  })
})

describe('date-utils — daysSinceSantiagoInstant (banner check-in, off-by-one nocturno)', () => {
  it('cuenta el día calendario Santiago, no el prefijo UTC (invierno, UTC-4)', () => {
    // 2026-06-11T02:00Z = 2026-06-10 22:00 en Santiago → día de medición = 2026-06-10.
    // Naive UTC prefix ('2026-06-11') daría 0; el conteo correcto vs hoy 2026-06-11 es 1.
    expect(daysSinceSantiagoInstant('2026-06-11T02:00:00.000Z', '2026-06-11')).toBe(1)
  })

  it('mismo día en Santiago → 0', () => {
    expect(daysSinceSantiagoInstant('2026-06-10T15:00:00.000Z', '2026-06-10')).toBe(0)
  })

  it('cuenta como vencido (>7) un check-in de hace más de una semana', () => {
    // 2026-06-03 11:00 Santiago → hoy 2026-06-11 = 8 días.
    expect(daysSinceSantiagoInstant('2026-06-03T15:00:00.000Z', '2026-06-11')).toBe(8)
  })

  it('respeta el borde nocturno también en verano (UTC-3)', () => {
    // 2026-01-16T02:00Z = 2026-01-15 23:00 en Santiago → día = 2026-01-15; hoy 2026-01-16 = 1.
    expect(daysSinceSantiagoInstant('2026-01-16T02:00:00.000Z', '2026-01-16')).toBe(1)
  })
})

describe('date-utils — formatNutritionShortDate (fecha legible es-CL para el alumno)', () => {
  it('formato corto sin año cuando es el año en curso ("jue 16 jul")', () => {
    expect(formatNutritionShortDate('2026-07-16', { todayIso: '2026-07-20' })).toBe('jue 16 jul')
  })

  it('agrega el año solo cuando difiere del año en curso ("mié 1 ene 2025")', () => {
    expect(formatNutritionShortDate('2025-01-01', { todayIso: '2026-07-20' })).toBe('mié 1 ene 2025')
  })

  it('con relative devuelve Hoy / Ayer como palabra', () => {
    expect(formatNutritionShortDate('2026-07-20', { todayIso: '2026-07-20', relative: true })).toBe('Hoy')
    expect(formatNutritionShortDate('2026-07-19', { todayIso: '2026-07-20', relative: true })).toBe('Ayer')
  })

  it('sin relative no usa Hoy/Ayer aunque sea el día de hoy', () => {
    expect(formatNutritionShortDate('2026-07-20', { todayIso: '2026-07-20' })).toBe('lun 20 jul')
  })

  it('timezone-safe: 2026-03-01 no se corre al día anterior por zona', () => {
    expect(formatNutritionShortDate('2026-03-01', { todayIso: '2026-07-20' })).toBe('dom 1 mar')
  })

  it('string fuera de patrón se devuelve tal cual (defensivo)', () => {
    expect(formatNutritionShortDate('no-es-fecha')).toBe('no-es-fecha')
  })
})

describe('date-utils — formatSantiagoMonthLabel', () => {
  it('capitaliza el mes y agrega el año ("Julio 2026")', () => {
    expect(formatSantiagoMonthLabel(new Date('2026-07-15T12:00:00.000Z'))).toBe('Julio 2026')
  })

  it('respeta el borde de mes en Santiago (ago-01 02:00Z → Julio 2026)', () => {
    expect(formatSantiagoMonthLabel(new Date('2026-08-01T02:00:00.000Z'))).toBe('Julio 2026')
  })
})
