import { describe, expect, it } from 'vitest'
import {
    averageBpm,
    isUsableBpm,
    isWebBleHrSupported,
    parseHeartRateMeasurement,
    zoneFromRanges,
} from './web-ble-hr'
import type { HrZoneRange } from '@eva/cardio'

/** Construye un DataView a partir de bytes crudos (como llega la caracteristica 0x2A37). */
function frame(...bytes: number[]): DataView {
    return new DataView(new Uint8Array(bytes).buffer)
}

describe('parseHeartRateMeasurement — parser PURO del Heart Rate Measurement (0x2A37)', () => {
    it('lee HR uint8 cuando el bit 0 del flag es 0', () => {
        // flags=0x00 (uint8, sin contacto ni RR), HR=72
        expect(parseHeartRateMeasurement(frame(0x00, 72))).toEqual({
            bpm: 72,
            contactSupported: false,
            contactDetected: false,
            hasRrIntervals: false,
        })
    })

    it('lee HR uint16 little-endian cuando el bit 0 del flag es 1', () => {
        // flags=0x01 (uint16), HR=300 = 0x012C ⇒ LE bytes 0x2C,0x01
        expect(parseHeartRateMeasurement(frame(0x01, 0x2c, 0x01))?.bpm).toBe(300)
    })

    it('un HR uint8 alto (>255 imposible en uint8) se mantiene en el byte', () => {
        // flags=0x00, HR=200
        expect(parseHeartRateMeasurement(frame(0x00, 200))?.bpm).toBe(200)
    })

    it('decodifica soporte y estado de contacto con la piel (bits 1 y 2)', () => {
        // flags=0x06 (bit1 contacto detectado + bit2 soportado), HR=140
        expect(parseHeartRateMeasurement(frame(0x06, 140))).toEqual({
            bpm: 140,
            contactSupported: true,
            contactDetected: true,
            hasRrIntervals: false,
        })
        // flags=0x04 (soportado pero SIN contacto), HR=140
        const noContact = parseHeartRateMeasurement(frame(0x04, 140))
        expect(noContact?.contactSupported).toBe(true)
        expect(noContact?.contactDetected).toBe(false)
    })

    it('detecta la presencia de intervalos RR (bit 4) sin usarlos', () => {
        // flags=0x10 (RR presente), HR=88, luego RR de relleno (ignorado)
        const sample = parseHeartRateMeasurement(frame(0x10, 88, 0x00, 0x03))
        expect(sample?.bpm).toBe(88)
        expect(sample?.hasRrIntervals).toBe(true)
    })

    it('combina uint16 + contacto + RR en una sola trama', () => {
        // flags=0x17 (uint16 + contacto detectado + soportado + RR), HR=260 = 0x0104 ⇒ LE 0x04,0x01
        const sample = parseHeartRateMeasurement(frame(0x17, 0x04, 0x01, 0xaa, 0xbb))
        expect(sample).toMatchObject({ bpm: 260, contactSupported: true, contactDetected: true, hasRrIntervals: true })
    })

    it('devuelve null si la trama es demasiado corta para el HR', () => {
        expect(parseHeartRateMeasurement(frame())).toBeNull() // sin flags
        expect(parseHeartRateMeasurement(frame(0x00))).toBeNull() // uint8 sin byte de HR
        expect(parseHeartRateMeasurement(frame(0x01, 0x2c))).toBeNull() // uint16 con un solo byte
    })
})

describe('isUsableBpm — filtra ruido/ceros del sensor', () => {
    it('acepta bpm fisiológicos plausibles', () => {
        expect(isUsableBpm(60)).toBe(true)
        expect(isUsableBpm(25)).toBe(true)
        expect(isUsableBpm(250)).toBe(true)
    })
    it('rechaza fuera de rango, no-finitos y nullish', () => {
        expect(isUsableBpm(0)).toBe(false)
        expect(isUsableBpm(24)).toBe(false)
        expect(isUsableBpm(251)).toBe(false)
        expect(isUsableBpm(Number.NaN)).toBe(false)
        expect(isUsableBpm(null)).toBe(false)
        expect(isUsableBpm(undefined)).toBe(false)
    })
})

describe('averageBpm — promedio para auto-prellenar actual_avg_hr', () => {
    it('promedia solo muestras utilizables y redondea a entero', () => {
        expect(averageBpm([100, 110, 120])).toBe(110)
        expect(averageBpm([100, 101])).toBe(101) // 100.5 → 101 (round)
    })
    it('descarta ruido/ceros antes de promediar', () => {
        expect(averageBpm([0, 150, 160, 9999])).toBe(155)
    })
    it('null si no hay muestras utilizables', () => {
        expect(averageBpm([])).toBeNull()
        expect(averageBpm([0, 10, 300])).toBeNull()
    })
})

describe('zoneFromRanges — clasifica un bpm en vivo con los rangos ya resueltos del alumno', () => {
    // Rangos típicos (FCmax 190, %FCmax): Z1 95-114, Z2 114-133, Z3 133-152, Z4 152-171, Z5 171-190.
    const zones: HrZoneRange[] = [
        { zone: 1, minBpm: 95, maxBpm: 114 },
        { zone: 2, minBpm: 114, maxBpm: 133 },
        { zone: 3, minBpm: 133, maxBpm: 152 },
        { zone: 4, minBpm: 152, maxBpm: 171 },
        { zone: 5, minBpm: 171, maxBpm: 190 },
    ]

    it('asigna la zona por el tramo más alto cuyo mínimo alcanza el bpm', () => {
        expect(zoneFromRanges(160, zones)?.zone).toBe(4)
        expect(zoneFromRanges(120, zones)?.zone).toBe(2)
    })
    it('un bpm en el borde pertenece a la zona superior', () => {
        expect(zoneFromRanges(152, zones)?.zone).toBe(4)
        expect(zoneFromRanges(171, zones)?.zone).toBe(5)
    })
    it('clampa bajo Z1 a la zona 1 y sobre Z5 a la zona 5', () => {
        expect(zoneFromRanges(60, zones)?.zone).toBe(1)
        expect(zoneFromRanges(240, zones)?.zone).toBe(5)
    })
    it('ordena zonas desordenadas antes de clasificar', () => {
        const shuffled = [zones[3], zones[0], zones[4], zones[1], zones[2]]
        expect(zoneFromRanges(140, shuffled)?.zone).toBe(3)
    })
    it('null si el bpm no sirve o no hay zonas', () => {
        expect(zoneFromRanges(0, zones)).toBeNull()
        expect(zoneFromRanges(150, null)).toBeNull()
        expect(zoneFromRanges(150, [])).toBeNull()
    })
})

describe('isWebBleHrSupported — feature-detect estricto', () => {
    it('es false en un runtime sin navigator.bluetooth (jsdom / SSR / iOS)', () => {
        // jsdom no expone navigator.bluetooth ⇒ la UI de sensor NO se monta.
        expect(isWebBleHrSupported()).toBe(false)
    })
})
