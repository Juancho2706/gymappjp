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
import { effectiveExerciseType, type ExerciseType, type TypedBlockFields } from '@eva/workout-engine'
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

// ─── Fuerza: «Reps | Segundos» (specs/cuenta-atras-en-pantalla, D3 + D4) ─────

/**
 * Los dos modos de prescripción DENTRO de Fuerza. NO son tipos de ejercicio (D3: sin quinto tipo):
 * una plancha con disco sigue siendo `strength` y conserva carga, RIR, tempo, descanso y lado.
 */
export type StrengthPrescriptionMode = 'reps' | 'sec'

/**
 * Modo vigente de un bloque de fuerza. `reps_unit === 'sec'` es la ÚNICA marca del modo Segundos en
 * el builder — el predicado del ejecutor (`isStrengthTimeBlock`, R3) además exige `duration_sec > 0`,
 * pero acá el bloque puede estar a medio tipear y el selector no puede saltar solo a «Reps».
 */
function strengthPrescriptionMode(block: BuilderBlock): StrengthPrescriptionMode {
    return block.reps_unit === 'sec' ? 'sec' : 'reps'
}

/**
 * Conmuta un bloque de fuerza entre «Reps» y «Segundos» dejando el resto de la prescripción intacta.
 *
 *   - `'sec'` ⇒ escribe `duration_sec` + `reps_unit: 'sec'` y baja la **doble progresión** a
 *     `weekly_linear` (D4): `parseRepsTop('30s')` devuelve **30** (regex `\d+`), así que sin este
 *     guard la doble progresión trataría 30 segundos como 30 reps y subiría el peso sola.
 *   - `'reps'` ⇒ `duration_sec` y `reps_unit` en `null` EXPLÍCITO.
 *
 * **`null`, jamás `undefined`** (misma regla R32 de la cabecera del archivo): el serializador RN
 * sólo sobreescribe una columna tipada cuando el campo está DEFINIDO, así que un strip con
 * `undefined` es un no-op y `_raw` repone el residuo — el alumno vería un reloj de 30 s en un press
 * de banca. Por eso `progression_mode` también sale como `?? null` y nunca como `undefined`.
 *
 * **No toca** `sets`, `target_weight_kg`, `rir`, `tempo`, `rest_time`, `warmup_rest_time`,
 * `side_mode`, `superset_group`, `notes` ni `instructions` (D3), ni `reps` (borrarlo dejaría al coach
 * en «Datos incompletos» mientras tipea; el espejo legacy lo escribe el builder en W2), ni
 * `reps_value` (R3: sin consumidores verificados en el eje de fuerza).
 *
 * Si el bloque YA está en ese modo devuelve el MISMO objeto sin tocar nada, igual que
 * `stripFieldsForType`: un re-render o un click repetido en el segmented no puede pisar los segundos
 * que el coach acaba de escribir.
 */
export function stripFieldsForStrengthMode(
    block: BuilderBlock,
    mode: StrengthPrescriptionMode,
    durationSec?: number | null,
): BuilderBlock {
    if (strengthPrescriptionMode(block) === mode) return block
    if (mode === 'reps') return { ...block, duration_sec: null, reps_unit: null }
    return {
        ...block,
        duration_sec: durationSec ?? block.duration_sec ?? null,
        reps_unit: 'sec',
        progression_mode: block.progression_mode === 'double'
            ? 'weekly_linear'
            : block.progression_mode ?? null,
    }
}

/**
 * Espejo legible que el builder escribe en `reps` cuando el bloque está en modo Segundos
 * (`legacyRepsSummaryFor` del motor: «30s», «1m30s», «30s/lado»). Sirve para reconocerlo al volver a
 * Reps y no dejarlo como «repeticiones» del coach.
 */
const STRENGTH_TIME_REPS_MIRROR = /^\d+(m\d+)?s(\/lado)?$/

/**
 * Conmutación del segmented «Reps | Segundos» del builder (web `BlockEditSheet` y RN
 * `BlockEditorSheet`): strip por modo + una sola política de UI, compartida para que las dos
 * plataformas no diverjan — al volver a Reps, si `reps` quedó con el espejo del reloj se propone un
 * rango tipeable («8-12») sin pisar un texto propio del coach. Idempotente como el strip: en el modo
 * pedido devuelve el mismo objeto.
 */
export function applyStrengthModeChange(block: BuilderBlock, mode: StrengthPrescriptionMode): BuilderBlock {
    const next = stripFieldsForStrengthMode(block, mode)
    if (next === block) return block
    if (mode === 'reps' && STRENGTH_TIME_REPS_MIRROR.test(next.reps ?? '')) return { ...next, reps: '8-12' }
    return next
}

// ─── Validez del bloque: ¿tiene la prescripción MÍNIMA para guardarse? (W2.1) ─

/**
 * Rango duro de los segundos por serie en modo tiempo (R11). **Espejo local** de
 * `STRENGTH_TIME_MIN_SEC` / `STRENGTH_TIME_MAX_SEC` (`packages/schemas/workout.ts`), re-declarado
 * acá con el MISMO criterio con que `types.ts` re-declara `RepsUnit`: `@eva/plan-builder` es
 * self-contained y no depende de `@eva/schemas` (que arrastra zod), porque el paquete también entra
 * al grafo de Metro del builder RN.
 *
 * La paridad no queda librada a la buena fe: `block-type-fields.test.ts` importa las dos constantes
 * del schema y las compara con éstas ⇒ moverlas de un lado sin el otro sale en rojo.
 */
const STRENGTH_TIME_MIN_SEC = 5
const STRENGTH_TIME_MAX_SEC = 600

/** Series: el único campo que comparten fuerza (clásica y por tiempo) y movilidad. */
function hasSets(block: BuilderBlock): boolean {
    return !!block.sets && block.sets >= 1
}

/** La distancia del builder es texto tipeado ("5", "2,5"): positiva y finita ⇒ hay prescripción. */
function hasDistanceValue(block: BuilderBlock): boolean {
    const n = parseFloat((block.distance_value || '').replace(',', '.'))
    return Number.isFinite(n) && n > 0
}

function isPositive(value: number | null | undefined): boolean {
    return (value ?? 0) > 0
}

/**
 * ¿El bloque tiene la prescripción mínima de SU tipo? Fuente ÚNICA de los tres guards que hasta
 * W2.1 copiaban la regla a mano —el sheet web (`BlockEditSheet.blockIsValid`), el guardado web
 * (`WeeklyPlanBuilder.handleSave`) y el guardado RN (`program-builder.blockIncomplete`)—, que es
 * justo lo que hacía falta para que el modo Segundos no diera **falso positivo** (el coach en modo
 * tiempo ve «Datos incompletos» y no puede guardar) ni **falso negativo** (un bloque sin reps y sin
 * segundos se guarda igual).
 *
 * **Fuerza** (D3): con `reps_unit === 'sec'` manda el reloj —series + segundos dentro del rango—;
 * si no, la regla histórica de siempre (series + texto de reps), byte a byte. El discriminante es
 * `reps_unit === 'sec'` SOLO, no `isStrengthTimeBlock` (que además exige `duration_sec > 0`): en el
 * builder el bloque puede estar a medio tipear y caer a la rama de reps diría «completo» por el
 * texto viejo del coach, que es exactamente el falso negativo que esta función viene a cerrar.
 *
 * **Cardio / movilidad / roller**: los tres guards NO coincidían —los dos de guardado (web y RN)
 * aceptaban además `!!reps?.trim()` como prescripción de movilidad y roller; el sheet web no—. Se
 * unifica hacia la PERMISIVA (decisión del jefe, W2.1): en LIVE hay 94 bloques de movilidad de 58
 * coaches sin `duration_sec` ni `reps_value` pero con texto en `reps`, que hoy se guardan; la regla
 * estricta los dejaría sin poder reguardar el programa («Hay ejercicios con datos incompletos»). Un
 * tren que arregla no puede bloquear lo que ya funciona. El sheet gana la misma tolerancia.
 */
export function isBlockComplete(block: BuilderBlock, type: ExerciseType): boolean {
    if (type === 'cardio') {
        return isPositive(block.duration_sec) || hasDistanceValue(block) || !!block.interval_config
    }
    if (type === 'mobility') {
        return hasSets(block) && (isPositive(block.duration_sec) || isPositive(block.reps_value) || !!block.reps?.trim())
    }
    if (type === 'roller') {
        return isPositive(block.duration_sec) || isPositive(block.reps_value) || !!block.reps?.trim()
    }
    if (strengthPrescriptionMode(block) === 'sec') {
        const sec = block.duration_sec ?? 0
        return hasSets(block) && sec >= STRENGTH_TIME_MIN_SEC && sec <= STRENGTH_TIME_MAX_SEC
    }
    return hasSets(block) && !!block.reps?.trim()
}

/**
 * Vista `TypedBlockFields` de un bloque del builder. En el editor `distance_value` y `load_value` son
 * strings de input (se parsean al guardar) y el motor los quiere numéricos; para el predicado y los
 * formatos de fuerza por tiempo (`isStrengthTimeBlock`, `formatStrengthTimeObjective*`,
 * `formatProgressionTag`) esos dos ejes no cuentan, así que van parseados o en `null` — la misma
 * normalización que los chips ya hacen a mano antes de llamar `typedBlockSummary`.
 */
export function builderTypedFields(
    block: BuilderBlock,
): Omit<BuilderBlock, 'distance_value' | 'load_value'> & TypedBlockFields & { distance_value: number | null; load_value: null } {
    const dist = Number.parseFloat((block.distance_value ?? '').replace(',', '.'))
    return { ...block, distance_value: Number.isFinite(dist) ? dist : null, load_value: null }
}
