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

/**
 * GATE iOS REAL (QA-4/H19). `react-native-health` arma su export con
 * `Object.assign({}, NativeModules.AppleHealthKit, { Constants })` y `Object.assign` NO lanza con
 * `undefined`: el require SIEMPRE devuelve un objeto, aunque el modulo nativo no este enlazado. Por
 * eso el simple `!== null` daba true siempre en iOS y el boton "Conectar salud" aparecia hasta en
 * Expo Go, para fallar despues con un toast generico. Verificamos los METODOS que vamos a usar.
 */
function iosUsable(m: AppleHealthKitModule | null): boolean {
  return !!m && typeof m.initHealthKit === 'function' && typeof m.getStepCount === 'function'
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

// ─── HealthKit (iOS) ─────────────────────────────────────────────────────────────────────────────

function iosPermissions(hk: AppleHealthKitModule): unknown {
  const P = hk.Constants?.Permissions ?? {}
  return { permissions: { read: [P.Steps ?? 'Steps', P.SleepAnalysis ?? 'SleepAnalysis'], write: [] } }
}

/**
 * QA-4/H19: antes esto era `resolve(!err)` y el error CRUDO de HealthKit se descartaba — sin rastro
 * en consola ni en Sentry, imposible saber por que fallaba en el iPhone de QA. Ahora se propaga el
 * detalle (y se loguea) para que el toast diga algo concreto y el diagnostico deje de ser adivinanza.
 */
function iosInit(hk: AppleHealthKitModule): Promise<HealthConnectResult> {
  return new Promise((resolve) => {
    let settled = false
    const done = (r: HealthConnectResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(
      () => done({ ok: false, reason: 'timeout', detail: 'initHealthKit no respondio' }),
      HEALTH_REQUEST_TIMEOUT_MS,
    )
    try {
      hk.initHealthKit(iosPermissions(hk), (err) => {
        if (!err) return done({ ok: true })
        const detail = typeof err === 'string' ? err : String(err)
        console.warn('[health] initHealthKit fallo:', detail)
        done({ ok: false, reason: 'native-error', detail })
      })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.warn('[health] initHealthKit lanzo:', detail)
      done({ ok: false, reason: 'native-error', detail })
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

/** ¿Quedo algo util? Con al menos uno de los dos ya podemos autocompletar ese campo. */
function coversSomeReadPerm(res: unknown): boolean {
  const granted = grantedReadRecordTypes(res)
  return granted.has('Steps') || granted.has('SleepSession')
}

async function androidInit(hc: HealthConnectModule): Promise<HealthConnectResult> {
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
    if (coversSomeReadPerm(granted)) return { ok: true }

    // Segunda mirada: algunas versiones devuelven [] aunque el permiso ya estuviera dado de antes.
    if (typeof hc.getGrantedPermissions === 'function') {
      const already = await withTimeout(hc.getGrantedPermissions(), HEALTH_INIT_TIMEOUT_MS)
      if (already !== TIMED_OUT && coversSomeReadPerm(already)) return { ok: true }
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

// ─── API unificada ───────────────────────────────────────────────────────────────────────────────

/**
 * Pide permisos de salud (pasos + sueño) JUST-IN-TIME al tocar "Conectar salud", devolviendo la
 * CAUSA cuando falla para que la UI muestre copy + accion concreta (`HEALTH_ERROR_COPY`) en vez del
 * "No se pudo conectar con Salud" a ciegas.
 */
export async function requestHealthPermissionsDetailed(): Promise<HealthConnectResult> {
  if (Platform.OS === 'ios') {
    const hk = loadIosHealth()
    if (!iosUsable(hk)) return { ok: false, reason: 'no-native' }
    return iosInit(hk as AppleHealthKitModule)
  }
  if (Platform.OS === 'android') {
    const hc = loadAndroidHealth()
    if (!hc) return { ok: false, reason: 'no-native' }
    return androidInit(hc)
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
export async function requestHealthPermissions(): Promise<boolean> {
  const res = await requestHealthPermissionsDetailed()
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
