import { describe, expect, it } from 'vitest'
import {
  buildEnterpriseProfileAnalyticsFallback,
  mapEnterpriseWorkoutLogs,
  type EnterpriseAnalyticsLogDbRow,
} from '../apps/mobile/lib/enterprise-profile-analytics'

const rows: EnterpriseAnalyticsLogDbRow[] = [
  {
    exercise_id: 'bench',
    exercise_name_at_log: 'Press antiguo',
    weight_kg: 80,
    reps_done: 5,
    logged_at: '2026-07-06T02:30:00.000Z', // 2026-07-05 en Santiago
    workout_blocks: null,
  },
  {
    exercise_id: 'bench',
    weight_kg: 90,
    reps_done: 5,
    logged_at: '2026-07-12T15:00:00.000Z',
    workout_blocks: {
      exercise_id: 'bench',
      exercises: { name: 'Press banca', muscle_group: 'Pecho' },
    },
  },
  {
    exercise_id: 'row',
    weight_kg: 50,
    reps_done: 10,
    logged_at: '2026-07-12T16:00:00.000Z',
    workout_blocks: {
      exercise_id: 'row',
      exercises: { name: 'Remo', muscle_group: 'Espalda' },
    },
  },
]

describe('enterprise profile analytics fallback', () => {
  it('normaliza cada instante a dia Santiago y resuelve snapshot huerfano', () => {
    const mapped = mapEnterpriseWorkoutLogs(rows, new Map([
      ['bench', { name: 'Press banca', muscleGroup: 'Pecho' }],
    ]))
    expect(mapped[0]).toMatchObject({
      exerciseId: 'bench',
      exerciseName: 'Press banca',
      muscleGroup: 'Pecho',
      loggedAt: '2026-07-05T12:00:00',
    })
  })

  it('reconstruye fuerza completa, volumen, tonelaje, PR semanal y actividad', () => {
    const fallback = buildEnterpriseProfileAnalyticsFallback(
      rows,
      [
        { logged_at: '2026-07-06T02:30:00.000Z' },
        { logged_at: '2026-07-12T15:00:00.000Z' },
        { logged_at: '2026-07-12T16:00:00.000Z' },
      ],
      '2026-07-12',
      new Map([['bench', { name: 'Press banca', muscleGroup: 'Pecho' }]]),
      new Date('2026-07-12T16:00:00.000Z'),
    )

    expect(fallback.personalRecords[0]).toMatchObject({ exerciseName: 'Press banca', maxWeightKg: 90 })
    expect(fallback.muscleVolume).toEqual([
      { muscleGroup: 'Pecho', volume: 850 },
      { muscleGroup: 'Espalda', volume: 500 },
    ])
    expect(fallback.strengthCards).toHaveLength(2)
    expect(fallback.strengthCards.find((card) => card.exerciseId === 'bench')?.series).toHaveLength(2)
    expect(fallback.tonnageSeries.at(-1)).toMatchObject({ dateKey: '2026-07-12', tonnage: 950 })
    expect(fallback.weeklyPRs[0]).toMatchObject({ exerciseId: 'bench', newWeightKg: 90, prevWeightKg: 80 })
    expect(fallback.workoutDates371).toEqual(['2026-07-05', '2026-07-12'])
    expect(fallback.workoutDayCounts30).toEqual([
      { day: '2026-07-12', sets: 2 },
      { day: '2026-07-05', sets: 1 },
    ])
    expect(fallback.lastWorkoutAt).toBe('2026-07-12T16:00:00.000Z')
    expect(fallback.hasTrained).toBe(true)
  })

  it('iguala bordes RPC: day-count incluye hoy-30 y volumen usa 30x24h exactas', () => {
    const now = new Date('2026-07-12T16:00:00.000Z')
    const fallback = buildEnterpriseProfileAnalyticsFallback(
      [
        {
          exercise_id: 'inside', exercise_name_at_log: 'Dentro', weight_kg: 10, reps_done: 10,
          logged_at: '2026-06-12T16:00:00.000Z', workout_blocks: null,
        },
        {
          exercise_id: 'outside', exercise_name_at_log: 'Fuera', weight_kg: 20, reps_done: 10,
          logged_at: '2026-06-12T15:59:59.999Z', workout_blocks: null,
        },
      ],
      [
        // En Santiago ambos instantes son 2026-06-12 = hoy-30; day-count incluye ambos.
        { logged_at: '2026-06-12T16:00:00.000Z' },
        { logged_at: '2026-06-12T15:59:59.999Z' },
      ],
      '2026-07-12',
      new Map([
        ['inside', { name: 'Dentro', muscleGroup: 'Pecho' }],
        ['outside', { name: 'Fuera', muscleGroup: 'Espalda' }],
      ]),
      now,
    )

    expect(fallback.workoutDayCounts30).toEqual([{ day: '2026-06-12', sets: 2 }])
    expect(fallback.muscleVolume).toEqual([{ muscleGroup: 'Pecho', volume: 100 }])
  })

  it('no fabrica datos con filas vacias', () => {
    expect(buildEnterpriseProfileAnalyticsFallback([], [], '2026-07-12')).toMatchObject({
      personalRecords: [],
      muscleVolume: [],
      strengthCards: [],
      tonnageSeries: [],
      weeklyPRs: [],
      workoutDates371: [],
      workoutDayCounts30: [],
      lastWorkoutAt: null,
      hasTrained: false,
    })
  })
})
