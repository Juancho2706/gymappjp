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
import { STRENGTH_TIME_MAX_SEC, STRENGTH_TIME_MIN_SEC } from '@eva/schemas'
import {
    applyStrengthModeChange,
    isBlockComplete,
    POLYMORPHIC_BLOCK_FIELDS,
    defaultBlockForType,
    stripFieldsForStrengthMode,
    stripFieldsForType,
} from './block-type-fields'
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

// ─── «Reps | Segundos» dentro de Fuerza (specs/cuenta-atras-en-pantalla, D3 + D4) ─────────────
// Mismo `toBeNull()` que arriba y por el mismo motivo: un strip con `undefined` no viaja al UPDATE
// del serializador RN y `_raw` repone el residuo — el alumno vería un reloj de 30 s en un press.

/** Bloque de fuerza clásico con la prescripción completa que D3 obliga a conservar. */
function strengthBlock(overrides: Partial<BuilderBlock> = {}): BuilderBlock {
    return {
        uid: 'blk-str',
        exercise_id: 'ex-2',
        exercise_name: 'Plancha frontal mantenida',
        muscle_group: 'Core',
        exercise_type: 'strength',
        sets: 3,
        reps: '8-12',
        target_weight_kg: '10',
        rir: '2',
        tempo: '3010',
        rest_time: '90s',
        warmup_rest_time: '45s',
        notes: 'nota del coach',
        instructions: 'Mantené el torso firme',
        superset_group: 'B',
        side_mode: 'per_side',
        progression_type: 'reps',
        progression_value: 2,
        progression_mode: 'weekly_linear',
        ...overrides,
    }
}

describe('stripFieldsForStrengthMode: conmutación Reps ↔ Segundos', () => {
    it('reps → sec escribe duration_sec y reps_unit «sec»', () => {
        const out = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        expect(out.duration_sec).toBe(30)
        expect(out.reps_unit).toBe('sec')
    })

    it('sec → reps deja AMBAS columnas en null EXPLÍCITO (no undefined)', () => {
        const enTiempo = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        const out = stripFieldsForStrengthMode(enTiempo, 'reps') as Record<string, unknown>
        expect(Object.keys(out)).toContain('duration_sec')
        expect(Object.keys(out)).toContain('reps_unit')
        expect(out.duration_sec).toBeNull()
        expect(out.reps_unit).toBeNull()
        expect(out.duration_sec).not.toBeUndefined()
        expect(out.reps_unit).not.toBeUndefined()
    })

    it('round-trip reps → sec → reps devuelve la prescripción de fuerza intacta (D3)', () => {
        const original = strengthBlock()
        const ida = stripFieldsForStrengthMode(original, 'sec', 45)
        const vuelta = stripFieldsForStrengthMode(ida, 'reps')

        expect(vuelta.duration_sec).toBeNull()
        expect(vuelta.reps_unit).toBeNull()
        // D3: nada de esto se toca en ninguna de las dos direcciones.
        expect(vuelta.sets).toBe(3)
        expect(vuelta.reps).toBe('8-12')
        expect(vuelta.target_weight_kg).toBe('10')
        expect(vuelta.rir).toBe('2')
        expect(vuelta.tempo).toBe('3010')
        expect(vuelta.rest_time).toBe('90s')
        expect(vuelta.warmup_rest_time).toBe('45s')
        expect(vuelta.side_mode).toBe('per_side')
        expect(vuelta.superset_group).toBe('B')
        expect(vuelta.notes).toBe('nota del coach')
        expect(vuelta.instructions).toBe('Mantené el torso firme')
        // identidad intacta
        expect(vuelta.uid).toBe('blk-str')
        expect(vuelta.exercise_id).toBe('ex-2')
    })

    // D4: `parseRepsTop('30s')` devuelve 30 (regex \d+) ⇒ sin el guard la doble progresión trataría
    // 30 segundos como 30 reps y subiría el peso sola.
    it('reps → sec baja la doble progresión a weekly_linear', () => {
        const out = stripFieldsForStrengthMode(strengthBlock({ progression_mode: 'double' }), 'sec', 30)
        expect(out.progression_mode).toBe('weekly_linear')
    })

    it('reps → sec respeta cualquier otro progression_mode y nunca escribe undefined', () => {
        for (const mode of ['weekly_linear', 'session_linear', 'adaptive'] as const) {
            const out = stripFieldsForStrengthMode(strengthBlock({ progression_mode: mode }), 'sec', 30)
            expect(out.progression_mode).toBe(mode)
        }
        const sinModo = stripFieldsForStrengthMode(strengthBlock({ progression_mode: undefined }), 'sec', 30)
        expect(sinModo.progression_mode).toBeNull()
    })

    it('la vuelta a Reps NO reabre la doble progresión (la decisión del coach ya se perdió en la ida)', () => {
        const ida = stripFieldsForStrengthMode(strengthBlock({ progression_mode: 'double' }), 'sec', 30)
        expect(stripFieldsForStrengthMode(ida, 'reps').progression_mode).toBe('weekly_linear')
    })

    it('mismo modo ⇒ devuelve el bloque sin mutar (mismo criterio que stripFieldsForType)', () => {
        const enReps = strengthBlock()
        expect(stripFieldsForStrengthMode(enReps, 'reps')).toBe(enReps)
        // ni siquiera con una duración nueva: el segmented no puede pisar lo que el coach tipea
        expect(stripFieldsForStrengthMode(enReps, 'reps', 30)).toBe(enReps)

        const enTiempo = stripFieldsForStrengthMode(enReps, 'sec', 30)
        expect(stripFieldsForStrengthMode(enTiempo, 'sec')).toBe(enTiempo)
        expect(stripFieldsForStrengthMode(enTiempo, 'sec', 90)).toBe(enTiempo)
    })

    it('es idempotente en las dos direcciones', () => {
        const sec = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        expect(stripFieldsForStrengthMode(sec, 'sec', 30)).toEqual(sec)
        const reps = stripFieldsForStrengthMode(sec, 'reps')
        expect(stripFieldsForStrengthMode(reps, 'reps')).toEqual(reps)
    })

    it('sin durationSec conserva la duración que ya tenía el bloque, o null', () => {
        const conDuracion = stripFieldsForStrengthMode(strengthBlock({ duration_sec: 60 }), 'sec')
        expect(conDuracion.duration_sec).toBe(60)
        const sinNada = stripFieldsForStrengthMode(strengthBlock(), 'sec') as Record<string, unknown>
        expect(Object.keys(sinNada)).toContain('duration_sec')
        expect(sinNada.duration_sec).toBeNull()
    })

    it('NO escribe reps_value (R3: sin consumidores verificados en el eje de fuerza)', () => {
        const out = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        expect(out.reps_value).toBeUndefined()
    })

    it('no muta el bloque de entrada', () => {
        const block = strengthBlock()
        stripFieldsForStrengthMode(block, 'sec', 30)
        expect(block.duration_sec).toBeUndefined()
        expect(block.reps_unit).toBeUndefined()
    })
})

describe('stripFieldsForType con un bloque de fuerza en modo tiempo', () => {
    it('Fuerza·Segundos → Movilidad limpia reps_unit y siembra el hold de movilidad', () => {
        const enTiempo = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        const out = stripFieldsForType(enTiempo, 'mobility') as Record<string, unknown>
        expect(Object.keys(out)).toContain('reps_unit')
        expect(out.reps_unit).toBeNull()
        expect(out.duration_sec).toBe(30) // default del hold de movilidad, no residuo
        // los compartidos siguen siendo los del coach (R32)
        expect(out.sets).toBe(3)
        expect(out.rest_time).toBe('90s')
        expect(out.side_mode).toBe('per_side')
    })

    it('Fuerza·Segundos → Cardio también deja reps_unit en null explícito', () => {
        const enTiempo = stripFieldsForStrengthMode(strengthBlock(), 'sec', 30)
        const out = stripFieldsForType(enTiempo, 'cardio') as Record<string, unknown>
        expect(out.reps_unit).toBeNull()
        expect(out.duration_sec).toBe(600) // default de cardio
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

describe('applyStrengthModeChange — conmutación del segmented «Reps | Segundos»', () => {
    const base = { exercise_id: 'e1', exercise_name: 'Plancha', sets: 3, reps: '8-12', order_index: 0 } as BuilderBlock

    it('Reps → Segundos deja reps intacto y marca reps_unit sec', () => {
        const next = applyStrengthModeChange(base, 'sec')
        expect(next.reps_unit).toBe('sec')
        expect(next.reps).toBe('8-12')
    })

    it('Segundos → Reps con el espejo del reloj en reps propone 8-12', () => {
        const timed = { ...base, reps: '30s', reps_unit: 'sec', duration_sec: 30 } as BuilderBlock
        const next = applyStrengthModeChange(timed, 'reps')
        expect(next.reps).toBe('8-12')
        expect(next.reps_unit).toBeNull()
        expect(next.duration_sec).toBeNull()
    })

    it('Segundos → Reps con el espejo por lado también propone 8-12', () => {
        const timed = { ...base, reps: '30s/lado', reps_unit: 'sec', duration_sec: 30, side_mode: 'per_side' } as BuilderBlock
        expect(applyStrengthModeChange(timed, 'reps').reps).toBe('8-12')
    })

    it('Segundos → Reps NO pisa un texto propio del coach', () => {
        const timed = { ...base, reps: 'AMRAP', reps_unit: 'sec', duration_sec: 30 } as BuilderBlock
        expect(applyStrengthModeChange(timed, 'reps').reps).toBe('AMRAP')
    })

    it('es idempotente: en el modo pedido devuelve el mismo objeto', () => {
        expect(applyStrengthModeChange(base, 'reps')).toBe(base)
        const timed = { ...base, reps_unit: 'sec', duration_sec: 30 } as BuilderBlock
        expect(applyStrengthModeChange(timed, 'sec')).toBe(timed)
    })
})

/**
 * W2.1 — `isBlockComplete`: la ÚNICA regla de «¿tiene la prescripción mínima?», compartida por los
 * tres guards que antes la copiaban a mano. El cableado de esos tres call sites lo vigila
 * `apps/web/src/app/coach/builder/[clientId]/block-complete-callsites.test.ts`; acá se fija la
 * regla en sí, con el MISMO fixture que usa ese test.
 */
describe('isBlockComplete — fuerza clásica (regla histórica, byte a byte)', () => {
    it('series ≥ 1 + texto de reps ⇒ completo', () => {
        expect(isBlockComplete(strengthBlock(), 'strength')).toBe(true)
    })

    it('sin series ⇒ incompleto', () => {
        expect(isBlockComplete(strengthBlock({ sets: 0 }), 'strength')).toBe(false)
        expect(isBlockComplete(strengthBlock({ sets: undefined }), 'strength')).toBe(false)
    })

    it('sin texto de reps (vacío o sólo espacios) ⇒ incompleto', () => {
        expect(isBlockComplete(strengthBlock({ reps: '' }), 'strength')).toBe(false)
        expect(isBlockComplete(strengthBlock({ reps: '   ' }), 'strength')).toBe(false)
    })

    it('un `duration_sec` suelto NO alcanza mientras el bloque siga en modo Reps', () => {
        expect(isBlockComplete(strengthBlock({ reps: '', duration_sec: 30 }), 'strength')).toBe(false)
    })
})

describe('isBlockComplete — fuerza POR TIEMPO (D3)', () => {
    /** El bloque tal como lo deja el segmented al pasar a Segundos: `reps` sigue con el texto viejo. */
    const timed = (overrides: Partial<BuilderBlock> = {}) =>
        strengthBlock({ reps_unit: 'sec', duration_sec: 30, ...overrides })

    it('series + 30 segundos ⇒ completo', () => {
        expect(isBlockComplete(timed(), 'strength')).toBe(true)
    })

    it('3 segundos (bajo el mínimo) ⇒ incompleto', () => {
        expect(isBlockComplete(timed({ duration_sec: 3 }), 'strength')).toBe(false)
    })

    it('sin segundos ⇒ incompleto AUNQUE `reps` conserve el texto del coach (falso negativo cerrado)', () => {
        expect(isBlockComplete(timed({ duration_sec: null }), 'strength')).toBe(false)
        expect(isBlockComplete(timed({ duration_sec: 0 }), 'strength')).toBe(false)
    })

    it('sin reps y sin segundos ⇒ incompleto', () => {
        expect(isBlockComplete(timed({ reps: '', duration_sec: null }), 'strength')).toBe(false)
    })

    it('sin series ⇒ incompleto aunque los segundos estén bien', () => {
        expect(isBlockComplete(timed({ sets: 0 }), 'strength')).toBe(false)
    })

    it('el rango es EXACTAMENTE el del schema (@eva/schemas), no una copia que derivó', () => {
        expect(isBlockComplete(timed({ duration_sec: STRENGTH_TIME_MIN_SEC }), 'strength')).toBe(true)
        expect(isBlockComplete(timed({ duration_sec: STRENGTH_TIME_MIN_SEC - 1 }), 'strength')).toBe(false)
        expect(isBlockComplete(timed({ duration_sec: STRENGTH_TIME_MAX_SEC }), 'strength')).toBe(true)
        expect(isBlockComplete(timed({ duration_sec: STRENGTH_TIME_MAX_SEC + 1 }), 'strength')).toBe(false)
    })
})

describe('isBlockComplete — cardio / movilidad / roller (regla canónica del sheet web)', () => {
    it('cardio: duración, distancia (texto con coma) o intervalos alcanzan', () => {
        const base = fullBlock('cardio')
        expect(isBlockComplete(base, 'cardio')).toBe(true)
        const soloDistancia = { ...base, duration_sec: null, interval_config: null, distance_value: '2,5' }
        expect(isBlockComplete(soloDistancia, 'cardio')).toBe(true)
        const soloIntervalos = { ...base, duration_sec: null, distance_value: '' }
        expect(isBlockComplete(soloIntervalos, 'cardio')).toBe(true)
        const vacio = { ...base, duration_sec: null, distance_value: '', interval_config: null }
        expect(isBlockComplete(vacio, 'cardio')).toBe(false)
    })

    it('movilidad: series + (duración o conteo)', () => {
        const base = { ...fullBlock('mobility'), duration_sec: 30, reps_value: null, interval_config: null }
        expect(isBlockComplete(base, 'mobility')).toBe(true)
        expect(isBlockComplete({ ...base, duration_sec: null, reps_value: 8 }, 'mobility')).toBe(true)
        expect(isBlockComplete({ ...base, sets: 0 }, 'mobility')).toBe(false)
        expect(isBlockComplete({ ...base, duration_sec: null }, 'mobility')).toBe(false)
    })

    it('roller: duración o pasadas, sin exigir series', () => {
        const base = { ...fullBlock('roller'), duration_sec: null, reps_value: 10 }
        expect(isBlockComplete(base, 'roller')).toBe(true)
        expect(isBlockComplete({ ...base, sets: undefined }, 'roller')).toBe(true)
        expect(isBlockComplete({ ...base, reps_value: null }, 'roller')).toBe(false)
    })

    it('el texto de `reps` SÍ rescata a movilidad y a roller (no-regresión: 94 bloques de 58 coaches en LIVE se guardan así)', () => {
        const mob = { ...fullBlock('mobility'), duration_sec: null, reps_value: null, reps: '30s' }
        expect(isBlockComplete(mob, 'mobility')).toBe(true)
        const roller = { ...fullBlock('roller'), duration_sec: null, reps_value: null, reps: '10 pasadas' }
        expect(isBlockComplete(roller, 'roller')).toBe(true)
        // Sin ningún eje (ni duración, ni cantidad, ni texto) sigue incompleto.
        expect(isBlockComplete({ ...mob, reps: '' }, 'mobility')).toBe(false)
        expect(isBlockComplete({ ...roller, reps: '   ' }, 'roller')).toBe(false)
    })
})
