import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  agendaSeverity,
  buildAgendaLabel,
  daysSince,
  programSeverity,
  SHORT_MONTHS_ES,
  shortDayMonthEs,
} from './agenda-label'

// N5 del tren «Señales honestas para el coach» (carril C). Tabla de casos de funciones puras, al
// estilo de top-alert.test.ts. Los strings son los del contrato del PLAN, letra por letra
// (comillas angulares « », punto medio · y «sept» para septiembre).

// Copia literal de la tabla de `apps/web/src/lib/date-utils.ts` (`const SHORT_MONTHS_ES`, ~:163).
// Allá es PRIVADA (no se exporta) y este tren no toca ese archivo, así que la paridad se guarda
// con esta copia: si alguien cambia la tabla de la web, este test queda rojo y obliga a mirar las
// dos. Es el mismo string que imprime el servidor y el fallback RN (R22).
const WEB_SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

afterEach(() => {
  vi.useRealTimers()
})

describe('agendaSeverity', () => {
  it('bordes 6/7/13/14', () => {
    expect(agendaSeverity(6)).toBe('none')
    expect(agendaSeverity(7)).toBe('warning')
    expect(agendaSeverity(13)).toBe('warning')
    expect(agendaSeverity(14)).toBe('danger')
  })
  it('sin dato ⇒ none (nunca pinta alarma por falta de fecha)', () => {
    expect(agendaSeverity(null)).toBe('none')
    expect(agendaSeverity(0)).toBe('none')
  })
})

describe('programSeverity', () => {
  it('bordes 0/3/4', () => {
    expect(programSeverity(0)).toBe('danger')
    expect(programSeverity(3)).toBe('warning')
    expect(programSeverity(4)).toBe('none')
  })
  it('programa vencido ⇒ danger', () => {
    expect(programSeverity(-1)).toBe('danger')
    expect(programSeverity(1)).toBe('warning')
  })
})

describe('daysSince', () => {
  it('cuenta días calendario entre dos YMD de Santiago', () => {
    expect(daysSince('2026-09-02', '2026-09-10')).toBe(8)
  })
  it('mismo día ⇒ 0 y ayer ⇒ 1 (día calendario, no ventana de 24 h)', () => {
    expect(daysSince('2026-09-10', '2026-09-10')).toBe(0)
    expect(daysSince('2026-09-09', '2026-09-10')).toBe(1)
  })
  it('sin fecha ⇒ null', () => {
    expect(daysSince(null, '2026-09-10')).toBeNull()
    expect(daysSince('', '2026-09-10')).toBeNull()
  })
  it('formato que no es YMD ⇒ null (no cuenta el día UTC de un instante en silencio)', () => {
    expect(daysSince('2026-09-02T23:30:00Z', '2026-09-10')).toBeNull()
    expect(daysSince('02-09-2026', '2026-09-10')).toBeNull()
    expect(daysSince('2026-09-02', 'hoy')).toBeNull()
  })
  it('cruza el cambio de hora de Chile y el fin de año sin perder ni ganar un día', () => {
    // El horario de verano de Santiago arranca el domingo 06-09-2026.
    expect(daysSince('2026-09-05', '2026-09-07')).toBe(2)
    expect(daysSince('2025-12-31', '2026-01-01')).toBe(1)
  })
  it('con el proceso en UTC dentro de la ventana 21:00–00:00 de Chile sigue dando 8, no 9', () => {
    // 2026-09-11T02:30:00Z = 23:30 del 10-09 en Santiago (UTC-3 en verano): el runtime ya está en
    // el día siguiente. La función solo mira los YMD que le pasan, así que el reloj no la mueve.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T02:30:00Z'))
    expect(daysSince('2026-09-02', '2026-09-10')).toBe(8)
    expect(agendaSeverity(daysSince('2026-09-02', '2026-09-10'))).toBe('warning')
  })
})

describe('shortDayMonthEs', () => {
  it('día sin cero a la izquierda y mes sin punto', () => {
    expect(shortDayMonthEs('2026-09-02')).toBe('2 sept')
    expect(shortDayMonthEs('2026-08-07')).toBe('7 ago')
    expect(shortDayMonthEs('2026-01-01')).toBe('1 ene')
    expect(shortDayMonthEs('2026-12-31')).toBe('31 dic')
  })
  it('entrada fuera de patrón vuelve tal cual', () => {
    expect(shortDayMonthEs('2026-13-01')).toBe('2026-13-01')
    expect(shortDayMonthEs('')).toBe('')
  })
})

describe('SHORT_MONTHS_ES', () => {
  it('12 entradas, septiembre = sept', () => {
    expect(SHORT_MONTHS_ES).toHaveLength(12)
    expect(SHORT_MONTHS_ES[8]).toBe('sept')
  })
  it('es idéntica entrada por entrada a la tabla de apps/web/src/lib/date-utils.ts', () => {
    expect(WEB_SHORT_MONTHS_ES).toHaveLength(12)
    for (let i = 0; i < WEB_SHORT_MONTHS_ES.length; i++) {
      expect(SHORT_MONTHS_ES[i]).toBe(WEB_SHORT_MONTHS_ES[i])
    }
  })
})

describe('buildAgendaLabel', () => {
  it('sin_ejercicio con fecha', () => {
    expect(buildAgendaLabel({ kind: 'sin_ejercicio', days: 8, dateText: '2 sept' })).toBe(
      'Sin entrenos desde el 2 sept · 8 d'
    )
  })
  it('sin_ejercicio sin fecha', () => {
    expect(buildAgendaLabel({ kind: 'sin_ejercicio', days: null, dateText: null })).toBe(
      'Todavía no registra entrenos'
    )
  })
  it('checkin_pendiente con fecha', () => {
    expect(buildAgendaLabel({ kind: 'checkin_pendiente', days: 34, dateText: '7 ago' })).toBe(
      'Sin check-in desde el 7 ago · 34 d'
    )
  })
  it('checkin_pendiente sin fecha', () => {
    expect(buildAgendaLabel({ kind: 'checkin_pendiente', days: null, dateText: null })).toBe(
      'Todavía no registra check-ins'
    )
  })
  it('programa_vence con daysLeft > 0', () => {
    expect(
      buildAgendaLabel({
        kind: 'programa_vence',
        days: null,
        dateText: null,
        programName: 'Fuerza 4 días',
        daysLeft: 2,
      })
    ).toBe('«Fuerza 4 días» vence en 2 d')
  })
  it('programa_vence con daysLeft === 0 ⇒ vence hoy', () => {
    expect(
      buildAgendaLabel({
        kind: 'programa_vence',
        days: null,
        dateText: null,
        programName: 'Fuerza 4 días',
        daysLeft: 0,
      })
    ).toBe('«Fuerza 4 días» vence hoy')
  })
  it('programa_vence con daysLeft < 0 ⇒ venció hace N d', () => {
    expect(
      buildAgendaLabel({
        kind: 'programa_vence',
        days: null,
        dateText: null,
        programName: 'Fuerza 4 días',
        daysLeft: -3,
      })
    ).toBe('«Fuerza 4 días» venció hace 3 d')
  })
  it('la fecha entra ya formateada por shortDayMonthEs (mismo string en servidor y fallback RN)', () => {
    const dateText = shortDayMonthEs('2026-09-02')
    const days = daysSince('2026-09-02', '2026-09-10')
    expect(buildAgendaLabel({ kind: 'sin_ejercicio', days, dateText })).toBe(
      'Sin entrenos desde el 2 sept · 8 d'
    )
  })
})
