/**
 * Dominio puro de cardio — workout que el reloj ya registro en un hub de salud (spec
 * cardio-conectado, fase 2: Apple Health / Health Connect).
 *
 * Los relojes (Apple Watch, Galaxy, Mi Band) no transmiten BLE estandar, asi que su sesion muere en
 * el hub del telefono. Este modulo es la mitad PURA del import: elegir cual de los workouts del hub
 * corresponde a la sesion que el alumno acaba de terminar y armar el parche minimo para el log.
 *
 * Dos reglas innegociables del SPEC:
 * - El import JAMAS pisa un valor tipeado por el alumno: `hubImportPatch` solo devuelve los ejes que
 *   estaban vacios.
 * - El matching exige solape >= 50% de la duracion del workout con la ventana de la sesion, para no
 *   importar la caminata de la tarde dentro del entreno de la manana.
 *
 * Los normalizadores hub->`HubWorkout` viven en `apps/mobile` (dependen de las APIs nativas); aca
 * solo entra el shape ya normalizado.
 */

import { dwellDeltaMs, emptyZoneSec, roundZoneSec } from './zone-session'
import type { HrZoneSecRecord } from './types'
import { hrToZone, type HrToZoneProfile } from './zones'

/** Solape minimo (fraccion de la duracion del workout) para aceptar un match. */
export const MIN_HUB_OVERLAP_RATIO = 0.5

/** Piso/techo de bpm aceptables al importar un promedio del hub (mismo rango que el schema del log). */
export const HUB_HR_MIN_BPM = 25
export const HUB_HR_MAX_BPM = 250

/**
 * Sesion de ejercicio leida de un hub de salud, ya normalizada (camelCase, ms epoch, SI).
 * Todo lo que el hub puede no traer es nullable — nunca se rellena con ceros.
 */
export type HubWorkout = {
    /** Identificador del hub (uuid de HealthKit / recordId de Health Connect). */
    id: string
    /** App o dispositivo que lo escribio ("Apple Watch", "Zepp", "Strava"); null si el hub no lo dice. */
    source: string | null
    /** Tipo de actividad tal como lo reporta el hub ("running", "cycling", ...). */
    activity: string | null
    /** epoch ms de inicio y fin reportados por el hub. */
    startMs: number
    endMs: number
    /** Duracion en segundos segun el hub (puede excluir pausas ⇒ no siempre es `endMs - startMs`). */
    durationSec: number
    distanceM: number | null
    calories: number | null
    avgHr: number | null
    maxHr: number | null
    /** Curva `[offsetSec desde `startMs`, bpm]` si el hub la expone; null si solo trajo agregados. */
    hrSamples: [number, number][] | null
}

/** Ventana temporal util del workout; 0 cuando el hub mando un rango degenerado (se descarta). */
function workoutSpanMs(workout: HubWorkout): number {
    const { startMs, endMs } = workout
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0
    return endMs > startMs ? endMs - startMs : 0
}

/**
 * Elige el workout del hub que corresponde a la ventana de la sesion de EVA.
 *
 * Criterio: se descarta todo lo que solape menos de `MIN_HUB_OVERLAP_RATIO` de SU PROPIA duracion
 * (la caminata de 40 min que pilla 5 min del entreno no califica); entre los candidatos gana el de
 * mayor solape absoluto y, ante empate exacto, el mas largo. Sin candidatos devuelve null y la UI
 * muestra el estado vacio honesto en vez de importar cualquier cosa.
 */
export function matchHubWorkoutToWindow(
    workouts: readonly HubWorkout[],
    windowStartMs: number,
    windowEndMs: number,
): HubWorkout | null {
    if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) return null
    if (!(windowEndMs > windowStartMs)) return null

    let best: HubWorkout | null = null
    let bestOverlap = 0
    let bestSpan = 0
    for (const workout of workouts) {
        const span = workoutSpanMs(workout)
        if (span <= 0) continue
        const overlap = Math.min(workout.endMs, windowEndMs) - Math.max(workout.startMs, windowStartMs)
        if (!(overlap > 0)) continue
        if (overlap / span < MIN_HUB_OVERLAP_RATIO) continue
        if (best === null || overlap > bestOverlap || (overlap === bestOverlap && span > bestSpan)) {
            best = workout
            bestOverlap = overlap
            bestSpan = span
        }
    }
    return best
}

/** Ejes ya registrados del log de cardio (snake_case = columnas de `workout_logs`). */
export interface HubImportExistingAxes {
    actual_duration_sec: number | null
    actual_distance_m: number | null
    actual_avg_hr: number | null
}

/**
 * Parche a aplicar sobre el log. Cada key es OPCIONAL y solo aparece cuando el eje estaba vacio y el
 * hub trajo un valor usable — un eje ausente del parche es un eje que no se toca.
 */
export interface HubImportPatch {
    actual_duration_sec?: number
    actual_distance_m?: number
    actual_avg_hr?: number
}

/** Numero utilizable: finito y > 0. Un 0 tipeado se considera eje VACIO (no hay entreno de 0 min). */
function usable(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * Arma el parche del import: SOLO los ejes que el alumno dejo vacios (null, 0 o basura no finita).
 * Un eje con valor tipeado jamas entra al objeto devuelto — es la garantia dura del SPEC ("el import
 * jamas pisa un valor tipeado"), no un `if` en la UI.
 *
 * La FC promedio se clampea a `[HUB_HR_MIN_BPM, HUB_HR_MAX_BPM]` porque los hubs devuelven promedios
 * degenerados cuando el reloj perdio contacto, y la columna tiene rango en el schema.
 */
export function hubImportPatch(workout: HubWorkout, existing: HubImportExistingAxes): HubImportPatch {
    const patch: HubImportPatch = {}
    if (!usable(existing.actual_duration_sec) && usable(workout.durationSec)) {
        patch.actual_duration_sec = Math.round(workout.durationSec)
    }
    if (!usable(existing.actual_distance_m) && usable(workout.distanceM)) {
        patch.actual_distance_m = Math.round(workout.distanceM)
    }
    if (!usable(existing.actual_avg_hr) && usable(workout.avgHr)) {
        patch.actual_avg_hr = clamp(Math.round(workout.avgHr), HUB_HR_MIN_BPM, HUB_HR_MAX_BPM)
    }
    return patch
}

/**
 * Segundos por zona de la serie que trajo el hub, con la MISMA regla de dwell que el stream BLE
 * (`dwellDeltaMs`: capado a 10 s, nunca negativo, la primera muestra no aporta) para que un tiempo
 * en zona importado sea comparable con uno medido en vivo.
 *
 * null (no un record en cero) cuando no hay serie, no hay perfil FC o ninguna muestra se pudo
 * clasificar: `metadata.hr.zone_sec` prefiere ausencia a data inventada.
 */
export function hubZoneSec(
    hrSamples: readonly (readonly [number, number])[] | null | undefined,
    profile: HrToZoneProfile | null | undefined,
): HrZoneSecRecord | null {
    if (!hrSamples || hrSamples.length === 0 || !profile) return null

    const zoneSec = emptyZoneSec()
    let prevOffsetSec: number | null = null
    let classified = 0
    for (const [offsetSec, bpm] of hrSamples) {
        if (!Number.isFinite(offsetSec) || !Number.isFinite(bpm)) continue
        const value = Math.round(bpm)
        // Muestra invalida: se descarta SIN adelantar el reloj (igual criterio que `addSample`).
        if (!(value > 0)) continue
        const dwellSec = dwellDeltaMs(prevOffsetSec == null ? null : prevOffsetSec * 1000, offsetSec * 1000) / 1000
        const classification = hrToZone(value, profile)
        if (classification) {
            classified += 1
            if (dwellSec > 0) {
                const key = String(classification.zone) as keyof HrZoneSecRecord
                zoneSec[key] += dwellSec
            }
        }
        prevOffsetSec = offsetSec
    }
    if (classified === 0) return null
    return roundZoneSec(zoneSec)
}
