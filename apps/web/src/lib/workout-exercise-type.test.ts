import { describe, it, expect } from 'vitest'
import {
    compactDistance,
    compactDuration,
    effectiveExerciseType,
    hasTypedPrescription,
    legacyRepsSummaryFor,
    typedBlockSummary,
} from './workout-exercise-type'
import { buildIntervalPhases, intervalTotalDurationSec, isTimeableInterval } from './workout-interval'
import type { IntervalConfig } from '@/domain/workout/types'

describe('effectiveExerciseType (decisión #2: override > exercise > strength)', () => {
    it('bloque legacy sin nada resuelve strength', () => {
        expect(effectiveExerciseType({}, {})).toBe('strength')
        expect(effectiveExerciseType(null, null)).toBe('strength')
        expect(effectiveExerciseType({ exercise_type_override: null }, { exercise_type: null })).toBe('strength')
    })

    it('el tipo del ejercicio manda si no hay override', () => {
        expect(effectiveExerciseType({}, { exercise_type: 'cardio' })).toBe('cardio')
        expect(effectiveExerciseType({ exercise_type_override: null }, { exercise_type: 'mobility' })).toBe('mobility')
    })

    it('el override del bloque gana sobre el ejercicio', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'roller' }, { exercise_type: 'cardio' })).toBe('roller')
    })

    it('valores desconocidos caen a strength (datos corruptos no rompen)', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'yoga' }, { exercise_type: 'pilates' })).toBe('strength')
    })
})

describe('legacyRepsSummaryFor (≤20 chars, es-neutro)', () => {
    it('cardio por intervalos: "8×400m @ Z4"', () => {
        const summary = legacyRepsSummaryFor(
            {
                hr_zone: 4,
                interval_config: { repeats: 8, work: { distance_m: 400 }, recovery: { duration_sec: 90 } },
            },
            'cardio'
        )
        expect(summary).toBe('8×400m @ Z4')
        expect(summary.length).toBeLessThanOrEqual(20)
    })

    it('cardio continuo por duración: "20min Z2"', () => {
        expect(legacyRepsSummaryFor({ duration_sec: 1200, hr_zone: 2 }, 'cardio')).toBe('20min Z2')
    })

    it('cardio por distancia: "5km"', () => {
        expect(legacyRepsSummaryFor({ distance_value: 5, distance_unit: 'km' }, 'cardio')).toBe('5km')
    })

    it('movilidad con hold por lado: "30s/lado"', () => {
        expect(legacyRepsSummaryFor({ duration_sec: 30, side_mode: 'per_side' }, 'mobility')).toBe('30s/lado')
    })

    it('roller por pasadas: "10 pasadas"', () => {
        expect(legacyRepsSummaryFor({ reps_value: 10, reps_unit: 'passes' }, 'roller')).toBe('10 pasadas')
    })

    it('strength respeta el texto manual del coach', () => {
        expect(legacyRepsSummaryFor({ reps: 'AMRAP' }, 'strength')).toBe('AMRAP')
        expect(legacyRepsSummaryFor({ reps: '8-10' }, 'strength')).toBe('8-10')
    })

    it('nunca supera 20 caracteres (presupuesto de la columna reps)', () => {
        const long = legacyRepsSummaryFor(
            {
                hr_zone: 5,
                interval_config: { repeats: 100, work: { distance_m: 12345 }, recovery: { duration_sec: 90 } },
            },
            'cardio'
        )
        expect(long.length).toBeLessThanOrEqual(20)
    })
})

describe('typedBlockSummary (resumen por tipo del builder)', () => {
    it('strength legacy devuelve null (el caller renderiza sets×reps idéntico a hoy)', () => {
        expect(typedBlockSummary({ sets: 3, reps: '8-12' }, 'strength')).toBeNull()
    })

    it('farmer carry strength tri-eje agrega la distancia', () => {
        expect(
            typedBlockSummary(
                { sets: 3, reps: '2 idas', distance_value: 7.5, distance_unit: 'm', side_mode: 'per_side' },
                'strength'
            )
        ).toBe('3×2 idas · 7.5m/lado')
    })

    it('movilidad muestra sets: "30s/lado ×3"', () => {
        expect(typedBlockSummary({ duration_sec: 30, side_mode: 'per_side', sets: 3 }, 'mobility')).toBe('30s/lado ×3')
    })

    it('cardio continuo con sets>1 antepone las series', () => {
        expect(typedBlockSummary({ duration_sec: 300, hr_zone: 3, sets: 2 }, 'cardio')).toBe('2× 5min Z3')
    })
})

describe('hasTypedPrescription', () => {
    it('false para bloque legacy puro', () => {
        expect(hasTypedPrescription({ sets: 3, reps: '8-12' })).toBe(false)
    })
    it('true cuando hay duración / distancia / zona', () => {
        expect(hasTypedPrescription({ duration_sec: 60 })).toBe(true)
        expect(hasTypedPrescription({ distance_value: 400 })).toBe(true)
        expect(hasTypedPrescription({ hr_zone: 4 })).toBe(true)
    })
})

describe('compactDuration / compactDistance', () => {
    it('formatos compactos', () => {
        expect(compactDuration(90)).toBe('1m30s')
        expect(compactDuration(45)).toBe('45s')
        expect(compactDuration(1200)).toBe('20min')
        expect(compactDistance(400, 'm')).toBe('400m')
        expect(compactDistance(5000, 'm')).toBe('5km')
        expect(compactDistance(5, 'km')).toBe('5km')
        expect(compactDistance(7.5, 'm')).toBe('7.5m')
    })
})

describe('buildIntervalPhases (AC5: máquina de fases)', () => {
    const config: IntervalConfig = {
        warmup_sec: 300,
        repeats: 3,
        work: { duration_sec: 60 },
        recovery: { duration_sec: 30 },
        cooldown_sec: 120,
    }

    it('warmup → (work→recovery)×N sin recovery final → cooldown', () => {
        const phases = buildIntervalPhases(config, 1)
        expect(phases.map((p) => p.kind)).toEqual([
            'warmup', 'work', 'recovery', 'work', 'recovery', 'work', 'cooldown',
        ])
        expect(phases[1]).toMatchObject({ repeat: 1, totalRepeats: 3, durationSec: 60 })
        expect(phases[5]).toMatchObject({ repeat: 3, totalRepeats: 3 })
    })

    it('sets multiplica los intervalos (M externo = block.sets)', () => {
        const phases = buildIntervalPhases({ repeats: 2, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } }, 2)
        const works = phases.filter((p) => p.kind === 'work')
        expect(works).toHaveLength(4)
        expect(works[3]).toMatchObject({ repeat: 4, totalRepeats: 4 })
    })

    it('work por distancia (sin duración) no es cronometrable', () => {
        const distConfig: IntervalConfig = { repeats: 8, work: { distance_m: 400 }, recovery: { duration_sec: 90 } }
        expect(buildIntervalPhases(distConfig)).toEqual([])
        expect(isTimeableInterval(distConfig)).toBe(false)
        expect(isTimeableInterval(config)).toBe(true)
    })

    it('duración total suma todas las fases', () => {
        // 300 + 3×60 + 2×30 + 120 = 660
        expect(intervalTotalDurationSec(config, 1)).toBe(660)
    })
})
