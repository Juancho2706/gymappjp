/**
 * Dominio puro de cardio — conversiones y formato de pace/duracion.
 * Convencion del PLAN: todo en segundos ENTEROS (Math.round); distancias en km.
 * Inputs invalidos (no finitos o fuera de dominio) lanzan RangeError — fail fast:
 * los forms validan con Zod antes de llegar aca.
 */

/** Factor km → milla (pace por milla = pace por km × factor). */
export const KM_PER_MILE = 1.60934

function assertFinite(value: number, name: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new RangeError(`${name} must be a finite number`)
    }
}

function assertNonNegative(value: number, name: string): void {
    assertFinite(value, name)
    if (value < 0) throw new RangeError(`${name} must be >= 0`)
}

function assertPositive(value: number, name: string): void {
    assertFinite(value, name)
    if (value <= 0) throw new RangeError(`${name} must be > 0`)
}

/** Tiempo total (s enteros) para cubrir `distanceKm` a un pace dado (s/km). */
export function paceToTimeSec(paceSecPerKm: number, distanceKm: number): number {
    assertPositive(paceSecPerKm, 'paceSecPerKm')
    assertNonNegative(distanceKm, 'distanceKm')
    return Math.round(paceSecPerKm * distanceKm)
}

/** Pace (s/km enteros) desde tiempo total y distancia. */
export function timeToPaceSecPerKm(timeSec: number, distanceKm: number): number {
    assertNonNegative(timeSec, 'timeSec')
    assertPositive(distanceKm, 'distanceKm')
    return Math.round(timeSec / distanceKm)
}

/** Distancia (km, 2 decimales) cubierta en `timeSec` a un pace dado. */
export function distanceKmFromTimePace(timeSec: number, paceSecPerKm: number): number {
    assertNonNegative(timeSec, 'timeSec')
    assertPositive(paceSecPerKm, 'paceSecPerKm')
    return Math.round((timeSec / paceSecPerKm) * 100) / 100
}

/** Velocidad (km/h, 1 decimal) equivalente a un pace (s/km): 3600/pace. */
export function kmhFromPace(paceSecPerKm: number): number {
    assertPositive(paceSecPerKm, 'paceSecPerKm')
    return Math.round((3600 / paceSecPerKm) * 10) / 10
}

/** Pace por milla (s enteros) desde pace por km: ×1.60934. */
export function paceKmToMile(paceSecPerKm: number): number {
    assertPositive(paceSecPerKm, 'paceSecPerKm')
    return Math.round(paceSecPerKm * KM_PER_MILE)
}

/** Formato pace "m:ss" (ej. 300 → "5:00", 483 → "8:03"). Redondea a segundo entero. */
export function formatPace(paceSecPerKm: number): string {
    assertNonNegative(paceSecPerKm, 'paceSecPerKm')
    const total = Math.round(paceSecPerKm)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Formato duracion: "m:ss" bajo la hora (1500 → "25:00"), "h:mm:ss" desde la hora
 * (3661 → "1:01:01"). Redondea a segundo entero.
 */
export function formatDuration(totalSec: number): string {
    assertNonNegative(totalSec, 'totalSec')
    const total = Math.round(totalSec)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`
}
