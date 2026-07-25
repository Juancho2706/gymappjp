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
