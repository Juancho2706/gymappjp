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
