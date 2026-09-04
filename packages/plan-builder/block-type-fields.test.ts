/**
 * R6 + R32: cambiar el tipo de un bloque limpia los campos del tipo anterior con `null` EXPLÍCITO.
 *
 * El `toBeNull()` de cada caso no es cosmética: `undefined` no viaja al UPDATE del serializador RN
 * (`apps/mobile/lib/plan-builder/serialize.ts:111-135`), así que un strip con `delete` deja el
 * residuo vivo en la DB y el coach ve «5 km» en un press de banca. El round-trip que lo prueba de
 * punta a punta vive en `tests/mobile/plan-builder-strip-roundtrip.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { typedBlockSummary, type TypedBlockFields } from '@eva/workout-engine'
import { POLYMORPHIC_BLOCK_FIELDS, defaultBlockForType, stripFieldsForType } from './block-type-fields'
import type { BuilderBlock } from './types'

/** Bloque con TODOS los ejes polimórficos poblados + los compartidos que deben sobrevivir. */
function fullBlock(type: BuilderBlock['exercise_type']): BuilderBlock {
    return {
        uid: 'blk-1',
        exercise_id: 'ex-1',
        exercise_name: 'Trote',
        muscle_group: 'Cardio',
        exercise_type: type,
        // compartidos (R32): sobreviven al cambio de tipo
        sets: 4,
        rest_time: '90s',
        notes: 'nota del coach',
        superset_group: 'A',
        side_mode: 'per_side',
        instructions: 'Mantené el torso firme',
        // polimórficos: se limpian
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
    }
}

describe('stripFieldsForType: limpieza con null explícito', () => {
    it('cardio → strength deja los ejes de cardio en null EXPLÍCITO', () => {
        const out = stripFieldsForType(fullBlock('cardio'), 'strength') as Record<string, unknown>
        for (const field of ['duration_sec', 'distance_value', 'distance_unit', 'target_pace_sec_per_km', 'hr_zone', 'interval_config']) {
            expect(Object.keys(out)).toContain(field)
            expect(out[field]).toBeNull()
        }
    })

    it('cardio → strength conserva los campos compartidos', () => {
        const out = stripFieldsForType(fullBlock('cardio'), 'strength')
        expect(out.sets).toBe(4)
        expect(out.rest_time).toBe('90s')
        expect(out.notes).toBe('nota del coach')
        expect(out.superset_group).toBe('A')
        expect(out.side_mode).toBe('per_side')
        expect(out.instructions).toBe('Mantené el torso firme')
        // identidad del bloque intacta
        expect(out.uid).toBe('blk-1')
        expect(out.exercise_id).toBe('ex-1')
    })

    it('roller → strength apaga la prescripción tipada (typedBlockSummary vuelve a null)', () => {
        const out = stripFieldsForType(fullBlock('roller'), 'strength') as Record<string, unknown>
        expect(out.reps_value).toBeNull()
        expect(out.reps_unit).toBeNull()
        expect(out.load_value).toBeNull()
        expect(out.load_unit).toBeNull()
        // `BuilderBlock` tipa distance_value/load_value como texto de input; el motor los quiere
        // numéricos. El cast sólo cruza esa frontera — los valores ya son `null`.
        expect(typedBlockSummary(out as unknown as TypedBlockFields, 'strength')).toBeNull()
    })

    it('strength con side_mode → mobility conserva side_mode e instructions', () => {
        const out = stripFieldsForType({ ...fullBlock('strength'), duration_sec: null }, 'mobility')
        expect(out.side_mode).toBe('per_side')
        expect(out.instructions).toBe('Mantené el torso firme')
        expect(out.duration_sec).toBe(30) // default del hold de movilidad
    })

    it('mobility → roller limpia el hold y siembra el default del roller', () => {
        const mobility: BuilderBlock = {
            ...fullBlock('mobility'),
            duration_sec: 30,
            reps_value: null,
            reps_unit: null,
        }
        const out = stripFieldsForType(mobility, 'roller')
        expect(out.duration_sec).toBeNull()
        expect(out.reps_value).toBe(10)
        expect(out.reps_unit).toBe('passes')
        // los compartidos siguen siendo los del coach, no los del default
        expect(out.sets).toBe(4)
        expect(out.rest_time).toBe('90s')
    })

    it('mismo tipo ⇒ devuelve el bloque sin mutar', () => {
        const block = fullBlock('cardio')
        expect(stripFieldsForType(block, 'cardio')).toEqual(block)
        expect(stripFieldsForType(block, 'cardio')).toBe(block)
        // el override manda sobre el tipo del catálogo
        const overridden: BuilderBlock = { ...block, exercise_type_override: 'strength' }
        expect(stripFieldsForType(overridden, 'strength')).toBe(overridden)
    })

    it('es idempotente', () => {
        const once = stripFieldsForType(fullBlock('cardio'), 'strength')
        expect(stripFieldsForType(once, 'strength')).toEqual(once)
    })

    it('cubre los 10 campos de R32: ninguno conserva su valor viejo', () => {
        const before = fullBlock('cardio') as Record<string, unknown>
        const after = stripFieldsForType(fullBlock('cardio'), 'strength') as Record<string, unknown>
        expect(POLYMORPHIC_BLOCK_FIELDS).toHaveLength(10)
        for (const field of POLYMORPHIC_BLOCK_FIELDS) {
            expect(before[field]).not.toBeNull() // el fixture los pobló todos
            expect(after[field]).toBeNull()
            expect(after[field]).not.toBe(before[field])
        }
    })

    it('no muta el bloque de entrada', () => {
        const block = fullBlock('cardio')
        stripFieldsForType(block, 'strength')
        expect(block.duration_sec).toBe(1800)
        expect(block.distance_value).toBe('5')
    })
})

describe('defaultBlockForType: espejo de createDefaultBlock (program-read-mappers.ts:189-204)', () => {
    it('strength = el default de siempre', () => {
        expect(defaultBlockForType('strength')).toEqual({ sets: 3, reps: '8-12', rest_time: '90s' })
    })

    it('cardio', () => {
        expect(defaultBlockForType('cardio')).toEqual({ sets: 1, reps: '10min', duration_sec: 600, rest_time: '' })
    })

    it('mobility', () => {
        expect(defaultBlockForType('mobility')).toEqual({ sets: 3, reps: '30s', duration_sec: 30, rest_time: '' })
    })

    it('roller', () => {
        expect(defaultBlockForType('roller')).toEqual({
            sets: 1,
            reps: '10 pasadas',
            reps_value: 10,
            reps_unit: 'passes',
            rest_time: '',
        })
    })
})
