/**
 * E6.3 — helpers PUROS de los agregadores de salud (ventanas de tiempo + normalizacion de sueño).
 * cardio-conectado fase 2 — normalizadores crudo→`HubWorkout` de ambos hubs.
 * No toca HealthKit / Health Connect (guardados tras el guard nativo).
 */
import { describe, expect, it } from 'vitest'
import {
  buildHubHrSeries,
  hcHrPoints,
  hkHrPoints,
  hoursBetween,
  lastNightWindow,
  nearestSleepOption,
  normalizeHcSession,
  normalizeHkWorkout,
  sleepHoursFromHkCategorySamples,
  sumSleepHours,
  todayWindow,
} from '../../apps/mobile/lib/health-aggregators-pure'

const SLEEP_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9]

describe('todayWindow', () => {
  it('arranca a las 00:00 locales de hoy y termina ahora', () => {
    const now = new Date(2026, 6, 22, 14, 30, 0) // 22-jul 14:30 local
    const { start, end } = todayWindow(now)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getDate()).toBe(22)
    expect(end.getTime()).toBe(now.getTime())
    expect(start.getTime()).toBeLessThan(end.getTime())
  })
})

describe('lastNightWindow', () => {
  it('va de ayer 18:00 a hoy 12:00 cuando ya pasó mediodía', () => {
    const now = new Date(2026, 6, 22, 15, 0, 0) // 22-jul 15:00
    const { start, end } = lastNightWindow(now)
    expect(start.getDate()).toBe(21)
    expect(start.getHours()).toBe(18)
    expect(end.getDate()).toBe(22)
    expect(end.getHours()).toBe(12)
  })

  it('si aún no es mediodía, el fin es "ahora" (no adelanta al futuro)', () => {
    const now = new Date(2026, 6, 22, 9, 15, 0) // 22-jul 09:15
    const { start, end } = lastNightWindow(now)
    expect(start.getDate()).toBe(21)
    expect(start.getHours()).toBe(18)
    expect(end.getTime()).toBe(now.getTime())
  })
})

describe('hoursBetween', () => {
  it('calcula horas entre dos instantes', () => {
    expect(hoursBetween('2026-07-22T00:00:00Z', '2026-07-22T07:30:00Z')).toBeCloseTo(7.5, 5)
  })
  it('rango invalido o negativo → 0', () => {
    expect(hoursBetween('2026-07-22T08:00:00Z', '2026-07-22T07:00:00Z')).toBe(0)
    expect(hoursBetween('no-fecha', '2026-07-22T07:00:00Z')).toBe(0)
  })
})

describe('sumSleepHours', () => {
  it('suma tramos de sueño y redondea a 0.1h', () => {
    const samples = [
      { start: '2026-07-21T23:00:00Z', end: '2026-07-22T03:00:00Z' }, // 4h
      { start: '2026-07-22T03:30:00Z', end: '2026-07-22T06:48:00Z' }, // 3.3h
    ]
    expect(sumSleepHours(samples)).toBe(7.3)
  })
  it('sin muestras → null', () => {
    expect(sumSleepHours([])).toBeNull()
  })
})

describe('nearestSleepOption', () => {
  it('cae al chip más cercano dentro de la tolerancia', () => {
    expect(nearestSleepOption(7.3, SLEEP_OPTIONS)).toBe(7.5)
    expect(nearestSleepOption(6.8, SLEEP_OPTIONS)).toBe(7)
    expect(nearestSleepOption(8, SLEEP_OPTIONS)).toBe(8)
  })

  it('null cuando el dato es raro o fuera de tolerancia (no inventa chip)', () => {
    expect(nearestSleepOption(3, SLEEP_OPTIONS)).toBeNull() // muy lejos del 6
    expect(nearestSleepOption(13, SLEEP_OPTIONS)).toBeNull() // muy lejos del 9
    expect(nearestSleepOption(null, SLEEP_OPTIONS)).toBeNull()
    expect(nearestSleepOption(0, SLEEP_OPTIONS)).toBeNull()
  })

  it('respeta una tolerancia custom', () => {
    // 6.4 está a 0.1 de 6.5 → dentro de tolerancia por defecto
    expect(nearestSleepOption(6.4, SLEEP_OPTIONS)).toBe(6.5)
    // con tolerancia 0.05, 6.4 queda fuera
    expect(nearestSleepOption(6.4, SLEEP_OPTIONS, 0.05)).toBeNull()
  })
})

describe('sleepHoursFromHkCategorySamples', () => {
  it('suma solo los tramos dormido (1/3/4/5) e ignora inBed y awake', () => {
    const samples = [
      { startDate: '2026-07-21T23:00:00Z', endDate: '2026-07-22T07:00:00Z', value: 0 }, // inBed → fuera
      { startDate: '2026-07-21T23:10:00Z', endDate: '2026-07-22T02:10:00Z', value: 3 }, // core 3h
      { startDate: '2026-07-22T02:10:00Z', endDate: '2026-07-22T03:40:00Z', value: 4 }, // deep 1.5h
      { startDate: '2026-07-22T03:40:00Z', endDate: '2026-07-22T04:10:00Z', value: 2 }, // awake → fuera
      { startDate: '2026-07-22T04:10:00Z', endDate: '2026-07-22T06:10:00Z', value: 5 }, // REM 2h
    ]
    expect(sleepHoursFromHkCategorySamples(samples)).toBe(6.5)
  })

  it('sin tramos dormido cae al total de las muestras (fuente que solo reporta inBed)', () => {
    const samples = [{ startDate: '2026-07-21T23:00:00Z', endDate: '2026-07-22T06:00:00Z', value: 0 }]
    expect(sleepHoursFromHkCategorySamples(samples)).toBe(7)
  })

  it('vacio o sin fechas → null (no inventa horas)', () => {
    expect(sleepHoursFromHkCategorySamples([])).toBeNull()
    expect(sleepHoursFromHkCategorySamples(null)).toBeNull()
    expect(sleepHoursFromHkCategorySamples([{ startDate: null, endDate: null, value: 1 }])).toBeNull()
  })
})

describe('buildHubHrSeries', () => {
  const START = Date.UTC(2026, 6, 22, 10, 0, 0)

  it('ordena, pasa a offsets en segundos y deriva avg/max de las muestras crudas', () => {
    const series = buildHubHrSeries(
      [
        { atMs: START + 60_000, bpm: 150 },
        { atMs: START, bpm: 120 },
        { atMs: START + 30_000, bpm: 180 },
      ],
      START,
    )
    expect(series.samples).toEqual([
      [0, 120],
      [30, 180],
      [60, 150],
    ])
    expect(series.avgHr).toBe(150)
    expect(series.maxHr).toBe(180)
  })

  it('descarta bpm no positivos / fechas basura y clampea offsets negativos a 0', () => {
    const series = buildHubHrSeries(
      [
        { atMs: START - 5_000, bpm: 100 }, // anterior al inicio reportado → offset 0
        { atMs: START + 10_000, bpm: 0 }, // bpm invalido → fuera
        { atMs: Number.NaN, bpm: 140 }, // fecha invalida → fuera
        { atMs: START + 20_000, bpm: 140 },
      ],
      START,
    )
    expect(series.samples).toEqual([
      [0, 100],
      [20, 140],
    ])
    expect(series.maxHr).toBe(140)
  })

  it('comprime al tope de puntos conservando el maximo real', () => {
    const points = Array.from({ length: 900 }, (_, i) => ({ atMs: START + i * 1000, bpm: i === 500 ? 199 : 130 }))
    const series = buildHubHrSeries(points, START, 360)
    expect(series.samples?.length).toBeLessThanOrEqual(360)
    // El max NO sale de la curva comprimida (ahi el pico se promedia), sale de las muestras crudas.
    expect(series.maxHr).toBe(199)
  })

  it('sin muestras usables → todo null', () => {
    expect(buildHubHrSeries([], START)).toEqual({ samples: null, avgHr: null, maxHr: null })
    expect(buildHubHrSeries(null, START)).toEqual({ samples: null, avgHr: null, maxHr: null })
  })
})

describe('hkHrPoints / hcHrPoints', () => {
  it('aplana muestras de HealthKit descartando las incompletas', () => {
    const points = hkHrPoints([
      { startDate: '2026-07-22T10:00:00Z', quantity: 132 },
      { startDate: null, quantity: 140 },
      { startDate: '2026-07-22T10:01:00Z', quantity: null },
      { startDate: '2026-07-22T10:02:00Z', quantity: 141 },
    ])
    expect(points).toEqual([
      { atMs: Date.parse('2026-07-22T10:00:00Z'), bpm: 132 },
      { atMs: Date.parse('2026-07-22T10:02:00Z'), bpm: 141 },
    ])
  })

  it('aplana la serie anidada de los records de Health Connect', () => {
    const points = hcHrPoints([
      { samples: [{ time: '2026-07-22T10:00:00Z', beatsPerMinute: 128 }] },
      { samples: [{ time: '2026-07-22T10:00:30Z', beatsPerMinute: 0 }] },
      { samples: null },
      { samples: [{ time: '2026-07-22T10:01:00Z', beatsPerMinute: 136 }] },
    ])
    expect(points).toEqual([
      { atMs: Date.parse('2026-07-22T10:00:00Z'), bpm: 128 },
      { atMs: Date.parse('2026-07-22T10:01:00Z'), bpm: 136 },
    ])
  })

  it('entrada nula → lista vacia', () => {
    expect(hkHrPoints(null)).toEqual([])
    expect(hcHrPoints(undefined)).toEqual([])
  })
})

describe('normalizeHkWorkout', () => {
  const START = new Date('2026-07-22T10:00:00Z')
  const END = new Date('2026-07-22T10:30:00Z')

  it('mapea el proxy de HealthKit a HubWorkout con la duracion que reporta el hub', () => {
    const hub = normalizeHkWorkout(
      {
        uuid: 'hk-uuid-1',
        startDate: START,
        endDate: END,
        duration: { quantity: 1500 }, // 25 min netos: hubo 5 min de pausa
        totalDistance: { quantity: 5200.4 },
        totalEnergyBurned: { quantity: 310.7 },
        activity: 'running',
        source: 'Apple Watch',
      },
      hkHrPoints([
        { startDate: '2026-07-22T10:00:00Z', quantity: 140 },
        { startDate: '2026-07-22T10:10:00Z', quantity: 160 },
      ]),
    )
    expect(hub).toEqual({
      id: 'hk-uuid-1',
      source: 'Apple Watch',
      activity: 'running',
      startMs: START.getTime(),
      endMs: END.getTime(),
      durationSec: 1500,
      distanceM: 5200.4,
      calories: 310.7,
      avgHr: 150,
      maxHr: 160,
      hrSamples: [
        [0, 140],
        [600, 160],
      ],
    })
  })

  it('sin duracion del hub cae al ancho de la ventana; ejes ausentes quedan null', () => {
    const hub = normalizeHkWorkout({ uuid: 'x', startDate: START, endDate: END })
    expect(hub?.durationSec).toBe(1800)
    expect(hub?.distanceM).toBeNull()
    expect(hub?.calories).toBeNull()
    expect(hub?.avgHr).toBeNull()
    expect(hub?.hrSamples).toBeNull()
    expect(hub?.source).toBeNull()
    expect(hub?.activity).toBeNull()
  })

  it('sin uuid arma un id derivado de la ventana (no lo inventa vacio)', () => {
    const hub = normalizeHkWorkout({ startDate: START, endDate: END })
    expect(hub?.id).toBe(`hk-${START.getTime()}-${END.getTime()}`)
  })

  it('rango degenerado o entrada nula → null', () => {
    expect(normalizeHkWorkout(null)).toBeNull()
    expect(normalizeHkWorkout({ startDate: END, endDate: START })).toBeNull()
    expect(normalizeHkWorkout({ startDate: START, endDate: START })).toBeNull()
    expect(normalizeHkWorkout({ startDate: 'no-fecha', endDate: END })).toBeNull()
  })

  it('distancia/calorias en 0 se leen como "no medido" (null), no como cero real', () => {
    const hub = normalizeHkWorkout({
      startDate: START,
      endDate: END,
      totalDistance: { quantity: 0 },
      totalEnergyBurned: { quantity: 0 },
    })
    expect(hub?.distanceM).toBeNull()
    expect(hub?.calories).toBeNull()
  })
})

describe('normalizeHcSession', () => {
  const START = '2026-07-22T10:00:00Z'
  const END = '2026-07-22T10:45:00Z'

  it('mapea la sesion de Health Connect con distancia/calorias agregadas aparte', () => {
    const hub = normalizeHcSession(
      {
        metadata: { id: 'hc-rec-9', dataOrigin: 'com.samsung.health' },
        startTime: START,
        endTime: END,
        activity: 'running',
        distanceM: 7400,
        calories: 480,
      },
      hcHrPoints([
        {
          samples: [
            { time: '2026-07-22T10:05:00Z', beatsPerMinute: 130 },
            { time: '2026-07-22T10:15:00Z', beatsPerMinute: 170 },
          ],
        },
      ]),
    )
    expect(hub).toEqual({
      id: 'hc-rec-9',
      source: 'com.samsung.health',
      activity: 'running',
      startMs: Date.parse(START),
      endMs: Date.parse(END),
      durationSec: 2700,
      distanceM: 7400,
      calories: 480,
      avgHr: 150,
      maxHr: 170,
      hrSamples: [
        [300, 130],
        [900, 170],
      ],
    })
  })

  it('sin metadata arma id derivado y source null', () => {
    const hub = normalizeHcSession({ startTime: START, endTime: END })
    expect(hub?.id).toBe(`hc-${Date.parse(START)}-${Date.parse(END)}`)
    expect(hub?.source).toBeNull()
    expect(hub?.distanceM).toBeNull()
    expect(hub?.calories).toBeNull()
    expect(hub?.maxHr).toBeNull()
  })

  it('rango degenerado o entrada nula → null', () => {
    expect(normalizeHcSession(null)).toBeNull()
    expect(normalizeHcSession({ startTime: END, endTime: START })).toBeNull()
    expect(normalizeHcSession({ startTime: null, endTime: END })).toBeNull()
  })
})
