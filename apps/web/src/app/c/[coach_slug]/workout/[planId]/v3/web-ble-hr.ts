/**
 * Ejecutor V3 (E6.2 · Ola 6) — Web Bluetooth para frecuencia cardiaca EN VIVO durante el cardio.
 *
 * Estrategia por capas del informe R7 (docs/research/executor-redesign/referentes/r7-universo-wearables-hr.md):
 * en PWA la única vía legítima de HR en vivo es Web Bluetooth con el perfil GATT Heart Rate estándar
 * (servicio `0x180D` / caracteristica de medición `0x2A37`). UNA integración cubre cintas de pecho
 * (Polar H10, Garmin HRM-Dual/Pro, Wahoo TICKR, Coospo, Magene), brazaletes ópticos (Verity Sense,
 * Scosche) y relojes en "modo broadcast" (Garmin, Coros, Suunto, Whoop).
 *
 * HONESTIDAD (regla dura): Web Bluetooth SOLO existe en Chrome/Edge de Android. En iOS/iPadOS NO existe
 * en NINGÚN navegador (todos WebKit por política de Apple), y en desktop sin adaptador tampoco. Por eso
 * `isWebBleHrSupported()` es un feature-detect estricto: si es false, la UI NO muestra NADA de sensor
 * (jamás promete BLE que no puede cumplir). El BPM en vivo solo ALIMENTA la UI; nunca inventamos pulso:
 * sin sensor conectado, el BPM simplemente no se muestra y la FC sigue siendo manual (fallback de siempre).
 *
 * Este módulo es agnóstico de React: parser PURO (testeable con fixtures) + feature-detect + un manejador
 * de conexión con notificaciones, reconexión básica y desconexión limpia. El estado de React vive en
 * `use-web-ble-hr.ts`.
 */

import type { HrZoneRange } from '@eva/cardio'

// UUIDs del perfil Heart Rate (GATT asignado). Web Bluetooth acepta los alias string estándar.
/** Servicio Heart Rate (`0x180D`). */
export const HEART_RATE_SERVICE = 'heart_rate' as const
/** Caracteristica Heart Rate Measurement (`0x2A37`). */
export const HEART_RATE_MEASUREMENT = 'heart_rate_measurement' as const

// ---- Tipos mínimos de Web Bluetooth (sin dependencia @types/web-bluetooth; solo el subconjunto usado) ----

interface BleCharacteristic extends EventTarget {
    startNotifications(): Promise<BleCharacteristic>
    stopNotifications(): Promise<BleCharacteristic>
    readonly value?: DataView | null
}
interface BleService {
    getCharacteristic(uuid: string | number): Promise<BleCharacteristic>
}
interface BleGattServer {
    readonly connected: boolean
    connect(): Promise<BleGattServer>
    disconnect(): void
    getPrimaryService(uuid: string | number): Promise<BleService>
}
interface BleDevice extends EventTarget {
    readonly name?: string
    readonly id: string
    readonly gatt?: BleGattServer
}
interface BleRequestOptions {
    filters?: Array<{ services: Array<string | number> }>
    optionalServices?: Array<string | number>
}
interface BluetoothLike {
    requestDevice(options: BleRequestOptions): Promise<BleDevice>
}

/** Accesor tipado a `navigator.bluetooth` (o null si el runtime no lo expone). SSR-safe. */
function getBluetooth(): BluetoothLike | null {
    if (typeof navigator === 'undefined') return null
    const nav = navigator as unknown as { bluetooth?: BluetoothLike }
    const bt = nav.bluetooth
    if (!bt || typeof bt.requestDevice !== 'function') return null
    return bt
}

/**
 * Feature-detect ESTRICTO de Web Bluetooth con perfil HR. Debe pasar el gate para que la UI de sensor
 * exista siquiera. En iOS (cualquier navegador) y desktop sin adaptador ⇒ false ⇒ no se muestra nada.
 */
export function isWebBleHrSupported(): boolean {
    return getBluetooth() !== null
}

// ---- Parser PURO del Heart Rate Measurement (0x2A37) ----

/** Resultado de parsear una trama de medición de HR. */
export interface HeartRateSample {
    /** Latidos por minuto (uint8 o uint16 según el flag byte). */
    bpm: number
    /** El sensor reporta soporte de detección de contacto (bit 2 del flag). */
    contactSupported: boolean
    /** Contacto con la piel detectado (bit 1; solo significativo si `contactSupported`). */
    contactDetected: boolean
    /** Intervalos RR presentes en la trama (bit 4) — no los usamos, pero se detectan. */
    hasRrIntervals: boolean
}

/**
 * Parsea una trama de la caracteristica Heart Rate Measurement (`0x2A37`), PURO y testeable con fixtures.
 *
 * Formato GATT (byte 0 = flags):
 *  - bit 0: formato del valor de HR — 0 = uint8 (offset 1), 1 = uint16 LE (offset 1..2).
 *  - bit 1: estado de contacto con la piel (si bit 2 lo declara soportado).
 *  - bit 2: soporte de detección de contacto.
 *  - bit 3: energía gastada presente (uint16 tras el HR) — se ignora.
 *  - bit 4: intervalos RR presentes — se detectan pero no se usan.
 *
 * Devuelve `null` si la trama es demasiado corta para contener el HR (bytes insuficientes) — el llamador
 * simplemente no muestra BPM (nunca inventa un valor).
 */
export function parseHeartRateMeasurement(value: DataView): HeartRateSample | null {
    if (value.byteLength < 1) return null
    const flags = value.getUint8(0)
    const is16 = (flags & 0x01) === 0x01
    const contactSupported = (flags & 0x04) === 0x04
    const contactDetected = (flags & 0x02) === 0x02
    const hasRrIntervals = (flags & 0x10) === 0x10

    // uint16 exige bytes 1 y 2; uint8 exige byte 1.
    if (is16 ? value.byteLength < 3 : value.byteLength < 2) return null
    const bpm = is16 ? value.getUint16(1, true /* little-endian */) : value.getUint8(1)

    return { bpm, contactSupported, contactDetected, hasRrIntervals }
}

/** Un bpm es utilizable si es un entero finito en un rango fisiológico plausible (evita ceros/ruido). */
export function isUsableBpm(bpm: number | null | undefined): bpm is number {
    return typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= 25 && bpm <= 250
}

/**
 * Promedio (entero) de las muestras de bpm de la sesión de cardio — alimenta el auto-prellenado de
 * `actual_avg_hr` al cerrar el bloque. PURO. `null` si no hay muestras utilizables.
 */
export function averageBpm(samples: readonly number[]): number | null {
    const usable = samples.filter(isUsableBpm)
    if (usable.length === 0) return null
    const sum = usable.reduce((acc, n) => acc + n, 0)
    return Math.round(sum / usable.length)
}

/**
 * Clasifica un bpm EN VIVO en su zona usando los rangos YA resueltos del alumno (`cardio.zones` del
 * ejecutor). Misma lógica de cortes que `hrToZone`/la prescripción (tramo más alto cuyo mínimo alcanza
 * el bpm, clampeado a [1,5]), pero operando sobre los rangos que la vista web ya transporta —evita
 * arrastrar `max_hr` hasta el cliente. `null` si el bpm no sirve o no hay zonas (el chip muestra el bpm
 * crudo sin zona). PURO.
 */
export function zoneFromRanges(bpm: number, zones: readonly HrZoneRange[] | null | undefined): HrZoneRange | null {
    if (!isUsableBpm(bpm) || !zones || zones.length === 0) return null
    const ordered = [...zones].sort((a, b) => a.zone - b.zone)
    let selected = ordered[0]
    for (const range of ordered) {
        if (bpm >= range.minBpm) selected = range
    }
    return selected
}

// ---- Manejador de conexión (notificaciones + reconexión básica + desconexión limpia) ----

/** Estado de alto nivel de la conexión al sensor. */
export type HrStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/** Causa honesta del fallo — la UI la traduce a un mensaje concreto (sin falsos positivos). */
export type HrErrorKind =
    | 'unsupported' // el navegador no expone Web Bluetooth (iOS / desktop sin adaptador)
    | 'cancelled' // el usuario cerró el selector del navegador o no había sensor
    | 'denied' // permiso denegado por política/usuario
    | 'connection-lost' // se agotó la reconexión tras perder el sensor
    | 'gatt' // fallo genérico de GATT/servicio

export interface HrConnectionCallbacks {
    onBpm: (sample: HeartRateSample) => void
    onStatus: (status: HrStatus) => void
    onDeviceName: (name: string) => void
    onError: (kind: HrErrorKind) => void
}

export interface HrConnectionHandle {
    /** Corta la conexión, quita listeners y detiene notificaciones. Idempotente. */
    disconnect: () => void
}

const RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1200

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapRequestError(err: unknown): HrErrorKind {
    const name = err instanceof Error ? err.name : ''
    // El selector del navegador rechaza con NotFoundError cuando el usuario cancela o no hay dispositivo.
    if (name === 'NotFoundError') return 'cancelled'
    if (name === 'SecurityError' || name === 'NotAllowedError') return 'denied'
    return 'gatt'
}

/**
 * Abre el selector nativo del navegador (filtro `heart_rate`), conecta GATT, se suscribe a
 * `heart_rate_measurement` y emite cada muestra por callback. Debe llamarse desde un gesto del usuario
 * (requisito de `requestDevice`). Devuelve un handle con `disconnect`, o `null` si el navegador no
 * soporta Web Bluetooth (el llamador ni siquiera debería llegar aquí por el feature-detect previo).
 *
 * Reconexión básica: ante `gattserverdisconnected` no provocado por nosotros, reintenta reconectar GATT
 * y re-suscribir hasta `RECONNECT_ATTEMPTS`; si se agota, reporta `connection-lost`.
 */
export async function connectHeartRate(cb: HrConnectionCallbacks): Promise<HrConnectionHandle | null> {
    const bluetooth = getBluetooth()
    if (!bluetooth) {
        cb.onError('unsupported')
        return null
    }

    let disposed = false
    let device: BleDevice | null = null
    let characteristic: BleCharacteristic | null = null

    const onValueChanged = (event: Event) => {
        const target = event.target as BleCharacteristic | null
        const value = target?.value
        if (!value) return
        const sample = parseHeartRateMeasurement(value)
        if (sample && isUsableBpm(sample.bpm)) cb.onBpm(sample)
    }

    async function subscribe(dev: BleDevice): Promise<void> {
        const server = dev.gatt
        if (!server) throw new Error('gatt-unavailable')
        if (!server.connected) await server.connect()
        const service = await server.getPrimaryService(HEART_RATE_SERVICE)
        characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
        characteristic.addEventListener('characteristicvaluechanged', onValueChanged)
        await characteristic.startNotifications()
    }

    const onDisconnected = async () => {
        if (disposed || !device) return
        cb.onStatus('reconnecting')
        for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !disposed; attempt++) {
            try {
                await delay(RECONNECT_DELAY_MS)
                if (disposed || !device) return
                await subscribe(device)
                if (!disposed) cb.onStatus('connected')
                return
            } catch {
                // siguiente intento
            }
        }
        if (!disposed) {
            cb.onError('connection-lost')
            cb.onStatus('error')
        }
    }

    try {
        cb.onStatus('requesting')
        device = await bluetooth.requestDevice({
            filters: [{ services: [HEART_RATE_SERVICE] }],
        })
        if (disposed) {
            device.gatt?.disconnect()
            return { disconnect: () => {} }
        }
        cb.onDeviceName(device.name?.trim() || 'Sensor de pulso')
        device.addEventListener('gattserverdisconnected', onDisconnected)
        cb.onStatus('connecting')
        await subscribe(device)
        if (disposed) {
            device.gatt?.disconnect()
            return { disconnect: () => {} }
        }
        cb.onStatus('connected')
    } catch (err) {
        cb.onError(mapRequestError(err))
        cb.onStatus('error')
        try {
            device?.gatt?.disconnect()
        } catch {
            /* noop */
        }
        return null
    }

    const disconnect = () => {
        if (disposed) return
        disposed = true
        try {
            device?.removeEventListener('gattserverdisconnected', onDisconnected)
            characteristic?.removeEventListener('characteristicvaluechanged', onValueChanged)
            characteristic?.stopNotifications().catch(() => {})
            device?.gatt?.disconnect()
        } catch {
            /* teardown best-effort */
        }
        device = null
        characteristic = null
    }

    return { disconnect }
}
