/**
 * Volumen de fuerza del resumen post-entreno con series POR LADO (R3/R27).
 *
 * `reps_done` guarda el lado MÁS BAJO (para que progresión y PR no se disparen falsos), así que el
 * tonelaje tiene que leer `metadata {left_reps, right_reps}` y sumar los dos lados — es el mismo
 * `reps_eff` del `CASE` de la migración de `get_client_muscle_volume`. Sin esto un unilateral
 * mostraba la mitad del volumen real.
 */
import { describe, expect, it } from 'vitest'
import { summarizeSessionByKind, type SummaryBlock, type SummaryLogLike } from './session-summary'

const BLOCK: SummaryBlock = {
    id: 'blk-1',
    exercises: { id: 'ex-1', name: 'Zancada búlgara', muscle_group: 'Piernas', exercise_type: 'strength' },
}

function log(partial: Partial<SummaryLogLike>): SummaryLogLike {
    return { block_id: 'blk-1', set_number: 1, weight_kg: 20, reps_done: 10, ...partial }
}

describe('summarizeSessionByKind: volumen de fuerza por lado', () => {
    it('sin metadata usa reps_done tal cual (byte a byte lo de hoy)', () => {
        const out = summarizeSessionByKind([BLOCK], [log({}), log({ set_number: 2, reps_done: 8 })])
        expect(out.strength[0]?.totalVolume).toBe(20 * 10 + 20 * 8)
        expect(out.strengthMuscleVolume).toEqual([{ group: 'Piernas', vol: 360 }])
    })

    it('con los dos lados suma izq + der, no el reps_done del lado más bajo', () => {
        const out = summarizeSessionByKind(
            [BLOCK],
            [log({ reps_done: 8, metadata: { left_reps: 8, right_reps: 10 } })],
        )
        expect(out.strength[0]?.totalVolume).toBe(20 * 18)
        expect(out.muscleWork).toEqual([{ group: 'Piernas', vol: 360 }])
    })

    it('metadata inválida o de un solo lado cae al reps_done (el ELSE del CASE)', () => {
        const cases: SummaryLogLike['metadata'][] = [
            null,
            {},
            { left_reps: 8 },
            { left_reps: 8, right_reps: null },
            { left_reps: -1, right_reps: 10 } as SummaryLogLike['metadata'],
        ]
        for (const metadata of cases) {
            const out = summarizeSessionByKind([BLOCK], [log({ reps_done: 8, metadata })])
            expect(out.strength[0]?.totalVolume).toBe(20 * 8)
        }
    })

    it('el volumen por lado no toca el máx peso ni el detalle de series', () => {
        const logs = [
            log({ weight_kg: 20, reps_done: 8, metadata: { left_reps: 8, right_reps: 10 } }),
            log({ set_number: 2, weight_kg: 24, reps_done: 6, metadata: { left_reps: 6, right_reps: 6 } }),
        ]
        const out = summarizeSessionByKind([BLOCK], logs)
        expect(out.strength[0]?.maxWeight).toBe(24)
        expect(out.strength[0]?.sets).toHaveLength(2)
        expect(out.strength[0]?.totalVolume).toBe(20 * 18 + 24 * 12)
    })

    it('cardio y movilidad ignoran los lados de fuerza (sin cambio de comportamiento)', () => {
        const cardioBlock: SummaryBlock = {
            id: 'blk-2',
            exercises: { id: 'ex-2', name: 'Trote', muscle_group: 'Cardio', exercise_type: 'cardio' },
        }
        const out = summarizeSessionByKind(
            [cardioBlock],
            [
                {
                    block_id: 'blk-2',
                    set_number: 1,
                    weight_kg: null,
                    reps_done: null,
                    actual_duration_sec: 600,
                    actual_distance_m: 2000,
                    metadata: { left_reps: 10, right_reps: 10 },
                },
            ],
        )
        expect(out.cardio[0]?.durationSec).toBe(600)
        expect(out.cardio[0]?.distanceM).toBe(2000)
        expect(out.strength).toHaveLength(0)
    })
})
