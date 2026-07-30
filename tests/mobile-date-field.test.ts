// QA2-B5 — logica pura del `DateField` RN (campo de fecha segmentado Día/Mes/Año que
// reemplaza el TextInput crudo "AAAA-MM-DD" del perfil cardio). Se testea la composicion
// del ISO, la validacion de calendario real (bisiestos incluidos), el tope "no futura" y
// el auto-avance entre casillas.
//
// `apps/mobile/lib/date-field.ts` es PURO (cero react-native), asi que se importa directo
// — no necesita el patron vi.doMock de los tests que tocan la cadena supabase/expo.
import { describe, expect, it } from 'vitest'
import {
  DATE_FIELD_MESSAGES,
  daysInMonth,
  datePartsToIso,
  isoToDateParts,
  localTodayIso,
  normalizeDateSegment,
  resolveDateParts,
  shouldAdvanceSegment,
} from '../apps/mobile/lib/date-field'

describe('isoToDateParts', () => {
  it('parte un ISO valido en segmentos sin cero a la izquierda', () => {
    expect(isoToDateParts('1991-07-09')).toEqual({ day: '9', month: '7', year: '1991' })
    expect(isoToDateParts('1996-12-31')).toEqual({ day: '31', month: '12', year: '1996' })
  })

  it('devuelve vacio para null, cadena vacia o formato ajeno', () => {
    for (const input of [null, undefined, '', '1991', '1991-7-9', '09/07/1991', 'hoy']) {
      expect(isoToDateParts(input)).toEqual({ day: '', month: '', year: '' })
    }
  })

  it('es ida y vuelta con datePartsToIso', () => {
    const iso = '1991-07-09'
    expect(datePartsToIso(isoToDateParts(iso), { maxIso: '2026-07-29' })).toBe(iso)
  })
})

describe('daysInMonth', () => {
  it('resuelve los meses fijos', () => {
    expect(daysInMonth(1, 2025)).toBe(31)
    expect(daysInMonth(4, 2025)).toBe(30)
    expect(daysInMonth(12, 2025)).toBe(31)
  })

  it('aplica la regla completa de bisiesto en febrero', () => {
    expect(daysInMonth(2, 2023)).toBe(28)
    expect(daysInMonth(2, 2024)).toBe(29) // divisible por 4
    expect(daysInMonth(2, 1900)).toBe(28) // siglo NO divisible por 400
    expect(daysInMonth(2, 2000)).toBe(29) // siglo divisible por 400
  })

  it('devuelve 0 para meses fuera de rango', () => {
    expect(daysInMonth(0, 2025)).toBe(0)
    expect(daysInMonth(13, 2025)).toBe(0)
  })
})

describe('resolveDateParts', () => {
  const opts = { maxIso: '2026-07-29' }

  it('vacio total = empty (sin error): el campo es opcional', () => {
    expect(resolveDateParts({ day: '', month: '', year: '' }, opts)).toEqual({ kind: 'empty' })
    expect(datePartsToIso({ day: '', month: '', year: '' }, opts)).toBeNull()
  })

  it('parcial = incomplete — reproduce el hallazgo del QA (solo "1991")', () => {
    const status = resolveDateParts({ day: '', month: '', year: '1991' }, opts)
    expect(status).toEqual({ kind: 'incomplete', message: DATE_FIELD_MESSAGES.incomplete })
    // Clave: NO se emite ISO parcial hacia el backend.
    expect(datePartsToIso({ day: '', month: '', year: '1991' }, opts)).toBeNull()
  })

  it('compone el ISO con padding a partir de segmentos sin padding', () => {
    expect(resolveDateParts({ day: '9', month: '7', year: '1991' }, opts)).toEqual({
      kind: 'valid',
      iso: '1991-07-09',
    })
  })

  it('rechaza mes y dia fuera de rango con mensajes distintos', () => {
    expect(resolveDateParts({ day: '10', month: '13', year: '1991' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.badMonth,
    })
    expect(resolveDateParts({ day: '32', month: '10', year: '1991' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.badDay,
    })
    expect(resolveDateParts({ day: '0', month: '10', year: '1991' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.badDay,
    })
  })

  it('rechaza fechas que no existen en el calendario', () => {
    expect(resolveDateParts({ day: '31', month: '2', year: '1991' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.noSuchDate,
    })
    expect(resolveDateParts({ day: '29', month: '2', year: '2023' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.noSuchDate,
    })
    // 2024 SI es bisiesto.
    expect(resolveDateParts({ day: '29', month: '2', year: '2024' }, opts)).toEqual({
      kind: 'valid',
      iso: '2024-02-29',
    })
  })

  it('exige año de 4 digitos y desde 1900', () => {
    expect(resolveDateParts({ day: '9', month: '7', year: '91' }, opts).kind).toBe('invalid')
    expect(resolveDateParts({ day: '9', month: '7', year: '91' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.badYear,
    })
    expect(resolveDateParts({ day: '9', month: '7', year: '1899' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.badYear,
    })
  })

  it('bloquea la fecha futura contra maxIso (inclusive)', () => {
    expect(resolveDateParts({ day: '30', month: '7', year: '2026' }, opts)).toEqual({
      kind: 'invalid',
      message: DATE_FIELD_MESSAGES.future,
    })
    // El propio maxIso es aceptable (tope inclusive).
    expect(resolveDateParts({ day: '29', month: '7', year: '2026' }, opts)).toEqual({
      kind: 'valid',
      iso: '2026-07-29',
    })
  })

  it('sin maxIso acepta fechas futuras (campos de vigencia)', () => {
    expect(resolveDateParts({ day: '30', month: '7', year: '2030' })).toEqual({
      kind: 'valid',
      iso: '2030-07-30',
    })
  })
})

describe('normalizeDateSegment', () => {
  it('deja solo digitos y recorta al largo del segmento', () => {
    expect(normalizeDateSegment('0a9-', 'day')).toBe('09')
    expect(normalizeDateSegment('123', 'month')).toBe('12')
    expect(normalizeDateSegment('19911', 'year')).toBe('1991')
    expect(normalizeDateSegment('AAAA', 'year')).toBe('')
  })
})

describe('shouldAdvanceSegment', () => {
  it('salta de dia cuando ya no puede crecer', () => {
    expect(shouldAdvanceSegment('day', '2')).toBe(false) // podria ser 25
    expect(shouldAdvanceSegment('day', '3')).toBe(false) // podria ser 31
    expect(shouldAdvanceSegment('day', '4')).toBe(true)
    expect(shouldAdvanceSegment('day', '09')).toBe(true)
  })

  it('salta de mes cuando ya no puede crecer', () => {
    expect(shouldAdvanceSegment('month', '1')).toBe(false) // podria ser 12
    expect(shouldAdvanceSegment('month', '2')).toBe(true)
    expect(shouldAdvanceSegment('month', '11')).toBe(true)
  })

  it('el año nunca auto-avanza (es el ultimo segmento)', () => {
    expect(shouldAdvanceSegment('year', '1991')).toBe(false)
  })

  it('segmento vacio no avanza', () => {
    expect(shouldAdvanceSegment('day', '')).toBe(false)
    expect(shouldAdvanceSegment('month', '')).toBe(false)
  })
})

describe('localTodayIso', () => {
  it('formatea con padding en la zona local del dispositivo', () => {
    expect(localTodayIso(new Date(2026, 6, 9))).toBe('2026-07-09')
    expect(localTodayIso(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
