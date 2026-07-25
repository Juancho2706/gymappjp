import { describe, expect, it } from 'vitest'

import { buildRepeatSeedMap, type RepeatSeedRow } from './repeat-seed'
import { sessionLogKey } from './session-logs.reconcile'

describe('buildRepeatSeedMap — indexado', () => {
    it('indexa por (block_id, set_number) con la misma clave que la cola', () => {
        const rows: RepeatSeedRow[] = [
            { block_id: 'b1', set_number: 1, weight_kg: 60, reps_done: 10 },
            { block_id: 'b1', set_number: 2, weight_kg: 62.5, reps_done: 8 },
            { block_id: 'b2', set_number: 1, weight_kg: 40, reps_done: 12 },
        ]
        const seed = buildRepeatSeedMap(rows)

        expect(seed.size).toBe(3)
        expect(seed.get(sessionLogKey('b1', 2))?.weightKg).toBe(62.5)
        expect(seed.get('b2:1')?.repsDone).toBe(12)
        expect(seed.get('b9:1')).toBeUndefined()
    })

    it('ante clave repetida gana la ultima fila', () => {
        const seed = buildRepeatSeedMap([
            { block_id: 'b1', set_number: 1, weight_kg: 60, reps_done: 10 },
            { block_id: 'b1', set_number: 1, weight_kg: 70, reps_done: 6 },
        ])

        expect(seed.size).toBe(1)
        expect(seed.get('b1:1')).toMatchObject({ weightKg: 70, repsDone: 6 })
    })

    it('array vacio devuelve un mapa vacio', () => {
        expect(buildRepeatSeedMap([]).size).toBe(0)
    })
})

describe('buildRepeatSeedMap — filas sin peso', () => {
    it('conserva la serie de peso corporal (sin kg pero con reps)', () => {
        const seed = buildRepeatSeedMap([{ block_id: 'b1', set_number: 1, weight_kg: null, reps_done: 15 }])

        expect(seed.get('b1:1')).toMatchObject({ weightKg: null, repsDone: 15 })
    })
})

describe('buildRepeatSeedMap — series sustituidas', () => {
    const rows: RepeatSeedRow[] = [
        { block_id: 'b1', set_number: 1, weight_kg: 60, reps_done: 10 },
        { block_id: 'b2', set_number: 1, weight_kg: 25, reps_done: 12, substituted_exercise_id: 'ex-otro' },
    ]

    it('las descarta por defecto (el peso de otra maquina engaña al alumno)', () => {
        const seed = buildRepeatSeedMap(rows)

        expect(seed.size).toBe(1)
        expect(seed.has('b2:1')).toBe(false)
    })

    it('las conserva con keepSubstituted', () => {
        const seed = buildRepeatSeedMap(rows, { keepSubstituted: true })

        expect(seed.size).toBe(2)
        expect(seed.get('b2:1')?.weightKg).toBe(25)
    })
})

describe('buildRepeatSeedMap — clamp de rir', () => {
    it('conserva el rir dentro de [0..10] y anula el resto', () => {
        const seed = buildRepeatSeedMap([
            { block_id: 'b1', set_number: 1, rir: 0 },
            { block_id: 'b1', set_number: 2, rir: 3 },
            { block_id: 'b1', set_number: 3, rir: 10 },
            { block_id: 'b1', set_number: 4, rir: -1 },
            { block_id: 'b1', set_number: 5, rir: 11 },
            { block_id: 'b1', set_number: 6, rir: Number.NaN },
            { block_id: 'b1', set_number: 7, rir: null },
        ])

        expect(seed.get('b1:1')?.rir).toBe(0)
        expect(seed.get('b1:2')?.rir).toBe(3)
        expect(seed.get('b1:3')?.rir).toBe(10)
        expect(seed.get('b1:4')?.rir).toBeNull()
        expect(seed.get('b1:5')?.rir).toBeNull()
        expect(seed.get('b1:6')?.rir).toBeNull()
        expect(seed.get('b1:7')?.rir).toBeNull()
    })

    it('rirMin corre el piso valido', () => {
        const seed = buildRepeatSeedMap([{ block_id: 'b1', set_number: 1, rir: 0 }], { rirMin: 1 })

        expect(seed.get('b1:1')?.rir).toBeNull()
    })
})

describe('buildRepeatSeedMap — filas tipadas', () => {
    it('conserva actual_* y metadata por lado', () => {
        const seed = buildRepeatSeedMap([
            {
                block_id: 'b1',
                set_number: 1,
                actual_duration_sec: 90,
                actual_distance_m: 1200,
                actual_hold_sec: 45,
                actual_avg_hr: 142,
                metadata: { left_sec: 20, right_sec: 25 },
            },
        ])

        expect(seed.get('b1:1')).toEqual({
            weightKg: null,
            repsDone: null,
            rpe: null,
            rir: null,
            actualDurationSec: 90,
            actualDistanceM: 1200,
            actualHoldSec: 45,
            actualAvgHr: 142,
            metadata: { left_sec: 20, right_sec: 25 },
        })
    })

    it('sin metadata siembra null', () => {
        const seed = buildRepeatSeedMap([{ block_id: 'b1', set_number: 1, reps_done: 5 }])

        expect(seed.get('b1:1')?.metadata).toBeNull()
    })
})
