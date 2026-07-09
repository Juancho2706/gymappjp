import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    sessionSnapshotKey,
    readSessionSnapshot,
    writeSessionSnapshot,
    clearSessionSnapshot,
    sweepOtherDaySnapshots,
} from './session-logs.snapshot'
import type { ReconciledSessionLog } from './session-logs.reconcile'

const PLAN = 'plan-abc'
const DAY = '2026-07-07'
const OTHER_DAY = '2026-07-06'

function row(blockId: string, setNumber: number, extra: Partial<ReconciledSessionLog> = {}): ReconciledSessionLog {
    return { block_id: blockId, set_number: setNumber, weight_kg: 100, reps_done: 5, rpe: 8, ...extra }
}

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('sessionSnapshotKey', () => {
    it('compone la clave con prefijo, plan y día', () => {
        expect(sessionSnapshotKey(PLAN, DAY)).toBe('eva:workout-snapshot:plan-abc:2026-07-07')
    })
})

describe('writeSessionSnapshot / readSessionSnapshot', () => {
    it('round-trip: persiste las filas confirmadas y las lee de vuelta', () => {
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1), row('b1', 2, { weight_kg: 80 })])
        const out = readSessionSnapshot(PLAN, DAY)
        expect(out).toHaveLength(2)
        expect(out[0]).toMatchObject({ block_id: 'b1', set_number: 1, weight_kg: 100 })
        expect(out[1]).toMatchObject({ block_id: 'b1', set_number: 2, weight_kg: 80 })
    })

    it('FILTRA las filas _pending (la cola offline es su fuente, no el snapshot)', () => {
        writeSessionSnapshot(PLAN, DAY, [
            row('b1', 1, { _pending: false }),
            row('b1', 2, { _pending: true }),
        ])
        const out = readSessionSnapshot(PLAN, DAY)
        expect(out).toHaveLength(1)
        expect(out[0].set_number).toBe(1)
    })

    it('descarta la marca _pending al serializar', () => {
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1, { _pending: false })])
        expect(readSessionSnapshot(PLAN, DAY)[0]).not.toHaveProperty('_pending')
    })

    it('conserva los ejes polimórficos + sustitución', () => {
        writeSessionSnapshot(PLAN, DAY, [
            row('b1', 1, {
                weight_kg: null,
                reps_done: null,
                actual_hold_sec: 45,
                substituted_exercise_id: 'ex-9',
                substituted_exercise_name: 'Prensa',
            }),
        ])
        expect(readSessionSnapshot(PLAN, DAY)[0]).toMatchObject({
            actual_hold_sec: 45,
            substituted_exercise_id: 'ex-9',
            substituted_exercise_name: 'Prensa',
        })
    })

    it('si TODAS son _pending borra la clave (no persiste snapshot vacío)', () => {
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1, { _pending: false })])
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1, { _pending: true })])
        expect(localStorage.getItem(sessionSnapshotKey(PLAN, DAY))).toBeNull()
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
    })

    it('devuelve [] ante ausencia y ante basura', () => {
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
        localStorage.setItem(sessionSnapshotKey(PLAN, DAY), 'no-json')
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
        localStorage.setItem(sessionSnapshotKey(PLAN, DAY), '{"a":1}')
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
    })

    it('write no propaga si setItem lanza (best-effort → false)', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded')
        })
        expect(writeSessionSnapshot(PLAN, DAY, [row('b1', 1)])).toBe(false)
    })

    it('read no propaga si getItem lanza (best-effort → [])', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
    })
})

describe('clearSessionSnapshot', () => {
    it('borra el snapshot del plan/día', () => {
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1)])
        clearSessionSnapshot(PLAN, DAY)
        expect(readSessionSnapshot(PLAN, DAY)).toEqual([])
    })

    it('no propaga si removeItem lanza', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('boom')
        })
        expect(() => clearSessionSnapshot(PLAN, DAY)).not.toThrow()
    })
})

describe('sweepOtherDaySnapshots', () => {
    it('borra snapshots de otros días y CONSERVA el del día actual', () => {
        writeSessionSnapshot(PLAN, DAY, [row('b1', 1)])
        writeSessionSnapshot(PLAN, OTHER_DAY, [row('b1', 1)])
        writeSessionSnapshot('otro-plan', OTHER_DAY, [row('b2', 1)])
        localStorage.setItem('eva:workout-touched:plan-abc', '1')

        sweepOtherDaySnapshots(DAY)

        expect(readSessionSnapshot(PLAN, DAY)).toHaveLength(1)
        expect(readSessionSnapshot(PLAN, OTHER_DAY)).toEqual([])
        expect(readSessionSnapshot('otro-plan', OTHER_DAY)).toEqual([])
        expect(localStorage.getItem('eva:workout-touched:plan-abc')).toBe('1')
    })

    it('conserva múltiples planes del MISMO día', () => {
        writeSessionSnapshot('p1', DAY, [row('b1', 1)])
        writeSessionSnapshot('p2', DAY, [row('b1', 1)])
        sweepOtherDaySnapshots(DAY)
        expect(readSessionSnapshot('p1', DAY)).toHaveLength(1)
        expect(readSessionSnapshot('p2', DAY)).toHaveLength(1)
    })

    it('no propaga si localStorage lanza', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('boom')
        })
        writeSessionSnapshot(PLAN, OTHER_DAY, [row('b1', 1)])
        expect(() => sweepOtherDaySnapshots(DAY)).not.toThrow()
    })
})
