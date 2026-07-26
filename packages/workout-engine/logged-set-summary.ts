/**
 * Formateo PURO de lo que el alumno REGISTRÓ en una serie tipada, para las superficies del COACH
 * (ficha del alumno web + móvil).
 *
 * Hasta la Fase B ninguna pantalla de coach leía `actual_duration_sec` / `actual_distance_m` /
 * `actual_avg_hr` / `actual_hold_sec` / `metadata`: una ronda de 45 min y 6.200 m se veía como una
 * serie vacía de fuerza (hallazgo G1). Este módulo traduce esas columnas a UNA línea por ronda,
 * tipada por el tipo efectivo del ejercicio (`effectiveExerciseType`).
 *
 * Vive en el motor compartido porque web y RN pintan la MISMA línea. `strength` devuelve `null`
 * a propósito: la fila de fuerza (peso × reps + RPE/RIR) la sigue pintando cada plataforma como hoy.
 *
 * Números en es-neutro sin `Intl` (coma decimal, punto de miles) → determinista en Node, Hermes y
 * navegador, y testeable sin depender del locale del runtime.
 */

import type { ExerciseType } from './workout-exercise-type'
import { formatCardioReps, repsUnitForModality } from './cardio-modality'

/** Subconjunto de `workout_logs` que necesita la línea (todas las columnas ya existen). */
export interface LoggedSetLike {
    reps_done?: number | null
    actual_duration_sec?: number | null
    actual_distance_m?: number | null
    actual_avg_hr?: number | null
    actual_hold_sec?: number | null
    /** jsonb `{left_sec, right_sec}` de movilidad por lado; cualquier otra forma se ignora. */
    metadata?: unknown
}

/** Ronda cerrada sin ningún eje registrado (decisión D3: la ronda vacía es válida). */
export const EMPTY_LOGGED_SET_LABEL = 'Registrado sin datos'

function groupThousands(intDigits: string): string {
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** `3200 → "3.200"` · `12.5 → "12,5"` · `20.0 → "20"`. Sin `Intl` (ver cabecera). */
export function formatEsNumber(value: number, maxDecimals = 0): string {
    if (!Number.isFinite(value)) return '0'
    const fixed = Math.abs(value).toFixed(maxDecimals)
    const [intDigits, decDigits = ''] = fixed.split('.')
    const decimals = decDigits.replace(/0+$/, '')
    const sign = value < 0 ? '-' : ''
    const int = groupThousands(intDigits ?? '0')
    return decimals ? `${sign}${int},${decimals}` : `${sign}${int}`
}

/** Duración registrada: `< 60 s` en segundos ("45 s"), desde 1 min en minutos ("12,5 min"). */
export function formatLoggedDuration(sec: number): string {
    if (sec < 60) return `${formatEsNumber(sec)} s`
    return `${formatEsNumber(sec / 60, 1)} min`
}

interface SideSeconds {
    left: number | null
    right: number | null
}

/** Lee `{left_sec, right_sec}` del jsonb del log; null si no viene o no es esa forma. */
export function loggedSideSeconds(metadata: unknown): SideSeconds | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const raw = metadata as Record<string, unknown>
    const left = typeof raw.left_sec === 'number' && raw.left_sec > 0 ? raw.left_sec : null
    const right = typeof raw.right_sec === 'number' && raw.right_sec > 0 ? raw.right_sec : null
    if (left == null && right == null) return null
    return { left, right }
}

function positive(value: number | null | undefined): number | null {
    return value != null && value > 0 ? value : null
}

function cardioParts(log: LoggedSetLike, cardioModality?: string | null): string[] {
    const parts: string[] = []
    const duration = positive(log.actual_duration_sec)
    if (duration != null) parts.push(formatLoggedDuration(duration))
    // La distancia se imprime siempre que exista en el log: aunque la modalidad ya no la pida (una
    // elíptica, por ejemplo), un registro viejo con metros es dato real del alumno y el coach debe verlo.
    const distance = positive(log.actual_distance_m)
    if (distance != null) parts.push(`${formatEsNumber(distance, 1)} m`)
    // Conteo de las modalidades rep-based, con la etiqueta correcta (saltos/pisos/reps). Sin modalidad
    // (ejercicio genérico o plan viejo) un `reps_done` en cardio se imprime como "N reps".
    const reps = positive(log.reps_done)
    if (reps != null) parts.push(formatCardioReps(reps, repsUnitForModality(cardioModality)))
    const hr = positive(log.actual_avg_hr)
    if (hr != null) parts.push(`FC ${formatEsNumber(hr)}`)
    return parts
}

function mobilityParts(log: LoggedSetLike): string[] {
    const sides = loggedSideSeconds(log.metadata)
    if (sides) {
        if (sides.left != null && sides.right != null) {
            return sides.left === sides.right
                ? [`${formatEsNumber(sides.left)} s por lado`]
                : [`Izq. ${formatEsNumber(sides.left)} s`, `Der. ${formatEsNumber(sides.right)} s`]
        }
        const only = sides.left ?? sides.right!
        return [`${sides.left != null ? 'Izq.' : 'Der.'} ${formatEsNumber(only)} s`]
    }
    const hold = positive(log.actual_hold_sec)
    return hold != null ? [`${formatEsNumber(hold)} s`] : []
}

function rollerParts(log: LoggedSetLike): string[] {
    const parts: string[] = []
    const duration = positive(log.actual_duration_sec)
    if (duration != null) parts.push(formatLoggedDuration(duration))
    const passes = positive(log.reps_done)
    if (passes != null) parts.push(`${formatEsNumber(passes)} ${passes === 1 ? 'pasada' : 'pasadas'}`)
    return parts
}

/** Contexto OPCIONAL de la línea. Sin él, el resultado es byte-idéntico al de la Fase B. */
export interface LoggedSetLineOptions {
    /** `exercises.cardio_modality` del ejercicio del bloque: da la etiqueta del conteo en cardio. */
    cardioModality?: string | null
}

/**
 * Línea de lo registrado en UNA ronda/serie tipada:
 *   cardio    → "12,5 min · 3.200 m · FC 148" · "8 min · 420 saltos · FC 152" · "12 min · 45 pisos"
 *   movilidad → "30 s por lado" / "Izq. 30 s · Der. 25 s" / "45 s"
 *   roller    → "45 s · 3 pasadas"
 * Sin ningún dato ⇒ `EMPTY_LOGGED_SET_LABEL`. `strength` ⇒ `null` (lo pinta el caller como hoy).
 *
 * 3er argumento (Fase C, opcional y retrocompatible): la modalidad de cardio, para que un conteo de
 * `reps_done` se imprima "420 saltos" y no "420 reps". Los callers existentes compilan sin cambios.
 */
export function formatLoggedSetLine(
    kind: ExerciseType,
    log: LoggedSetLike,
    opts?: LoggedSetLineOptions,
): string | null {
    if (kind === 'strength') return null
    const parts =
        kind === 'cardio'
            ? cardioParts(log, opts?.cardioModality)
            : kind === 'mobility'
              ? mobilityParts(log)
              : rollerParts(log)
    return parts.length > 0 ? parts.join(' · ') : EMPTY_LOGGED_SET_LABEL
}
