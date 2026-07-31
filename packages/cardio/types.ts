/**
 * Dominio puro de cardio — tipos de zonas de frecuencia cardiaca.
 * Cero imports de Next.js / Supabase / lib (Clean Architecture: domain/ no depende de nada).
 *
 * Modelo (specs/movida-entrenamiento, decision #4): la prescripcion persiste SOLO la zona
 * (hr_zone 1-5); los bpm se derivan al renderizar con el perfil del alumno.
 * NUNCA persistir bpm absolutos en la prescripcion.
 */

/** Zona de frecuencia cardiaca prescrita (Z1-Z5, modelo 5 zonas). */
export type HrZone = 1 | 2 | 3 | 4 | 5

/** Metodo con que se resolvio la FCmax del alumno. */
export type MaxHrMethod = 'override' | 'tanaka'

/** Metodo con que se derivaron los rangos bpm por zona. */
export type ZoneCalcMethod = 'karvonen' | 'percent_max'

/** Rango de bpm (enteros) de una zona. */
export interface HrZoneRange {
    zone: HrZone
    minBpm: number
    maxBpm: number
}

/**
 * Perfil cardio del alumno — espejo camelCase de clients.birth_date / resting_hr /
 * max_hr_override (M4 del PLAN). El repository/service hace el mapeo de columnas;
 * el dominio nunca ve snake_case de DB.
 */
export interface CardioProfile {
    /** Fecha de nacimiento ISO 'YYYY-MM-DD' (o ISO timestamp); null si el alumno no la registro. */
    birthDate: string | null
    /** FC en reposo medida (bpm); habilita Karvonen. */
    restingHr: number | null
    /** FCmax medida por el coach; manda sobre cualquier formula. */
    maxHrOverride: number | null
}

/**
 * Segundos acumulados por zona tal como viajan en jsonb: las claves son STRING ('1'..'5'), no
 * numeros — Postgres/JSON no tiene claves numericas y asi el objeto sobrevive el round-trip.
 */
export type HrZoneSecRecord = Record<'1' | '2' | '3' | '4' | '5', number>

/**
 * Resumen + curva de FC de un bloque cardio, tal cual se persiste en `workout_logs.metadata.hr`
 * (spec cardio-conectado, fases 1+2 — sin migracion DB: reusa el jsonb `metadata` existente).
 *
 * Versionado (`v: 1`) porque el consumidor web llega en fase 3: un lector futuro debe poder
 * distinguir esta forma de la siguiente. `source` dice de donde salio el dato — `'ble'` es el
 * stream en vivo de la correa (gana siempre), `'health_import'` es lo que el reloj ya habia
 * registrado en Apple Health / Health Connect.
 *
 * Campos nullables = degradacion honesta, NO ceros inventados: sin perfil FC del alumno no hay
 * clasificacion posible (`zone_sec` / `in_target_sec` quedan null) y sin muestras no hay serie
 * (`sample_period_sec` / `samples` quedan null).
 *
 * `samples` es la curva DOWNSAMPLEADA: pares `[offsetSec desde el inicio, bpm]`, tope 360 puntos
 * (~6-8 KB) para no engordar la fila ni la cola offline.
 */
export type HrMetadataV1 = {
    v: 1
    source: 'ble' | 'health_import'
    /** bpm promedio de las muestras aceptadas. */
    avg: number
    /** bpm maximo visto. */
    max: number
    /** Segundos con senal (suma de los dwell capados), no la duracion del bloque. */
    duration_sec: number
    /** Zona prescrita por el coach (`workout_blocks.hr_zone`); null si no prescribio zona. */
    target_zone: HrZone | null
    /** Segundos por zona; null cuando no se pudo clasificar ninguna muestra. */
    zone_sec: HrZoneSecRecord | null
    /** Segundos dentro de `target_zone`; null sin zona prescrita o sin clasificacion. */
    in_target_sec: number | null
    /** Espaciado medio (seg) de `samples`; null sin serie. */
    sample_period_sec: number | null
    /** Curva downsampleada `[offsetSec, bpm]`; null sin serie. */
    samples: [number, number][] | null
    /** Solo import: app/dispositivo que reporto el workout al hub ("Apple Watch", "Zepp", ...). */
    hub_source?: string
    /** Solo import: metros que reporto el hub (el eje del log manda; esto es evidencia). */
    distance_m?: number
    /** Solo import: calorias activas que reporto el hub. */
    calories?: number
}

/**
 * Zonas resueltas para un alumno concreto. Quien resuelve devuelve null cuando
 * no hay FCmax derivable (sin override ni edad) — la UI muestra solo "Z4" sin bpm.
 */
export interface ResolvedClientZones {
    /** FCmax efectiva (bpm entero). */
    maxHr: number
    maxHrMethod: MaxHrMethod
    zoneMethod: ZoneCalcMethod
    /** FC reposo usada por Karvonen; null si se uso %FCmax. */
    restingHr: number | null
    /** Las 5 zonas en orden Z1..Z5. */
    zones: HrZoneRange[]
}
