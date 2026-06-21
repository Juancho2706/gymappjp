/**
 * Dominio puro de cardio para mobile — FCmax/zonas (Z1-Z5), pace y plantillas de
 * intervalos. Espejo 1:1 de la web (apps/web/src/domain/cardio/{zones,pace,types}.ts
 * + lib/workout-interval.ts INTERVAL_TEMPLATES). Sin imports de RN/Supabase.
 *
 * NOTA anti-drift: idealmente esto vive en un package compartido (@eva/*). Mientras
 * tanto es un port verbatim — si cambian las formulas en web, actualizar acá.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type HrZone = 1 | 2 | 3 | 4 | 5
export type MaxHrMethod = 'override' | 'tanaka'
export type ZoneCalcMethod = 'karvonen' | 'percent_max'

export interface HrZoneRange {
  zone: HrZone
  minBpm: number
  maxBpm: number
}

export interface CardioProfile {
  birthDate: string | null
  restingHr: number | null
  maxHrOverride: number | null
}

export interface ResolvedClientZones {
  maxHr: number
  maxHrMethod: MaxHrMethod
  zoneMethod: ZoneCalcMethod
  restingHr: number | null
  zones: HrZoneRange[]
}

// ─── Zonas de frecuencia cardiaca ─────────────────────────────────────────────
export const HR_ZONES: readonly HrZone[] = [1, 2, 3, 4, 5]

export const HR_ZONE_BOUNDS: Readonly<Record<HrZone, readonly [min: number, max: number]>> = {
  1: [0.5, 0.6],
  2: [0.6, 0.7],
  3: [0.7, 0.8],
  4: [0.8, 0.9],
  5: [0.9, 1],
}

export const ZONE_DESCRIPTIONS: Record<HrZone, string> = {
  1: 'Recuperación',
  2: 'Base aeróbica',
  3: 'Tempo',
  4: 'Umbral',
  5: 'VO2max',
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Edad en años cumplidos; null si falta/inválida/futura. */
export function ageFromBirthDate(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate) return null
  const match = ISO_DATE_PREFIX.exec(birthDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
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

/** FCmax por Tanaka (2001): 208 − 0.7·edad — DEFAULT. */
export function maxHrTanaka(age: number): number {
  return Math.round(208 - 0.7 * age)
}

/** FCmax clásica: 220 − edad (solo referencia). */
export function maxHrClassic(age: number): number {
  return Math.round(220 - age)
}

export function percentMaxBpm(maxHr: number, intensity: number): number {
  return Math.round(maxHr * intensity)
}

export function karvonenBpm(maxHr: number, restingHr: number, intensity: number): number {
  return Math.round((maxHr - restingHr) * intensity + restingHr)
}

export function hrZonesFromMax(maxHr: number): HrZoneRange[] {
  return HR_ZONES.map((zone) => {
    const [min, max] = HR_ZONE_BOUNDS[zone]
    return { zone, minBpm: percentMaxBpm(maxHr, min), maxBpm: percentMaxBpm(maxHr, max) }
  })
}

export function hrZonesKarvonen(maxHr: number, restingHr: number): HrZoneRange[] {
  return HR_ZONES.map((zone) => {
    const [min, max] = HR_ZONE_BOUNDS[zone]
    return { zone, minBpm: karvonenBpm(maxHr, restingHr, min), maxBpm: karvonenBpm(maxHr, restingHr, max) }
  })
}

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

// ─── Pace / duración ──────────────────────────────────────────────────────────
export const KM_PER_MILE = 1.60934

export function paceToTimeSec(paceSecPerKm: number, distanceKm: number): number {
  return Math.round(paceSecPerKm * distanceKm)
}

export function kmhFromPace(paceSecPerKm: number): number {
  if (paceSecPerKm <= 0) return 0
  return Math.round((3600 / paceSecPerKm) * 10) / 10
}

export function paceKmToMile(paceSecPerKm: number): number {
  return Math.round(paceSecPerKm * KM_PER_MILE)
}

export function formatPace(paceSecPerKm: number): string {
  const total = Math.round(Math.max(0, paceSecPerKm))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDuration(totalSec: number): string {
  const total = Math.round(Math.max(0, totalSec))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Parsea "m:ss" o segundos planos → segundos; null si inválido. */
export function parsePaceStr(str: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(str.trim())
  if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
  const n = parseInt(str.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─── Plantillas system de intervalos (espejo lib/workout-interval) ────────────
interface IntervalStep {
  duration_sec?: number
  distance_m?: number
  mode?: string
  target?: unknown
}
export interface IntervalConfig {
  warmup_sec?: number
  repeats?: number
  work?: IntervalStep
  recovery?: IntervalStep
  cooldown_sec?: number
}

export interface IntervalTemplate {
  id: string
  name: string
  description: string
  config: IntervalConfig
  suggestedHrZone?: HrZone
}

export const INTERVAL_TEMPLATES: readonly IntervalTemplate[] = [
  {
    id: 'track-8x400',
    name: '8×400m @ Z4',
    description: 'Series de pista: 8 repeticiones de 400 m con 90 s de recuperación.',
    suggestedHrZone: 4,
    config: { warmup_sec: 600, repeats: 8, work: { distance_m: 400 }, recovery: { duration_sec: 90, mode: 'rest' }, cooldown_sec: 300 },
  },
  {
    id: 'vo2-6x1min',
    name: '6×1min @ Z5',
    description: 'VO2max: 6 repeticiones de 1 minuto fuerte con 2 minutos suaves.',
    suggestedHrZone: 5,
    config: { warmup_sec: 600, repeats: 6, work: { duration_sec: 60 }, recovery: { duration_sec: 120, mode: 'jog' }, cooldown_sec: 300 },
  },
  {
    id: 'continuo-20min-z2',
    name: '20min Z2 continuo',
    description: 'Base aeróbica: 20 minutos continuos en zona 2.',
    suggestedHrZone: 2,
    config: { repeats: 1, work: { duration_sec: 1200 } },
  },
  {
    id: 'fartlek-10x30-30',
    name: 'Fartlek 10×30/30',
    description: 'Fartlek: 10 repeticiones de 30 s fuerte / 30 s suave.',
    suggestedHrZone: 4,
    config: { warmup_sec: 300, repeats: 10, work: { duration_sec: 30 }, recovery: { duration_sec: 30, mode: 'jog' }, cooldown_sec: 300 },
  },
  {
    id: 'hyrox-compromised-run',
    name: 'HYROX run + estación',
    description: 'Carrera comprometida: 4×(1 km de carrera + 90 s de estación funcional).',
    suggestedHrZone: 4,
    config: { warmup_sec: 600, repeats: 4, work: { distance_m: 1000 }, recovery: { duration_sec: 90, mode: 'rest' } },
  },
]

/** Duración total cronometrable (s) de un interval_config (0 si el work es por distancia). */
export function intervalTotalDurationSec(config: IntervalConfig, sets: number = 1): number {
  const safeSets = Number.isFinite(sets) && sets >= 1 ? Math.round(sets) : 1
  const repeats = Number.isFinite(config.repeats) && (config.repeats ?? 0) >= 1 ? Math.round(config.repeats as number) : 1
  const total = repeats * safeSets
  const workSec = config.work?.duration_sec ?? 0
  if (!Number.isFinite(workSec) || workSec <= 0) return 0
  let sum = 0
  if (config.warmup_sec && config.warmup_sec > 0) sum += Math.round(config.warmup_sec)
  const recoverySec = config.recovery?.duration_sec ?? 0
  for (let i = 1; i <= total; i += 1) {
    sum += Math.round(workSec)
    if (recoverySec > 0 && i < total) sum += Math.round(recoverySec)
  }
  if (config.cooldown_sec && config.cooldown_sec > 0) sum += Math.round(config.cooldown_sec)
  return sum
}
