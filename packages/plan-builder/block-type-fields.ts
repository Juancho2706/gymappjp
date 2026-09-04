/**
 * @eva/plan-builder — campos polimórficos por tipo de bloque (R6 + R32).
 *
 * Dos helpers que web y mobile comparten para que cambiar el tipo de un bloque, o nacer con el tipo
 * del catálogo, sea la MISMA operación en los dos builders:
 *
 *   - `stripFieldsForType(block, newType)`: limpia los campos del tipo anterior y siembra los
 *     defaults tipados del tipo nuevo. Sin diálogo — el coach cambia el tipo y el bloque queda
 *     coherente al instante.
 *   - `defaultBlockForType(type)`: los defaults por tipo del bloque nuevo, espejo EXACTO de
 *     `createDefaultBlock` (`apps/web/src/app/coach/builder/[clientId]/program-read-mappers.ts`).
 *
 * **Por qué `null` explícito y nunca `undefined` (R32):** el serializador RN
 * (`apps/mobile/lib/plan-builder/serialize.ts:111-135`) sólo sobreescribe una columna tipada cuando
 * el campo está DEFINIDO (`!== undefined`); todo lo demás lo repone el passthrough de `_raw`. Un
 * strip hecho con `delete` o con `undefined` es entonces un **no-op**: la limpieza se ve bien en
 * memoria y el residuo sigue vivo en la DB.
 *
 * TypeScript puro (sin React / Next / Supabase / React Native).
 */
import { effectiveExerciseType, type ExerciseType } from '@eva/workout-engine'
import type { BuilderBlock } from './types'

/**
 * Los 10 campos polimórficos de `workout_blocks` (según `packages/schemas/workout.ts`) que un
 * cambio de tipo tiene que limpiar. Lista CERRADA y exportada: el test recorre estos nombres, así
 * que agregar un campo polimórfico al schema sin agregarlo acá se caza en rojo.
 */
export const POLYMORPHIC_BLOCK_FIELDS = [
    'duration_sec',
    'distance_value',
    'distance_unit',
    'hr_zone',
    'interval_config',
    'reps_value',
    'reps_unit',
    'target_pace_sec_per_km',
    'load_value',
    'load_unit',
] as const

export type PolymorphicBlockField = (typeof POLYMORPHIC_BLOCK_FIELDS)[number]

/**
 * Campos COMPARTIDOS que sobreviven al cambio de tipo (R32): son del bloque, no del tipo. Perder el
 * descanso o las notas del coach por tocar un selector sería destructivo.
 */
export const SHARED_BLOCK_FIELDS = [
    'sets',
    'rest_time',
    'notes',
    'superset_group',
    'side_mode',
    'instructions',
] as const

/**
 * Defaults del bloque nuevo POR TIPO — espejo exacto de las ramas por tipo de `createDefaultBlock`
 * (`program-read-mappers.ts:189-204`). Es un overlay parcial: la identidad del bloque (uid,
 * exercise_id, nombre, multimedia, sección) la pone el call site, que es quien conoce el ejercicio.
 * `strength` devuelve el default de siempre (sets 3 · "8-12" · 90s), byte a byte (AC3).
 */
export function defaultBlockForType(type: ExerciseType): Partial<BuilderBlock> {
    if (type === 'cardio') return { sets: 1, reps: '10min', duration_sec: 600, rest_time: '' }
    if (type === 'mobility') return { sets: 3, reps: '30s', duration_sec: 30, rest_time: '' }
    if (type === 'roller') {
        return { sets: 1, reps: '10 pasadas', reps_value: 10, reps_unit: 'passes', rest_time: '' }
    }
    return { sets: 3, reps: '8-12', rest_time: '90s' }
}

/** Sólo la parte POLIMÓRFICA de los defaults del tipo: `sets`/`reps`/`rest_time` se conservan (R32). */
function typedDefaultsForType(type: ExerciseType): Partial<BuilderBlock> {
    const defaults = defaultBlockForType(type)
    const out: Partial<BuilderBlock> = {}
    for (const field of POLYMORPHIC_BLOCK_FIELDS) {
        if (field in defaults) Object.assign(out, { [field]: defaults[field] })
    }
    return out
}

/**
 * Los 10 campos de R32 en `null`. `Record` exhaustivo sobre la lista: la lista y este mapa se
 * mueven juntos, y el `Partial<BuilderBlock>` obliga a que cada `null` sea legal en el bloque.
 */
const CLEARED_POLYMORPHIC_FIELDS: Record<PolymorphicBlockField, null> & Partial<BuilderBlock> = {
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
}

/**
 * Bloque listo para el tipo nuevo: los 10 campos polimórficos en `null` explícito y encima los
 * defaults tipados de `newType` (p. ej. movilidad → roller limpia el hold y siembra "10 pasadas").
 * Conserva `sets`, `rest_time`, `notes`, `superset_group`, `side_mode` e `instructions`.
 *
 * Si el bloque YA es de ese tipo devuelve el mismo objeto sin tocar nada: un re-render o un click
 * repetido en el selector no puede borrar la prescripción que el coach acaba de escribir.
 *
 * NO escribe `exercise_type_override`: eso lo decide el call site (`type === ownType ? null : type`,
 * `BlockEditSheet.tsx` / `BlockEditorSheet.tsx`), que es donde vive la regla del override.
 */
export function stripFieldsForType(block: BuilderBlock, newType: ExerciseType): BuilderBlock {
    const currentType = effectiveExerciseType(block, { exercise_type: block.exercise_type })
    if (currentType === newType) return block
    return { ...block, ...CLEARED_POLYMORPHIC_FIELDS, ...typedDefaultsForType(newType) }
}
