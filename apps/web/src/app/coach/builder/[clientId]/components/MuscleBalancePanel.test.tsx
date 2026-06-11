import { describe, it, expect } from 'vitest'
import { buildMuscleBalance } from './MuscleBalancePanel'
import type { BuilderBlock, DayState } from '../types'

function block(over: Partial<BuilderBlock> & { uid: string }): BuilderBlock {
    return {
        exercise_id: 'ex-1',
        exercise_name: 'Sentadilla',
        muscle_group: 'Piernas',
        sets: 3,
        reps: '10',
        section: 'main',
        section_template_id: null,
        superset_group: null,
        ...over,
    }
}

function day(blocks: BuilderBlock[], over: Partial<DayState> = {}): DayState {
    return { id: 1, name: 'Día 1', title: 'Día 1', blocks, ...over }
}

describe('buildMuscleBalance (F4.5 — solo strength suma volumen)', () => {
    it('bloque cardio NO suma series ni ejercicios al grupo muscular', () => {
        const { muscleSetMap, muscleExMap } = buildMuscleBalance([
            day([block({ uid: 'b1', exercise_type: 'cardio', muscle_group: 'Piernas', sets: 4 })]),
        ])
        expect(muscleSetMap['Piernas']).toBeUndefined()
        expect(muscleExMap['Piernas']).toBeUndefined()
    })

    it('bloque strength explícito suma series y cuenta el ejercicio', () => {
        const { muscleSetMap, muscleExMap } = buildMuscleBalance([
            day([block({ uid: 'b1', exercise_type: 'strength', sets: 4 })]),
        ])
        expect(muscleSetMap['Piernas']).toBe(4)
        expect(muscleExMap['Piernas']).toBe(1)
    })

    it('bloque legacy sin tipo (sin override ni exercise_type) resuelve strength y suma', () => {
        const { muscleSetMap, muscleExMap } = buildMuscleBalance([
            day([block({ uid: 'b1', sets: 3 })]),
        ])
        expect(muscleSetMap['Piernas']).toBe(3)
        expect(muscleExMap['Piernas']).toBe(1)
    })

    it('override del bloque manda sobre el tipo del ejercicio', () => {
        const { muscleSetMap } = buildMuscleBalance([
            day([
                block({ uid: 'b1', exercise_type: 'strength', exercise_type_override: 'mobility', sets: 2 }),
                block({ uid: 'b2', exercise_type: 'cardio', exercise_type_override: 'strength', sets: 5, muscle_group: 'Dorsales' }),
            ]),
        ])
        expect(muscleSetMap['Piernas']).toBeUndefined()
        expect(muscleSetMap['Dorsales']).toBe(5)
    })

    it('mezcla en un mismo día: solo los strength aportan al total', () => {
        const { muscleSetMap, muscleExMap } = buildMuscleBalance([
            day([
                block({ uid: 'b1', sets: 3, muscle_group: 'Pectorales' }),
                block({ uid: 'b2', exercise_type: 'cardio', sets: 4, muscle_group: 'Pectorales' }),
                block({ uid: 'b3', exercise_type: 'roller', sets: 2, muscle_group: 'Pectorales' }),
            ]),
        ])
        expect(muscleSetMap['Pectorales']).toBe(3)
        expect(muscleExMap['Pectorales']).toBe(1)
    })

    it('días de descanso siguen excluidos', () => {
        const { muscleSetMap } = buildMuscleBalance([
            day([block({ uid: 'b1', sets: 3 })], { is_rest: true }),
        ])
        expect(muscleSetMap['Piernas']).toBeUndefined()
    })
})
