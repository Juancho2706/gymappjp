/**
 * Cambio de tipo del bloque en el builder WEB (W4.3 · R6 + R32).
 *
 * Se testea la función PURA `applyBlockTypeChange` —la que el selector de tipo del sheet llama en
 * `setOverride`— sin montar el sheet: lo que hay que pinnear es la operación sobre el estado del
 * bloque, no el markup (el control «Lado» y el resumen los toca W4.10).
 *
 * Las tres cosas que este test protege:
 *   1. R6 · sin diálogo: cambiar el tipo limpia los campos del tipo anterior en el acto.
 *   2. R32 · la limpieza es `null` EXPLÍCITO (no `delete`/`undefined`), que es lo único que sobrevive
 *      al serializador passthrough de RN. Web no tiene passthrough, pero el bloque es el MISMO tipo
 *      compartido y el contrato tiene que ser idéntico en las dos apps.
 *   3. la regla del override vive en el call site: `null` cuando el tipo elegido es el propio del
 *      ejercicio, el tipo cuando el coach lo fuerza.
 *
 * El módulo del sheet arrastra `../_actions/builder.actions` ('use server' → workout.service →
 * Supabase). Se mockea porque este test no ejercita el historial del ejercicio.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../_actions/builder.actions', () => ({
    getExerciseHistoryAction: vi.fn(),
}))

import { applyBlockTypeChange } from './BlockEditSheet'
import { POLYMORPHIC_BLOCK_FIELDS, SHARED_BLOCK_FIELDS } from '@eva/plan-builder'
import type { BuilderBlock } from '../types'

/** Bloque de cardio con TODOS los ejes del tipo poblados + los campos compartidos con contenido. */
function cardioBlock(over: Partial<BuilderBlock> = {}): BuilderBlock {
    return {
        uid: 'b1',
        exercise_id: 'ex-42',
        exercise_name: 'Trote',
        muscle_group: 'Cardio',
        sets: 4,
        reps: '30min',
        rest_time: '90s',
        notes: 'nota del coach',
        superset_group: 'A',
        section: 'main',
        section_template_id: 'sect-1',
        instructions: 'Mantené el torso firme',
        side_mode: 'per_side',
        exercise_type: 'cardio',
        exercise_type_override: null,
        duration_sec: 1800,
        distance_value: '5',
        distance_unit: 'km',
        hr_zone: 2,
        interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
        reps_value: 10,
        reps_unit: 'passes',
        target_pace_sec_per_km: 330,
        load_value: '20',
        load_unit: 'kg',
        ...over,
    }
}

describe('applyBlockTypeChange — limpieza de campos (R6 · R32)', () => {
    it('cardio → fuerza deja los 10 campos polimórficos en null explícito', () => {
        const next = applyBlockTypeChange(cardioBlock(), 'strength')

        for (const field of POLYMORPHIC_BLOCK_FIELDS) {
            expect(field in next).toBe(true)
            expect(next[field]).toBeNull()
        }
    })

    it('conserva los campos compartidos del bloque (descanso, notas, superserie, lado, instrucciones)', () => {
        const next = applyBlockTypeChange(cardioBlock(), 'strength')

        expect(next.sets).toBe(4)
        expect(next.rest_time).toBe('90s')
        expect(next.notes).toBe('nota del coach')
        expect(next.superset_group).toBe('A')
        expect(next.side_mode).toBe('per_side')
        expect(next.instructions).toBe('Mantené el torso firme')
        // ninguno de los compartidos se perdió por tocar el selector
        for (const field of SHARED_BLOCK_FIELDS) {
            expect(next[field]).not.toBeUndefined()
        }
        // identidad y área del bloque intactas
        expect(next.uid).toBe('b1')
        expect(next.exercise_id).toBe('ex-42')
        expect(next.section_template_id).toBe('sect-1')
    })

    it('siembra los defaults tipados del tipo nuevo (movilidad → roller)', () => {
        const mobility = cardioBlock({ exercise_type: 'mobility', duration_sec: 30 })
        const next = applyBlockTypeChange(mobility, 'roller')

        expect(next.duration_sec).toBeNull()
        expect(next.reps_value).toBe(10)
        expect(next.reps_unit).toBe('passes')
    })

    it('fuerza → cardio siembra la duración por defecto del cardio', () => {
        const strength = cardioBlock({
            exercise_type: 'strength',
            duration_sec: null,
            distance_value: null,
            distance_unit: null,
            hr_zone: null,
            interval_config: null,
            reps_value: null,
            reps_unit: null,
            target_pace_sec_per_km: null,
            load_value: null,
            load_unit: null,
        })
        const next = applyBlockTypeChange(strength, 'cardio')

        expect(next.duration_sec).toBe(600)
        expect(next.exercise_type_override).toBe('cardio')
    })
})

describe('applyBlockTypeChange — regla del override (call site)', () => {
    it('elegir el tipo PROPIO del ejercicio borra el override', () => {
        const forced = cardioBlock({ exercise_type: 'cardio', exercise_type_override: 'strength' })
        const next = applyBlockTypeChange(forced, 'cardio')

        expect(next.exercise_type_override).toBeNull()
    })

    it('elegir un tipo distinto al del ejercicio deja el override explícito', () => {
        const next = applyBlockTypeChange(cardioBlock(), 'mobility')

        expect(next.exercise_type_override).toBe('mobility')
    })

    it('un bloque legacy (ejercicio sin tipo) resuelve fuerza, así que elegir fuerza no deja override', () => {
        const legacy = cardioBlock({ exercise_type: null, exercise_type_override: 'cardio' })
        const next = applyBlockTypeChange(legacy, 'strength')

        expect(next.exercise_type_override).toBeNull()
    })
})

describe('applyBlockTypeChange — idempotencia', () => {
    it('re-elegir el tipo que YA tiene el bloque no borra la prescripción que el coach escribió', () => {
        const block = cardioBlock({ exercise_type: 'cardio', exercise_type_override: null })
        const next = applyBlockTypeChange(block, 'cardio')

        expect(next.duration_sec).toBe(1800)
        expect(next.distance_value).toBe('5')
        expect(next.hr_zone).toBe(2)
        expect(next.exercise_type_override).toBeNull()
    })
})
