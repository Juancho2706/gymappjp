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

// ─────────────────────────────────────────────────────────────────────────────
// Fuerza por tiempo y el mapa muscular (R16, specs/cuenta-atras-en-pantalla — W1.9)
// ─────────────────────────────────────────────────────────────────────────────

describe('summarizeSessionByKind: fuerza por tiempo enciende el mapa (R16)', () => {
    const TIME_BLOCK: SummaryBlock = {
        id: 'blk-hold',
        exercises: { id: 'ex-plank', name: 'Plancha frontal', muscle_group: 'Core', exercise_type: 'strength' },
        sets: 3,
        reps_unit: 'sec',
        duration_sec: 30,
    }
    const holdLog = (setNumber: number, holdSec: number | null): SummaryLogLike => ({
        block_id: 'blk-hold',
        set_number: setNumber,
        weight_kg: 10,
        reps_done: null, // R2: en modo tiempo `reps_done` es NULL a propósito
        actual_hold_sec: holdSec,
    })

    it('el hold NO aporta tonelaje: totalVolume 0 y sin fila en strengthMuscleVolume', () => {
        const out = summarizeSessionByKind([TIME_BLOCK], [holdLog(1, 30), holdLog(2, 30), holdLog(3, 28)])
        expect(out.strength[0]?.totalVolume).toBe(0)
        expect(out.strengthMuscleVolume).toEqual([])
    })

    it('pero SÍ enciende la zona en muscleWork, con los segundos como proxy', () => {
        const out = summarizeSessionByKind([TIME_BLOCK], [holdLog(1, 30), holdLog(2, 30), holdLog(3, 28)])
        expect(out.muscleWork).toEqual([{ group: 'Core', vol: 88 }])
    })

    it('sin hold registrado cae al mismo proxy por serie que movilidad (20 × series)', () => {
        const out = summarizeSessionByKind([TIME_BLOCK], [holdLog(1, null), holdLog(2, null)])
        expect(out.muscleWork).toEqual([{ group: 'Core', vol: 40 }])
        expect(out.strengthMuscleVolume).toEqual([])
    })

    it('sigue apareciendo en el desglose de fuerza (es fuerza, no movilidad)', () => {
        const out = summarizeSessionByKind([TIME_BLOCK], [holdLog(1, 30)])
        expect(out.strength).toHaveLength(1)
        expect(out.mobility).toHaveLength(0)
        expect(out.strength[0]?.name).toBe('Plancha frontal')
        // Y no contamina los totales de cardio (`actual_duration_sec` sigue ausente, R2).
        expect(out.totalCardioDurationSec).toBe(0)
    })

    // H8: los 2 bloques de LIVE con `duration_sec` y `reps_unit NULL` son fuerza CLÁSICA.
    it('un bloque de fuerza clásico da resultado byte-idéntico (con y sin duration_sec)', () => {
        const classic: SummaryBlock = {
            id: 'blk-1',
            exercises: { id: 'ex-1', name: 'Press banca', muscle_group: 'Pecho', exercise_type: 'strength' },
            sets: 3,
        }
        const logs: SummaryLogLike[] = [
            { block_id: 'blk-1', set_number: 1, weight_kg: 60, reps_done: 10 },
            { block_id: 'blk-1', set_number: 2, weight_kg: 60, reps_done: 8 },
        ]
        const expected = {
            totalVolume: 60 * 18,
            muscleWork: [{ group: 'Pecho', vol: 1080 }],
            strengthMuscleVolume: [{ group: 'Pecho', vol: 1080 }],
        }
        const plain = summarizeSessionByKind([classic], logs)
        expect(plain.strength[0]?.totalVolume).toBe(expected.totalVolume)
        expect(plain.muscleWork).toEqual(expected.muscleWork)
        expect(plain.strengthMuscleVolume).toEqual(expected.strengthMuscleVolume)

        const legacyH8 = summarizeSessionByKind(
            [{ ...classic, duration_sec: 600, reps_unit: null }],
            logs,
        )
        expect(legacyH8.strength[0]?.totalVolume).toBe(expected.totalVolume)
        expect(legacyH8.muscleWork).toEqual(expected.muscleWork)
        expect(legacyH8.strengthMuscleVolume).toEqual(expected.strengthMuscleVolume)
    })

    it('conviviendo con fuerza clásica del mismo grupo, sólo el clásico suma a las barras de kg', () => {
        const classic: SummaryBlock = {
            id: 'blk-crunch',
            exercises: { id: 'ex-crunch', name: 'Crunch', muscle_group: 'Core', exercise_type: 'strength' },
            sets: 3,
        }
        const out = summarizeSessionByKind(
            [TIME_BLOCK, classic],
            [holdLog(1, 30), { block_id: 'blk-crunch', set_number: 1, weight_kg: 5, reps_done: 20 }],
        )
        expect(out.strengthMuscleVolume).toEqual([{ group: 'Core', vol: 100 }])
        expect(out.muscleWork).toEqual([{ group: 'Core', vol: 130 }])
    })
})
