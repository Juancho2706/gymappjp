/**
 * Parte PURA de los agregadores de salud (E6.3) — ventanas de tiempo y normalizacion de datos.
 * SIN imports de react-native: corre en Vitest (node) y queda testeable. Los adaptadores nativos
 * (HealthKit / Health Connect) viven en `health-aggregators.ts` tras el guard dinamico.
 *
 * Fase 2 de cardio-conectado: aca vive tambien la normalizacion cruda→`HubWorkout` (el workout que
 * el reloj dejo en el hub). Los shapes crudos de cada plataforma difieren muchisimo; el contrato
 * `HubWorkout` de `@eva/cardio` es el unico que cruza a la UI. Regla dura: lo que el hub no trajo
 * queda en `null` — jamas se rellena con ceros ni con estimaciones.
 */
import { downsampleSeries, type HubWorkout } from '@eva/cardio'

/** Ventana "hoy" (local): 00:00 de hoy → ahora. Para sumar pasos del dia en curso. */
export function todayWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { start, end: new Date(now) }
}

/**
 * Ventana "anoche" (local): ayer 18:00 → hoy 12:00. Cubre el sueño de la noche pasada aunque el
 * alumno abra la app a media mañana; el corte a las 12:00 evita capturar una siesta de la tarde.
 * Si aun no son las 12:00, el fin es "ahora" (no adelantamos al futuro).
 */
export function lastNightWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setDate(start.getDate() - 1)
  start.setHours(18, 0, 0, 0)
  const noon = new Date(now)
  noon.setHours(12, 0, 0, 0)
  return { start, end: noon.getTime() > now.getTime() ? new Date(now) : noon }
}

/** Horas entre dos instantes ISO/Date; 0 si el rango es invalido o negativo. */
export function hoursBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0
  return (e - s) / 3_600_000
}

/**
 * Redondea horas de sueño a la opcion mas cercana del selector de habitos (chips 6..9 cada 0.5),
 * solo si cae dentro de la tolerancia (0.5h por defecto). null si no hay match razonable — asi no
 * "inventamos" un chip cuando el dato del agregador es raro (ej. 3h o 13h).
 */
export function nearestSleepOption(
  hours: number | null | undefined,
  options: readonly number[],
  toleranceH = 0.5,
): number | null {
  if (hours == null || !Number.isFinite(hours) || hours <= 0 || options.length === 0) return null
  let best: number | null = null
  let bestDist = Infinity
  for (const opt of options) {
    const dist = Math.abs(opt - hours)
    if (dist < bestDist) {
      bestDist = dist
      best = opt
    }
  }
  return best != null && bestDist <= toleranceH ? best : null
}

/** Suma horas de sueño de una lista de muestras {start,end} (solo tramos dormido). null si vacio. */
export function sumSleepHours(samples: readonly { start: string | Date; end: string | Date }[]): number | null {
  if (!samples || samples.length === 0) return null
  const total = samples.reduce((acc, s) => acc + hoursBetween(s.start, s.end), 0)
  return total > 0 ? Math.round(total * 10) / 10 : null
}

// ─── HealthKit: sueño por valor numerico de categoria ─────────────────────────────────────────────

/**
 * Valores de `HKCategoryValueSleepAnalysis` que cuentan como DORMIDO: `asleepUnspecified` (1),
 * `asleepCore` (3), `asleepDeep` (4) y `asleepREM` (5). Quedan fuera `inBed` (0) y `awake` (2).
 * La libreria nueva (kingstinct) entrega el enum numerico crudo, no el string de la libreria vieja.
 */
export const HK_ASLEEP_CATEGORY_VALUES: readonly number[] = [1, 3, 4, 5]

/** Muestra de `HKCategoryTypeIdentifierSleepAnalysis` tal como la devuelve `queryCategorySamples`. */
export interface HkSleepSampleRaw {
  startDate?: string | number | Date | null
  endDate?: string | number | Date | null
  value?: number | null
}

/**
 * Horas dormidas de una tanda de muestras de HealthKit. Si ninguna muestra califica como "dormido"
 * cae a TODAS las muestras (mismo criterio que tenia la version con strings: mejor el tiempo en cama
 * que un null cuando la fuente no distingue fases). Sin muestras → null.
 */
export function sleepHoursFromHkCategorySamples(
  samples: readonly HkSleepSampleRaw[] | null | undefined,
): number | null {
  if (!samples || samples.length === 0) return null
  const usable = samples.filter((s) => s.startDate != null && s.endDate != null)
  const asleep = usable.filter((s) => typeof s.value === 'number' && HK_ASLEEP_CATEGORY_VALUES.includes(s.value))
  const source = asleep.length > 0 ? asleep : usable
  if (source.length === 0) return null
  return sumSleepHours(
    source.map((s) => ({ start: s.startDate as string | Date, end: s.endDate as string | Date })),
  )
}

// ─── Normalizacion cruda → HubWorkout ────────────────────────────────────────────────────────────

/** Tope de puntos de la curva de FC importada (mismo presupuesto que la serie BLE del bloque). */
export const MAX_HUB_HR_POINTS = 360

/** Punto de FC crudo del hub: instante absoluto (epoch ms) + bpm. */
export interface HrPointRaw {
  atMs: number
  bpm: number
}

/** Curva + agregados derivados de la curva; todo null cuando el hub no trajo muestras usables. */
export interface HubHrSeries {
  samples: [number, number][] | null
  avgHr: number | null
  maxHr: number | null
}

function epochMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Numero utilizable: finito y > 0 (un 0 del hub es "no lo midio", no "midio cero"). */
function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Ordena, limpia y comprime la curva cruda a `[offsetSec desde startMs, bpm]`.
 *
 * `avgHr`/`maxHr` salen de las muestras CRUDAS (antes del downsample) para que promediar la curva
 * comprimida no achate el maximo real. Los offsets negativos (muestra anterior al inicio reportado)
 * se clampean a 0 en vez de descartarse: el reloj suele adelantar la primera lectura.
 */
export function buildHubHrSeries(
  points: readonly HrPointRaw[] | null | undefined,
  startMs: number,
  maxPoints: number = MAX_HUB_HR_POINTS,
): HubHrSeries {
  const empty: HubHrSeries = { samples: null, avgHr: null, maxHr: null }
  if (!points || points.length === 0 || !Number.isFinite(startMs)) return empty

  const valid = points
    .filter((p) => Number.isFinite(p?.atMs) && positive(p?.bpm))
    .sort((a, b) => a.atMs - b.atMs)
  if (valid.length === 0) return empty

  let sum = 0
  let max = 0
  const raw: [number, number][] = []
  for (const point of valid) {
    const bpm = Math.round(point.bpm)
    sum += bpm
    if (bpm > max) max = bpm
    raw.push([Math.max(0, Math.round((point.atMs - startMs) / 1000)), bpm])
  }
  return {
    samples: downsampleSeries(raw, maxPoints).samples,
    avgHr: Math.round(sum / valid.length),
    maxHr: max,
  }
}

/** Cantidad de HealthKit tal como viaja por Nitro (`{unit, quantity}`). */
export interface HkQuantityRaw {
  quantity?: number | null
}

/**
 * Workout de HealthKit ya aplanado por el adaptador nativo. `activity` llega resuelto (el nombre del
 * `WorkoutActivityType`) porque la tabla del enum vive en el modulo nativo, no aca.
 */
export interface HkWorkoutRaw {
  uuid?: string | null
  startDate?: string | number | Date | null
  endDate?: string | number | Date | null
  duration?: HkQuantityRaw | null
  totalDistance?: HkQuantityRaw | null
  totalEnergyBurned?: HkQuantityRaw | null
  activity?: string | null
  source?: string | null
}

/** Muestra de `HKQuantityTypeIdentifierHeartRate` (pedida en `count/min`, o sea bpm directo). */
export interface HkHrSampleRaw {
  startDate?: string | number | Date | null
  quantity?: number | null
}

/** Aplana muestras de FC de HealthKit a puntos crudos; descarta lo que no tenga fecha y bpm usables. */
export function hkHrPoints(samples: readonly HkHrSampleRaw[] | null | undefined): HrPointRaw[] {
  if (!samples) return []
  const out: HrPointRaw[] = []
  for (const sample of samples) {
    const atMs = epochMs(sample?.startDate)
    if (atMs == null || !positive(sample?.quantity)) continue
    out.push({ atMs, bpm: sample.quantity })
  }
  return out
}

/**
 * HealthKit → `HubWorkout`. null cuando el rango es degenerado (sin fechas o fin <= inicio): sin
 * ventana valida no hay nada que emparejar con la sesion de EVA.
 *
 * `durationSec` prefiere la duracion que reporta el hub (excluye pausas) y solo cae al ancho de la
 * ventana cuando el hub no la trajo. Distancia (m) y energia (kcal) ya vienen en SI desde la libreria.
 */
export function normalizeHkWorkout(
  raw: HkWorkoutRaw | null | undefined,
  hrPoints: readonly HrPointRaw[] = [],
  maxPoints: number = MAX_HUB_HR_POINTS,
): HubWorkout | null {
  if (!raw) return null
  const startMs = epochMs(raw.startDate)
  const endMs = epochMs(raw.endDate)
  if (startMs == null || endMs == null || endMs <= startMs) return null

  const series = buildHubHrSeries(hrPoints, startMs, maxPoints)
  const reported = raw.duration?.quantity
  return {
    id: typeof raw.uuid === 'string' && raw.uuid.length > 0 ? raw.uuid : `hk-${startMs}-${endMs}`,
    source: typeof raw.source === 'string' && raw.source.length > 0 ? raw.source : null,
    activity: typeof raw.activity === 'string' && raw.activity.length > 0 ? raw.activity : null,
    startMs,
    endMs,
    durationSec: positive(reported) ? Math.round(reported) : Math.round((endMs - startMs) / 1000),
    distanceM: positive(raw.totalDistance?.quantity) ? raw.totalDistance.quantity : null,
    calories: positive(raw.totalEnergyBurned?.quantity) ? raw.totalEnergyBurned.quantity : null,
    avgHr: series.avgHr,
    maxHr: series.maxHr,
    hrSamples: series.samples,
  }
}

/**
 * Sesion de Health Connect ya aplanada por el adaptador nativo: distancia y calorias llegan de sus
 * propias agregaciones (Health Connect NO las guarda dentro del `ExerciseSession`).
 */
export interface HcSessionRaw {
  metadata?: { id?: string | null; dataOrigin?: string | null } | null
  startTime?: string | null
  endTime?: string | null
  activity?: string | null
  distanceM?: number | null
  calories?: number | null
}

/** Registro `HeartRate` de Health Connect: un contenedor con su serie de muestras. */
export interface HcHrRecordRaw {
  samples?: readonly { time?: string | null; beatsPerMinute?: number | null }[] | null
}

/** Aplana los registros `HeartRate` (serie dentro de cada record) a puntos crudos. */
export function hcHrPoints(records: readonly HcHrRecordRaw[] | null | undefined): HrPointRaw[] {
  if (!records) return []
  const out: HrPointRaw[] = []
  for (const record of records) {
    for (const sample of record?.samples ?? []) {
      const atMs = epochMs(sample?.time)
      if (atMs == null || !positive(sample?.beatsPerMinute)) continue
      out.push({ atMs, bpm: sample.beatsPerMinute })
    }
  }
  return out
}

/**
 * Health Connect → `HubWorkout`. Mismas reglas que iOS: rango degenerado → null; ejes que el hub no
 * trajo → null. `durationSec` sale del ancho de la sesion porque Health Connect no expone una
 * duracion neta separada.
 */
export function normalizeHcSession(
  raw: HcSessionRaw | null | undefined,
  hrPoints: readonly HrPointRaw[] = [],
  maxPoints: number = MAX_HUB_HR_POINTS,
): HubWorkout | null {
  if (!raw) return null
  const startMs = epochMs(raw.startTime)
  const endMs = epochMs(raw.endTime)
  if (startMs == null || endMs == null || endMs <= startMs) return null

  const series = buildHubHrSeries(hrPoints, startMs, maxPoints)
  const id = raw.metadata?.id
  const origin = raw.metadata?.dataOrigin
  return {
    id: typeof id === 'string' && id.length > 0 ? id : `hc-${startMs}-${endMs}`,
    source: typeof origin === 'string' && origin.length > 0 ? origin : null,
    activity: typeof raw.activity === 'string' && raw.activity.length > 0 ? raw.activity : null,
    startMs,
    endMs,
    durationSec: Math.round((endMs - startMs) / 1000),
    distanceM: positive(raw.distanceM) ? raw.distanceM : null,
    calories: positive(raw.calories) ? raw.calories : null,
    avgHr: series.avgHr,
    maxHr: series.maxHr,
    hrSamples: series.samples,
  }
}
