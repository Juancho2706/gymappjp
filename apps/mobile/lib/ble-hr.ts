/**
 * BLE Heart Rate (E6.1, Ola 6) — canal ÚNICO de frecuencia cardiaca en vivo.
 *
 * Estrategia por capas del informe r7 (docs/research/executor-redesign/referentes/r7): con UNA sola
 * integración BLE del perfil GATT Heart Rate (servicio 0x180D, caracteristica de medicion 0x2A37)
 * EVA lee cualquier cinta de pecho / brazalete óptico del mercado (Polar, Garmin, Wahoo, Coospo,
 * Magene, Scosche…) y ademas relojes Garmin/Coros/Suunto/Whoop puestos en "modo broadcast". Apple
 * Watch y Galaxy Watch NO transmiten BLE estandar → quedan fuera de esta capa (llegan por su app).
 *
 * DEGRADACION HONESTA (regla dura del proyecto): la libreria nativa `react-native-ble-plx` solo
 * existe en build de desarrollo / EAS — en Expo Go el modulo entero degrada a `unavailable` y el
 * boton "Conectar sensor" NO aparece. Sin sensor conectado el BPM simplemente NO se muestra; jamas
 * se inventa pulso. El motor de guardado sigue intacto: el BPM vivo solo ALIMENTA la UI y auto-rellena
 * `actual_avg_hr` al cerrar el bloque por el flujo tipado existente.
 *
 * Este archivo separa lo PURO y testeable (parser de 0x2A37, decode base64, señal→barras) del
 * controlador con estado (scan/connect/stream/reconexion) que corre tras un guard dinamico.
 */
import { useSyncExternalStore } from 'react'
import { NativeModules, PermissionsAndroid, Platform } from 'react-native'
import {
  BLE_ERROR_COPY,
  type BleErrorKind,
  HR_MEASUREMENT_UUID,
  HR_SERVICE_UUID,
  bleErrorKind,
  bleStateErrorKind,
  bpmFromBase64,
} from './ble-hr-parse'

// Re-export de la parte PURA (parser 0x2A37, señal→barras, promedio, taxonomia de error).
export {
  HR_SERVICE_UUID,
  HR_MEASUREMENT_UUID,
  parseHeartRateMeasurement,
  base64ToBytes,
  bpmFromBase64,
  rssiToBars,
  averageBpm,
  bleErrorKind,
  bleStateErrorKind,
  BLE_ERROR_COPY,
} from './ble-hr-parse'
export type { BleErrorKind } from './ble-hr-parse'

// ─── Estado publico del controlador ──────────────────────────────────────────────────────────────

export type BleStatus = 'unavailable' | 'idle' | 'scanning' | 'connecting' | 'streaming' | 'error'

export interface BleFoundDevice {
  id: string
  name: string
  rssi: number | null
}

export interface BleHrState {
  status: BleStatus
  devices: BleFoundDevice[]
  connectedId: string | null
  connectedName: string | null
  /** Ultimo bpm recibido en vivo (null si no hay stream). */
  bpm: number | null
  /** Promedio de la sesion de stream (para auto-rellenar `actual_avg_hr` al cerrar el bloque). */
  avgHr: number | null
  sampleCount: number
  error: string | null
  /**
   * Causa honesta del ultimo fallo (QA-4/H6). `error` sigue siendo el string que se pinta, pero la UI
   * usa `errorKind` para elegir la ACCION (ir a ajustes de Bluetooth, de la app, de ubicacion…).
   */
  errorKind: BleErrorKind | null
}

// ─── Guard dinamico de la libreria nativa ────────────────────────────────────────────────────────
// `react-native-ble-plx` requiere build nativa (dev build / EAS). En Expo Go el require puede
// resolver el JS pero `new BleManager()` lanza; por eso ambos pasos van en try/catch y cualquier
// fallo cae a `unavailable`.

type MinimalDevice = {
  id: string
  name: string | null
  localName?: string | null
  rssi: number | null
  connect: () => Promise<MinimalDevice>
  discoverAllServicesAndCharacteristics: () => Promise<MinimalDevice>
  monitorCharacteristicForService: (
    serviceUUID: string,
    charUUID: string,
    listener: (error: unknown, characteristic: { value?: string | null } | null) => void,
  ) => { remove: () => void }
  onDisconnected: (listener: (error: unknown, device: MinimalDevice | null) => void) => { remove: () => void }
  cancelConnection: () => Promise<MinimalDevice>
}

type BleSubscription = { remove: () => void }

type MinimalManager = {
  startDeviceScan: (
    uuids: string[] | null,
    options: unknown,
    listener: (error: unknown, device: MinimalDevice | null) => void,
  ) => void
  stopDeviceScan: () => void
  connectToDevice: (id: string, options?: unknown) => Promise<MinimalDevice>
  destroy: () => void
  /** Estado del adaptador: 'PoweredOn' | 'PoweredOff' | 'Unauthorized' | 'Unsupported' | 'Unknown' | 'Resetting'. */
  state: () => Promise<string>
  /** `emitCurrentState=true` entrega el estado actual de inmediato (iOS arranca en 'Unknown'). */
  onStateChange: (listener: (state: string) => void, emitCurrentState?: boolean) => BleSubscription
}

let managerSingleton: MinimalManager | null = null
let managerLoadAttempted = false

/**
 * Instancia el `BleManager`. OJO: `new BleManager()` crea el CBCentralManager (iOS) /
 * BluetoothAdapter client (Android) — en iOS eso dispara el prompt de Bluetooth del SISTEMA. Por eso
 * NUNCA se llama desde el import ni desde el feature-detect: solo desde startScan/connect, es decir
 * cuando el alumno ya tocó "Conectar sensor" (permisos JUST-IN-TIME, regla del módulo).
 */
function loadManager(): MinimalManager | null {
  if (managerLoadAttempted) return managerSingleton
  managerLoadAttempted = true
  try {
    // Dynamic require: la libreria SOLO existe en build nativa. En Expo Go esto degrada a null.
    const mod = require('react-native-ble-plx') as { BleManager: new () => MinimalManager }
    managerSingleton = new mod.BleManager()
  } catch {
    managerSingleton = null
  }
  return managerSingleton
}

let libDetected: boolean | null = null

/**
 * ¿Hay backend BLE nativo disponible? false en Expo Go / web.
 * Detect BARATO y SIN efectos: mira el binding nativo (`NativeModules.BlePlx`, mismo nombre en iOS y
 * Android) y que el JS exporte la clase. No instancia el manager (ver `loadManager`). Si el manager
 * ya se instanció con éxito en esta sesión, eso manda: es la prueba más fuerte de que el módulo está.
 */
export function isBleAvailable(): boolean {
  if (managerSingleton !== null) return true
  if (libDetected !== null) return libDetected
  try {
    const mod = require('react-native-ble-plx') as { BleManager?: unknown }
    const nativeLinked = (() => {
      try {
        return NativeModules != null && (NativeModules as Record<string, unknown>).BlePlx != null
      } catch {
        return false
      }
    })()
    libDetected = typeof mod?.BleManager === 'function' && nativeLinked
  } catch {
    libDetected = false
  }
  return libDetected
}

// ─── Estado del adaptador Bluetooth ──────────────────────────────────────────────────────────────

const ADAPTER_TIMEOUT_MS = 4_000

/**
 * Espera a que el adaptador resuelva. En iOS el CBCentralManager arranca en 'Unknown' y tarda
 * 100-500 ms en llegar a 'PoweredOn': escanear antes falla con un error opaco. En Android devuelve
 * 'PoweredOff' de inmediato cuando el Bluetooth está apagado — que es EXACTAMENTE el caso de QA.
 * `manager.enable()` de ble-plx está deprecado (Android 13+ lo removió), así que no se usa: cuando
 * el adaptador no está listo la UI manda al alumno a los ajustes del sistema.
 */
function waitForAdapterReady(manager: MinimalManager, timeoutMs = ADAPTER_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve) => {
    let done = false
    let sub: BleSubscription | null = null
    const finish = (state: string) => {
      if (done) return
      done = true
      try {
        sub?.remove()
      } catch {
        /* no-op */
      }
      resolve(state)
    }
    const timer = setTimeout(() => finish('Unknown'), timeoutMs)
    try {
      sub = manager.onStateChange((state) => {
        if (state === 'Unknown' || state === 'Resetting') return // aún resolviendo
        clearTimeout(timer)
        finish(state)
      }, true)
    } catch {
      clearTimeout(timer)
      // Runtime sin `onStateChange` (mock / lib vieja): no bloqueamos el flujo, seguimos al scan.
      finish('PoweredOn')
    }
  })
}

// ─── Permisos JUST-IN-TIME (al tocar Conectar, nunca al abrir la app) ────────────────────────────

async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true // iOS: el prompt lo dispara el primer scan del sistema.
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10)
  try {
    if (api >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ])
      return (
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      )
    }
    // API < 31: el scan BLE exige ubicacion fina (aunque no la usemos para geolocalizar).
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
    return res === PermissionsAndroid.RESULTS.GRANTED
  } catch {
    return false
  }
}

// ─── Controlador con estado (singleton) para useSyncExternalStore ────────────────────────────────

const SCAN_TIMEOUT_MS = 15_000
const MAX_RECONNECT_ATTEMPTS = 3

class BleHrController {
  private listeners = new Set<() => void>()
  private snapshot: BleHrState = {
    status: isBleAvailable() ? 'idle' : 'unavailable',
    devices: [],
    connectedId: null,
    connectedName: null,
    bpm: null,
    avgHr: null,
    sampleCount: 0,
    error: null,
    errorKind: null,
  }
  private sum = 0
  private count = 0
  private device: MinimalDevice | null = null
  private monitorSub: { remove: () => void } | null = null
  private disconnectSub: { remove: () => void } | null = null
  private adapterSub: BleSubscription | null = null
  private scanTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private userDisconnected = false

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): BleHrState => this.snapshot

  private set(patch: Partial<BleHrState>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }

  /** Setea el error con la causa clasificada + su copy (fuente única: BLE_ERROR_COPY). */
  private fail(kind: BleErrorKind, status: BleStatus = 'error') {
    this.set({ status, errorKind: kind, error: BLE_ERROR_COPY[kind] })
  }

  /**
   * Mientras el Bluetooth esté apagado, escucha el adaptador: si el alumno lo prende desde el panel
   * rápido / Centro de Control, el scan se reanuda solo sin cerrar el sheet.
   */
  private watchAdapterForResume(manager: MinimalManager) {
    this.clearAdapterWatch()
    try {
      this.adapterSub = manager.onStateChange((state) => {
        if (state !== 'PoweredOn') return
        this.clearAdapterWatch()
        if (this.snapshot.status === 'error' && this.snapshot.errorKind === 'powered-off') {
          void this.startScan()
        }
      }, false)
    } catch {
      this.adapterSub = null
    }
  }

  private clearAdapterWatch() {
    try {
      this.adapterSub?.remove()
    } catch {
      /* no-op */
    }
    this.adapterSub = null
  }

  /** Inicia el scan filtrado por servicio 0x180D. Pide permisos JUST-IN-TIME. */
  async startScan(): Promise<void> {
    if (!isBleAvailable()) {
      this.set({ status: 'unavailable', errorKind: 'no-native', error: BLE_ERROR_COPY['no-native'] })
      return
    }
    // Recién acá se instancia el manager (en iOS esto dispara el prompt de Bluetooth del sistema:
    // tiene que salir con el sheet abierto, nunca al entrar a cardio).
    const manager = loadManager()
    if (!manager) {
      this.set({ status: 'unavailable', errorKind: 'no-native', error: BLE_ERROR_COPY['no-native'] })
      return
    }
    const granted = await ensureBlePermissions()
    if (!granted) {
      this.fail('unauthorized')
      return
    }
    // Gate del adaptador ANTES de escanear: con el Bluetooth apagado ble-plx no pide nada, solo
    // devuelve un error opaco por el callback del scan (QA-4/H6: "no se pudo buscar sensores").
    const adapterState = await waitForAdapterReady(manager)
    const adapterProblem = bleStateErrorKind(adapterState)
    if (adapterProblem) {
      this.fail(adapterProblem)
      if (adapterProblem === 'powered-off') this.watchAdapterForResume(manager)
      return
    }
    this.clearAdapterWatch()
    this.set({ status: 'scanning', devices: [], error: null, errorKind: null })
    try {
      manager.startDeviceScan([HR_SERVICE_UUID], null, (error, device) => {
        if (error) {
          const kind = bleErrorKind(error)
          this.stopScan()
          this.fail(kind)
          if (kind === 'powered-off') this.watchAdapterForResume(manager)
          return
        }
        if (!device) return
        const name = device.name || device.localName || 'Sensor de pulso'
        const found: BleFoundDevice = { id: device.id, name, rssi: device.rssi ?? null }
        const existing = this.snapshot.devices.findIndex((d) => d.id === found.id)
        if (existing >= 0) {
          const next = this.snapshot.devices.slice()
          next[existing] = found
          this.set({ devices: next })
        } else {
          this.set({ devices: [...this.snapshot.devices, found] })
        }
      })
      if (this.scanTimer) clearTimeout(this.scanTimer)
      this.scanTimer = setTimeout(() => {
        if (this.snapshot.status !== 'scanning') return
        const empty = this.snapshot.devices.length === 0
        this.stopScan()
        // Vacío tras 15 s: antes el radar se quedaba quieto y el sheet no decía NADA. Ahora se
        // explica qué hacer (prender la cinta / activar el broadcast del reloj) y se puede reintentar.
        if (empty) this.fail('not-found')
      }, SCAN_TIMEOUT_MS)
    } catch (e) {
      const kind = bleErrorKind(e)
      this.fail(kind === 'unknown' ? 'scan-failed' : kind)
    }
  }

  stopScan(): void {
    // Al cerrar el sheet se corta también la escucha del adaptador (nada de reanudar en background).
    this.clearAdapterWatch()
    // No instancia el manager: si nunca se escaneó no hay nada que detener.
    const manager = managerSingleton
    try {
      manager?.stopDeviceScan()
    } catch {
      /* no-op */
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }
    if (this.snapshot.status === 'scanning') this.set({ status: 'idle' })
  }

  /** Conecta al dispositivo y se suscribe al stream de 0x2A37. */
  async connect(id: string): Promise<void> {
    const manager = loadManager()
    if (!manager) {
      this.set({ status: 'unavailable', errorKind: 'no-native', error: BLE_ERROR_COPY['no-native'] })
      return
    }
    this.clearAdapterWatch()
    this.stopScan()
    this.userDisconnected = false
    this.reconnectAttempts = 0
    const target = this.snapshot.devices.find((d) => d.id === id)
    this.set({
      status: 'connecting',
      connectedId: id,
      connectedName: target?.name ?? null,
      error: null,
      errorKind: null,
    })
    await this.doConnect(id)
  }

  private async doConnect(id: string): Promise<void> {
    const manager = loadManager()
    if (!manager) return
    // Reinicia el promedio de la sesion en cada conexion fresca (no en reconexion silenciosa).
    if (this.reconnectAttempts === 0) {
      this.sum = 0
      this.count = 0
      this.set({ bpm: null, avgHr: null, sampleCount: 0 })
    }
    try {
      const device = await manager.connectToDevice(id)
      await device.discoverAllServicesAndCharacteristics()
      this.device = device

      this.disconnectSub?.remove()
      this.disconnectSub = device.onDisconnected(() => this.handleDisconnected(id))

      this.monitorSub?.remove()
      this.monitorSub = device.monitorCharacteristicForService(
        HR_SERVICE_UUID,
        HR_MEASUREMENT_UUID,
        (error, characteristic) => {
          if (error) return // reconexion la maneja onDisconnected
          const bpm = bpmFromBase64(characteristic?.value)
          if (bpm == null || bpm <= 0) return
          this.sum += bpm
          this.count += 1
          this.reconnectAttempts = 0 // stream sano → resetea contador de reintentos
          this.set({
            status: 'streaming',
            bpm,
            avgHr: Math.round(this.sum / this.count),
            sampleCount: this.count,
          })
        },
      )
    } catch (e) {
      // Distingue "el adaptador se apagó / no hay permiso" de "el sensor no responde".
      const kind = bleErrorKind(e)
      this.fail(kind === 'unknown' || kind === 'not-found' ? 'connection-lost' : kind)
    }
  }

  private handleDisconnected(id: string): void {
    this.monitorSub?.remove()
    this.monitorSub = null
    if (this.userDisconnected) {
      this.set({ status: 'idle', connectedId: null, connectedName: null, bpm: null, errorKind: null, error: null })
      return
    }
    // Reconexion basica: reintenta hasta MAX_RECONNECT_ATTEMPTS conservando el promedio.
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts += 1
      this.set({ status: 'connecting', bpm: null })
      void this.doConnect(id)
    } else {
      this.set({ bpm: null })
      this.fail('connection-lost')
    }
  }

  /** Desconexion limpia solicitada por el usuario. Conserva el promedio en el estado. */
  async disconnect(): Promise<void> {
    this.userDisconnected = true
    this.clearAdapterWatch()
    this.monitorSub?.remove()
    this.monitorSub = null
    this.disconnectSub?.remove()
    this.disconnectSub = null
    try {
      await this.device?.cancelConnection()
    } catch {
      /* ya estaba desconectado */
    }
    this.device = null
    this.set({ status: 'idle', connectedId: null, connectedName: null, bpm: null, error: null, errorKind: null })
  }
}

const controller = new BleHrController()

export interface UseBleHr {
  state: BleHrState
  startScan: () => Promise<void>
  stopScan: () => void
  connect: (id: string) => Promise<void>
  disconnect: () => Promise<void>
}

/** Hook de acceso al controlador BLE (estado reactivo via useSyncExternalStore). */
export function useBleHr(): UseBleHr {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  return {
    state,
    startScan: () => controller.startScan(),
    stopScan: () => controller.stopScan(),
    connect: (id: string) => controller.connect(id),
    disconnect: () => controller.disconnect(),
  }
}
