import { describe, expect, it } from 'vitest'
import {
  resolveDotState,
  resolveWeekWindow,
  summarizeWeek,
  type AdherenceWeekDay,
} from './AdherenceWeekDots'

function day(overrides: Partial<AdherenceWeekDay> & { date: string }): AdherenceWeekDay {
  return {
    entryCount: 1,
    consumedCalories: 0,
    targetCalories: null,
    ...overrides,
  }
}

describe('summarizeWeek', () => {
  it('cuenta solo dias con registro', () => {
    const days = [
      day({ date: '2026-08-01', entryCount: 3, consumedCalories: 1900, targetCalories: 2000 }),
      day({ date: '2026-08-02', entryCount: 0, consumedCalories: 0, targetCalories: 2000 }),
    ]
    expect(summarizeWeek(days)).toEqual({ registered: 1, inRange: 1, evaluable: 1 })
  })

  it('un dia sin meta cuenta como registrado pero NO es evaluable', () => {
    const days = [day({ date: '2026-08-01', entryCount: 2, consumedCalories: 1200, targetCalories: null })]
    expect(summarizeWeek(days)).toEqual({ registered: 1, inRange: 0, evaluable: 0 })
  })

  it('respeta la banda 90-110 % de resolveCoachDayAdherence', () => {
    const days = [
      // 95 % -> en meta
      day({ date: '2026-08-01', consumedCalories: 1900, targetCalories: 2000 }),
      // 110 % -> borde superior, en meta
      day({ date: '2026-08-02', consumedCalories: 2200, targetCalories: 2000 }),
      // 70 % -> evaluable pero fuera de meta
      day({ date: '2026-08-03', consumedCalories: 1400, targetCalories: 2000 }),
      // 140 % -> evaluable pero fuera de meta
      day({ date: '2026-08-04', consumedCalories: 2800, targetCalories: 2000 }),
    ]
    expect(summarizeWeek(days)).toEqual({ registered: 4, inRange: 2, evaluable: 4 })
  })

  it('meta <= 0 no es evaluable (no divide por cero)', () => {
    const days = [day({ date: '2026-08-01', consumedCalories: 1800, targetCalories: 0 })]
    expect(summarizeWeek(days)).toEqual({ registered: 1, inRange: 0, evaluable: 0 })
  })

  it('tolera null/undefined y arrays vacios', () => {
    expect(summarizeWeek(null)).toEqual({ registered: 0, inRange: 0, evaluable: 0 })
    expect(summarizeWeek(undefined)).toEqual({ registered: 0, inRange: 0, evaluable: 0 })
    expect(summarizeWeek([])).toEqual({ registered: 0, inRange: 0, evaluable: 0 })
  })
})

describe('resolveWeekWindow', () => {
  it('7 fechas consecutivas que terminan HOY', () => {
    expect(resolveWeekWindow('2026-08-05', [])).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
  })

  it('NO mueve la semana cuando el alumno simplemente no registro hoy', () => {
    const days = [day({ date: '2026-08-03' })]
    expect(resolveWeekWindow('2026-08-05', days).at(-1)).toBe('2026-08-05')
  })

  it('se ancla en los datos si la base (UTC) va un dia adelante del coach', () => {
    const days = [day({ date: '2026-08-06' })]
    const window = resolveWeekWindow('2026-08-05', days)
    expect(window.at(-1)).toBe('2026-08-06')
    // El dia mas viejo sigue estando en ventana: nada registrado se pierde.
    expect(window).toContain('2026-07-31')
  })

  it('fecha corrupta => sin ventana (no se inventa un calendario)', () => {
    expect(resolveWeekWindow('nope', [])).toEqual([])
  })
})

describe('resolveDotState', () => {
  it('sin dia o sin registros -> hueco', () => {
    expect(resolveDotState(undefined)).toBe('empty')
    expect(resolveDotState(day({ date: '2026-08-01', entryCount: 0 }))).toBe('empty')
  })

  it('en meta -> in-range', () => {
    expect(
      resolveDotState(day({ date: '2026-08-01', consumedCalories: 1900, targetCalories: 2000 })),
    ).toBe('in-range')
  })

  it('desvio moderado -> off-range', () => {
    expect(
      resolveDotState(day({ date: '2026-08-01', consumedCalories: 1400, targetCalories: 2000 })),
    ).toBe('off-range')
  })

  it('registro sin meta evaluable -> logged (verde tenue)', () => {
    expect(
      resolveDotState(day({ date: '2026-08-01', consumedCalories: 1200, targetCalories: null })),
    ).toBe('logged')
  })

  it('consumo muy fuera de banda (tone neutral) tambien cae en logged', () => {
    expect(
      resolveDotState(day({ date: '2026-08-01', consumedCalories: 200, targetCalories: 2000 })),
    ).toBe('logged')
  })
})
