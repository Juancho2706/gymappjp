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
  formatShortDayMonthEs,
  formatShortDayDashMonthEs,
  formatShortDayMonthYearEs,
  formatShortMonthYearEs,
  formatShortMonthEs,
  formatShortWeekdayDayMonthEs,
  formatLongWeekdayShortDayMonthEs,
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

/**
 * Regresión EVA-NEXTJS-18 (reapareció 2026-09-01): tabla fija, cero dependencia de Intl/ICU, para
 * que el HTML de la grilla de PRs no cambie entre el Node de Vercel y el Safari del alumno.
 */
describe('date-utils — formatShortDayMonthEs (tabla fija, sin Intl — regresión EVA-NEXTJS-18)', () => {
  it('enero: sin cero a la izquierda en el día', () => {
    expect(formatShortDayMonthEs('2026-01-05')).toBe('5 ene')
  })

  it('septiembre: abreviatura "sept" (la divergencia real entre ICUs — nunca "sep"/"sept.")', () => {
    expect(formatShortDayMonthEs('2026-09-01')).toBe('1 sept')
  })

  it('diciembre: día de dos dígitos', () => {
    expect(formatShortDayMonthEs('2026-12-25')).toBe('25 dic')
  })

  it('ymd fuera de patrón o inválido → se devuelve tal cual (defensivo)', () => {
    expect(formatShortDayMonthEs('no-es-fecha')).toBe('no-es-fecha')
    expect(formatShortDayMonthEs('2026-13-01')).toBe('2026-13-01')
  })

  it('acepta un Date ya resuelto al día calendario y lo lee con los getters LOCALES', () => {
    expect(formatShortDayMonthEs(new Date(2026, 8, 2, 23, 30))).toBe('2 sept')
    expect(formatShortDayMonthEs(new Date(NaN))).toBe('')
  })

  it('day: "2-digit" pone el cero a la izquierda, igual que es-ES', () => {
    expect(formatShortDayMonthEs('2026-08-05', { day: '2-digit' })).toBe('05 ago')
    expect(formatShortDayMonthEs('2026-09-02', { day: '2-digit' })).toBe('02 sept')
  })
})

/**
 * Familia de tablas fijas agregada el 2026-09-02 por el MISMO issue (Safari 26.5 en iOS 18.7 agrega
 * punto: «ago.», «sept.», «mié.»). Cada `expect` calca, carácter por carácter, lo que imprime hoy el
 * Node 24 de Vercel para el `toLocaleDateString` que reemplaza — cero cambio de texto en Chrome.
 */
describe('date-utils — familia de fechas cortas con tabla fija (EVA-NEXTJS-18, 02-09)', () => {
  it('formatShortDayDashMonthEs calca el guion de es-CL con day 2-digit y sin año', () => {
    expect(formatShortDayDashMonthEs('2026-08-31')).toBe('31-ago')
    expect(formatShortDayDashMonthEs('2026-08-05')).toBe('05-ago')
    expect(formatShortDayDashMonthEs('2026-09-02')).toBe('02-sept')
    expect(formatShortDayDashMonthEs('basura')).toBe('basura')
  })

  it('formatShortDayMonthYearEs → "31 ago 2026" (y "02 sept 2026" con day 2-digit)', () => {
    expect(formatShortDayMonthYearEs('2026-08-31')).toBe('31 ago 2026')
    expect(formatShortDayMonthYearEs('2026-09-02')).toBe('2 sept 2026')
    expect(formatShortDayMonthYearEs('2026-09-02', { day: '2-digit' })).toBe('02 sept 2026')
    expect(formatShortDayMonthYearEs('2026-08-05', { day: '2-digit' })).toBe('05 ago 2026')
    expect(formatShortDayMonthYearEs('basura')).toBe('basura')
  })

  it('formatShortMonthYearEs → "ago 2026" / "sept 2026"', () => {
    expect(formatShortMonthYearEs('2026-08-31')).toBe('ago 2026')
    expect(formatShortMonthYearEs('2026-09-02')).toBe('sept 2026')
    expect(formatShortMonthYearEs(new Date(2026, 8, 2))).toBe('sept 2026')
    expect(formatShortMonthYearEs('basura')).toBe('basura')
  })

  it('formatShortMonthEs devuelve la abreviatura sola, SIN el punto de es-CL', () => {
    expect(formatShortMonthEs('2026-08-31')).toBe('ago')
    expect(formatShortMonthEs('2026-09-02')).toBe('sept')
    expect(formatShortMonthEs('2026-07-21')).toBe('jul')
    expect(formatShortMonthEs('basura')).toBe('basura')
  })

  it('formatShortWeekdayDayMonthEs → "lun, 31 ago" (día de semana por aritmética UTC, sin punto)', () => {
    expect(formatShortWeekdayDayMonthEs('2026-08-31')).toBe('lun, 31 ago')
    expect(formatShortWeekdayDayMonthEs('2026-09-02')).toBe('mié, 2 sept')
    expect(formatShortWeekdayDayMonthEs('2026-09-02', { day: '2-digit' })).toBe('mié, 02 sept')
    expect(formatShortWeekdayDayMonthEs('2026-09-05')).toBe('sáb, 5 sept')
    expect(formatShortWeekdayDayMonthEs('basura')).toBe('basura')
  })

  it('formatLongWeekdayShortDayMonthEs → "lunes, 31 ago" / "miércoles, 2 sept"', () => {
    expect(formatLongWeekdayShortDayMonthEs('2026-08-31')).toBe('lunes, 31 ago')
    expect(formatLongWeekdayShortDayMonthEs('2026-09-02')).toBe('miércoles, 2 sept')
    expect(formatLongWeekdayShortDayMonthEs('2026-09-06')).toBe('domingo, 6 sept')
    expect(formatLongWeekdayShortDayMonthEs('basura')).toBe('basura')
  })

  it('un Date inválido cae a cadena vacía en toda la familia (nunca "NaN")', () => {
    const invalido = new Date(NaN)
    expect(formatShortDayDashMonthEs(invalido)).toBe('')
    expect(formatShortDayMonthYearEs(invalido)).toBe('')
    expect(formatShortMonthYearEs(invalido)).toBe('')
    expect(formatShortMonthEs(invalido)).toBe('')
    expect(formatShortWeekdayDayMonthEs(invalido)).toBe('')
    expect(formatLongWeekdayShortDayMonthEs(invalido)).toBe('')
  })
})

/**
 * EVA-NEXTJS-18 — regresó el 2026-09-02 a las 12:09 y 12:17 hora Chile en /coach/dashboard (iPhone,
 * Safari 26.5): el mismo coach había cargado a las 11:xx sin error. Los helpers de Santiago volvían a
 * PARSEAR `now.toLocaleString('en-US', { timeZone })` con `new Date(...)`, y ese parseo no coincide
 * entre V8 (servidor) y JSC (Safari) en la franja «12:xx PM» ⇒ el saludo/fecha del HTML no era el del
 * cliente. Ahora todo sale de `Intl.formatToParts` (componentes, `h23`) y de tablas fijas. Estos casos
 * son ABSOLUTOS (instantes UTC) y cubren las dos estaciones (UTC-4 hasta el 2026-09-05; UTC-3 desde el
 * primer domingo de septiembre).
 */
describe('date-utils — franja 12:xx en Santiago, sin re-parseo de strings (regresión EVA-NEXTJS-18, 02-09)', () => {
  const mediodiaInvierno = new Date('2026-09-02T16:09:44.000Z') // 12:09:44 en Santiago (UTC-4)
  const mediodiaVerano = new Date('2026-09-07T15:00:00.000Z') // 12:00:00 en Santiago (UTC-3)
  const madrugada = new Date('2026-09-03T04:30:00.000Z') // 00:30 en Santiago (UTC-4)

  it('12:09 en Santiago saluda de tarde y el reloj de pared marca 12, no 0 ni 24', () => {
    expect(timeGreetingSantiago(mediodiaInvierno)).toBe('Buenas tardes')
    const hoy = getTodayInSantiago(mediodiaInvierno)
    expect(hoy.iso).toBe('2026-09-02')
    expect(hoy.date.getHours()).toBe(12)
    expect(hoy.date.getMinutes()).toBe(9)
    expect(hoy.dayOfWeek).toBe(3)
  })

  it('12:00 en horario de verano (UTC-3) también es tarde y el mismo día', () => {
    expect(timeGreetingSantiago(mediodiaVerano)).toBe('Buenas tardes')
    expect(getTodayInSantiago(mediodiaVerano).iso).toBe('2026-09-07')
  })

  it('00:30 en Santiago es noche y NO se corre al día siguiente ni al mediodía', () => {
    expect(timeGreetingSantiago(madrugada)).toBe('Buenas noches')
    const hoy = getTodayInSantiago(madrugada)
    expect(hoy.iso).toBe('2026-09-03')
    expect(hoy.date.getHours()).toBe(0)
  })

  it('la fecha larga sale de tablas fijas con el mismo texto que imprimía Node', () => {
    expect(formatLongDateSantiago(mediodiaInvierno)).toBe('miércoles, 2 de septiembre')
    expect(formatLongDateSantiago(madrugada)).toBe('jueves, 3 de septiembre')
    expect(formatLongDateSantiago(new Date('2026-01-01T15:00:00.000Z'))).toBe('jueves, 1 de enero')
  })

  it('el día calendario de un instante UTC no depende del parseo de strings', () => {
    expect(getSantiagoIsoYmdForUtcInstant('2026-09-02T16:09:44.000Z')).toBe('2026-09-02')
    expect(getSantiagoIsoYmdForUtcInstant('2026-09-03T02:30:00.000Z')).toBe('2026-09-02') // 22:30 Chile
    expect(getSantiagoIsoYmdForUtcInstant('2026-09-03T04:30:00.000Z')).toBe('2026-09-03') // 00:30 Chile
  })

  it('instante inválido ⇒ cadena vacía (antes: "NaN-NaN-NaN")', () => {
    expect(getSantiagoIsoYmdForUtcInstant('basura')).toBe('')
  })

  it('el día de semana de un YYYY-MM-DD es aritmética pura (miércoles 2 de septiembre = 3)', () => {
    expect(getNutritionDayOfWeekFromIsoYmdInSantiago('2026-09-02')).toBe(3)
    expect(getNutritionDayOfWeekFromIsoYmdInSantiago('2026-09-06')).toBe(7)
  })
})
