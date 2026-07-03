import { afterEach, describe, expect, it } from 'vitest'
import {
    dedupeWorkoutQueue,
    dequeueWorkoutLog,
    enqueueWorkoutLog,
    isLikelyOfflineError,
    pruneOrphanWorkoutLogs,
    readWorkoutOfflineQueue,
    readWorkoutOfflineQueueForPlan,
    workoutLogKey,
    writeWorkoutOfflineQueue,
    type WorkoutOfflineLog,
} from './workout-offline-queue'

const QUEUE_KEY = 'eva:workout-offline-queue'

function make(over: Partial<WorkoutOfflineLog> = {}): WorkoutOfflineLog {
    return {
        blockId: 'b1',
        setNumber: 1,
        weightKg: 20,
        repsDone: 10,
        rpe: null,
        rir: null,
        note: null,
        planId: 'p1',
        coachSlug: 'coach',
        timestamp: 1,
        ...over,
    }
}

describe('workout-offline-queue', () => {
    afterEach(() => {
        localStorage.removeItem(QUEUE_KEY)
    })

    describe('dedupeWorkoutQueue (pure)', () => {
        it('collapses repeats of the same (block,set) — last intention wins', () => {
            const q = [
                make({ weightKg: 35, timestamp: 1 }),
                make({ weightKg: 36, rpe: 7, rir: 4, note: 'hola', timestamp: 2 }),
                make({ weightKg: 56, timestamp: 3 }),
            ]
            const out = dedupeWorkoutQueue(q)
            expect(out).toHaveLength(1)
            expect(out[0].weightKg).toBe(56)
        })

        it('keeps distinct sets of the same block', () => {
            const out = dedupeWorkoutQueue([
                make({ setNumber: 1, weightKg: 35 }),
                make({ setNumber: 2, weightKg: 56 }),
                make({ setNumber: 3, weightKg: 36 }),
            ])
            expect(out).toHaveLength(3)
            expect(out.map((i) => i.setNumber)).toEqual([1, 2, 3])
        })

        it('keeps same set number across different blocks', () => {
            const out = dedupeWorkoutQueue([
                make({ blockId: 'a', setNumber: 1 }),
                make({ blockId: 'b', setNumber: 1 }),
            ])
            expect(out).toHaveLength(2)
        })

        it('places the surviving item at the position of its LAST occurrence', () => {
            const out = dedupeWorkoutQueue([
                make({ blockId: 'a', setNumber: 1, weightKg: 1 }),
                make({ blockId: 'b', setNumber: 1, weightKg: 2 }),
                make({ blockId: 'a', setNumber: 1, weightKg: 3 }),
            ])
            // 'a:1' last-wins (weight 3) and moves after 'b:1'
            expect(out.map((i) => `${i.blockId}:${i.weightKg}`)).toEqual(['b:2', 'a:3'])
        })
    })

    describe('pruneOrphanWorkoutLogs (pure)', () => {
        it('drops items whose block_id is not in the valid set', () => {
            const q = [make({ blockId: 'live' }), make({ blockId: 'dead' })]
            const { kept, dropped } = pruneOrphanWorkoutLogs(q, new Set(['live']))
            expect(kept.map((i) => i.blockId)).toEqual(['live'])
            expect(dropped.map((i) => i.blockId)).toEqual(['dead'])
        })

        it('accepts an array of valid ids', () => {
            const q = [make({ blockId: 'x' }), make({ blockId: 'y' })]
            const { kept } = pruneOrphanWorkoutLogs(q, ['x'])
            expect(kept.map((i) => i.blockId)).toEqual(['x'])
        })

        it('never prunes when the valid universe is empty (fail-safe)', () => {
            const q = [make({ blockId: 'x' })]
            const { kept, dropped } = pruneOrphanWorkoutLogs(q, [])
            expect(kept).toHaveLength(1)
            expect(dropped).toHaveLength(0)
        })
    })

    describe('enqueueWorkoutLog (localStorage, deduped)', () => {
        it('dedupes on enqueue by (block,set) last-wins', () => {
            enqueueWorkoutLog(make({ weightKg: 35 }))
            enqueueWorkoutLog(make({ weightKg: 36, rpe: 7 }))
            const q = readWorkoutOfflineQueue()
            expect(q).toHaveLength(1)
            expect(q[0].weightKg).toBe(36)
            expect(q[0].rpe).toBe(7)
        })

        it('does NOT stack a new item per re-submit (the forensic bug)', () => {
            enqueueWorkoutLog(make({ setNumber: 1, weightKg: 35 }))
            enqueueWorkoutLog(make({ setNumber: 1, weightKg: 36 }))
            enqueueWorkoutLog(make({ setNumber: 1, weightKg: 40 }))
            expect(readWorkoutOfflineQueue()).toHaveLength(1)
        })
    })

    describe('dequeueWorkoutLog', () => {
        it('removes a confirmed set (write-through)', () => {
            enqueueWorkoutLog(make({ setNumber: 1 }))
            enqueueWorkoutLog(make({ setNumber: 2 }))
            dequeueWorkoutLog('b1', 1)
            const q = readWorkoutOfflineQueue()
            expect(q).toHaveLength(1)
            expect(q[0].setNumber).toBe(2)
        })

        it('is a no-op for a set not in the queue', () => {
            enqueueWorkoutLog(make({ setNumber: 1 }))
            dequeueWorkoutLog('b1', 99)
            expect(readWorkoutOfflineQueue()).toHaveLength(1)
        })
    })

    describe('readWorkoutOfflineQueueForPlan', () => {
        it('filters by planId', () => {
            enqueueWorkoutLog(make({ planId: 'p1', setNumber: 1 }))
            enqueueWorkoutLog(make({ planId: 'p2', setNumber: 1, blockId: 'other' }))
            expect(readWorkoutOfflineQueueForPlan('p1')).toHaveLength(1)
            expect(readWorkoutOfflineQueueForPlan('p1')[0].planId).toBe('p1')
        })
    })

    describe('read resilience', () => {
        it('returns [] on corrupt localStorage', () => {
            localStorage.setItem(QUEUE_KEY, '{not json')
            expect(readWorkoutOfflineQueue()).toEqual([])
        })

        it('returns [] when stored value is not an array', () => {
            localStorage.setItem(QUEUE_KEY, '{"a":1}')
            expect(readWorkoutOfflineQueue()).toEqual([])
        })

        it('write then read roundtrip', () => {
            const item = make()
            writeWorkoutOfflineQueue([item])
            expect(readWorkoutOfflineQueue()).toEqual([item])
        })
    })

    describe('workoutLogKey', () => {
        it('builds the identity key (block:set)', () => {
            expect(workoutLogKey('abc', 3)).toBe('abc:3')
        })
    })

    describe('isLikelyOfflineError', () => {
        it('detects typical network errors', () => {
            expect(isLikelyOfflineError(new Error('Failed to fetch'))).toBe(true)
            expect(isLikelyOfflineError(new Error('NetworkError when'))).toBe(true)
            expect(isLikelyOfflineError(new Error('connection reset'))).toBe(true)
            expect(isLikelyOfflineError(new Error('The operation was aborted'))).toBe(true)
        })

        it('does not flag a plain validation-ish message', () => {
            expect(isLikelyOfflineError(new Error('El bloque ya no existe.'))).toBe(false)
        })

        it('treats navigator.onLine false as offline', () => {
            const orig = navigator.onLine
            Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
            expect(isLikelyOfflineError(new Error('anything'))).toBe(true)
            Object.defineProperty(navigator, 'onLine', { value: orig, configurable: true })
        })
    })
})
