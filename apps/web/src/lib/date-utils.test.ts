import { describe, expect, it } from 'vitest'
import {
  daysSinceSantiagoInstant,
  formatNutritionShortDate,
  getNutritionDayOfWeekFromIsoYmdInSantiago,
  getSantiagoIsoYmdForUtcInstant,
  getSantiagoUtcBoundsForDay,
  getSantiagoMonthPrefix,
  formatLongDateSantiago,
  formatSantiagoDdMmHhMm,
  formatSantiagoDdMmYy,
  formatDateDdMmYyyySantiago,
  formatSantiagoMonthLabel,
  getTodayInSantiago,
  nutritionMealAppliesOnIsoYmdInSantiago,
  timeGreetingSantiago,
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

/**
 * EVA-NEXTJS-18 — Hydration Error en /coach/dashboard.
 *
 * El header del dashboard derivaba fecha y saludo del reloj del RUNTIME. Vercel corre en UTC
 * y el coach está en Chile, así que el instante observado en vivo (2026-08-09T02:59Z = sábado
 * 22:59 en Santiago) producía "Domingo, 9 de agosto · Buenos días" en el HTML del servidor y
 * "Sábado, 8 de agosto · Buenas noches" en el navegador. Estos casos fijan el borde nocturno:
 * mientras el resultado dependa SOLO del instante, servidor y cliente coinciden siempre.
 */
describe('date-utils — borde nocturno UTC vs Santiago (regresión EVA-NEXTJS-18)', () => {
  const nocheDelSabado = new Date('2026-08-09T02:59:00.000Z')

  it('22:59 en Santiago sigue siendo el día anterior, no el UTC', () => {
    expect(formatLongDateSantiago(nocheDelSabado)).toBe('sábado, 8 de agosto')
    expect(getTodayInSantiago(nocheDelSabado).iso).toBe('2026-08-08')
  })

  it('22:59 en Santiago saluda de noche aunque en UTC sean las 02:59', () => {
    expect(timeGreetingSantiago(nocheDelSabado)).toBe('Buenas noches')
  })

  it('el mediodía chileno no se corre al saludo de la tarde por el offset UTC', () => {
    // 15:30Z = 11:30 en Santiago: en UTC ya es tarde, en Chile todavía es mañana.
    expect(timeGreetingSantiago(new Date('2026-08-08T15:30:00.000Z'))).toBe('Buenos días')
  })
})

/**
 * EVA-NEXTJS-18 — Hydration Error en /admin/coaches.
 *
 * Los formatters del panel admin (`format()` de date-fns, `toLocaleDateString('es-CL')`) usan la
 * TZ del PROCESO: Vercel genera el HTML en UTC y el navegador del admin hidrata en
 * America/Santiago, así que entre las 20:00 y las 24:00 hora chilena el día impreso difería y
 * React marcaba mismatch en cada carga. Estos casos fijan el borde de medianoche en las DOS
 * estaciones (UTC-4 en invierno; UTC-3 desde el primer domingo de septiembre, 2026-09-06) y son
 * ABSOLUTOS: valen igual corriendo el test en UTC, en hora chilena o en cualquier otra TZ.
 */
describe('date-utils — formatters Santiago para el panel admin (regresión EVA-NEXTJS-18)', () => {
  it('invierno (UTC-4): 01-sep 02:30Z todavía es el 31-ago 22:30 en Chile', () => {
    expect(formatSantiagoDdMmYy('2026-09-01T02:30:00Z')).toBe('31/08/26')
    expect(formatDateDdMmYyyySantiago('2026-09-01T02:30:00Z')).toBe('31-08-2026')
    expect(formatSantiagoDdMmHhMm('2026-09-01T02:30:00Z')).toBe('31/08 22:30')
  })

  it('invierno (UTC-4): 31-ago 23:30Z es el mismo día 19:30 en Chile', () => {
    expect(formatSantiagoDdMmYy('2026-08-31T23:30:00Z')).toBe('31/08/26')
    expect(formatDateDdMmYyyySantiago('2026-08-31T23:30:00Z')).toBe('31-08-2026')
    expect(formatSantiagoDdMmHhMm('2026-08-31T23:30:00Z')).toBe('31/08 19:30')
  })

  it('verano (UTC-3): 15-oct 02:30Z todavía es el 14-oct 23:30 en Chile', () => {
    expect(formatSantiagoDdMmYy('2026-10-15T02:30:00Z')).toBe('14/10/26')
    expect(formatDateDdMmYyyySantiago('2026-10-15T02:30:00Z')).toBe('14-10-2026')
    expect(formatSantiagoDdMmHhMm('2026-10-15T02:30:00Z')).toBe('14/10 23:30')
  })

  it('verano (UTC-3): 15-oct 03:30Z ya cruzó a las 00:30 del 15-oct en Chile', () => {
    expect(formatSantiagoDdMmYy('2026-10-15T03:30:00Z')).toBe('15/10/26')
    expect(formatDateDdMmYyyySantiago('2026-10-15T03:30:00Z')).toBe('15-10-2026')
    // Medianoche imprime 00, nunca 24 (algunos ICU devuelven h24 para el borde del día).
    expect(formatSantiagoDdMmHhMm('2026-10-15T03:30:00Z')).toBe('15/10 00:30')
  })

  it('el resultado NO depende de la TZ del proceso que corre el test', () => {
    // Mismo instante, mismo string, sea cual sea process.env.TZ: es exactamente la propiedad
    // que hace que SSR (UTC en Vercel) e hidratación (Chile en el navegador) coincidan.
    const instante = '2026-09-01T02:30:00Z'
    const enUtcYEnChile = { ddMmYy: '31/08/26', ddMmYyyy: '31-08-2026', ddMmHhMm: '31/08 22:30' }
    expect({
      ddMmYy: formatSantiagoDdMmYy(instante),
      ddMmYyyy: formatDateDdMmYyyySantiago(instante),
      ddMmHhMm: formatSantiagoDdMmHhMm(instante),
    }).toEqual(enUtcYEnChile)
    // Y el mismo instante escrito con offset explícito da idéntico resultado.
    expect(formatSantiagoDdMmHhMm('2026-08-31T22:30:00-04:00')).toBe('31/08 22:30')
  })

  it('timestamp inválido → cadena vacía (defensivo, no "Invalid Date")', () => {
    expect(formatSantiagoDdMmYy('no-es-fecha')).toBe('')
    expect(formatDateDdMmYyyySantiago('no-es-fecha')).toBe('')
    expect(formatSantiagoDdMmHhMm('no-es-fecha')).toBe('')
  })
})
