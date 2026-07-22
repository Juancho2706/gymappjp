/**
 * E6.1 — parsers PUROS de BLE Heart Rate (perfil GATT 0x180D / caracteristica 0x2A37).
 * Fixtures uint8 vs uint16, señal→barras y promedio de stream. No toca la libreria nativa.
 */
import { describe, expect, it } from 'vitest'
import { encode as encodeBase64 } from 'base64-arraybuffer'
import {
  averageBpm,
  base64ToBytes,
  bpmFromBase64,
  parseHeartRateMeasurement,
  rssiToBars,
} from '../../apps/mobile/lib/ble-hr-parse'

function toBase64(bytes: number[]): string {
  return encodeBase64(new Uint8Array(bytes).buffer)
}

describe('parseHeartRateMeasurement (0x2A37)', () => {
  it('formato uint8 (flag bit0 = 0): HR en el byte 1', () => {
    // flags=0x00 → uint8; 0x48 = 72 bpm
    expect(parseHeartRateMeasurement(new Uint8Array([0x00, 72]))).toBe(72)
    expect(parseHeartRateMeasurement(new Uint8Array([0x00, 0]))).toBe(0)
    expect(parseHeartRateMeasurement(new Uint8Array([0x00, 255]))).toBe(255)
  })

  it('formato uint16 (flag bit0 = 1): HR little-endian en bytes 1-2', () => {
    // flags=0x01 → uint16 LE; 0x2C 0x01 = 300 bpm
    expect(parseHeartRateMeasurement(new Uint8Array([0x01, 0x2c, 0x01]))).toBe(300)
    // 200 = 0xC8 0x00
    expect(parseHeartRateMeasurement(new Uint8Array([0x01, 0xc8, 0x00]))).toBe(200)
  })

  it('ignora bits de flags altos (energia/RR presentes) y lee el formato del bit 0', () => {
    // flags=0x10 (bit0=0 → uint8 aunque haya otros flags) → 65 bpm
    expect(parseHeartRateMeasurement(new Uint8Array([0x10, 65, 0xff, 0xff]))).toBe(65)
    // flags=0x11 (bit0=1 → uint16) → 130 bpm en bytes 1-2, resto ignorado
    expect(parseHeartRateMeasurement(new Uint8Array([0x11, 130, 0x00, 0xaa]))).toBe(130)
  })

  it('devuelve null cuando el buffer es demasiado corto para el formato', () => {
    expect(parseHeartRateMeasurement(new Uint8Array([]))).toBeNull()
    expect(parseHeartRateMeasurement(new Uint8Array([0x00]))).toBeNull()
    // uint16 declarado pero sin el tercer byte
    expect(parseHeartRateMeasurement(new Uint8Array([0x01, 0x2c]))).toBeNull()
    expect(parseHeartRateMeasurement(null)).toBeNull()
    expect(parseHeartRateMeasurement(undefined)).toBeNull()
  })
})

describe('base64ToBytes / bpmFromBase64', () => {
  it('decodifica base64 (lo que entrega react-native-ble-plx) a bytes', () => {
    const bytes = base64ToBytes(toBase64([0x00, 88]))
    expect(bytes).not.toBeNull()
    expect(Array.from(bytes as Uint8Array)).toEqual([0x00, 88])
  })

  it('base64 → bpm directo, uint8 y uint16', () => {
    expect(bpmFromBase64(toBase64([0x00, 91]))).toBe(91)
    expect(bpmFromBase64(toBase64([0x01, 0x2c, 0x01]))).toBe(300)
  })

  it('null/base64 vacio → null', () => {
    expect(base64ToBytes(null)).toBeNull()
    expect(base64ToBytes('')).toBeNull()
    expect(bpmFromBase64(null)).toBeNull()
  })
})

describe('rssiToBars', () => {
  it('mapea RSSI (dBm) a 0-4 barras', () => {
    expect(rssiToBars(-40)).toBe(4)
    expect(rssiToBars(-55)).toBe(4)
    expect(rssiToBars(-60)).toBe(3)
    expect(rssiToBars(-70)).toBe(2)
    expect(rssiToBars(-85)).toBe(1)
    expect(rssiToBars(-95)).toBe(0)
  })

  it('null/NaN → 0 barras (sin señal conocida)', () => {
    expect(rssiToBars(null)).toBe(0)
    expect(rssiToBars(undefined)).toBe(0)
    expect(rssiToBars(NaN)).toBe(0)
  })
})

describe('averageBpm (promedio de stream para actual_avg_hr)', () => {
  it('promedia y redondea a entero', () => {
    expect(averageBpm([120, 130, 140])).toBe(130)
    expect(averageBpm([100, 101])).toBe(101) // 100.5 → 101
    expect(averageBpm([150])).toBe(150)
  })

  it('descarta muestras no positivas y sin datos válidos → null', () => {
    expect(averageBpm([0, -5, 140])).toBe(140)
    expect(averageBpm([])).toBeNull()
    expect(averageBpm([0, 0])).toBeNull()
  })
})
