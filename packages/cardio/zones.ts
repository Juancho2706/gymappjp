/**
 * Dominio puro de cardio — FCmax y zonas de frecuencia cardiaca (Z1-Z5).
 *
 * Research 2026 (SPEC movida-entrenamiento): Tanaka (208 − 0.7·edad) es mas precisa que la
 * clasica 220−edad; Karvonen (reserva de FC) personaliza mejor cuando hay FC de reposo medida.
 * Resolucion: override manual > Tanaka; rangos via Karvonen si hay reposo, sino %FCmax.
 * Todo bpm redondeado a entero (Math.round).
 */

import type {
    CardioProfile,
    HrZone,
    HrZoneRange,
    MaxHrMethod,
    ResolvedClientZones,
} from './types'

/** Las 5 zonas en orden, para iterar sin castear. */
export const HR_ZONES: readonly HrZone[] = [1, 2, 3, 4, 5]

/**
 * Limites de intensidad por zona como fraccion 0-1 (modelo 5 zonas estandar):
 * Z1 50-60% · Z2 60-70% · Z3 70-80% · Z4 80-90% · Z5 90-100%.
 * La misma fraccion se aplica sobre FCmax (%FCmax) o sobre la reserva (Karvonen).
 */
export const HR_ZONE_BOUNDS: Readonly<Record<HrZone, readonly [min: number, max: number]>> = {
    1: [0.5, 0.6],
    2: [0.6, 0.7],
    3: [0.7, 0.8],
    4: [0.8, 0.9],
    5: [0.9, 1],
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/

function isPositiveFinite(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Edad en anos cumplidos a la fecha `today` (default: hoy, hora local).
 * null si birthDate falta, no es ISO 'YYYY-MM-DD', es una fecha imposible
 * (ej. 2000-02-30) o es futura — borde AC: sin edad NO hay bpm, solo zona.
 */
export function ageFromBirthDate(birthDate: string | null | undefined, today: Date = new Date()): number | null {
    if (!birthDate) return null
    const match = ISO_DATE_PREFIX.exec(birthDate)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    // Round-trip via UTC detecta fechas imposibles (2000-02-30 → 2000-03-01).
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        return null
    }
    let age = today.getFullYear() - year
    const beforeBirthday =
        today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)
    if (beforeBirthday) age -= 1
    return age >= 0 ? age : null
}

/** FCmax por Tanaka (2001): 208 − 0.7·edad — formula DEFAULT del producto. */
export function maxHrTanaka(age: number): number {
    return Math.round(208 - 0.7 * age)
}

/** FCmax clasica: 220 − edad. Solo referencia/comparacion en la calculadora del coach. */
export function maxHrClassic(age: number): number {
    return Math.round(220 - age)
}

/** bpm a una intensidad dada como %FCmax (fraccion 0-1), redondeado a entero. */
export function percentMaxBpm(maxHr: number, intensity: number): number {
    return Math.round(maxHr * intensity)
}

/**
 * bpm por Karvonen a una intensidad dada (fraccion 0-1):
 * reserva = FCmax − FCreposo; bpm = round(reserva·intensidad + FCreposo).
 */
export function karvonenBpm(maxHr: number, restingHr: number, intensity: number): number {
    return Math.round((maxHr - restingHr) * intensity + restingHr)
}

/** Las 5 zonas como %FCmax: [round(FCmax·min), round(FCmax·max)] por zona. */
export function hrZonesFromMax(maxHr: number): HrZoneRange[] {
    return HR_ZONES.map((zone) => {
        const [min, max] = HR_ZONE_BOUNDS[zone]
        return { zone, minBpm: percentMaxBpm(maxHr, min), maxBpm: percentMaxBpm(maxHr, max) }
    })
}

/** Las 5 zonas por Karvonen (reserva de FC) — requiere FC reposo medida y menor a FCmax. */
export function hrZonesKarvonen(maxHr: number, restingHr: number): HrZoneRange[] {
    return HR_ZONES.map((zone) => {
        const [min, max] = HR_ZONE_BOUNDS[zone]
        return { zone, minBpm: karvonenBpm(maxHr, restingHr, min), maxBpm: karvonenBpm(maxHr, restingHr, max) }
    })
}

/**
 * FCmax efectiva del perfil: override manual del coach > Tanaka sobre la edad.
 * null si no hay override valido ni fecha de nacimiento utilizable.
 */
export function resolveMaxHr(
    profile: CardioProfile,
    today: Date = new Date(),
): { maxHr: number; method: MaxHrMethod } | null {
    if (isPositiveFinite(profile.maxHrOverride)) {
        return { maxHr: Math.round(profile.maxHrOverride), method: 'override' }
    }
    const age = ageFromBirthDate(profile.birthDate, today)
    if (age === null) return null
    return { maxHr: maxHrTanaka(age), method: 'tanaka' }
}

/**
 * Zonas personalizadas del alumno (decision del PLAN: override > Tanaka; Karvonen si hay reposo).
 * null cuando no hay FCmax derivable (sin override ni edad) — la UI cae a "Z4" sin bpm.
 * Si la FC reposo es invalida o >= FCmax (data degenerada), cae a %FCmax en vez de Karvonen.
 */
export function resolveClientZones(profile: CardioProfile, today: Date = new Date()): ResolvedClientZones | null {
    const resolved = resolveMaxHr(profile, today)
    if (!resolved) return null
    const useKarvonen = isPositiveFinite(profile.restingHr) && profile.restingHr < resolved.maxHr
    if (useKarvonen) {
        return {
            maxHr: resolved.maxHr,
            maxHrMethod: resolved.method,
            zoneMethod: 'karvonen',
            restingHr: profile.restingHr,
            zones: hrZonesKarvonen(resolved.maxHr, profile.restingHr as number),
        }
    }
    return {
        maxHr: resolved.maxHr,
        maxHrMethod: resolved.method,
        zoneMethod: 'percent_max',
        restingHr: null,
        zones: hrZonesFromMax(resolved.maxHr),
    }
}

/**
 * Rango bpm de UNA zona prescrita (workout_blocks.hr_zone) para un alumno.
 * null si el perfil no permite derivar bpm — el chip muestra solo "Z4" + CTA de perfil.
 */
export function hrRangeForZone(zone: HrZone, profile: CardioProfile, today: Date = new Date()): HrZoneRange | null {
    const resolved = resolveClientZones(profile, today)
    if (!resolved) return null
    return resolved.zones.find((range) => range.zone === zone) ?? null
}
