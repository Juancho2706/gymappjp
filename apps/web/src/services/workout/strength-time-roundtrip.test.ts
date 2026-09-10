import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isStrengthTimeBlock, legacyRepsSummaryFor } from '@/lib/workout-exercise-type'
import { mapDbBlockToBuilderBlock } from '@/app/coach/builder/[clientId]/program-read-mappers'
import type { BuilderBlock } from '@/app/coach/builder/[clientId]/types'
import type { Tables } from '@/lib/database.types'
import { mapDbBlockToWorkoutInput, polymorphicBlockColumns } from './workout.service'

/**
 * W2.4 + W2.5 — las dos columnas del modo tiempo (`reps_unit: 'sec'` + `duration_sec`) sobreviven
 * los tres caminos por los que un bloque puede pasar sin que nadie las nombre explícitamente:
 * guardar → leer, copiar una plantilla, y sincronizar con la plantilla vinculada.
 *
 * Ninguno de los tres necesitó cambio de código (las whitelists ya eran completas), y ese es
 * justamente el punto: son whitelists **por enumeración**, así que la única forma de que sigan
 * completas mañana es un test que falle cuando alguien agregue una columna y se olvide de una de
 * éstas. Sin `duration_sec` en el camino de lectura el coach abre el builder y el reloj desapareció;
 * sin `reps_unit`, el bloque vuelve a ser fuerza clásica y el alumno pierde la cuenta atrás.
 */
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..')

/** Fila de `workout_blocks` de una plancha con disco prescrita en segundos. */
function holdRow(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'blk-hold',
        plan_id: 'plan-1',
        order_index: 0,
        exercise_id: 'ex-99',
        sets: 3,
        reps: '30s',
        target_weight_kg: 10,
        rir: '2',
        tempo: null,
        rest_time: '90s',
        warmup_rest_time: null,
        notes: null,
        superset_group: null,
        progression_type: 'reps',
        progression_value: 5,
        progression_mode: 'weekly_linear',
        section: 'main',
        section_template_id: null,
        is_override: false,
        exercise_type_override: null,
        side_mode: null,
        reps_value: null,
        reps_unit: 'sec',
        load_type: null,
        load_value: null,
        load_unit: null,
        distance_value: null,
        distance_unit: null,
        duration_sec: 30,
        target_pace_sec_per_km: null,
        hr_zone: null,
        instructions: null,
        interval_config: null,
        is_unilateral: null,
        extra_targets: null,
        exercises: { name: 'Plancha frontal mantenida', muscle_group: 'Core', exercise_type: 'strength' },
        ...over,
    }
}

/**
 * El bloque del builder guarda distancia y carga como TEXTO de input; el motor las quiere
 * numéricas. Es la misma coerción que hace el mapper del guardado antes de pedirle el resumen.
 */
function typed(block: BuilderBlock) {
    return { ...block, distance_value: null, load_value: null }
}

describe('W2.5 — round-trip guardar → leer de un bloque en modo tiempo', () => {
    it('la whitelist del guardado (`polymorphicBlockColumns`) deja pasar reps_unit y duration_sec', () => {
        const columns = polymorphicBlockColumns(holdRow())

        expect(columns.reps_unit).toBe('sec')
        expect(columns.duration_sec).toBe(30)
        // El resto de la prescripción de fuerza (D3) no se pierde por prescribir en segundos.
        expect(columns.side_mode).toBeNull()
        expect(columns.exercise_type_override).toBeNull()
    })

    it('guardar → leer devuelve el MISMO bloque en modo tiempo, y el motor lo reconoce', () => {
        const guardado = { ...holdRow(), ...polymorphicBlockColumns(holdRow()) }
        const leido = mapDbBlockToBuilderBlock(guardado, new Map<string, Tables<'exercises'>>(), 'uid-1', 1)

        expect(leido.reps_unit).toBe('sec')
        expect(leido.duration_sec).toBe(30)
        expect(leido.sets).toBe(3)
        expect(leido.target_weight_kg).toBe('10')
        expect(isStrengthTimeBlock(typed(leido), { exercise_type: leido.exercise_type })).toBe(true)
        expect(legacyRepsSummaryFor(typed(leido), 'strength')).toBe('30s')
    })

    it('per_side: el lado viaja en el round-trip y el espejo legacy lo refleja', () => {
        const row = holdRow({ side_mode: 'per_side', reps: '30s/lado' })
        const leido = mapDbBlockToBuilderBlock({ ...row, ...polymorphicBlockColumns(row) }, new Map(), 'uid-2', 1)

        expect(leido.side_mode).toBe('per_side')
        expect(legacyRepsSummaryFor(typed(leido), 'strength')).toBe('30s/lado')
    })

    it('un bloque de fuerza CLÁSICA sigue leyéndose igual (sin modo tiempo)', () => {
        const row = holdRow({ reps: '8-12', reps_unit: null, duration_sec: null })
        const leido = mapDbBlockToBuilderBlock({ ...row, ...polymorphicBlockColumns(row) }, new Map(), 'uid-3', 1)

        expect(leido.reps_unit).toBeNull()
        expect(leido.duration_sec).toBeNull()
        expect(isStrengthTimeBlock(typed(leido), { exercise_type: leido.exercise_type })).toBe(false)
    })
})

describe('W2.4 — plantillas: copiar y sincronizar no borran el reloj', () => {
    it('el sync desde plantilla (`mapDbBlockToWorkoutInput`) conserva reps_unit y duration_sec', () => {
        const input = mapDbBlockToWorkoutInput(holdRow())

        expect(input.reps_unit).toBe('sec')
        expect(input.duration_sec).toBe(30)
        expect(input.reps).toBe('30s')
        expect(input.sets).toBe(3)
        expect(input.target_weight_kg).toBe(10)
    })

    it('el bloque copiado de la plantilla se relee como modo tiempo (mismo mapeo canónico)', () => {
        const copiado = mapDbBlockToBuilderBlock(holdRow(), new Map(), 'uid-tpl', 1)

        expect(copiado.reps_unit).toBe('sec')
        expect(copiado.duration_sec).toBe(30)
        expect(isStrengthTimeBlock(typed(copiado), { exercise_type: copiado.exercise_type })).toBe(true)
    })

    it('`TemplatePickerDialog` copia las DOS columnas al aplicar la plantilla', () => {
        // La copia vive inline dentro del componente (no es importable sin montar el diálogo), pero
        // es una enumeración campo por campo: lo que hay que vigilar es que estas dos líneas sigan
        // ahí. Sin ellas, aplicar una plantilla devuelve el bloque a fuerza clásica en silencio.
        const src = fs.readFileSync(
            path.join(REPO, 'apps', 'web', 'src', 'app', 'coach', 'builder', '[clientId]', 'components', 'TemplatePickerDialog.tsx'),
            'utf8',
        )
        expect(src).toContain('reps_unit: b.reps_unit ?? null')
        expect(src).toContain('duration_sec: b.duration_sec ?? null')
    })
})
