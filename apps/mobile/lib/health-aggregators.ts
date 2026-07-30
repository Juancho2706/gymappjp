/**
 * Salud del alumno via agregadores de plataforma (E6.3, Ola 6) — HealthKit (iOS) + Health Connect
 * (Android). "La estrella de la ola": cubre TODO lo que el alumno ya sincroniza a su centro de salud
 * SIN una app de reloj — Apple Watch, Galaxy Watch, bandas Xiaomi/Amazfit, Fitbit y cualquier
 * dispositivo que escriba al agregador. Datos AGREGADOS/historicos (no en vivo): leemos pasos de HOY
 * y sueño de anoche para PRE-LLENAR el widget de habitos.
 *
 * REGLAS (informe r7 §1 + task): los agregadores NO son fuente de BPM en vivo (eso es BLE, ble-hr.ts).
 * Guards dinamicos igual que BLE — las librerias nativas (`react-native-health` iOS,
 * `react-native-health-connect` Android) solo existen en build nativa; en Expo Go / web el modulo
 * degrada a `unavailable` y el opt-in no aparece. JAMAS sobreescribe lo que el alumno ya escribio:
 * el pre-llenado es solo cuando el campo esta vacio, editable, y se guarda por el flujo manual.
 */
import { Platform } from 'react-native'
import { lastNightWindow, sumSleepHours, todayWindow } from './health-aggregators-pure'

// Re-export de la parte PURA (ventanas + normalizacion) para consumidores del modulo.
export { todayWindow, lastNightWindow, hoursBetween, nearestSleepOption, sumSleepHours } from './health-aggregators-pure'

// ─── Guards dinamicos de las librerias nativas ───────────────────────────────────────────────────

type AppleHealthKitModule = {
  initHealthKit: (perms: unknown, cb: (err: string | null) => void) => void
  getStepCount: (opts: unknown, cb: (err: string | null, res: { value: number } | null) => void) => void
  getSleepSamples: (
    opts: unknown,
    cb: (err: string | null, res: { startDate: string; endDate: string; value?: string }[] | null) => void,
  ) => void
  Constants?: { Permissions?: Record<string, string> }
}

type HealthConnectModule = {
  initialize: () => Promise<boolean>
  requestPermission: (perms: unknown) => Promise<unknown>
  aggregateRecord: (req: unknown) => Promise<{ COUNT_TOTAL?: number } | null>
  readRecords: (
    recordType: string,
    req: unknown,
  ) => Promise<{ records: { startTime: string; endTime: string }[] } | null>
  /** Opcional: no existe en versiones viejas de la lib → se trata como "seguir el flujo normal". */
  getSdkStatus?: () => Promise<number>
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
    const mod = require('react-native-health')
    iosModule = (mod.default ?? mod) as AppleHealthKitModule
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

// ─── HealthKit (iOS) ─────────────────────────────────────────────────────────────────────────────

function iosPermissions(hk: AppleHealthKitModule): unknown {
  const P = hk.Constants?.Permissions ?? {}
  return { permissions: { read: [P.Steps ?? 'Steps', P.SleepAnalysis ?? 'SleepAnalysis'], write: [] } }
}

function iosInit(hk: AppleHealthKitModule): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      hk.initHealthKit(iosPermissions(hk), (err) => resolve(!err))
    } catch {
      resolve(false)
    }
  })
}

function iosSteps(hk: AppleHealthKitModule, now: Date): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      hk.getStepCount({ date: now.toISOString() }, (err, res) => {
        resolve(err || !res ? null : Math.round(res.value))
      })
    } catch {
      resolve(null)
    }
  })
}

function iosSleep(hk: AppleHealthKitModule, now: Date): Promise<number | null> {
  const { start, end } = lastNightWindow(now)
  return new Promise((resolve) => {
    try {
      hk.getSleepSamples({ startDate: start.toISOString(), endDate: end.toISOString() }, (err, res) => {
        if (err || !res) return resolve(null)
        // Solo tramos efectivamente dormido (excluye INBED / AWAKE).
        const asleep = res.filter((s) => {
          const v = (s.value ?? '').toUpperCase()
          return v === 'ASLEEP' || v === 'CORE' || v === 'DEEP' || v === 'REM'
        })
        const source = asleep.length > 0 ? asleep : res
        resolve(sumSleepHours(source.map((s) => ({ start: s.startDate, end: s.endDate }))))
      })
    } catch {
      resolve(null)
    }
  })
}

// ─── Health Connect (Android) ─────────────────────────────────────────────────────────────────────

const ANDROID_READ_PERMS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
]

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

async function androidInit(hc: HealthConnectModule): Promise<boolean> {
  try {
    // Gate previo: si el proveedor no está instalado/actualizado NO se pide permiso (evita el
    // salto a una Activity inexistente). El caller muestra el mensaje segun getAndroidHealthAvailability().
    if ((await androidAvailability(hc)) !== 'available') return false
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

// ─── API unificada ───────────────────────────────────────────────────────────────────────────────

/**
 * Pide permisos de salud (pasos + sueño) JUST-IN-TIME al tocar "Conectar salud". Devuelve true si el
 * usuario concedio y el agregador quedo inicializado. En plataformas sin agregador → false.
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
