/**
 * Salud del alumno via agregadores de plataforma (E6.3, Ola 6) — HealthKit (iOS) + Health Connect
 * (Android). "La estrella de la ola": cubre TODO lo que el alumno ya sincroniza a su centro de salud
 * SIN una app de reloj — Apple Watch, Galaxy Watch, bandas Xiaomi/Amazfit, Fitbit y cualquier
 * dispositivo que escriba al agregador. Datos AGREGADOS/historicos (no en vivo): leemos pasos de HOY
 * y sueño de anoche para PRE-LLENAR el widget de habitos, y desde cardio-conectado (fase 2) los
 * WORKOUTS que el reloj registro (duracion, distancia, calorias, curva de FC) para ofrecer el import
 * al cerrar la sesion.
 *
 * REGLAS (informe r7 §1 + task): los agregadores NO son fuente de BPM en vivo (eso es BLE, ble-hr.ts).
 * Guards dinamicos igual que BLE — las librerias nativas (`@kingstinct/react-native-healthkit` iOS,
 * `react-native-health-connect` Android) solo existen en build nativa; en Expo Go / web el modulo
 * degrada a `unavailable` y el opt-in no aparece. JAMAS sobreescribe lo que el alumno ya escribio:
 * el pre-llenado es solo cuando el campo esta vacio, editable, y se guarda por el flujo manual.
 *
 * SOLO LECTURA: nunca pedimos permisos de escritura ni escribimos de vuelta a los hubs.
 */
import { Platform } from 'react-native'
import type { HubWorkout } from '@eva/cardio'
import {
  hcHrPoints,
  hkHrPoints,
  lastNightWindow,
  normalizeHcSession,
  normalizeHkWorkout,
  sleepHoursFromHkCategorySamples,
  sumSleepHours,
  todayWindow,
  type HrPointRaw,
} from './health-aggregators-pure'

// Re-export de la parte PURA (ventanas + normalizacion) para consumidores del modulo.
export { todayWindow, lastNightWindow, hoursBetween, nearestSleepOption, sumSleepHours } from './health-aggregators-pure'
export type { HubWorkout } from '@eva/cardio'

// ─── Guards dinamicos de las librerias nativas ───────────────────────────────────────────────────

/** Identificadores de HealthKit que leemos (v14 los expone como strings, ya no enums). */
const HK_STEPS = 'HKQuantityTypeIdentifierStepCount'
const HK_SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis'
const HK_HEART_RATE = 'HKQuantityTypeIdentifierHeartRate'
const HK_WORKOUT = 'HKWorkoutTypeIdentifier'
const HK_DISTANCE_WALK = 'HKQuantityTypeIdentifierDistanceWalkingRunning'
const HK_DISTANCE_CYCLE = 'HKQuantityTypeIdentifierDistanceCycling'
const HK_ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned'

/** Permisos de LECTURA de iOS. `toShare` jamas se pide: EVA no escribe en Salud. */
const IOS_READ_TYPES: readonly string[] = [
  HK_STEPS,
  HK_SLEEP,
  HK_HEART_RATE,
  HK_WORKOUT,
  HK_DISTANCE_WALK,
  HK_DISTANCE_CYCLE,
  HK_ACTIVE_ENERGY,
]

/** Cantidad serializada por Nitro: `{unit, quantity}`. La unidad la fijamos nosotros al consultar. */
type HkQuantity = { unit?: string; quantity?: number }

/** Subconjunto del `WorkoutProxy` que consumimos (el proxy trae mucho mas: rutas, planes, eventos). */
type HkWorkoutProxy = {
  uuid?: string
  startDate?: Date
  endDate?: Date
  duration?: HkQuantity
  totalDistance?: HkQuantity | null
  totalEnergyBurned?: HkQuantity | null
  workoutActivityType?: number
  sourceRevision?: { source?: { name?: string } }
}

/**
 * Superficie MINIMA de `@kingstinct/react-native-healthkit` v14 que usamos. Se declara a mano porque
 * el modulo entra por `require` dinamico (guard): importarlo estaticamente cargaria Nitro en Expo Go.
 */
type AppleHealthKitModule = {
  isHealthDataAvailable?: () => boolean
  requestAuthorization: (toRequest: { toRead?: readonly string[]; toShare?: readonly string[] }) => Promise<boolean>
  queryStatisticsForQuantity: (
    identifier: string,
    statistics: readonly string[],
    options?: { filter?: unknown; unit?: string },
  ) => Promise<{ sumQuantity?: HkQuantity } | null>
  queryCategorySamples: (
    identifier: string,
    options: { limit: number; ascending?: boolean; filter?: unknown },
  ) => Promise<readonly { startDate?: Date; endDate?: Date; value?: number }[] | null>
  queryQuantitySamples: (
    identifier: string,
    options: { limit: number; ascending?: boolean; unit?: string; filter?: unknown },
  ) => Promise<readonly { startDate?: Date; quantity?: number }[] | null>
  queryWorkoutSamples: (options: {
    limit: number
    ascending?: boolean
    filter?: unknown
  }) => Promise<readonly HkWorkoutProxy[] | null>
  /** Enum numerico de actividades; TS lo compila con mapa inverso (13 → 'cycling'). */
  WorkoutActivityType?: Record<string | number, string | number>
}

/** Registro generico de Health Connect: union laxa de los tipos que leemos. */
type HcRecord = {
  startTime: string
  endTime: string
  metadata?: { id?: string; dataOrigin?: string }
  exerciseType?: number
  title?: string
  samples?: readonly { time?: string; beatsPerMinute?: number }[]
  distance?: { inMeters?: number }
  energy?: { inKilocalories?: number }
}

type HcAggregateResult = {
  COUNT_TOTAL?: number
  DISTANCE?: { inMeters?: number }
  ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number }
}

type HealthConnectModule = {
  initialize: () => Promise<boolean>
  requestPermission: (perms: unknown) => Promise<unknown>
  aggregateRecord: (req: unknown) => Promise<HcAggregateResult | null>
  readRecords: (recordType: string, req: unknown) => Promise<{ records: HcRecord[] } | null>
  /** Tabla `{RUNNING: 56, ...}`; sin mapa inverso, hay que invertirla para nombrar la actividad. */
  ExerciseType?: Record<string, number>
}

let iosLoaded = false
let iosModule: AppleHealthKitModule | null = null
let androidLoaded = false
let androidModule: HealthConnectModule | null = null

function loadIosHealth(): AppleHealthKitModule | null {
  if (iosLoaded) return iosModule
  iosLoaded = true
  try {
    // Dynamic require: la libreria monta HybridObjects de Nitro al importarse → en Expo Go lanza.
    const mod = require('@kingstinct/react-native-healthkit')
    const candidate = (mod.default ?? mod) as AppleHealthKitModule
    // Un iPad sin HealthKit resuelve el modulo pero no tiene datos: eso tambien es "no disponible".
    iosModule = candidate?.isHealthDataAvailable?.() === false ? null : candidate
  } catch {
    iosModule = null
  }
  return iosModule
}

function loadAndroidHealth(): HealthConnectModule | null {
  if (androidLoaded) return androidModule
  androidLoaded = true
  try {
    androidModule = require('react-native-health-connect') as HealthConnectModule
  } catch {
    androidModule = null
  }
  return androidModule
}

/** ¿Hay agregador de salud disponible en esta plataforma/build? false en Expo Go / web. */
export function isHealthAvailable(): boolean {
  if (Platform.OS === 'ios') return loadIosHealth() !== null
  if (Platform.OS === 'android') return loadAndroidHealth() !== null
  return false
}

/** Ventana [startMs, endMs] valida para consultar el hub; null si el llamador mando basura. */
function windowDates(startMs: number, endMs: number): { start: Date; end: Date } | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return { start: new Date(startMs), end: new Date(endMs) }
}

// ─── HealthKit (iOS) ─────────────────────────────────────────────────────────────────────────────

function iosInit(hk: AppleHealthKitModule): Promise<boolean> {
  // `requestAuthorization` resuelve true cuando el dialogo se completo; Apple NO revela que concedio.
  return hk
    .requestAuthorization({ toRead: IOS_READ_TYPES })
    .then((ok) => ok !== false)
    .catch(() => false)
}

async function iosSteps(hk: AppleHealthKitModule, now: Date): Promise<number | null> {
  const { start, end } = todayWindow(now)
  try {
    const res = await hk.queryStatisticsForQuantity(HK_STEPS, ['cumulativeSum'], {
      filter: { date: { startDate: start, endDate: end } },
      unit: 'count',
    })
    const total = res?.sumQuantity?.quantity
    return typeof total === 'number' && Number.isFinite(total) ? Math.round(total) : null
  } catch {
    return null
  }
}

async function iosSleep(hk: AppleHealthKitModule, now: Date): Promise<number | null> {
  const { start, end } = lastNightWindow(now)
  try {
    // `limit: 0` = sin tope (contrato de la libreria); los tramos dormido los filtra la parte pura.
    const samples = await hk.queryCategorySamples(HK_SLEEP, {
      limit: 0,
      ascending: true,
      filter: { date: { startDate: start, endDate: end } },
    })
    return sleepHoursFromHkCategorySamples(samples ?? [])
  } catch {
    return null
  }
}

/** Nombre legible del `WorkoutActivityType` via el mapa inverso del enum; null si no se puede. */
function iosActivityName(hk: AppleHealthKitModule, activityType: number | undefined): string | null {
  if (typeof activityType !== 'number') return null
  const name = hk.WorkoutActivityType?.[activityType]
  return typeof name === 'string' && name.length > 0 ? name : null
}

/** Curva de FC del intervalo del workout. La unidad `count/min` es OBLIGATORIA: la canonica es count/s. */
async function iosWorkoutHrPoints(hk: AppleHealthKitModule, start: Date, end: Date): Promise<HrPointRaw[]> {
  try {
    const samples = await hk.queryQuantitySamples(HK_HEART_RATE, {
      limit: 0,
      ascending: true,
      unit: 'count/min',
      filter: { date: { startDate: start, endDate: end } },
    })
    return hkHrPoints(samples ?? [])
  } catch {
    return []
  }
}

async function iosHubWorkouts(hk: AppleHealthKitModule, start: Date, end: Date): Promise<HubWorkout[]> {
  let workouts: readonly HkWorkoutProxy[]
  try {
    workouts =
      (await hk.queryWorkoutSamples({
        limit: 0,
        ascending: true,
        filter: { date: { startDate: start, endDate: end } },
      })) ?? []
  } catch {
    return []
  }

  const out: HubWorkout[] = []
  for (const workout of workouts) {
    try {
      const from = workout.startDate
      const to = workout.endDate
      if (!from || !to) continue
      const hub = normalizeHkWorkout(
        {
          uuid: workout.uuid,
          startDate: from,
          endDate: to,
          duration: workout.duration,
          totalDistance: workout.totalDistance,
          totalEnergyBurned: workout.totalEnergyBurned,
          activity: iosActivityName(hk, workout.workoutActivityType),
          source: workout.sourceRevision?.source?.name ?? null,
        },
        await iosWorkoutHrPoints(hk, from, to),
      )
      if (hub) out.push(hub)
    } catch {
      // Un workout ilegible no puede tumbar el import completo.
    }
  }
  return out
}

// ─── Health Connect (Android) ─────────────────────────────────────────────────────────────────────

const ANDROID_READ_PERMS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
]

async function androidInit(hc: HealthConnectModule): Promise<boolean> {
  try {
    const ok = await hc.initialize()
    if (!ok) return false
    await hc.requestPermission(ANDROID_READ_PERMS)
    return true
  } catch {
    return false
  }
}

async function androidSteps(hc: HealthConnectModule, now: Date): Promise<number | null> {
  const { start, end } = todayWindow(now)
  try {
    const res = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
    const total = res?.COUNT_TOTAL
    return typeof total === 'number' ? Math.round(total) : null
  } catch {
    return null
  }
}

async function androidSleep(hc: HealthConnectModule, now: Date): Promise<number | null> {
  const { start, end } = lastNightWindow(now)
  try {
    const res = await hc.readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
    const records = res?.records ?? []
    return sumSleepHours(records.map((r) => ({ start: r.startTime, end: r.endTime })))
  } catch {
    return null
  }
}

/** Nombre de la actividad: el titulo que puso la app dueña, si no el nombre del `ExerciseType`. */
function androidActivityName(hc: HealthConnectModule, record: HcRecord): string | null {
  if (typeof record.title === 'string' && record.title.length > 0) return record.title
  if (typeof record.exerciseType !== 'number') return null
  const table = hc.ExerciseType
  if (!table) return null
  for (const [name, value] of Object.entries(table)) {
    if (value === record.exerciseType) return name.toLowerCase()
  }
  return null
}

async function androidSessionHrPoints(hc: HealthConnectModule, range: unknown): Promise<HrPointRaw[]> {
  try {
    const res = await hc.readRecords('HeartRate', { timeRangeFilter: range, ascendingOrder: true })
    return hcHrPoints(res?.records ?? [])
  } catch {
    return []
  }
}

/** Distancia (m) del intervalo: agregado primero, suma de records como respaldo. null si no hay. */
async function androidSessionDistanceM(hc: HealthConnectModule, range: unknown): Promise<number | null> {
  try {
    const agg = await hc.aggregateRecord({ recordType: 'Distance', timeRangeFilter: range })
    const meters = agg?.DISTANCE?.inMeters
    if (typeof meters === 'number' && Number.isFinite(meters) && meters > 0) return meters
  } catch {
    // sigue al respaldo
  }
  try {
    const res = await hc.readRecords('Distance', { timeRangeFilter: range })
    const total = (res?.records ?? []).reduce((acc, r) => acc + (r.distance?.inMeters ?? 0), 0)
    return total > 0 ? total : null
  } catch {
    return null
  }
}

/** Calorias activas (kcal) del intervalo: agregado primero, suma de records como respaldo. */
async function androidSessionCalories(hc: HealthConnectModule, range: unknown): Promise<number | null> {
  try {
    const agg = await hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range })
    const kcal = agg?.ACTIVE_CALORIES_TOTAL?.inKilocalories
    if (typeof kcal === 'number' && Number.isFinite(kcal) && kcal > 0) return kcal
  } catch {
    // sigue al respaldo
  }
  try {
    const res = await hc.readRecords('ActiveCaloriesBurned', { timeRangeFilter: range })
    const total = (res?.records ?? []).reduce((acc, r) => acc + (r.energy?.inKilocalories ?? 0), 0)
    return total > 0 ? total : null
  } catch {
    return null
  }
}

async function androidHubWorkouts(hc: HealthConnectModule, start: Date, end: Date): Promise<HubWorkout[]> {
  let sessions: HcRecord[]
  try {
    const res = await hc.readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
      ascendingOrder: true,
    })
    sessions = res?.records ?? []
  } catch {
    return []
  }

  const out: HubWorkout[] = []
  for (const session of sessions) {
    try {
      // Cada eje se pide por el intervalo de LA SESION, no por la ventana completa de la pantalla.
      const range = { operator: 'between', startTime: session.startTime, endTime: session.endTime }
      const hub = normalizeHcSession(
        {
          metadata: session.metadata,
          startTime: session.startTime,
          endTime: session.endTime,
          activity: androidActivityName(hc, session),
          distanceM: await androidSessionDistanceM(hc, range),
          calories: await androidSessionCalories(hc, range),
        },
        await androidSessionHrPoints(hc, range),
      )
      if (hub) out.push(hub)
    } catch {
      // Una sesion ilegible no puede tumbar el import completo.
    }
  }
  return out
}

// ─── API unificada ───────────────────────────────────────────────────────────────────────────────

/**
 * Pide permisos de salud (pasos, sueño, workouts, FC, distancia y calorias activas) JUST-IN-TIME al
 * tocar "Conectar salud" / "Importar de tu reloj". Devuelve true si el usuario concedio y el
 * agregador quedo inicializado. En plataformas sin agregador → false.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    return hk ? iosInit(hk) : false
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    return hc ? androidInit(hc) : false
  }
  return false
}

/** Pasos de HOY desde el agregador; null si no hay dato/permiso o la plataforma no soporta. */
export async function readTodaySteps(now: Date = new Date()): Promise<number | null> {
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    return hk ? iosSteps(hk, now) : null
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    return hc ? androidSteps(hc, now) : null
  }
  return null
}

/** Horas de sueño de anoche desde el agregador; null si no hay dato/permiso o plataforma no soporta. */
export async function readLastNightSleepHours(now: Date = new Date()): Promise<number | null> {
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    return hk ? iosSleep(hk, now) : null
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    return hc ? androidSleep(hc, now) : null
  }
  return null
}

/**
 * Workouts que el reloj dejo en el hub dentro de la ventana `[startMs, endMs]`, normalizados a
 * `HubWorkout` (contrato de `@eva/cardio`). El matching contra la sesion de EVA y el parche del log
 * son puros y viven en `@eva/cardio` — aca solo se LEE.
 *
 * Siempre devuelve un array: sin agregador, sin permisos, sin datos o con error → `[]`. Nunca lanza
 * a la UI y nunca inventa un workout.
 */
export async function readHubWorkouts(startMs: number, endMs: number): Promise<HubWorkout[]> {
  const range = windowDates(startMs, endMs)
  if (!range) return []
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    return hk ? iosHubWorkouts(hk, range.start, range.end) : []
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    return hc ? androidHubWorkouts(hc, range.start, range.end) : []
  }
  return []
}
