import { describe, expect, it } from 'vitest'
import {
    compactDistance,
    compactDuration,
    effectiveExerciseType,
    hasTypedPrescription,
} from './workout-exercise-type'

describe('effectiveExerciseType', () => {
    it('prioriza el override del bloque', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'cardio' }, { exercise_type: 'strength' })).toBe('cardio')
    })
    it('cae al tipo del ejercicio sin override', () => {
        expect(effectiveExerciseType({ exercise_type_override: null }, { exercise_type: 'mobility' })).toBe('mobility')
    })
    it('legacy sin nada → strength', () => {
        expect(effectiveExerciseType(null, null)).toBe('strength')
        expect(effectiveExerciseType({}, {})).toBe('strength')
    })
    it('ignora valores desconocidos', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'garbage' }, { exercise_type: 'roller' })).toBe('roller')
        expect(effectiveExerciseType({ exercise_type_override: 'garbage' }, { exercise_type: 'nope' })).toBe('strength')
    })
})

describe('hasTypedPrescription', () => {
    it('detecta duración/distancia/zona/pace/intervalos/unidad no-reps', () => {
        expect(hasTypedPrescription({ duration_sec: 30 })).toBe(true)
        expect(hasTypedPrescription({ distance_value: 400 })).toBe(true)
        expect(hasTypedPrescription({ hr_zone: 4 })).toBe(true)
        expect(hasTypedPrescription({ target_pace_sec_per_km: 300 })).toBe(true)
        expect(hasTypedPrescription({ interval_config: {} })).toBe(true)
        expect(hasTypedPrescription({ reps_value: 10, reps_unit: 'passes' })).toBe(true)
    })
    it('bloque strength puro → false', () => {
        expect(hasTypedPrescription({ sets: 3, reps: '8-10', reps_value: 10, reps_unit: 'reps' })).toBe(false)
        expect(hasTypedPrescription({})).toBe(false)
    })
})

describe('compactDuration', () => {
    it('segundos, minutos exactos y mixtos', () => {
        expect(compactDuration(45)).toBe('45s')
        expect(compactDuration(300)).toBe('5min')
        expect(compactDuration(75)).toBe('1m15s')
    })
})

describe('compactDistance', () => {
    it('metros vs km', () => {
        expect(compactDistance(400, 'm')).toBe('400m')
        expect(compactDistance(5000, 'm')).toBe('5km')
        expect(compactDistance(3, 'km')).toBe('3km')
        expect(compactDistance(7.5, 'm')).toBe('7.5m')
    })
})
