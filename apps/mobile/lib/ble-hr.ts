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
import { PermissionsAndroid, Platform } from 'react-native'
import { HR_MEASUREMENT_UUID, HR_SERVICE_UUID, bpmFromBase64 } from './ble-hr-parse'

// Re-export de la parte PURA (parser 0x2A37, señal→barras, promedio) para consumidores del modulo.
export {
  HR_SERVICE_UUID,
  HR_MEASUREMENT_UUID,
  parseHeartRateMeasurement,
  base64ToBytes,
  bpmFromBase64,
  rssiToBars,
  averageBpm,
} from './ble-hr-parse'

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

type MinimalManager = {
  startDeviceScan: (
    uuids: string[] | null,
    options: unknown,
    listener: (error: unknown, device: MinimalDevice | null) => void,
  ) => void
  stopDeviceScan: () => void
  connectToDevice: (id: string, options?: unknown) => Promise<MinimalDevice>
  destroy: () => void
}

let managerSingleton: MinimalManager | null = null
let managerLoadAttempted = false

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

/** ¿Hay backend BLE nativo disponible? false en Expo Go / web. */
export function isBleAvailable(): boolean {
  return loadManager() !== null
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
  }
  private sum = 0
  private count = 0
  private device: MinimalDevice | null = null
  private monitorSub: { remove: () => void } | null = null
  private disconnectSub: { remove: () => void } | null = null
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

  /** Inicia el scan filtrado por servicio 0x180D. Pide permisos JUST-IN-TIME. */
  async startScan(): Promise<void> {
    const manager = loadManager()
    if (!manager) {
      this.set({ status: 'unavailable' })
      return
    }
    const granted = await ensureBlePermissions()
    if (!granted) {
      this.set({ status: 'error', error: 'Permiso de Bluetooth denegado' })
      return
    }
    this.set({ status: 'scanning', devices: [], error: null })
    try {
      manager.startDeviceScan([HR_SERVICE_UUID], null, (error, device) => {
        if (error) {
          this.set({ status: 'error', error: 'No se pudo buscar sensores' })
          this.stopScan()
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
        if (this.snapshot.status === 'scanning') this.stopScan()
      }, SCAN_TIMEOUT_MS)
    } catch {
      this.set({ status: 'error', error: 'No se pudo iniciar la busqueda' })
    }
  }

  stopScan(): void {
    const manager = loadManager()
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
      this.set({ status: 'unavailable' })
      return
    }
    this.stopScan()
    this.userDisconnected = false
    this.reconnectAttempts = 0
    const target = this.snapshot.devices.find((d) => d.id === id)
    this.set({ status: 'connecting', connectedId: id, connectedName: target?.name ?? null, error: null })
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
    } catch {
      this.set({ status: 'error', error: 'No se pudo conectar al sensor' })
    }
  }

  private handleDisconnected(id: string): void {
    this.monitorSub?.remove()
    this.monitorSub = null
    if (this.userDisconnected) {
      this.set({ status: 'idle', connectedId: null, connectedName: null, bpm: null })
      return
    }
    // Reconexion basica: reintenta hasta MAX_RECONNECT_ATTEMPTS conservando el promedio.
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts += 1
      this.set({ status: 'connecting', bpm: null })
      void this.doConnect(id)
    } else {
      this.set({ status: 'error', error: 'Se perdio la conexion con el sensor', bpm: null })
    }
  }

  /** Desconexion limpia solicitada por el usuario. Conserva el promedio en el estado. */
  async disconnect(): Promise<void> {
    this.userDisconnected = true
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
    this.set({ status: 'idle', connectedId: null, connectedName: null, bpm: null })
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
