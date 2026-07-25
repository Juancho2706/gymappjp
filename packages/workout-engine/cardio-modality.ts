/**
 * Ejes de captura de CARDIO por modalidad (Fase C · specs/cardio-ejes-y-fixes, hallazgo G6).
 *
 * Hasta la Fase C todo bloque de cardio pedía las MISMAS 3 cajas (Min · Metros · FC) sin mirar el
 * ejercicio: a quien saltaba la cuerda o pedaleaba en una bici estática se le pedían "Metros", un
 * dato que no existe en esa modalidad. `exercises.cardio_modality` (migración 20260725221804)
 * clasifica los 9 ejercicios de cardio de sistema y este módulo traduce esa modalidad a la lista
 * ordenada de ejes que el teclado tipado ofrece.
 *
 * Fuente ÚNICA compartida: web (`LogSetForm`) y RN (`SetRow`) llegan acá vía `typedKeypadFields`,
 * así que el mapa se cambia UNA vez y las dos plataformas quedan a paridad.
 *
 * Reglas duras del diseño:
 *  - Cero columnas nuevas: saltos/reps/pisos viajan en `workout_logs.reps_done` (entero ≥ 0), la
 *    semántica la da la modalidad; distancia sigue en `actual_distance_m` (metros), tiempo en
 *    `actual_duration_sec` y FC en `actual_avg_hr`.
 *  - Modalidad desconocida o ausente (`null`) ⇒ ejes GENÉRICOS = los 3 de siempre, byte-idénticos.
 *    Los planes viejos y los ejercicios de cardio creados por coaches no cambian de comportamiento.
 *  - FC está en TODAS las modalidades (el pulsómetro BLE ya cablea ese eje en ambas plataformas).
 *
 * Mapa aprobado por el owner (D2/D4, 2026-07-25):
 *   run · bike · row  → Min · Distancia (en la unidad prescrita, RF4) · FC
 *   elliptical        → Min · FC
 *   jump_rope         → Min · Saltos · FC
 *   hiit_reps         → Min · Reps · FC
 *   stairs            → Min · Pisos · FC
 *   null (genérica)   → Min · Distancia · FC
 */

// SOLO tipos desde `typed-keypad` (import erasable): la dependencia de VALORES va en el sentido
// contrario (typed-keypad importa `cardioAxesFor` de acá y re-exporta los helpers de unidad de abajo),
// así el grafo queda acíclico en runtime — un ciclo ESM acá lo pagaría el build de web.
import type { TypedKeypadFieldDef } from './typed-keypad'

/** Metros por kilómetro — factor único de la conversión de captura de distancia. */
export const METERS_PER_KM = 1000

/** ¿La distancia se CAPTURA en km? (solo cuando el coach prescribió la distancia en km). */
export function capturesDistanceInKm(distanceUnit?: string | null): boolean {
    return distanceUnit === 'km'
}

/** Valor tipeado en la caja de distancia → metros de `actual_distance_m`. */
export function distanceCaptureToMeters(value: number, distanceUnit?: string | null): number {
    return capturesDistanceInKm(distanceUnit) ? Math.round(value * METERS_PER_KM) : value
}

/**
 * Inversa de `distanceCaptureToMeters`: metros de la columna → valor que se muestra en la caja
 * (km con hasta 2 decimales), para que el alumno relea EXACTAMENTE lo que escribió al remontar.
 */
export function metersToDistanceCapture(
    meters: number | null | undefined,
    distanceUnit?: string | null,
): number | null {
    if (meters == null) return null
    if (!capturesDistanceInKm(distanceUnit)) return meters
    return Math.round((meters / METERS_PER_KM) * 100) / 100
}

/** Modalidades del catálogo (espejo exacto del CHECK de `exercises.cardio_modality`). */
export type CardioModality = 'run' | 'bike' | 'row' | 'elliptical' | 'jump_rope' | 'hiit_reps' | 'stairs'

/** Lista canónica, en el orden del CHECK de la migración. */
export const CARDIO_MODALITIES: readonly CardioModality[] = [
    'run',
    'bike',
    'row',
    'elliptical',
    'jump_rope',
    'hiit_reps',
    'stairs',
] as const

/**
 * Unidad rep-based de la PRESCRIPCIÓN (`workout_blocks.reps_unit`, superset ampliado por la
 * migración 20260725221804 con 'jumps' y 'floors').
 */
export type CardioRepsUnit = 'jumps' | 'floors' | 'reps'

/** Valor crudo de la DB → modalidad conocida, o `null` (genérica) si no la reconocemos. */
export function normalizeCardioModality(raw: string | null | undefined): CardioModality | null {
    if (!raw) return null
    return (CARDIO_MODALITIES as readonly string[]).includes(raw) ? (raw as CardioModality) : null
}

/** Lista canónica de unidades rep-based de cardio (espejo del CHECK de `workout_blocks.reps_unit`). */
export const CARDIO_REPS_UNITS: readonly CardioRepsUnit[] = ['jumps', 'floors', 'reps'] as const

/** `reps_unit` crudo de la prescripción → unidad rep-based de cardio, o `null` ('passes'/'breaths'/…). */
export function normalizeCardioRepsUnit(raw: string | null | undefined): CardioRepsUnit | null {
    if (!raw) return null
    return (CARDIO_REPS_UNITS as readonly string[]).includes(raw) ? (raw as CardioRepsUnit) : null
}

/** Modalidades cuyo 2º eje es un CONTEO (saltos/reps/pisos) en vez de distancia. */
const REPS_UNIT_BY_MODALITY: Partial<Record<CardioModality, CardioRepsUnit>> = {
    jump_rope: 'jumps',
    hiit_reps: 'reps',
    stairs: 'floors',
}

/** Modalidades SIN eje de distancia (la elíptica no la reporta; las rep-based tampoco). */
const MODALITIES_WITHOUT_DISTANCE: readonly CardioModality[] = ['elliptical', 'jump_rope', 'hiit_reps', 'stairs']

/**
 * Unidad rep-based de la modalidad, o `null` si esa modalidad no captura conteo.
 * Acepta el valor crudo de la DB (se normaliza acá) para que los callers no dupliquen el guard.
 */
export function repsUnitForModality(modality: string | null | undefined): CardioRepsUnit | null {
    const m = normalizeCardioModality(modality)
    return m == null ? null : REPS_UNIT_BY_MODALITY[m] ?? null
}

/** ¿La modalidad pide la caja de distancia? (genérica = sí, comportamiento histórico). */
export function cardioHasDistanceAxis(modality: string | null | undefined): boolean {
    const m = normalizeCardioModality(modality)
    if (m == null) return true
    return !MODALITIES_WITHOUT_DISTANCE.includes(m)
}

/** Etiqueta de la caja / encabezado de columna: "Saltos" · "Pisos" · "Reps". */
export function cardioRepsLabel(unit: CardioRepsUnit): string {
    return unit === 'jumps' ? 'Saltos' : unit === 'floors' ? 'Pisos' : 'Reps'
}

/** Unidad corta que acompaña al display del teclado y a los textos: "saltos" · "pisos" · "reps". */
export function cardioRepsUnitShort(unit: CardioRepsUnit): string {
    return unit === 'jumps' ? 'saltos' : unit === 'floors' ? 'pisos' : 'reps'
}

/**
 * Conteo con su unidad, con singular correcto: `420 saltos`, `1 piso`, `30 reps`.
 * Sin unidad conocida cae a "reps" (genérico), para no imprimir un número pelado.
 */
export function formatCardioReps(value: number, unit: CardioRepsUnit | null): string {
    const u = unit ?? 'reps'
    if (value === 1) return `${value} ${u === 'jumps' ? 'salto' : u === 'floors' ? 'piso' : 'rep'}`
    return `${value} ${cardioRepsUnitShort(u)}`
}

/** Contexto de los ejes: hoy solo la unidad de distancia PRESCRITA del bloque (RF4). */
export interface CardioAxesContext {
    /** `distance_unit` del bloque ('m' | 'km'); 'km' ⇒ la caja captura KM y guarda metros ×1000. */
    distanceUnit?: string | null
}

const minutesAxis = (): TypedKeypadFieldDef => ({
    key: 'cardio_min',
    label: 'Min',
    unit: 'min',
    allowDecimal: true,
})

const hrAxis = (): TypedKeypadFieldDef => ({
    key: 'actual_avg_hr',
    label: 'FC',
    unit: 'bpm',
    allowDecimal: false,
})

/**
 * Eje de distancia en la unidad PRESCRITA (G3/RF4): con 'km' la caja se llama "Km" y declara el
 * factor a metros; sin prescripción (o con 'm') sigue siendo "Metros" tal cual siempre.
 */
export function cardioDistanceAxis(distanceUnit?: string | null): TypedKeypadFieldDef {
    return capturesDistanceInKm(distanceUnit)
        ? { key: 'actual_distance_m', label: 'Km', unit: 'km', allowDecimal: true, toColumnFactor: METERS_PER_KM }
        : { key: 'actual_distance_m', label: 'Metros', unit: 'm', allowDecimal: true }
}

/** Eje de conteo (saltos/reps/pisos) → `workout_logs.reps_done`, entero ≥ 0. */
export function cardioRepsAxis(unit: CardioRepsUnit): TypedKeypadFieldDef {
    return {
        key: 'reps_done',
        label: cardioRepsLabel(unit),
        unit: cardioRepsUnitShort(unit),
        allowDecimal: false,
    }
}

/**
 * Ejes de captura de UNA ronda de cardio, en el orden en que el alumno los recorre.
 * `null`/desconocida ⇒ Min · Distancia · FC (idéntico al comportamiento previo a la Fase C).
 */
export function cardioAxesFor(
    modality: string | null | undefined,
    ctx?: CardioAxesContext,
): TypedKeypadFieldDef[] {
    const repsUnit = repsUnitForModality(modality)
    const axes: TypedKeypadFieldDef[] = [minutesAxis()]
    if (repsUnit != null) axes.push(cardioRepsAxis(repsUnit))
    else if (cardioHasDistanceAxis(modality)) axes.push(cardioDistanceAxis(ctx?.distanceUnit))
    axes.push(hrAxis())
    return axes
}
