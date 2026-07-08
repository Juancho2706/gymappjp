import { describe, it, expect } from 'vitest'
import { reconcileSessionLogs, sessionLogKey, type ReconciledSessionLog } from './session-logs.reconcile'
import type { WorkoutOfflineLog } from '@/lib/workout-offline-queue'

/** Server log mínimo (los opcionales quedan sin setear como en el payload real del RSC). */
function serverLog(
    blockId: string,
    setNumber: number,
    extra: Partial<ReconciledSessionLog> = {},
): ReconciledSessionLog {
    return { block_id: blockId, set_number: setNumber, weight_kg: 100, reps_done: 5, rpe: 8, ...extra }
}

/** Item de cola mínimo (los polimórficos/sustitución quedan sin setear = legacy). */
function queued(blockId: string, setNumber: number, extra: Partial<WorkoutOfflineLog> = {}): WorkoutOfflineLog {
    return {
        blockId,
        setNumber,
        weightKg: 60,
        repsDone: 10,
        rpe: null,
        rir: null,
        planId: 'plan-1',
        coachSlug: 'coach',
        timestamp: 1,
        ...extra,
    }
}

describe('reconcileSessionLogs', () => {
    it('cola vacía → devuelve exactamente los logs del server (el caso del CEO: todo sincronizado)', () => {
        const server = [serverLog('b1', 1), serverLog('b1', 2), serverLog('b2', 1)]
        const out = reconcileSessionLogs(server, [])
        expect(out).toHaveLength(3)
        // cada uno marcado como NO pendiente (confirmado por el server)
        expect(out.every((l) => l._pending === false)).toBe(true)
        expect(out.map((l) => sessionLogKey(l.block_id, l.set_number)).sort()).toEqual(['b1:1', 'b1:2', 'b2:1'])
    })

    it('server vacío + cola → rellena huecos con las series encoladas marcadas _pending', () => {
        const out = reconcileSessionLogs([], [queued('b1', 1, { weightKg: 62.5, repsDone: 8 })])
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({
            block_id: 'b1',
            set_number: 1,
            weight_kg: 62.5,
            reps_done: 8,
            _pending: true,
        })
    })

    it('el server GANA por (block,set): un huérfano en cola no pisa la fila confirmada ni la marca pendiente', () => {
        const server = [serverLog('b1', 1, { weight_kg: 105, reps_done: 6 })]
        // mismo block/set en la cola con OTRO valor (huérfano ya guardado, no dequeueado)
        const out = reconcileSessionLogs(server, [queued('b1', 1, { weightKg: 999, repsDone: 99 })])
        expect(out).toHaveLength(1)
        expect(out[0].weight_kg).toBe(105) // valor del server, no el de la cola
        expect(out[0].reps_done).toBe(6)
        expect(out[0]._pending).toBe(false) // no se ve "sin sincronizar"
    })

    it('mezcla: server confirma unas y la cola aporta OTRAS (distintas) sin colisión', () => {
        const server = [serverLog('b1', 1), serverLog('b1', 2)]
        const q = [queued('b1', 3), queued('b2', 1)]
        const out = reconcileSessionLogs(server, q)
        const byKey = new Map(out.map((l) => [sessionLogKey(l.block_id, l.set_number), l]))
        expect(out).toHaveLength(4)
        expect(byKey.get('b1:1')?._pending).toBe(false)
        expect(byKey.get('b1:2')?._pending).toBe(false)
        expect(byKey.get('b1:3')?._pending).toBe(true)
        expect(byKey.get('b2:1')?._pending).toBe(true)
    })

    it('items legacy de cola (sin campos polimórficos/sustitución) parsean a null, no undefined', () => {
        const out = reconcileSessionLogs([], [queued('b1', 1)])
        expect(out[0].actual_duration_sec).toBeNull()
        expect(out[0].actual_distance_m).toBeNull()
        expect(out[0].actual_hold_sec).toBeNull()
        expect(out[0].actual_avg_hr).toBeNull()
        expect(out[0].substituted_exercise_id).toBeNull()
        expect(out[0].note).toBeNull()
    })

    it('reload: un log del SERVER de HOLD (peso/reps NULL, actual_hold_sec real) conserva el eje', () => {
        // Camino de recarga (síntoma 2): tras reload el RSC trae la serie de hold con weight/reps NULL
        // y actual_hold_sec=45. El reconcile debe preservar el eje para que la fila tipada lo pinte.
        const server = [serverLog('b1', 1, { weight_kg: null, reps_done: null, rpe: null, actual_hold_sec: 45 })]
        const out = reconcileSessionLogs(server, [])
        expect(out).toHaveLength(1)
        expect(out[0].actual_hold_sec).toBe(45)
        expect(out[0].weight_kg).toBeNull()
        expect(out[0].reps_done).toBeNull()
        expect(out[0]._pending).toBe(false)
    })

    it('preserva los ejes polimórficos + sustitución de una serie encolada', () => {
        const out = reconcileSessionLogs(
            [],
            [
                queued('b1', 1, {
                    actualDurationSec: 1800,
                    actualDistanceM: 5000,
                    substitutedExerciseId: 'ex-9',
                    substitutedExerciseName: 'Prensa',
                    substitutionReason: 'machine_busy',
                }),
            ],
        )
        expect(out[0]).toMatchObject({
            actual_duration_sec: 1800,
            actual_distance_m: 5000,
            substituted_exercise_id: 'ex-9',
            substituted_exercise_name: 'Prensa',
            substitution_reason: 'machine_busy',
            _pending: true,
        })
    })

    it('no muta las entradas del server (copia con _pending, no referencia)', () => {
        const original = serverLog('b1', 1)
        const out = reconcileSessionLogs([original], [])
        expect(out[0]).not.toBe(original)
        expect(original).not.toHaveProperty('_pending')
    })

    // ── Snapshot local (forense RC3/RC4): monotonía server > cola > snapshot ──────────────────
    it('server VACÍO + cola VACÍA + snapshot 3 filas → 3 filas confirmadas (la pantalla no colapsa a vacío)', () => {
        const snap = [serverLog('b1', 1), serverLog('b1', 2), serverLog('b2', 1)]
        const out = reconcileSessionLogs([], [], snap)
        expect(out).toHaveLength(3)
        expect(out.every((l) => l._pending === false)).toBe(true)
        expect(out.map((l) => sessionLogKey(l.block_id, l.set_number)).sort()).toEqual(['b1:1', 'b1:2', 'b2:1'])
    })

    it('server FRESCO pisa el snapshot (mismo (block,set), valor distinto → gana el server)', () => {
        const server = [serverLog('b1', 1, { weight_kg: 105, reps_done: 6 })]
        const snap = [serverLog('b1', 1, { weight_kg: 999, reps_done: 99 })]
        const out = reconcileSessionLogs(server, [], snap)
        expect(out).toHaveLength(1)
        expect(out[0].weight_kg).toBe(105)
        expect(out[0].reps_done).toBe(6)
        expect(out[0]._pending).toBe(false)
    })

    it('el snapshot NO resucita una fila que el server SÍ reporta distinta (no duplica ni pisa)', () => {
        // server tiene b1:1 (105kg); snapshot trae b1:1 (viejo, 90kg) + b1:2 (que el server aún no reporta).
        const server = [serverLog('b1', 1, { weight_kg: 105 })]
        const snap = [serverLog('b1', 1, { weight_kg: 90 }), serverLog('b1', 2, { weight_kg: 88 })]
        const out = reconcileSessionLogs(server, [], snap)
        const byKey = new Map(out.map((l) => [sessionLogKey(l.block_id, l.set_number), l]))
        expect(out).toHaveLength(2)
        expect(byKey.get('b1:1')?.weight_kg).toBe(105) // server manda
        expect(byKey.get('b1:2')?.weight_kg).toBe(88) // snapshot rellena el hueco
        expect(byKey.get('b1:2')?._pending).toBe(false)
    })

    it('la cola (pending) gana sobre el snapshot para el mismo (block,set)', () => {
        const snap = [serverLog('b1', 1, { weight_kg: 90 })]
        const out = reconcileSessionLogs([], [queued('b1', 1, { weightKg: 61 })], snap)
        expect(out).toHaveLength(1)
        expect(out[0].weight_kg).toBe(61)
        expect(out[0]._pending).toBe(true) // sin sincronizar, no lo pisa el snapshot confirmado
    })

    it('mezcla server + snapshot: server confirma unas y el snapshot rellena OTRAS', () => {
        const server = [serverLog('b1', 1)]
        const snap = [serverLog('b1', 1, { weight_kg: 1 }), serverLog('b1', 2), serverLog('b2', 1)]
        const out = reconcileSessionLogs(server, [], snap)
        expect(out).toHaveLength(3)
        expect(out.every((l) => l._pending === false)).toBe(true)
    })
})
