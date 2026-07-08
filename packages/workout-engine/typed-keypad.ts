/**
 * Lógica pura del teclado numérico custom para los bloques TIPADOS (cardio/movilidad/roller).
 *
 * Los bloques tipados registran ejes propios (duración, distancia, FC, hold, pasadas) en vez de
 * peso×reps. Este módulo define, por modo, qué campos entran al teclado (label de la pestaña +
 * unidad + regla decimal) y arma el objetivo prescrito que viaja en el header del keypad. Es pura
 * y testeable — la fila (`TypedLogSetRow`) sólo la consume para abrir el teclado con las etiquetas
 * y reglas correctas. El pipeline de submit tipado (keys `actual_*`/`reps_done`) queda intacto.
 */

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
}

/**
 * Campos del teclado por modo tipado, en el orden en que el alumno los recorre con "Siguiente".
 * Reglas decimales (CEO 2026-07-04): distancia y minutos = decimal; FC, segundos y pasadas = enteros.
 */
export function typedKeypadFields(mode: TypedKeypadMode): TypedKeypadFieldDef[] {
    switch (mode) {
        case 'cardio':
            return [
                { key: 'cardio_min', label: 'Min', unit: 'min', allowDecimal: true },
                { key: 'actual_distance_m', label: 'Metros', unit: 'm', allowDecimal: true },
                { key: 'actual_avg_hr', label: 'FC', unit: 'bpm', allowDecimal: false },
            ]
        case 'mobility':
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
 * ("Duración 20 min · Z4", "Hold 30s · 3 series", "10 pasadas"). Vacío si no hay prescripción.
 */
export function formatTypedObjective(block: TypedObjectiveInput, mode: TypedKeypadMode): string {
    const parts: string[] = []
    if (mode === 'cardio') {
        if ((block.duration_sec ?? 0) > 0) parts.push(fmtDuration(block.duration_sec as number))
        if ((block.distance_value ?? 0) > 0) parts.push(`${block.distance_value} ${block.distance_unit ?? 'm'}`)
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
