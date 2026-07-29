import { describe, expect, it } from 'vitest'
import {
  formatNutritionDayAndMonth,
  resolveCoachDayAdherence,
  resolveCoachWeekSelection,
} from './week-nav'

// Semana de referencia: lunes 2026-07-27 … domingo 2026-08-02. Hoy = miércoles 2026-07-29.
const LUNES = '2026-07-27'
const MIERCOLES = '2026-07-29'
const SABADO = '2026-08-01'
const DOMINGO = '2026-08-02'
const LUNES_ANTERIOR = '2026-07-20'

describe('resolveCoachWeekSelection', () => {
  it('sin ?date= muestra hoy y la semana en curso', () => {
    const selection = resolveCoachWeekSelection({ requestedDate: undefined, todayIso: MIERCOLES })

    expect(selection).toEqual({ selectedIso: MIERCOLES, weekStartIso: LUNES, isToday: true })
  })

  it('honra un día de la semana en curso, pasado o futuro', () => {
    expect(
      resolveCoachWeekSelection({ requestedDate: LUNES, todayIso: MIERCOLES }),
    ).toEqual({ selectedIso: LUNES, weekStartIso: LUNES, isToday: false })

    expect(
      resolveCoachWeekSelection({ requestedDate: SABADO, todayIso: MIERCOLES }),
    ).toEqual({ selectedIso: SABADO, weekStartIso: LUNES, isToday: false })
  })

  it('no deja pasar del domingo de la semana en curso', () => {
    expect(
      resolveCoachWeekSelection({ requestedDate: DOMINGO, todayIso: MIERCOLES }).selectedIso,
    ).toBe(DOMINGO)
    expect(
      resolveCoachWeekSelection({ requestedDate: '2026-08-03', todayIso: MIERCOLES }).selectedIso,
    ).toBe(MIERCOLES)
  })

  it('cae a hoy con una fecha inválida o inventada', () => {
    for (const requestedDate of ['', '   ', 'mañana', '2026-13-40', '2026-02-30', '29-07-2026']) {
      expect(resolveCoachWeekSelection({ requestedDate, todayIso: MIERCOLES }).selectedIso).toBe(
        MIERCOLES,
      )
    }
  })

  it('abre la semana anterior solo si el historial visible llega hasta ahí', () => {
    const conHistorial = resolveCoachWeekSelection({
      requestedDate: '2026-07-22',
      todayIso: MIERCOLES,
      historyDays: [{ localDate: '2026-07-28' }, { localDate: LUNES_ANTERIOR }],
    })
    expect(conHistorial).toEqual({
      selectedIso: '2026-07-22',
      weekStartIso: LUNES_ANTERIOR,
      isToday: false,
    })
  })

  it('respeta el recorte del gate Pro: sin esos días en el historial, la semana vieja no existe', () => {
    // `historyDays` llega YA recortado por `filterHistoryDaysToBaseWindow`; si el recorte se llevó
    // los días viejos, su semana deja de ser alcanzable por URL.
    const recortado = resolveCoachWeekSelection({
      requestedDate: '2026-07-22',
      todayIso: MIERCOLES,
      historyDays: [{ localDate: '2026-07-28' }],
    })
    expect(recortado).toEqual({ selectedIso: MIERCOLES, weekStartIso: LUNES, isToday: true })
  })

  it('tolera filas de historial rotas sin abrir la ventana', () => {
    const selection = resolveCoachWeekSelection({
      requestedDate: '2026-07-22',
      todayIso: MIERCOLES,
      historyDays: [{ localDate: 'sin fecha' }, null as unknown as { localDate: string }],
    })
    expect(selection.selectedIso).toBe(MIERCOLES)
  })
})

describe('resolveCoachDayAdherence', () => {
  it('sin registro o sin meta no hay indicador (null ≠ cero)', () => {
    expect(resolveCoachDayAdherence(null, 2000)).toBeNull()
    expect(resolveCoachDayAdherence(1800, null)).toBeNull()
    expect(resolveCoachDayAdherence(1800, 0)).toBeNull()
  })

  it('marca en rango el ±10 % de la meta', () => {
    expect(resolveCoachDayAdherence(1900, 2000)).toEqual({ percent: 95, tone: 'success' })
    expect(resolveCoachDayAdherence(2200, 2000)).toEqual({ percent: 110, tone: 'success' })
  })

  it('marca desvío moderado y nunca usa rojo', () => {
    expect(resolveCoachDayAdherence(1400, 2000)).toEqual({ percent: 70, tone: 'warning' })
    expect(resolveCoachDayAdherence(2500, 2000)).toEqual({ percent: 125, tone: 'warning' })
  })

  it('no topa el porcentaje: comer de más se ve', () => {
    expect(resolveCoachDayAdherence(2800, 2000)).toEqual({ percent: 140, tone: 'neutral' })
    expect(resolveCoachDayAdherence(200, 2000)).toEqual({ percent: 10, tone: 'neutral' })
  })
})

describe('formatNutritionDayAndMonth', () => {
  it('formatea día y mes sin correr la fecha por zona horaria', () => {
    expect(formatNutritionDayAndMonth(LUNES)).toBe('27 jul')
    expect(formatNutritionDayAndMonth('2026-01-01')).toBe('1 ene')
  })

  it('devuelve vacío con una fecha inválida en vez de mostrar el ISO crudo', () => {
    expect(formatNutritionDayAndMonth('2026-13-40')).toBe('')
  })
})
