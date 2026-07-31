/**
 * Dominio puro de cardio — acumulador de una sesion de FC en vivo (spec cardio-conectado, fase 1).
 *
 * El HUD del bloque cardio recibe muestras sueltas del sensor BLE (~1 por segundo, con gaps cuando
 * la correa pierde contacto) y necesita responder tres cosas: cuanto tiempo llevo en la zona que me
 * pidieron, cual es mi promedio/maximo, y como fue la curva. Este modulo es ese reducer: TypeScript
 * puro (sin React / RN / timers), asi web y mobile pueden compartirlo y los tests son deterministas.
 *
 * Reglas duras del acumulador:
 * - La permanencia (dwell) entre dos muestras se capa en `MAX_DWELL_MS`: si la correa se desconecto
 *   3 minutos, esos 3 minutos NO se regalan a la zona (mentira clasica de los acumuladores ingenuos).
 * - La clasificacion usa `hrToZone`, los MISMOS cortes que la prescripcion — cero drift.
 * - Sin perfil FC del alumno no se clasifica NADA: el resumen sale con `zone_sec: null` en vez de
 *   cinco ceros que pareceria data real.
 */

import type { HrMetadataV1, HrZone, HrZoneSecRecord } from './types'
import { hrToZone, type HrToZoneProfile } from './zones'

/** Tope de permanencia atribuible entre dos muestras (ms): un gap mas largo no infla el tiempo. */
export const MAX_DWELL_MS = 10_000

/** Fuera de zona sostenido (ms) antes de avisar. Default del AC de fase 1. */
export const OUT_OF_ZONE_THRESHOLD_MS = 10_000

/** Techo de puntos de la serie persistida (`metadata.hr.samples`). */
export const DEFAULT_MAX_SAMPLE_POINTS = 360

/** Record de segundos por zona en cero (claves string, igual que en jsonb). */
export function emptyZoneSec(): HrZoneSecRecord {
    return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
}

/** Redondea a entero cada zona (los acumuladores llevan segundos fraccionarios). */
export function roundZoneSec(zoneSec: HrZoneSecRecord): HrZoneSecRecord {
    return {
        '1': Math.round(zoneSec['1']),
        '2': Math.round(zoneSec['2']),
        '3': Math.round(zoneSec['3']),
        '4': Math.round(zoneSec['4']),
        '5': Math.round(zoneSec['5']),
    }
}

/**
 * Permanencia atribuible entre la muestra previa y la actual, en ms: capada a `MAX_DWELL_MS`,
 * nunca negativa (reloj hacia atras / muestras desordenadas) y 0 para la primera muestra.
 * Helper compartido con `hub-workout.ts` para que la serie del reloj se acumule con la MISMA regla.
 */
export function dwellDeltaMs(prevAtMs: number | null, atMs: number): number {
    if (prevAtMs == null || !Number.isFinite(prevAtMs) || !Number.isFinite(atMs)) return 0
    const delta = atMs - prevAtMs
    if (!(delta > 0)) return 0
    return Math.min(delta, MAX_DWELL_MS)
}

/**
 * Estado acumulado de la sesion de FC. Inmutable: `addSample`/`updateOutOfZone` devuelven un objeto
 * nuevo (identidad distinta ⇒ el HUD re-renderiza) y jamas mutan el recibido.
 *
 * Los acumuladores de tiempo llevan segundos FRACCIONARIOS a proposito: redondear en cada muestra
 * arrastraria hasta medio segundo de error por muestra. El redondeo pasa una sola vez, en el resumen.
 */
export interface ZoneSessionState {
    /** Zona prescrita del bloque (`workout_blocks.hr_zone`); null si el coach no pidio zona. */
    targetZone: HrZone | null
    /** epoch ms de la PRIMERA muestra — origen de los offsets de la serie; null sin muestras. */
    startedAtMs: number | null
    /** epoch ms de la ultima muestra aceptada; base del dwell siguiente. */
    lastSampleAtMs: number | null
    /** Suma de bpm de las muestras aceptadas (promedio = `sumBpm / count`). */
    sumBpm: number
    /** Muestras aceptadas. */
    count: number
    /** bpm maximo visto (0 sin muestras). */
    maxBpm: number
    /** Muestras que `hrToZone` SI pudo clasificar; 0 ⇒ el resumen sale sin `zone_sec`. */
    classifiedCount: number
    /** Segundos (fraccionarios) por zona. */
    zoneSec: HrZoneSecRecord
    /** Segundos (fraccionarios) dentro de `targetZone`. */
    inTargetSec: number
    /** Segundos (fraccionarios) con senal: suma de los dwell capados. */
    durationSec: number
    /** Serie cruda `[offsetSec desde la primera muestra, bpm]`, sin downsamplear. */
    samples: [number, number][]
    /** epoch ms en que empezo el tramo fuera de zona vigente; null si esta dentro. */
    outOfZoneSinceMs: number | null
    /** true cuando el aviso del tramo actual ya se disparo (se rearma al volver a zona). */
    outOfZoneFired: boolean
}

/** Estado inicial vacio para el bloque; `targetZone` es la zona prescrita (null = sin zona). */
export function createZoneSession(targetZone: HrZone | null): ZoneSessionState {
    return {
        targetZone,
        startedAtMs: null,
        lastSampleAtMs: null,
        sumBpm: 0,
        count: 0,
        maxBpm: 0,
        classifiedCount: 0,
        zoneSec: emptyZoneSec(),
        inTargetSec: 0,
        durationSec: 0,
        samples: [],
        outOfZoneSinceMs: null,
        outOfZoneFired: false,
    }
}

/**
 * Integra una muestra del sensor. `bpm` se redondea a entero (el sensor manda enteros y asi la serie
 * pesa menos en jsonb); una muestra no positiva o no finita se DESCARTA devolviendo el mismo estado
 * — y sin adelantar `lastSampleAtMs`, para que el dwell siguiente se mida desde la ultima muestra
 * valida (igual capado a `MAX_DWELL_MS`).
 *
 * `profile` null (alumno sin FCmax derivable) ⇒ se acumulan avg/max/serie pero NO zonas: el HUD cae
 * al chip de bpm crudo y el resumen no inventa `zone_sec`.
 *
 * La permanencia se atribuye a la zona de la muestra ACTUAL (criterio del AC: el HUD reacciona con
 * la lectura que el alumno esta viendo).
 */
export function addSample(
    state: ZoneSessionState,
    bpm: number,
    atMs: number,
    profile: HrToZoneProfile | null,
): ZoneSessionState {
    if (!Number.isFinite(bpm) || !Number.isFinite(atMs)) return state
    const value = Math.round(bpm)
    if (!(value > 0)) return state

    const startedAtMs = state.startedAtMs ?? atMs
    const dwellSec = dwellDeltaMs(state.lastSampleAtMs, atMs) / 1000
    const classification = profile ? hrToZone(value, profile) : null

    let zoneSec = state.zoneSec
    if (classification && dwellSec > 0) {
        const key = String(classification.zone) as keyof HrZoneSecRecord
        zoneSec = { ...zoneSec, [key]: zoneSec[key] + dwellSec }
    }
    const inTarget = classification != null && state.targetZone != null && classification.zone === state.targetZone
    // Offset nunca negativo: una muestra con timestamp anterior al inicio queda pegada al origen.
    const offsetSec = Math.max(0, Math.round((atMs - startedAtMs) / 1000))

    return {
        ...state,
        startedAtMs,
        lastSampleAtMs: atMs,
        sumBpm: state.sumBpm + value,
        count: state.count + 1,
        maxBpm: Math.max(state.maxBpm, value),
        classifiedCount: state.classifiedCount + (classification ? 1 : 0),
        zoneSec,
        inTargetSec: state.inTargetSec + (inTarget ? dwellSec : 0),
        durationSec: state.durationSec + dwellSec,
        samples: [...state.samples, [offsetSec, value]],
    }
}

/** Serie comprimida lista para persistir. */
export interface DownsampledSeries {
    /** Espaciado medio (seg) de la serie devuelta; 0 con menos de 2 puntos. */
    samplePeriodSec: number
    samples: [number, number][]
}

/**
 * Comprime la serie a `maxPoints` puntos promediando por bucket de indice consecutivo (factor
 * `ceil(n / maxPoints)`): cada punto de salida es el promedio de offset y de bpm de su bucket, asi
 * la curva conserva la forma en vez de perder los picos que tiraria un muestreo "1 de cada k".
 * Con `n <= maxPoints` la serie pasa intacta (solo se copia).
 */
export function downsampleSeries(
    samples: readonly (readonly [number, number])[],
    maxPoints: number = DEFAULT_MAX_SAMPLE_POINTS,
): DownsampledSeries {
    const limit = Number.isFinite(maxPoints) && maxPoints >= 1 ? Math.floor(maxPoints) : DEFAULT_MAX_SAMPLE_POINTS
    if (samples.length === 0) return { samplePeriodSec: 0, samples: [] }

    const factor = Math.ceil(samples.length / limit)
    const out: [number, number][] = []
    if (factor <= 1) {
        for (const [offsetSec, bpm] of samples) out.push([offsetSec, bpm])
    } else {
        for (let i = 0; i < samples.length; i += factor) {
            const end = Math.min(i + factor, samples.length)
            let sumOffset = 0
            let sumBpm = 0
            for (let j = i; j < end; j += 1) {
                sumOffset += samples[j][0]
                sumBpm += samples[j][1]
            }
            const n = end - i
            out.push([Math.round(sumOffset / n), Math.round(sumBpm / n)])
        }
    }

    const samplePeriodSec =
        out.length >= 2 ? Math.max(1, Math.round((out[out.length - 1][0] - out[0][0]) / (out.length - 1))) : 0
    return { samplePeriodSec, samples: out }
}

/**
 * Resumen persistible del bloque (`workout_logs.metadata.hr`) con `source: 'ble'` — el import del
 * reloj arma el suyo con `source: 'health_import'`.
 *
 * Sin muestras clasificadas no hay `zone_sec` ni `in_target_sec` (null, no ceros); sin serie no hay
 * `samples` ni `sample_period_sec`. Un estado vacio devuelve un resumen honesto de sesion sin datos.
 */
export function zoneSessionSummary(
    state: ZoneSessionState,
    maxPoints: number = DEFAULT_MAX_SAMPLE_POINTS,
): HrMetadataV1 {
    const series = downsampleSeries(state.samples, maxPoints)
    const hasSeries = series.samples.length > 0
    const classified = state.classifiedCount > 0
    return {
        v: 1,
        source: 'ble',
        avg: state.count > 0 ? Math.round(state.sumBpm / state.count) : 0,
        max: state.maxBpm,
        duration_sec: Math.round(state.durationSec),
        target_zone: state.targetZone,
        zone_sec: classified ? roundZoneSec(state.zoneSec) : null,
        in_target_sec: classified && state.targetZone != null ? Math.round(state.inTargetSec) : null,
        sample_period_sec: hasSeries ? series.samplePeriodSec : null,
        samples: hasSeries ? series.samples : null,
    }
}

/** Resultado de `updateOutOfZone`: estado nuevo + si corresponde avisar AHORA. */
export interface OutOfZoneUpdate {
    state: ZoneSessionState
    /** true SOLO en la transicion que cruza el umbral — una vez por tramo fuera de zona. */
    fire: boolean
}

/**
 * Debounce del aviso "te saliste de zona": marca el instante en que el alumno salio y dispara UNA
 * sola vez cuando lleva `thresholdMs` sostenidos afuera. Volver a zona rearma el gatillo, asi que un
 * bandazo de 3 segundos no vibra y un tramo largo no vibra en loop.
 *
 * Quien llama decide `inTarget` (y no llama en pausa): el modulo es puro, no conoce hapticas.
 */
export function updateOutOfZone(
    st: ZoneSessionState,
    inTarget: boolean,
    atMs: number,
    thresholdMs: number = OUT_OF_ZONE_THRESHOLD_MS,
): OutOfZoneUpdate {
    if (inTarget) {
        // Ya rearmado ⇒ mismo objeto (evita re-render inutil del HUD en cada muestra en zona).
        if (st.outOfZoneSinceMs == null && !st.outOfZoneFired) return { state: st, fire: false }
        return { state: { ...st, outOfZoneSinceMs: null, outOfZoneFired: false }, fire: false }
    }
    if (!Number.isFinite(atMs)) return { state: st, fire: false }
    if (st.outOfZoneSinceMs == null) {
        return { state: { ...st, outOfZoneSinceMs: atMs, outOfZoneFired: false }, fire: false }
    }
    if (st.outOfZoneFired) return { state: st, fire: false }
    if (atMs - st.outOfZoneSinceMs >= thresholdMs) {
        return { state: { ...st, outOfZoneFired: true }, fire: true }
    }
    return { state: st, fire: false }
}
