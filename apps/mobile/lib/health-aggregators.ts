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
 *
 * QA-4/H19: todo fallo del opt-in viaja tipado (`HealthConnectResult`) para que la UI diga la CAUSA
 * (falta instalar Health Connect / lo denegaste / el nativo reventó) en vez del "No se pudo conectar
 * con Salud" a ciegas.
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
  /** Opcional: no existe en versiones viejas de la lib → se trata como "seguir el flujo normal". */
  getSdkStatus?: () => Promise<number>
  /** Opcional: permisos ya concedidos (para revalidar sin abrir el dialogo). */
  getGrantedPermissions?: () => Promise<unknown>
  /** Opcional: abre la pantalla de Health Connect del sistema. */
  openHealthConnectSettings?: () => void
  SdkAvailabilityStatus?: {
    SDK_UNAVAILABLE?: number
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED?: number
    SDK_AVAILABLE?: number
  }
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

/**
 * GATE iOS REAL (QA-4/H19). El `require` de una lib RN puede resolver un OBJETO aunque el modulo
 * nativo no este enlazado — el caso historico fue `react-native-health`, que armaba su export con
 * `Object.assign({}, NativeModules.AppleHealthKit, { Constants })` y `Object.assign` NO lanza con
 * `undefined`. Con el simple `!== null` el boton "Conectar salud" aparecia hasta en Expo Go, para
 * fallar despues con un toast generico. El binding kingstinct puede degradar igual, asi que se
 * verifican los METODOS que vamos a usar, no la mera existencia del objeto.
 */
function iosUsable(m: AppleHealthKitModule | null): boolean {
  return !!m && typeof m.requestAuthorization === 'function' && typeof m.queryStatisticsForQuantity === 'function'
}

/** ¿Hay agregador de salud disponible en esta plataforma/build? false en Expo Go / web. */
export function isHealthAvailable(): boolean {
  if (Platform.OS === 'ios') return iosUsable(loadIosHealth())
  if (Platform.OS === 'android') return loadAndroidHealth() !== null
  return false
}

/** Igual que `isHealthAvailable` pero con la CAUSA, para que la UI diga por que no se puede. */
export function getHealthAvailability(): 'ok' | 'no-native' | 'unsupported-platform' {
  if (Platform.OS === 'ios') return iosUsable(loadIosHealth()) ? 'ok' : 'no-native'
  if (Platform.OS === 'android') return loadAndroidHealth() !== null ? 'ok' : 'no-native'
  return 'unsupported-platform'
}

// ─── Resultado tipado del opt-in (QA-4/H19) ──────────────────────────────────────────────────────
// Antes TODO fallo devolvia `false` y la UI pintaba el mismo "No se pudo conectar con Salud", sin
// distinguir "falta instalar Health Connect" de "denegaste el permiso" de "el modulo nativo reventó".
// Ahora la causa viaja hasta la UI y cada una tiene su copy y su accion.

export type HealthConnectFailReason =
  | 'no-native' // el binario no trae el modulo (Expo Go / build viejo)
  | 'provider-missing' // Android <= 13 sin Health Connect instalado
  | 'provider-update' // Health Connect instalado pero desactualizado
  | 'denied' // el usuario no autorizo ningun dato
  | 'timeout' // la promesa nativa nunca resolvio (el spinner quedaria colgado para siempre)
  | 'native-error' // el modulo nativo devolvio un error real
  | 'unsupported-platform' // web / plataforma sin agregador

export type HealthConnectResult = { ok: true } | { ok: false; reason: HealthConnectFailReason; detail?: string }

/** Copy por causa. La UI elige ademas la accion (tienda, ajustes, reintentar). */
export const HEALTH_ERROR_COPY: Record<HealthConnectFailReason, string> = {
  'no-native': 'Actualizá EVA desde la tienda para conectar con Salud.',
  'provider-missing': 'Instalá Health Connect desde Google Play para conectar.',
  'provider-update': 'Actualizá Health Connect desde Google Play para conectar.',
  denied: 'No autorizaste pasos ni sueño. Podés hacerlo cuando quieras desde Salud.',
  timeout: 'Salud no respondió. Volvé a intentar.',
  'native-error': 'Salud no pudo responder. Volvé a intentar o revisá los permisos.',
  'unsupported-platform': 'Este dispositivo no tiene una app de Salud compatible.',
}

/**
 * Aviso ANTES de mandar al alumno a Google Play (Android <= 13 sin el proveedor). Google Play no
 * puede aparecer de sorpresa: el salto tiene que ser una decision del alumno, con contexto.
 */
export const HEALTH_PROVIDER_INSTALL_COPY = {
  title: 'Instalá Health Connect',
  body:
    'Android guarda tus pasos y horas de sueño en Health Connect, una app gratis de Google. Te vamos a llevar a Google Play para instalarla y después volvés a EVA.',
  cta: 'Abrir Google Play',
}

/** Deep link a la ficha de Health Connect (con fallback web si no hay app de Play). */
export const HEALTH_PROVIDER_PACKAGE = 'com.google.android.apps.healthdata'
export const HEALTH_PROVIDER_STORE_URL = `market://details?id=${HEALTH_PROVIDER_PACKAGE}`
export const HEALTH_PROVIDER_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${HEALTH_PROVIDER_PACKAGE}`

/** Abre la pantalla de Health Connect del sistema (Android). No-op si la lib no la expone. */
export function openHealthProviderSettings(): void {
  if (Platform.OS !== 'android') return
  const hc = loadAndroidHealth()
  try {
    hc?.openHealthConnectSettings?.()
  } catch (e) {
    console.warn('[health] openHealthConnectSettings fallo:', e)
  }
}

/** Timeout duro de las llamadas nativas: sin esto una promesa colgada deja el boton en "Conectando…". */
const HEALTH_REQUEST_TIMEOUT_MS = 90_000
const HEALTH_INIT_TIMEOUT_MS = 20_000
const TIMED_OUT = Symbol('health-timeout')

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([
    p,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ])
}

/**
 * Para que se pide el opt-in. El dialogo del sistema siempre cubre TODO lo que EVA lee (un solo
 * viaje), pero "¿quedo algo util?" depende del caller: habitos necesita pasos/sueño y el import del
 * reloj necesita las sesiones de ejercicio. Sin esta distincion, conceder solo uno de los dos grupos
 * daba un "conectado" que despues no entregaba nada — la mentira silenciosa que mato QA-4/H19.
 */
export type HealthScope = 'habits' | 'workouts'

/** Ventana [startMs, endMs] valida para consultar el hub; null si el llamador mando basura. */
function windowDates(startMs: number, endMs: number): { start: Date; end: Date } | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return { start: new Date(startMs), end: new Date(endMs) }
}

// ─── HealthKit (iOS) ─────────────────────────────────────────────────────────────────────────────

/**
 * QA-4/H19: antes el error CRUDO de HealthKit se descartaba — sin rastro en consola ni en Sentry,
 * imposible saber por que fallaba en el iPhone de QA. Ahora se propaga el detalle (y se loguea) para
 * que el toast diga algo concreto y el diagnostico deje de ser adivinanza.
 *
 * ASIMETRIA CON ANDROID: `requestAuthorization` resuelve cuando el dialogo se completo, pero Apple
 * NO revela que concedio el alumno (politica de privacidad de HealthKit). Por eso en iOS no existe
 * el estado 'denied': si nego todo, los reads devuelven null/[] y la UI degrada sola.
 */
async function iosInit(hk: AppleHealthKitModule): Promise<HealthConnectResult> {
  try {
    const res = await withTimeout(hk.requestAuthorization({ toRead: IOS_READ_TYPES }), HEALTH_REQUEST_TIMEOUT_MS)
    if (res === TIMED_OUT) {
      return { ok: false, reason: 'timeout', detail: 'requestAuthorization() no resolvio' }
    }
    if (res === false) {
      const detail = 'requestAuthorization() devolvio false'
      console.warn('[health] requestAuthorization fallo:', detail)
      return { ok: false, reason: 'native-error', detail }
    }
    return { ok: true }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.warn('[health] requestAuthorization lanzo:', detail)
    return { ok: false, reason: 'native-error', detail }
  }
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

/**
 * Un solo dialogo cubre TODO lo que EVA lee: pedir pasos hoy y sesiones de ejercicio la semana que
 * viene serian dos interrupciones al mismo alumno. Que se hace con cada permiso lo decide despues el
 * `HealthScope` del caller.
 */
const ANDROID_READ_PERMS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
]

/** RecordTypes que hacen util a cada scope: con al menos uno ya podemos entregar algo real. */
const SCOPE_RECORD_TYPES: Record<HealthScope, readonly string[]> = {
  habits: ['Steps', 'SleepSession'],
  workouts: ['ExerciseSession'],
}

/**
 * Estado del agregador ANTES de tocar `initialize/requestPermission`. Sin este chequeo, en un
 * teléfono sin Health Connect (o con el proveedor desactualizado) el `requestPermission` se va a
 * una Activity que no existe y el error puede escaparse del try/catch de JS (QA3: "conectar salud
 * saca de la app"). `available` tambien es el fallback cuando la lib no expone `getSdkStatus`.
 */
export type AndroidHealthAvailability = 'available' | 'update-required' | 'not-installed' | 'unsupported'

async function androidAvailability(hc: HealthConnectModule): Promise<AndroidHealthAvailability> {
  if (typeof hc.getSdkStatus !== 'function') return 'available'
  try {
    const status = await hc.getSdkStatus()
    const codes = hc.SdkAvailabilityStatus
    // Constantes de react-native-health-connect (1 = no disponible, 2 = requiere update, 3 = ok).
    if (status === (codes?.SDK_AVAILABLE ?? 3)) return 'available'
    if (status === (codes?.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ?? 2)) return 'update-required'
    return 'not-installed'
  } catch {
    return 'unsupported'
  }
}

/**
 * ¿Puede este Android abrir Health Connect? La UI la usa para elegir el mensaje (instalar /
 * actualizar) en vez de un "no se pudo conectar" a ciegas. En iOS/web → 'unsupported'.
 */
export async function getAndroidHealthAvailability(): Promise<AndroidHealthAvailability> {
  if (Platform.OS !== 'android') return 'unsupported'
  const hc = loadAndroidHealth()
  if (!hc) return 'unsupported'
  return androidAvailability(hc)
}

/** Normaliza la respuesta de `requestPermission`/`getGrantedPermissions` a los recordType de LECTURA. */
function grantedReadRecordTypes(res: unknown): Set<string> {
  const out = new Set<string>()
  if (!Array.isArray(res)) return out
  for (const p of res) {
    if (typeof p === 'string') {
      out.add(p)
      continue
    }
    const rt = (p as { recordType?: unknown })?.recordType
    const at = (p as { accessType?: unknown })?.accessType
    if (typeof rt === 'string' && (at == null || at === 'read')) out.add(rt)
  }
  return out
}

/** ¿Quedo algo util PARA ESTE SCOPE? Con al menos uno ya podemos cumplir lo que se prometio. */
function coversSomeReadPerm(res: unknown, scope: HealthScope): boolean {
  const granted = grantedReadRecordTypes(res)
  return SCOPE_RECORD_TYPES[scope].some((recordType) => granted.has(recordType))
}

async function androidInit(hc: HealthConnectModule, scope: HealthScope): Promise<HealthConnectResult> {
  // Gate previo: si el proveedor no está instalado/actualizado NO se pide permiso (evita el
  // salto a una Activity inexistente / a Google Play sin contexto).
  let availability: AndroidHealthAvailability
  try {
    availability = await androidAvailability(hc)
  } catch (e) {
    return { ok: false, reason: 'native-error', detail: e instanceof Error ? e.message : String(e) }
  }
  if (availability === 'update-required') return { ok: false, reason: 'provider-update' }
  if (availability === 'not-installed') return { ok: false, reason: 'provider-missing' }
  if (availability === 'unsupported') return { ok: false, reason: 'unsupported-platform' }

  try {
    const init = await withTimeout(hc.initialize(), HEALTH_INIT_TIMEOUT_MS)
    if (init === TIMED_OUT) return { ok: false, reason: 'timeout', detail: 'initialize() no resolvio' }
    if (!init) return { ok: false, reason: 'native-error', detail: 'initialize() devolvio false' }

    // Timeout obligatorio: si el delegate nativo de permisos no está registrado, esta promesa NO
    // resuelve nunca y el boton se queda en "Conectando…" para siempre (ver plugins/with-health-connect.js).
    const granted = await withTimeout(hc.requestPermission(ANDROID_READ_PERMS), HEALTH_REQUEST_TIMEOUT_MS)
    if (granted === TIMED_OUT) {
      return { ok: false, reason: 'timeout', detail: 'requestPermission() no resolvio' }
    }
    // QA-4/H19: antes se devolvia `true` a ciegas — EVA decia "Conectado a Salud" aunque el alumno
    // hubiera denegado TODO, y despues no autocompletaba nunca nada. Mentira silenciosa.
    if (coversSomeReadPerm(granted, scope)) return { ok: true }

    // Segunda mirada: algunas versiones devuelven [] aunque el permiso ya estuviera dado de antes.
    if (typeof hc.getGrantedPermissions === 'function') {
      const already = await withTimeout(hc.getGrantedPermissions(), HEALTH_INIT_TIMEOUT_MS)
      if (already !== TIMED_OUT && coversSomeReadPerm(already, scope)) return { ok: true }
    }
    return { ok: false, reason: 'denied' }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.warn('[health] Health Connect fallo:', detail)
    return { ok: false, reason: 'native-error', detail }
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
 * tocar "Conectar salud" / "Importar de tu reloj", devolviendo la CAUSA cuando falla para que la UI
 * muestre copy + accion concreta (`HEALTH_ERROR_COPY`) en vez del "No se pudo conectar" a ciegas.
 *
 * `scope` decide que concesion cuenta como exito en Android (ver `HealthScope`); en iOS es
 * informativo porque Apple no revela que autorizo el alumno.
 */
export async function requestHealthPermissionsDetailed(
  scope: HealthScope = 'habits',
): Promise<HealthConnectResult> {
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    if (!iosUsable(hk)) return { ok: false, reason: 'no-native' }
    return iosInit(hk as AppleHealthKitModule)
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    if (!hc) return { ok: false, reason: 'no-native' }
    return androidInit(hc, scope)
  }
  return { ok: false, reason: 'unsupported-platform' }
}

/** Ultima causa de fallo del opt-in (para el toast cuando el caller solo mira el booleano). */
let lastHealthFailure: HealthConnectResult | null = null

/** Causa del ultimo `requestHealthPermissions()` fallido; null si el ultimo intento salio bien. */
export function getLastHealthFailure(): { reason: HealthConnectFailReason; detail?: string } | null {
  if (!lastHealthFailure || lastHealthFailure.ok) return null
  return { reason: lastHealthFailure.reason, detail: lastHealthFailure.detail }
}

/**
 * Compat: mismo contrato booleano de siempre para los callers existentes. Cuando devuelve false, la
 * causa queda disponible en `getLastHealthFailure()` (y ya se logueo el detalle nativo en consola).
 */
export async function requestHealthPermissions(scope: HealthScope = 'habits'): Promise<boolean> {
  const res = await requestHealthPermissionsDetailed(scope)
  lastHealthFailure = res
  if (!res.ok) console.warn('[health] opt-in fallo:', res.reason, res.detail ?? '')
  return res.ok
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
