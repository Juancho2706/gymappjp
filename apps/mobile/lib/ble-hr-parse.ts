/**
 * Parte PURA de BLE Heart Rate (E6.1) — parser del perfil GATT Heart Rate y helpers de señal/promedio.
 * SIN imports de react-native / react: así corre en Vitest (node) y queda testeable con fixtures.
 * El controlador con estado (scan/connect/stream) vive en `ble-hr.ts` tras el guard dinamico nativo.
 */
import { decode as decodeBase64 } from 'base64-arraybuffer'

/** Heart Rate Service (0x180D) en forma 128-bit — `react-native-ble-plx` espera UUID completo lower-case. */
export const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb'
/** Heart Rate Measurement characteristic (0x2A37). */
export const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb'

/**
 * Parsea el payload de la caracteristica Heart Rate Measurement (0x2A37).
 * Byte 0 = flags; bit 0 indica el formato del valor de HR: 0 = uint8 (byte 1), 1 = uint16 LE
 * (bytes 1-2). Devuelve el bpm o `null` si el buffer es demasiado corto para el formato indicado.
 * (Ignoramos los campos opcionales de energia/RR — solo necesitamos el bpm instantaneo.)
 */
export function parseHeartRateMeasurement(bytes: Uint8Array | null | undefined): number | null {
  if (!bytes || bytes.length < 2) return null
  const flags = bytes[0]
  const is16bit = (flags & 0x01) === 0x01
  if (is16bit) {
    if (bytes.length < 3) return null
    return bytes[1] | (bytes[2] << 8) // little-endian
  }
  return bytes[1]
}

/** Decodifica el valor base64 que entrega `react-native-ble-plx` a bytes crudos. */
export function base64ToBytes(base64: string | null | undefined): Uint8Array | null {
  if (!base64) return null
  try {
    return new Uint8Array(decodeBase64(base64))
  } catch {
    return null
  }
}

/** Conveniencia: base64 (0x2A37) → bpm. */
export function bpmFromBase64(base64: string | null | undefined): number | null {
  return parseHeartRateMeasurement(base64ToBytes(base64))
}

/**
 * Fuerza de señal (RSSI dBm) → 0-4 barras. RSSI mas cercano a 0 = mejor. Cortes tipicos BLE:
 * ≥ -55 excelente (4), ≥ -67 buena (3), ≥ -78 regular (2), ≥ -90 debil (1), inferior/desconocido = 0.
 */
export function rssiToBars(rssi: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (rssi == null || !Number.isFinite(rssi)) return 0
  if (rssi >= -55) return 4
  if (rssi >= -67) return 3
  if (rssi >= -78) return 2
  if (rssi >= -90) return 1
  return 0
}

/** Promedio entero de una serie de bpm (para auto-rellenar `actual_avg_hr`). null si no hay muestras. */
export function averageBpm(samples: readonly number[]): number | null {
  const valid = samples.filter((s) => Number.isFinite(s) && s > 0)
  if (valid.length === 0) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

// ─── Taxonomia de errores (paridad con la web: web-ble-hr.ts `HrErrorKind`) ──────────────────────
// QA-4/H6: antes TODAS las causas (Bluetooth apagado, permiso denegado, ubicación apagada, scan
// rechazado por Android, equipo sin BLE) colapsaban al mismo string opaco "No se pudo buscar
// sensores" — por eso el alumno nunca sabía que solo tenía que prender el Bluetooth. Acá se
// clasifica la causa REAL para que la UI muestre copy + acción concreta.

export type BleErrorKind =
  | 'powered-off' // el adaptador Bluetooth está apagado
  | 'unauthorized' // permiso de Bluetooth denegado (iOS o Android 12+)
  | 'unsupported' // el equipo no tiene BLE
  | 'location-off' // Android < 12 con los servicios de ubicación apagados
  | 'scan-failed' // Android rechazó el scan (throttling: 5 scans / 30 s)
  | 'not-found' // el scan terminó sin encontrar ningún sensor
  | 'connection-lost' // se cayó/no se pudo abrir la conexión con el sensor
  | 'no-native' // el binario no trae el módulo nativo (Expo Go / build viejo)
  | 'unknown'

/**
 * PURA: mapea el `errorCode` de `react-native-ble-plx` (BleError.js) a una causa accionable.
 * 100 Unsupported · 101 Unauthorized · 102 PoweredOff · 105 StateChangeFailed ·
 * 200/201/205 conexión · 204 DeviceNotFound · 600 ScanStartFailed · 601 LocationServicesDisabled.
 */
export function bleErrorKind(err: unknown): BleErrorKind {
  const code = (err as { errorCode?: number } | null | undefined)?.errorCode
  switch (code) {
    case 100:
      return 'unsupported'
    case 101:
      return 'unauthorized'
    case 102:
    case 105:
      return 'powered-off'
    case 200:
    case 201:
    case 205:
      return 'connection-lost'
    case 204:
      return 'not-found'
    case 600:
      return 'scan-failed'
    case 601:
      return 'location-off'
    default:
      return 'unknown'
  }
}

/**
 * PURA: traduce el estado del adaptador (`manager.state()` / `onStateChange`) a una causa.
 * Devuelve `null` cuando el adaptador está listo (`PoweredOn`) — o sea, "no hay error".
 */
export function bleStateErrorKind(state: string | null | undefined): BleErrorKind | null {
  switch (state) {
    case 'PoweredOn':
      return null
    case 'PoweredOff':
      return 'powered-off'
    case 'Unauthorized':
      return 'unauthorized'
    case 'Unsupported':
      return 'unsupported'
    default:
      // 'Unknown' / 'Resetting' / timeout: el adaptador nunca llegó a responder.
      return 'unknown'
  }
}

/** Copy por causa (voz del producto, misma que la web). La UI decide además la acción. */
export const BLE_ERROR_COPY: Record<BleErrorKind, string> = {
  'powered-off': 'Prendé el Bluetooth del teléfono para buscar tu sensor.',
  unauthorized: 'EVA no tiene permiso de Bluetooth. Activalo en los ajustes del teléfono.',
  unsupported: 'Este teléfono no tiene Bluetooth de baja energía (BLE).',
  'location-off':
    'Prendé la ubicación del teléfono: Android la exige para buscar sensores Bluetooth. EVA no usa tu ubicación.',
  'scan-failed': 'No pudimos iniciar la búsqueda. Esperá unos segundos y volvé a intentar.',
  'not-found':
    'No encontramos sensores. Prendé la cinta o activá "Difundir frecuencia cardíaca" en el reloj y volvé a buscar.',
  'connection-lost': 'Se perdió la conexión con el sensor. Acercalo y volvé a conectar.',
  'no-native': 'Actualizá EVA desde la tienda para conectar tu sensor de pulso.',
  unknown: 'No se pudo buscar sensores. Volvé a intentar.',
}
