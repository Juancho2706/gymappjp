import { describe, expect, it } from 'vitest'
import {
  buildDailyTonnageSeries,
  buildExerciseStrengthSeriesMap,
  detectVolumeImbalances,
  epleyOneRM,
  findWeeklyWeightPRs,
  mapDailyTonnageRpc,
  mapStrengthSeriesRpc,
  mapWeeklyWeightPRsRpc,
  maxOneRMIndex,
  selectStrengthCardsFromSeries,
  strengthTrendDeltaKg,
} from './strength'
import type { ExerciseStrengthSeries, WorkoutLogRow } from './types'

const log = (over: Partial<WorkoutLogRow>): WorkoutLogRow => ({
  exerciseId: 'ex1',
  exerciseName: 'Press banca',
  muscleGroup: 'pecho',
  weightKg: 100,
  reps: 10,
  loggedAt: '2026-01-05T10:00:00Z',
  ...over,
})

describe('epleyOneRM', () => {
  it('Epley = w*(1+reps/30)', () => {
    expect(epleyOneRM(100, 10)).toBeCloseTo(133.333, 3)
  })
  it('cero para inputs no positivos', () => {
    expect(epleyOneRM(0, 10)).toBe(0)
    expect(epleyOneRM(100, 0)).toBe(0)
  })
})

describe('buildExerciseStrengthSeriesMap (planos)', () => {
  it('mejor 1RM por dia + totalVolume acumulado', () => {
    const map = buildExerciseStrengthSeriesMap([
      log({ loggedAt: '2026-01-05T10:00:00Z', weightKg: 100, reps: 5 }),
      log({ loggedAt: '2026-01-05T18:00:00Z', weightKg: 110, reps: 5 }), // mismo dia, mejor
      log({ loggedAt: '2026-01-07T10:00:00Z', weightKg: 120, reps: 5 }),
    ])
    const s = map.get('ex1')!
    expect(s.series).toHaveLength(2)
    // dia 1: mejor 110x5 → 110*(1+5/30)=128.33 → 128.3
    expect(s.series[0]!.oneRm).toBeCloseTo(128.3, 1)
    expect(s.totalVolume).toBe(100 * 5 + 110 * 5 + 120 * 5)
  })
  it('descarta logs sin peso/reps/fecha', () => {
    const map = buildExerciseStrengthSeriesMap([
      log({ weightKg: null }),
      log({ reps: 0 }),
      log({ loggedAt: '' }),
    ])
    expect(map.size).toBe(0)
  })
})

describe('selectStrengthCardsFromSeries', () => {
  it('prioriza compuestos y luego volumen', () => {
    const mk = (name: string, vol: number): ExerciseStrengthSeries => ({
      exerciseId: name,
      exerciseName: name,
      muscleGroup: 'x',
      series: [{ dateKey: '2026-01-01', label: '01 ene', oneRm: 10, weightKg: 10, reps: 1 }],
      totalVolume: vol,
    })
    const out = selectStrengthCardsFromSeries([mk('Curl biceps', 9999), mk('Sentadilla', 100)], 4)
    expect(out[0]!.exerciseName).toBe('Sentadilla') // compuesto gana pese a menor volumen
  })
})

describe('strengthTrendDeltaKg / maxOneRMIndex', () => {
  const series = [
    { dateKey: 'a', label: 'a', oneRm: 100, weightKg: 0, reps: 0 },
    { dateKey: 'b', label: 'b', oneRm: 130, weightKg: 0, reps: 0 },
    { dateKey: 'c', label: 'c', oneRm: 120, weightKg: 0, reps: 0 },
  ]
  it('delta = ultimo - primero', () => {
    expect(strengthTrendDeltaKg(series)).toBe(20)
    expect(strengthTrendDeltaKg([series[0]!])).toBeNull()
  })
  it('indice del maximo 1RM', () => {
    expect(maxOneRMIndex(series)).toBe(1)
  })
})

describe('findWeeklyWeightPRs', () => {
  it('detecta mejora dentro de la semana vs antes', () => {
    const now = new Date('2026-01-08T12:00:00') // jueves
    const prs = findWeeklyWeightPRs(
      [
        log({ loggedAt: '2026-01-01T10:00:00', weightKg: 100, reps: 5 }), // antes (semana previa)
        log({ loggedAt: '2026-01-07T10:00:00', weightKg: 120, reps: 5 }), // en la semana (lunes 5 → ...)
      ],
      now
    )
    expect(prs).toHaveLength(1)
    expect(prs[0]!.newWeightKg).toBe(120)
    expect(prs[0]!.prevWeightKg).toBe(100)
    expect(prs[0]!.pctChange).toBeGreaterThan(0)
  })
})

describe('buildDailyTonnageSeries', () => {
  it('suma tonelaje por dia con media movil', () => {
    const out = buildDailyTonnageSeries([
      log({ loggedAt: '2026-01-05T10:00:00Z', weightKg: 100, reps: 10 }),
      log({ loggedAt: '2026-01-05T11:00:00Z', weightKg: 50, reps: 10 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.tonnage).toBe(1500)
    expect(out[0]!.movingAvg).toBe(1500)
  })
})

describe('detectVolumeImbalances', () => {
  it('alerta cuando ratio >= minRatio', () => {
    const out = detectVolumeImbalances([
      { muscleGroup: 'pecho', volume: 1000 },
      { muscleGroup: 'espalda', volume: 200 },
    ])
    expect(out).toEqual([{ stronger: 'pecho', weaker: 'espalda', ratio: 5 }])
  })
  it('sin alertas con < 2 grupos', () => {
    expect(detectVolumeImbalances([{ muscleGroup: 'pecho', volume: 1 }])).toEqual([])
  })
})

describe('RPC mappers', () => {
  it('mapStrengthSeriesRpc reconstruye el Map por exercise_id', () => {
    const map = mapStrengthSeriesRpc([
      { exercise_id: 'e1', name: 'Sentadilla', muscle_group: 'pierna', day: '2026-01-01', one_rm: 150.04, weight_kg: 130, reps_done: 5, total_volume: 3900 },
      { exercise_id: 'e1', name: 'Sentadilla', muscle_group: 'pierna', day: '2026-01-03', one_rm: 160, weight_kg: 140, reps_done: 5, total_volume: 3900 },
    ])
    const s = map.get('e1')!
    expect(s.series).toHaveLength(2)
    expect(s.series[0]!.oneRm).toBe(150) // redondeo a 1 decimal
    expect(s.totalVolume).toBe(3900)
  })
  it('mapWeeklyWeightPRsRpc ordena por 1RM nuevo DESC', () => {
    const out = mapWeeklyWeightPRsRpc([
      { exercise_id: 'a', name: 'A', muscle_group: 'x', week_weight: 1, week_reps: 1, week_1rm: 100, before_weight: 1, before_reps: 1, before_1rm: 90, pct_change: 11 },
      { exercise_id: 'b', name: 'B', muscle_group: 'x', week_weight: 1, week_reps: 1, week_1rm: 200, before_weight: 1, before_reps: 1, before_1rm: 150, pct_change: 33 },
    ])
    expect(out.map((r) => r.exerciseId)).toEqual(['b', 'a'])
  })
  it('mapDailyTonnageRpc respeta el orden y redondea', () => {
    const out = mapDailyTonnageRpc([{ day: '2026-01-01', tonnage: 1000.6, sessions: 2, moving_avg: 900.4 }])
    expect(out[0]).toMatchObject({ dateKey: '2026-01-01', tonnage: 1001, sessions: 2, movingAvg: 900 })
  })
})
