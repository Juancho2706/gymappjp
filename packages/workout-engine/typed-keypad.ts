/**
 * Lógica pura del teclado numérico custom para los bloques TIPADOS (cardio/movilidad/roller).
 *
 * Los bloques tipados registran ejes propios (duración, distancia, FC, hold, pasadas) en vez de
 * peso×reps. Este módulo define, por modo, qué campos entran al teclado (label de la pestaña +
 * unidad + regla decimal) y arma el objetivo prescrito que viaja en el header del keypad. Es pura
 * y testeable — la fila (`TypedLogSetRow`) sólo la consume para abrir el teclado con las etiquetas
 * y reglas correctas. El pipeline de submit tipado (keys `actual_*`/`reps_done`) queda intacto.
 *
 * Los EJES de cardio ya no viven acá: los resuelve `cardio-modality.ts` a partir de
 * `exercises.cardio_modality` (Fase C). Este módulo sigue siendo la puerta única del teclado tipado.
 */

import { cardioAxesFor, cardioRepsUnitShort, normalizeCardioRepsUnit } from './cardio-modality'

export type TypedKeypadMode = 'cardio' | 'mobility' | 'roller'

/** Definición de un campo numérico del teclado tipado. `key` = name del `<input>` (FormData). */
export interface TypedKeypadFieldDef {
    /** Name del input (identidad + a qué ref apunta el teclado). */
    key: string
    /** Etiqueta de la pestaña del teclado y del header de la tabla. */
    label: string
    /** Unidad mostrada junto al display del teclado. */
    unit: string
    /** ¿Admite coma decimal? (distancia/min sí; FC/segundos/pasadas no). */
    allowDecimal: boolean
    /**
     * Factor del valor TIPEADO hacia la unidad de la COLUMNA del log. Ausente ⇒ 1 (se guarda tal
     * cual, comportamiento de siempre). Hoy solo lo declara la distancia cuando el coach prescribió
     * en km: la caja captura km y `actual_distance_m` guarda metros (×1000).
     */
    toColumnFactor?: number
}

/**
 * Contexto OPCIONAL del bloque que ajusta los campos del teclado tipado. Aditivo: sin contexto (o
 * pasando el `side_mode` suelto, forma histórica) los campos son byte-idénticos a los previos.
 */
export interface TypedKeypadContext {
    /** `side_mode` del bloque (movilidad `per_side` ⇒ dos holds). */
    sideMode?: string | null
    /** `distance_unit` prescrita del bloque ('m' | 'km'); 'km' ⇒ la caja de distancia captura KM. */
    distanceUnit?: string | null
    /**
     * `exercises.cardio_modality` del ejercicio del bloque (Fase C). Decide los EJES de cardio:
     * elíptica sin distancia, cuerda por saltos, escaladora por pisos, HIIT por reps.
     * Ausente / desconocida ⇒ ejes genéricos (Min · Distancia · FC), byte-idénticos a los previos.
     */
    cardioModality?: string | null
}

/** Normaliza el 2º argumento histórico (`sideMode` suelto) al contexto tipado. */
export function typedKeypadContext(ctx?: string | null | TypedKeypadContext): TypedKeypadContext {
    if (ctx == null) return {}
    return typeof ctx === 'string' ? { sideMode: ctx } : ctx
}

/**
 * Helpers de la unidad de captura de distancia (A1/RF4). Viven en `cardio-modality.ts` — donde el eje
 * de distancia se arma — y se RE-EXPORTAN acá para no romper a ningún consumidor histórico
 * (`import { METERS_PER_KM, distanceCaptureToMeters } from '@eva/workout-engine'` sigue igual).
 */
export {
    METERS_PER_KM,
    capturesDistanceInKm,
    distanceCaptureToMeters,
    metersToDistanceCapture,
} from './cardio-modality'

/**
 * Campos del teclado por modo tipado, en el orden en que el alumno los recorre con "Siguiente".
 * Reglas decimales (CEO 2026-07-04): distancia y minutos = decimal; FC, segundos y pasadas = enteros.
 *
 * 2º argumento: `side_mode` suelto (forma histórica) o el `TypedKeypadContext` completo.
 *
 * `sideMode` (E0.5 · executor-v3): cuando un bloque de MOVILIDAD es unilateral
 * (`side_mode === 'per_side'`), el hold se captura POR LADO → el teclado declara DOS campos
 * (`hold_left_sec` / `hold_right_sec`) que `typedLogValues` mapea a `metadata {left_sec, right_sec}`
 * y suma en `actual_hold_sec`. SIN el argumento (o cualquier otro `side_mode`) el comportamiento es
 * byte-idéntico al previo: un solo campo `actual_hold_sec`.
 *
 * `distanceUnit` (G3 · cardio): la UNIDAD DE CAPTURA es la PRESCRITA. Con 'km' la caja se llama "Km"
 * y declara `toColumnFactor` para que el payload guarde metros; sin prescripción (o con 'm') sigue
 * siendo "Metros" tal cual hoy.
 *
 * `cardioModality` (G6 · Fase C): los ejes de cardio los decide `cardio-modality.ts` según la
 * modalidad del ejercicio (elíptica sin distancia, cuerda por saltos, escaladora por pisos, HIIT por
 * reps). SIN modalidad (o desconocida) devuelve exactamente los 3 campos de siempre.
 */
export function typedKeypadFields(
    mode: TypedKeypadMode,
    ctx?: string | null | TypedKeypadContext,
): TypedKeypadFieldDef[] {
    const { sideMode, distanceUnit, cardioModality } = typedKeypadContext(ctx)
    switch (mode) {
        case 'cardio':
            return cardioAxesFor(cardioModality, { distanceUnit })
        case 'mobility':
            if (sideMode === 'per_side') {
                return [
                    { key: 'hold_left_sec', label: 'Hold izq.', unit: 'seg', allowDecimal: false },
                    { key: 'hold_right_sec', label: 'Hold der.', unit: 'seg', allowDecimal: false },
                ]
            }
            return [{ key: 'actual_hold_sec', label: 'Hold', unit: 'seg', allowDecimal: false }]
        case 'roller':
            return [
                { key: 'actual_duration_sec', label: 'Seg', unit: 'seg', allowDecimal: false },
                { key: 'reps_done', label: 'Pasadas', unit: 'pas.', allowDecimal: false },
            ]
    }
}

/** Subconjunto del bloque necesario para el objetivo del header del teclado (evita atar a `BlockType`). */
export interface TypedObjectiveInput {
    duration_sec?: number | null
    distance_value?: number | null
    distance_unit?: string | null
    reps_value?: number | null
    reps_unit?: string | null
    hr_zone?: number | null
    sets?: number | null
}

/** Duración compacta: múltiplos de minuto → "20 min", <60s → "45s", resto → "1m 30s". */
function fmtDuration(sec: number): string {
    if (sec <= 0) return ''
    if (sec % 60 === 0) return `${sec / 60} min`
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}m ${s}s`
}

/**
 * Objetivo prescrito del bloque tipado en una línea corta para el header del teclado
 * ("Duración 20 min · Z4", "500 saltos · Z3", "Hold 30s · 3 series", "10 pasadas").
 * Vacío si no hay prescripción.
 */
export function formatTypedObjective(block: TypedObjectiveInput, mode: TypedKeypadMode): string {
    const parts: string[] = []
    if (mode === 'cardio') {
        if ((block.duration_sec ?? 0) > 0) parts.push(fmtDuration(block.duration_sec as number))
        if ((block.distance_value ?? 0) > 0) parts.push(`${block.distance_value} ${block.distance_unit ?? 'm'}`)
        // Objetivo rep-based (RF8): cuerda ⇒ "500 saltos", escaladora ⇒ "40 pisos", HIIT ⇒ "30 reps".
        const repsUnit = normalizeCardioRepsUnit(block.reps_unit)
        if (repsUnit != null && (block.reps_value ?? 0) > 0) {
            parts.push(`${block.reps_value} ${cardioRepsUnitShort(repsUnit)}`)
        }
        if (block.hr_zone != null) parts.push(`Z${block.hr_zone}`)
        if ((block.sets ?? 0) > 1) parts.push(`${block.sets} rondas`)
    } else if (mode === 'mobility') {
        if ((block.duration_sec ?? 0) > 0) parts.push(`Hold ${fmtDuration(block.duration_sec as number)}`)
        if ((block.sets ?? 0) > 0) parts.push(`${block.sets} series`)
        if (block.reps_unit === 'breaths' && (block.reps_value ?? 0) > 0) parts.push(`${block.reps_value} resp.`)
    } else {
        if (block.reps_unit === 'passes' && (block.reps_value ?? 0) > 0) parts.push(`${block.reps_value} pasadas`)
        else if ((block.duration_sec ?? 0) > 0) parts.push(fmtDuration(block.duration_sec as number))
    }
    return parts.join(' · ')
}
