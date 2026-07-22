import { describe, it, expect } from 'vitest'
import {
    applyOptimisticSessionLog,
    buildOptimisticSessionLog,
    type OptimisticLogPayload,
} from './session-logs.optimistic'
import type { ReconciledSessionLog } from './session-logs.reconcile'

function payload(extra: Partial<OptimisticLogPayload> = {}): OptimisticLogPayload {
    return { blockId: 'b1', setNumber: 1, weightKg: null, repsDone: null, rpe: null, rir: null, ...extra }
}

describe('buildOptimisticSessionLog', () => {
    it('preserva actual_hold_sec de una serie de HOLD (bug forense: peso/reps NULL, hold real)', () => {
        // "Plancha frontal con peso" / "Cat/Camel": strength/mobility con reps "45s" → sólo actual_hold_sec.
        const log = buildOptimisticSessionLog(payload({ actualHoldSec: 45 }))
        expect(log.actual_hold_sec).toBe(45)
        expect(log.weight_kg).toBeNull()
        expect(log.reps_done).toBeNull()
        expect(log.block_id).toBe('b1')
        expect(log.set_number).toBe(1)
    })

    it('preserva TODOS los ejes tipados (cardio: duración/distancia/FC)', () => {
        const log = buildOptimisticSessionLog(
            payload({ actualDurationSec: 1200, actualDistanceM: 5000, actualAvgHr: 148, rpe: 7 }),
        )
        expect(log.actual_duration_sec).toBe(1200)
        expect(log.actual_distance_m).toBe(5000)
        expect(log.actual_avg_hr).toBe(148)
        expect(log.rpe).toBe(7)
    })

    it('serie strength (sin ejes tipados) → actual_* quedan null, no undefined', () => {
        const log = buildOptimisticSessionLog(payload({ weightKg: 100, repsDone: 5, rpe: 8 }))
        expect(log.weight_kg).toBe(100)
        expect(log.reps_done).toBe(5)
        expect(log.actual_hold_sec).toBeNull()
        expect(log.actual_duration_sec).toBeNull()
        expect(log.actual_distance_m).toBeNull()
        expect(log.actual_avg_hr).toBeNull()
    })

    it('preserva metadata {left_sec, right_sec} de un hold POR LADO (bug forense E0.5)', () => {
        // Un optimismo sobre una serie per_side NO debe perder los segundos por lado: sin esto la fila
        // tipada per_side los perdería al confirmar (mismo bug que actual_hold_sec bilateral).
        const log = buildOptimisticSessionLog(payload({ actualHoldSec: 55, metadata: { left_sec: 30, right_sec: 25 } }))
        expect(log.metadata).toEqual({ left_sec: 30, right_sec: 25 })
        expect(log.actual_hold_sec).toBe(55)
    })

    it('serie sin metadata → metadata null, no undefined', () => {
        const log = buildOptimisticSessionLog(payload({ weightKg: 80, repsDone: 6 }))
        expect(log.metadata).toBeNull()
    })
})

describe('applyOptimisticSessionLog', () => {
    it('mete el log de hold preservando el eje → la fila tipada NO se ve vacía al confirmar', () => {
        const out = applyOptimisticSessionLog<ReconciledSessionLog>([], payload({ actualHoldSec: 45 }))
        expect(out).toHaveLength(1)
        expect(out[0].actual_hold_sec).toBe(45)
    })

    it('dedup por (block_id, set_number): re-confirmar la misma serie con OTRO hold pisa el anterior', () => {
        const first = applyOptimisticSessionLog<ReconciledSessionLog>([], payload({ setNumber: 2, actualHoldSec: 30 }))
        const second = applyOptimisticSessionLog(first, payload({ setNumber: 2, actualHoldSec: 45 }))
        expect(second).toHaveLength(1)
        expect(second[0].actual_hold_sec).toBe(45)
    })

    it('no toca otras series ya presentes (otro block/set coexiste)', () => {
        const prev: ReconciledSessionLog[] = [
            { block_id: 'b1', set_number: 1, weight_kg: 80, reps_done: 6, rpe: null, actual_hold_sec: null },
        ]
        const out = applyOptimisticSessionLog(prev, payload({ blockId: 'b2', setNumber: 1, actualHoldSec: 23 }))
        expect(out).toHaveLength(2)
        expect(out.find((l) => l.block_id === 'b1')?.weight_kg).toBe(80)
        expect(out.find((l) => l.block_id === 'b2')?.actual_hold_sec).toBe(23)
    })
})
