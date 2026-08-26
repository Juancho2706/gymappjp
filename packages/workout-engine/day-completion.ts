/**
 * Completitud de UN día de entrenamiento — regla ÚNICA compartida por web y RN
 * (spec `docs/specs/workout-day-in-progress`, decisión CEO O2 2026-07-26).
 *
 * Qué resuelve: hasta hoy un día quedaba `done` con UNA sola serie registrada, así que un alumno
 * interrumpido a mitad de sesión reentraba por la day-card y caía al sheet "Ya hiciste este
 * entrenamiento" (incidente P0 2026-07-26). La regla vive acá — y sólo acá — porque el concepto ya
 * tenía tres implementaciones paralelas (TS web, TS RN, SQL del RPC de racha); una cuarta sería drift
 * garantizado.
 *
 * REGLA (SPEC "Regla de completitud"):
 *   · Series esperadas por bloque = `sets` si es numérico > 0; si es `null`/`0`/ausente (cardio,
 *     movilidad, formatos sin prescripción de series) el bloque cuenta como UNA unidad.
 *   · Series registradas por bloque se CAPAN a su esperado. El índice único (bloque, set_number, día)
 *     garantiza filas exactas; el cap evita >100% cuando el coach edita el bloque a la baja DESPUÉS
 *     de la sesión.
 *   · `pct = sum(min(logged_b, expected_b)) / sum(expected_b)`.
 *   · 0 series registradas ⇒ `none`; 100% ⇒ `done`; cualquier punto intermedio ⇒ `in_progress`.
 *
 * DERIVADO PURO, SIN PERSISTENCIA: si el coach edita los bloques después de la sesión el estado se
 * recalcula solo y un día puede migrar entre estados (aceptado explícitamente en el SPEC).
 *
 * LOGS HUÉRFANOS: las entradas de `loggedSetsByBlock` cuyo bloque ya NO existe en el plan se IGNORAN
 * (bloque borrado o reemplazado por el coach). No suman ni al numerador ni al denominador: el día se
 * mide siempre contra el plan VIGENTE. Corolario: un plan sin bloques da `none` (expected 0), nunca
 * `done` — no existe el "100% de nada".
 *
 * CAP POR CANTIDAD, NO POR ÍNDICE: el cap mira cuántas series hay registradas, no qué `set_number`
 * traen. Una serie con número fuera de rango (bloque bajado de 4 a 3 series post-sesión) cuenta como
 * una serie registrada y luego se capa. Es una simplificación deliberada frente al filtro por índice
 * de `heroComplianceBundle.ts` (`set_number < 1 || > sets`): con numeración contigua —el caso real—
 * ambos dan el MISMO resultado.
 *
 * NO-OBJETIVOS (SPEC): la racha real del home (RPC `get_client_current_streak`), `workout_sessions`
 * y la adherencia 30d / momentum NO consumen esto en v1.
 *
 * EJERCICIOS OMITIDOS (mockup 3 · ejecutor RN 2026-08-25): un bloque que el alumno declaró OMITIDO
 * queda RESUELTO —cuenta para cerrar el día— pero NO aporta series entrenadas. Las dos mitades de esa
 * regla viven acá: `countLoggedSetsByBlock` IGNORA las filas de omisión (no son series registradas) y
 * `deriveDayCompletion` acepta `skippedBlockIds` para resolver esos bloques enteros.
 */

/** Estado de completitud del día: sin empezar, a medias, o 100% de las series esperadas. */
export type DayCompletionState = 'none' | 'in_progress' | 'done'

/**
 * Motivos por los que el alumno declara que OMITE un ejercicio del día. Catálogo cerrado (viaja a
 * `workout_logs.metadata.skip_reason` para que el coach lo lea en el registro); `null` = omitido sin
 * declarar motivo (el motivo es OPCIONAL en la UI).
 */
export const SKIP_REASONS = ['no_space', 'machine_busy', 'discomfort', 'other'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

/**
 * Mitad "omisión" de `workout_logs.metadata` (jsonb). La fila de omisión se escribe por el MISMO
 * pipeline que una serie (`logSet`) pero SIN valores de ejes: es una declaración, no un registro.
 * Espejo VERBATIM de las claves de la columna (snake_case) — igual que el hold por lado.
 */
export interface WorkoutSkipMetadata {
    /** `true` ⇒ esta fila declara el bloque OMITIDO (no es una serie entrenada). */
    skipped?: boolean | null
    /** Motivo declarado (catálogo `SKIP_REASONS`) o `null` si el alumno no eligió ninguno. */
    skip_reason?: SkipReason | string | null
}

/** Metadata de la fila de omisión de un bloque. `reason` null ⇒ sólo se marca `skipped`. */
export function buildSkipMetadata(reason: SkipReason | null): WorkoutSkipMetadata {
    return reason ? { skipped: true, skip_reason: reason } : { skipped: true }
}

/** Fila mínima capaz de declarar una omisión (cualquier log con su columna `metadata`). */
export interface SkippableLogRow {
    metadata?: WorkoutSkipMetadata | null
}

/** ¿La fila es una declaración de OMISIÓN del bloque (y no una serie entrenada)? */
export function isSkippedSetRow(row: SkippableLogRow | null | undefined): boolean {
    return row?.metadata?.skipped === true
}

/** Bloque del plan reducido a lo único que define el denominador. */
export interface DayCompletionBlock {
    id: string
    /** Series prescritas. `null`/`0`/ausente ⇒ el bloque vale 1 unidad (cardio, movilidad, etc.). */
    sets?: number | null
}

export interface DayCompletionInput {
    /** Bloques VIGENTES del plan del día (los borrados simplemente no vienen). */
    blocks: readonly DayCompletionBlock[]
    /** Series registradas por bloque: `{ [blockId]: cantidad }` (ver `countLoggedSetsByBlock`). */
    loggedSetsByBlock: Readonly<Record<string, number>>
    /**
     * Bloques que el alumno declaró OMITIDOS (ver `skippedBlockIdsFromLogs`). Cada uno cuenta como
     * RESUELTO por su esperado completo — el día puede cerrar aunque esos ejercicios no se entrenaran.
     * Omitir el campo ⇒ comportamiento idéntico al histórico (nada se resuelve solo).
     */
    skippedBlockIds?: readonly string[]
}

export interface DayCompletion {
    state: DayCompletionState
    /** Fracción completada en [0, 1]. `0` cuando no hay nada esperado (plan sin bloques). */
    pct: number
    /** Denominador: suma de series esperadas de los bloques vigentes. */
    expected: number
    /**
     * Numerador: series RESUELTAS — las registradas (capadas bloque a bloque a su esperado) MÁS el
     * esperado completo de los bloques omitidos. Es el numerador de `pct`/`state`, NO un conteo de
     * series entrenadas: para eso está `countLoggedSetsByBlock`, que ignora las filas de omisión.
     */
    logged: number
}

/** Conteo defensivo: cualquier basura (no numérico, NaN, negativo) cuenta 0; decimales se truncan. */
function toCount(value: number | null | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
    return Math.floor(value)
}

/**
 * Series esperadas de UN bloque: `sets` si es numérico > 0, si no 1 unidad (cardio/movilidad y todo
 * formato sin prescripción de series). Nunca devuelve 0 — un bloque siempre pesa en el denominador.
 */
export function expectedSetsForBlock(block: DayCompletionBlock): number {
    return Math.max(toCount(block.sets), 1)
}

/**
 * Completitud del día según la regla del SPEC. Función PURA: mismas entradas ⇒ misma salida en web y
 * en RN (los fixtures de `day-completion.fixtures.ts` congelan el contrato para ambas).
 *
 * Ids de bloque repetidos en `blocks` se cuentan UNA sola vez (la primera aparición gana): así el
 * `pct` nunca supera 1 aunque el caller arme mal la lista.
 */
export function deriveDayCompletion(input: DayCompletionInput): DayCompletion {
    const { blocks, loggedSetsByBlock } = input
    const skipped = input.skippedBlockIds && input.skippedBlockIds.length > 0 ? new Set(input.skippedBlockIds) : null

    const seenBlockIds = new Set<string>()
    let expected = 0
    let logged = 0

    for (const block of blocks) {
        if (seenBlockIds.has(block.id)) continue
        seenBlockIds.add(block.id)
        const blockExpected = expectedSetsForBlock(block)
        expected += blockExpected
        // Bloque OMITIDO: resuelto por su esperado completo (el alumno declaró que no lo haría), sin
        // importar cuántas series alcanzó a registrar antes de omitirlo.
        if (skipped?.has(block.id)) {
            logged += blockExpected
            continue
        }
        // Cap por bloque: lo registrado de más (bloque editado a la baja) no infla el numerador.
        logged += Math.min(toCount(loggedSetsByBlock[block.id]), blockExpected)
    }

    // Plan sin bloques (o sin nada esperado): no hay 100% de nada.
    if (expected <= 0) return { state: 'none', pct: 0, expected: 0, logged: 0 }
    // Cero series del plan vigente: los huérfanos ya quedaron fuera del conteo.
    if (logged <= 0) return { state: 'none', pct: 0, expected, logged: 0 }
    if (logged >= expected) return { state: 'done', pct: 1, expected, logged: expected }
    return { state: 'in_progress', pct: logged / expected, expected, logged }
}

/** Fila de serie registrada tal como viaja hoy en web (`getRecentWorkoutLogs`) y en la home de RN. */
export interface LoggedSetRow {
    block_id: string | null
    set_number?: number | null
    /**
     * Columna `metadata` jsonb — sólo se lee la mitad de OMISIÓN. Opcional/aditiva: un caller que no
     * la seleccione se comporta exactamente como antes (ninguna fila cuenta como omitida).
     */
    metadata?: WorkoutSkipMetadata | null
}

/**
 * Agrupa filas de series registradas en el `loggedSetsByBlock` que consume `deriveDayCompletion`.
 * Vive acá para que web y RN no vuelvan a escribir el mismo bucketing (origen del drift).
 *
 * Deduplica por (`block_id`, `set_number`) — el índice único de la DB ya lo garantiza, pero la cola
 * offline puede entregar la misma serie dos veces antes de reconciliar. Filas sin `block_id` se
 * ignoran; `set_number` nulo cuenta como UNA serie del bloque (dos filas nulas del mismo bloque
 * colapsan a una).
 *
 * Las filas de OMISIÓN (`metadata.skipped`) NO se cuentan: son una declaración del alumno, no una
 * serie entrenada — un skip jamás debe inflar las "series registradas" que ve el coach. Para que el
 * bloque igual resuelva el día, el caller pasa `skippedBlockIdsFromLogs(rows)` a `deriveDayCompletion`.
 *
 * El caller filtra ANTES por plan y por día (huso Santiago): esta función no sabe de fechas.
 */
export function countLoggedSetsByBlock(rows: readonly LoggedSetRow[]): Record<string, number> {
    const seenSetKeys = new Set<string>()
    const counts = new Map<string, number>()

    for (const row of rows) {
        const blockId = row.block_id
        if (typeof blockId !== 'string' || blockId.length === 0) continue
        if (isSkippedSetRow(row)) continue
        const key = `${blockId}#${row.set_number ?? ''}`
        if (seenSetKeys.has(key)) continue
        seenSetKeys.add(key)
        counts.set(blockId, (counts.get(blockId) ?? 0) + 1)
    }

    return Object.fromEntries(counts)
}

/**
 * Ids de los bloques que traen al menos una fila de OMISIÓN — el `skippedBlockIds` que consume
 * `deriveDayCompletion`. Compañera de `countLoggedSetsByBlock`: misma entrada, mismo filtrado previo
 * por plan/día del caller. Sin filas de omisión devuelve `[]` (barato para el caso normal).
 */
export function skippedBlockIdsFromLogs(rows: readonly LoggedSetRow[]): string[] {
    const ids = new Set<string>()
    for (const row of rows) {
        const blockId = row.block_id
        if (typeof blockId !== 'string' || blockId.length === 0) continue
        if (isSkippedSetRow(row)) ids.add(blockId)
    }
    return [...ids]
}
