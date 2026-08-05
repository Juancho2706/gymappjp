import { describe, expect, it } from 'vitest'
import {
  formatAdherenceWeekSummaryText,
  formatAdherenceWeekSummaryTitle,
  resolveDotState,
  resolveWeekWindow,
  summarizeWeek,
  toAdherenceWeekDays,
  type AdherenceWeekDay,
} from './adherence-week'

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

describe('formatAdherenceWeekSummary*', () => {
  it('texto con meta evaluable', () => {
    expect(formatAdherenceWeekSummaryText({ registered: 5, inRange: 3, evaluable: 4 })).toBe(
      '5/7 registrados · 3/4 en meta',
    )
  })

  it('texto sin ningun dia evaluable (no divide por cero ni inventa 0 %)', () => {
    expect(formatAdherenceWeekSummaryText({ registered: 2, inRange: 0, evaluable: 0 })).toBe(
      '2/7 registrados · sin meta evaluable',
    )
  })

  it('el tooltip lleva los numeros del alumno + la formula (una sola fuente de copy)', () => {
    const title = formatAdherenceWeekSummaryTitle({ registered: 5, inRange: 3, evaluable: 4 })
    expect(title).toContain('En meta 3 de 4 días registrados.')
    expect(title).toContain('90% y 110%')
    expect(title).toContain('75-90%')
  })
})

describe('toAdherenceWeekDays', () => {
  const history = [
    // Orden descendente, como llega `recentDays` del RPC.
    {
      localDate: '2026-08-04',
      activeEntryCount: 3,
      consumed: { calories: 2100, entryCount: 3 },
      targets: { calories: 2000 },
    },
    {
      localDate: '2026-08-03',
      activeEntryCount: 0,
      consumed: { calories: 0, entryCount: 0 },
      targets: { calories: 2000 },
    },
    {
      localDate: '2026-07-28',
      activeEntryCount: 2,
      consumed: { calories: 1900, entryCount: 2 },
      targets: { calories: 2000 },
    },
  ]

  it('mapea localDate/entryCount/consumo/meta y ordena ascendente', () => {
    expect(toAdherenceWeekDays({ historyDays: history })).toEqual([
      { date: '2026-07-28', entryCount: 2, consumedCalories: 1900, targetCalories: 2000 },
      { date: '2026-08-03', entryCount: 0, consumedCalories: 0, targetCalories: 2000 },
      { date: '2026-08-04', entryCount: 3, consumedCalories: 2100, targetCalories: 2000 },
    ])
  })

  it('recorta a la ventana pintada (la semana Lu-Do)', () => {
    const week = ['2026-08-03', '2026-08-04', '2026-08-05']
    expect(toAdherenceWeekDays({ historyDays: history, window: week }).map((d) => d.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
    ])
  })

  it('inyecta HOY, que nunca viaja en el historial', () => {
    const days = toAdherenceWeekDays({
      historyDays: history,
      window: ['2026-08-03', '2026-08-04', '2026-08-05'],
      today: {
        date: '2026-08-05',
        entryCount: 2,
        consumedCalories: 1850,
        targetCalories: 2000,
      },
    })
    expect(days.at(-1)).toEqual({
      date: '2026-08-05',
      entryCount: 2,
      consumedCalories: 1850,
      targetCalories: 2000,
    })
    expect(summarizeWeek(days)).toEqual({ registered: 2, inRange: 2, evaluable: 2 })
  })

  it('HOY pisa la fila del historial de esa fecha (el read del dia es el dato vivo)', () => {
    const days = toAdherenceWeekDays({
      historyDays: [
        {
          localDate: '2026-08-04',
          activeEntryCount: 1,
          consumed: { calories: 500, entryCount: 1 },
          targets: { calories: 2000 },
        },
      ],
      today: { date: '2026-08-04', entryCount: 4, consumedCalories: 2050, targetCalories: 2000 },
    })
    expect(days).toEqual([
      { date: '2026-08-04', entryCount: 4, consumedCalories: 2050, targetCalories: 2000 },
    ])
  })

  it('HOY fuera de la ventana (el coach mira una semana pasada) NO se inyecta', () => {
    const days = toAdherenceWeekDays({
      historyDays: history,
      window: ['2026-07-27', '2026-07-28'],
      today: { date: '2026-08-05', entryCount: 2, consumedCalories: 1850, targetCalories: 2000 },
    })
    expect(days.map((d) => d.date)).toEqual(['2026-07-28'])
  })

  it('primera fila gana ante fechas repetidas; campos ausentes degradan sin romper', () => {
    const days = toAdherenceWeekDays({
      historyDays: [
        { localDate: '2026-08-04', activeEntryCount: 3 },
        { localDate: '2026-08-04', activeEntryCount: 9, targets: { calories: 2000 } },
        { localDate: '  ' },
      ],
    })
    expect(days).toEqual([
      { date: '2026-08-04', entryCount: 3, consumedCalories: 0, targetCalories: null },
    ])
  })

  it('dia solo del sistema anterior (sin ingestas V2) queda sin registro', () => {
    const days = toAdherenceWeekDays({
      historyDays: [
        {
          localDate: '2026-08-04',
          activeEntryCount: 0,
          consumed: { calories: 0, entryCount: 0 },
          targets: { calories: 2000 },
        },
      ],
    })
    expect(resolveDotState(days[0])).toBe('empty')
    expect(summarizeWeek(days)).toEqual({ registered: 0, inRange: 0, evaluable: 0 })
  })

  it('sin datos devuelve lista vacia', () => {
    expect(toAdherenceWeekDays({})).toEqual([])
    expect(toAdherenceWeekDays({ historyDays: null, today: null })).toEqual([])
  })
})
