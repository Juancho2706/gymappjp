import { describe, it, expect } from 'vitest'
import {
    summarizeSessionByKind,
    type SummaryBlock,
    type SummaryLogLike,
} from './session-summary'

/** Helper: bloque con un ejercicio inline. */
function block(
    id: string,
    exercise: { id: string; name: string; muscle_group: string; exercise_type?: string | null } | null,
    extra: Partial<SummaryBlock> = {},
): SummaryBlock {
    return { id, exercises: exercise, sets: 3, ...extra }
}

function log(block_id: string, set_number: number, extra: Partial<SummaryLogLike> = {}): SummaryLogLike {
    return { block_id, set_number, weight_kg: null, reps_done: null, ...extra }
}

describe('summarizeSessionByKind', () => {
    it('agrega volumen de fuerza por ejercicio y grupo muscular', () => {
        const blocks = [
            block('b1', { id: 'e1', name: 'Press banca', muscle_group: 'Pectorales', exercise_type: 'strength' }),
        ]
        const logs = [
            log('b1', 1, { weight_kg: 60, reps_done: 10 }),
            log('b1', 2, { weight_kg: 80, reps_done: 8 }),
        ]
        const out = summarizeSessionByKind(blocks, logs)
        expect(out.strength).toHaveLength(1)
        expect(out.strength[0].totalVolume).toBe(60 * 10 + 80 * 8)
        expect(out.strength[0].maxWeight).toBe(80)
        expect(out.strengthMuscleVolume).toEqual([{ group: 'Pectorales', vol: 1240 }])
        expect(out.muscleWork).toEqual([{ group: 'Pectorales', vol: 1240 }])
        expect(out.cardio).toHaveLength(0)
        expect(out.mobility).toHaveLength(0)
    })

    it('enciende el mapa para movilidad con grupo muscular real (abdominales) sin peso', () => {
        const blocks = [
            block('m1', { id: 'e2', name: 'Plancha', muscle_group: 'Abdominales', exercise_type: 'mobility' }),
        ]
        const logs = [
            log('m1', 1, { actual_hold_sec: 45 }),
            log('m1', 2, { actual_hold_sec: 45 }),
        ]
        const out = summarizeSessionByKind(blocks, logs)
        // No es fuerza → no aparece en el desglose de fuerza ni en las barras kg
        expect(out.strength).toHaveLength(0)
        expect(out.strengthMuscleVolume).toHaveLength(0)
        // Pero SÍ enciende el mapa (trabajo = hold total)
        expect(out.muscleWork).toEqual([{ group: 'Abdominales', vol: 90 }])
        // Y aparece en la sección de movilidad con series + hold
        expect(out.mobility).toEqual([
            { blockId: 'm1', name: 'Plancha', kind: 'mobility', sets: 2, holdSec: 90 },
        ])
    })

    it('movilidad sin hold registrado usa proxy por serie para encender la zona', () => {
        const blocks = [
            block('m1', { id: 'e2', name: 'Cat-cow', muscle_group: 'Lumbar', exercise_type: 'mobility' }),
        ]
        const logs = [log('m1', 1), log('m1', 2), log('m1', 3)]
        const out = summarizeSessionByKind(blocks, logs)
        expect(out.mobility[0].holdSec).toBeNull()
        expect(out.mobility[0].sets).toBe(3)
        // proxy = 3 series * 20 = 60 > 0 → la zona se enciende
        expect(out.muscleWork).toEqual([{ group: 'Lumbar', vol: 60 }])
    })

    it('cardio: agrega tiempo/distancia/FC y se EXCLUYE del mapa muscular', () => {
        const blocks = [
            block('c1', { id: 'e3', name: 'Trote', muscle_group: 'Cardio', exercise_type: 'cardio' }, { sets: 1 }),
        ]
        const logs = [
            log('c1', 1, { actual_duration_sec: 600, actual_distance_m: 2000, actual_avg_hr: 150 }),
            log('c1', 2, { actual_duration_sec: 600, actual_distance_m: 2000, actual_avg_hr: 160 }),
        ]
        const out = summarizeSessionByKind(blocks, logs)
        expect(out.cardio).toEqual([
            { blockId: 'c1', name: 'Trote', rounds: 2, durationSec: 1200, distanceM: 4000, avgHr: 155 },
        ])
        // cardio NO aparece en el mapa (aunque tuviera grupo mapeable, se excluye por tipo)
        expect(out.muscleWork).toHaveLength(0)
        expect(out.strength).toHaveLength(0)
        expect(out.totalCardioDistanceM).toBe(4000)
        expect(out.totalCardioDurationSec).toBe(1200)
    })

    it('cardio sin actuals registrados deja tiempo/distancia/FC en null', () => {
        const blocks = [
            block('c1', { id: 'e3', name: 'Bici', muscle_group: 'Cardio', exercise_type: 'cardio' }, { sets: 1 }),
        ]
        const out = summarizeSessionByKind(blocks, [log('c1', 1)])
        expect(out.cardio[0]).toMatchObject({ durationSec: null, distanceM: null, avgHr: null, rounds: 1 })
    })

    it('bloque sustituido: cuenta el volumen pero NO aporta al máximo (anti-PR-falso)', () => {
        const blocks = [
            block('b1', { id: 'e1', name: 'Sentadilla', muscle_group: 'Cuádriceps', exercise_type: 'strength' }),
        ]
        const logs = [log('b1', 1, { weight_kg: 200, reps_done: 5 })]
        const out = summarizeSessionByKind(blocks, logs, ['b1'])
        expect(out.strength[0].totalVolume).toBe(1000) // volumen sí cuenta
        expect(out.strength[0].maxWeight).toBe(0) // máximo excluido
    })

    it('ignora bloques sin logs', () => {
        const blocks = [
            block('b1', { id: 'e1', name: 'Curl', muscle_group: 'Bíceps', exercise_type: 'strength' }),
            block('b2', { id: 'e2', name: 'Remo', muscle_group: 'Dorsales', exercise_type: 'strength' }),
        ]
        const out = summarizeSessionByKind(blocks, [log('b1', 1, { weight_kg: 20, reps_done: 12 })])
        expect(out.strength).toHaveLength(1)
        expect(out.strength[0].name).toBe('Curl')
    })

    it('sesión sólo de cardio/movilidad: fuerza vacía pero mapa y secciones con datos', () => {
        const blocks = [
            block('c1', { id: 'e3', name: 'Trote', muscle_group: 'Cardio', exercise_type: 'cardio' }, { sets: 1 }),
            block('m1', { id: 'e2', name: 'Plancha', muscle_group: 'Abdominales', exercise_type: 'mobility' }),
        ]
        const logs = [
            log('c1', 1, { actual_duration_sec: 900, actual_distance_m: 3000 }),
            log('m1', 1, { actual_hold_sec: 60 }),
        ]
        const out = summarizeSessionByKind(blocks, logs)
        expect(out.strength).toHaveLength(0)
        expect(out.strengthMuscleVolume).toHaveLength(0)
        expect(out.cardio).toHaveLength(1)
        expect(out.mobility).toHaveLength(1)
        expect(out.muscleWork).toEqual([{ group: 'Abdominales', vol: 60 }])
    })

    it('roller se clasifica como no-fuerza con su propio kind', () => {
        const blocks = [
            block('r1', { id: 'e4', name: 'Roller cuádriceps', muscle_group: 'Cuádriceps', exercise_type: 'roller' }),
        ]
        const out = summarizeSessionByKind(blocks, [log('r1', 1), log('r1', 2)])
        expect(out.mobility[0].kind).toBe('roller')
        expect(out.mobility[0].sets).toBe(2)
        expect(out.muscleWork[0].group).toBe('Cuádriceps')
    })
})
