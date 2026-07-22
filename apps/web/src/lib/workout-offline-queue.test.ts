import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    dedupeWorkoutQueue,
    dequeueWorkoutLog,
    enqueueWorkoutLog,
    flushWorkoutQueue,
    isLikelyOfflineError,
    pruneOrphanWorkoutLogs,
    readWorkoutOfflineQueue,
    readWorkoutOfflineQueueForPlan,
    workoutLogKey,
    workoutLogToFormData,
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

    // Resiliencia setItem (Safari private mode / quota llena): setItem LANZA (QuotaExceededError).
    // Antes del fix, la excepción propagaba desde enqueue y abortaba el handleSubmit ANTES de tocar
    // el server (write-through) → pérdida total silenciosa. Ahora se traga y se señaliza por retorno.
    describe('setItem que lanza (QuotaExceededError)', () => {
        const throwQuota = () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }

        it('enqueue devuelve true en el camino feliz (respaldó local)', () => {
            expect(enqueueWorkoutLog(make({ setNumber: 1 }))).toBe(true)
            expect(readWorkoutOfflineQueue()).toHaveLength(1)
        })

        it('enqueue devuelve false y NO propaga cuando setItem lanza', () => {
            const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwQuota)
            let ret: boolean | undefined
            expect(() => {
                ret = enqueueWorkoutLog(make({ setNumber: 1 }))
            }).not.toThrow()
            expect(ret).toBe(false)
            spy.mockRestore()
            // El respaldo no quedó, pero la app siguió viva (el server action es el camino real).
            expect(readWorkoutOfflineQueue()).toHaveLength(0)
        })

        it('dequeue no lanza cuando setItem lanza (best-effort)', () => {
            enqueueWorkoutLog(make({ setNumber: 1 }))
            const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwQuota)
            expect(() => dequeueWorkoutLog('b1', 1)).not.toThrow()
            spy.mockRestore()
        })

        it('write no lanza cuando setItem lanza (best-effort)', () => {
            const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwQuota)
            expect(() => writeWorkoutOfflineQueue([make({ setNumber: 2 })])).not.toThrow()
            spy.mockRestore()
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

    describe('workoutLogToFormData', () => {
        it('serializes the core fields the action expects', () => {
            const fd = workoutLogToFormData(make({ blockId: 'bX', setNumber: 3, weightKg: 42.5, repsDone: 8, rpe: 9, rir: 2, note: 'ok' }))
            expect(fd.get('block_id')).toBe('bX')
            expect(fd.get('set_number')).toBe('3')
            expect(fd.get('weight_kg')).toBe('42.5')
            expect(fd.get('reps_done')).toBe('8')
            expect(fd.get('rpe')).toBe('9')
            expect(fd.get('rir')).toBe('2')
            expect(fd.get('note')).toBe('ok')
        })

        it('omits null / empty fields (no key rather than empty string)', () => {
            const fd = workoutLogToFormData(make({ weightKg: null, repsDone: null, rpe: null, rir: null, note: '' }))
            expect(fd.has('weight_kg')).toBe(false)
            expect(fd.has('reps_done')).toBe(false)
            expect(fd.has('rpe')).toBe(false)
            expect(fd.has('note')).toBe(false)
        })

        // E1.6: la fecha de edición viaja EN el item — el flush global de reconexión no conoce el
        // contexto de página; sin esto, una edición de día pasado encolada offline insertaría en HOY.
        it('serializa target_date cuando el item es una edición de día pasado (y la omite si no)', () => {
            const conFecha = workoutLogToFormData(make({ targetDate: '2026-07-21' }))
            expect(conFecha.get('target_date')).toBe('2026-07-21')
            const sinFecha = workoutLogToFormData(make({}))
            expect(sinFecha.has('target_date')).toBe(false)
            const nula = workoutLogToFormData(make({ targetDate: null }))
            expect(nula.has('target_date')).toBe(false)
        })

        it('serializes the polymorphic (cardio/mobility) mirror keys', () => {
            const fd = workoutLogToFormData(make({ actualDurationSec: 600, actualDistanceM: 1200, actualHoldSec: 45, actualAvgHr: 150 }))
            expect(fd.get('actual_duration_sec')).toBe('600')
            expect(fd.get('actual_distance_m')).toBe('1200')
            expect(fd.get('actual_hold_sec')).toBe('45')
            expect(fd.get('actual_avg_hr')).toBe('150')
        })
    })

    describe('flushWorkoutQueue', () => {
        it('clears an already-saved orphan (last-wins re-send succeeds → out of queue)', async () => {
            // Simula el bug W6: la fila colapsó antes de reconciliar → el item quedó en cola aunque el
            // server ya lo guardó. El flush lo reenvía, el server responde success, y sale de la cola.
            enqueueWorkoutLog(make({ setNumber: 1 }))
            const sent: string[] = []
            const res = await flushWorkoutQueue(async (item) => {
                sent.push(workoutLogKey(item.blockId, item.setNumber))
                return { success: true }
            })
            expect(sent).toEqual(['b1:1'])
            expect(res.flushed).toBe(1)
            expect(res.remainingInScope).toBe(0)
            expect(readWorkoutOfflineQueue()).toHaveLength(0)
        })

        it('keeps items that fail with a transient error (stays for retry)', async () => {
            enqueueWorkoutLog(make({ setNumber: 1 }))
            const res = await flushWorkoutQueue(async () => ({ error: 'db down', code: 'db' }))
            expect(res.flushed).toBe(0)
            expect(res.remainingInScope).toBe(1)
            expect(readWorkoutOfflineQueue()).toHaveLength(1)
        })

        it('keeps items when send throws (network exception)', async () => {
            enqueueWorkoutLog(make({ setNumber: 1 }))
            const res = await flushWorkoutQueue(async () => {
                throw new Error('Failed to fetch')
            })
            expect(res.remainingInScope).toBe(1)
            expect(readWorkoutOfflineQueue()).toHaveLength(1)
        })

        it('discards orphaned blocks (invalid_block) without keeping them', async () => {
            enqueueWorkoutLog(make({ setNumber: 1, blockId: 'dead' }))
            const res = await flushWorkoutQueue(async () => ({ error: 'gone', code: 'invalid_block' }))
            expect(res.discarded).toBe(1)
            expect(res.remainingInScope).toBe(0)
            expect(readWorkoutOfflineQueue()).toHaveLength(0)
        })

        it('scopes sending to a planId and preserves other plans untouched', async () => {
            enqueueWorkoutLog(make({ planId: 'p1', setNumber: 1, blockId: 'a' }))
            enqueueWorkoutLog(make({ planId: 'p2', setNumber: 1, blockId: 'b' }))
            const sent: string[] = []
            const res = await flushWorkoutQueue(
                async (item) => {
                    sent.push(item.planId)
                    return { success: true }
                },
                { planId: 'p1' },
            )
            expect(sent).toEqual(['p1'])
            expect(res.flushed).toBe(1)
            // p2 sigue en la cola (fuera de scope, intacto).
            const left = readWorkoutOfflineQueue()
            expect(left).toHaveLength(1)
            expect(left[0].planId).toBe('p2')
        })

        it('dedupes before sending (one network call per block/set, last intention)', async () => {
            enqueueWorkoutLog(make({ setNumber: 1, weightKg: 35 }))
            enqueueWorkoutLog(make({ setNumber: 1, weightKg: 40 }))
            const weights: (number | null)[] = []
            await flushWorkoutQueue(async (item) => {
                weights.push(item.weightKg)
                return { success: true }
            })
            expect(weights).toEqual([40])
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
