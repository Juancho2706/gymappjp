import { describe, expect, it } from 'vitest'

import {
    KM_PER_MILE,
    distanceKmFromTimePace,
    formatDuration,
    formatPace,
    kmhFromPace,
    paceKmToMile,
    paceToTimeSec,
    timeToPaceSecPerKm,
} from './pace'

describe('paceToTimeSec', () => {
    it('golden AC8: pace 5:00/km → 5K = 1500 s', () => {
        expect(paceToTimeSec(300, 5)).toBe(1500)
    })

    it('redondea a segundos enteros (floats intermedios)', () => {
        expect(paceToTimeSec(290, 3.3)).toBe(957) // 956.999... en float
        expect(paceToTimeSec(305, 10.5)).toBe(3203) // 3202.5 → 3203
    })

    it('distancia 0 → 0 s', () => {
        expect(paceToTimeSec(300, 0)).toBe(0)
    })

    it('rechaza pace invalido', () => {
        expect(() => paceToTimeSec(0, 5)).toThrow(RangeError)
        expect(() => paceToTimeSec(-300, 5)).toThrow(RangeError)
        expect(() => paceToTimeSec(Number.NaN, 5)).toThrow(RangeError)
        expect(() => paceToTimeSec(Number.POSITIVE_INFINITY, 5)).toThrow(RangeError)
    })

    it('rechaza distancia negativa', () => {
        expect(() => paceToTimeSec(300, -1)).toThrow(RangeError)
    })
})

describe('timeToPaceSecPerKm', () => {
    it('inversa del golden: 1500 s en 5 km → 300 s/km', () => {
        expect(timeToPaceSecPerKm(1500, 5)).toBe(300)
    })

    it('redondea a segundos enteros', () => {
        expect(timeToPaceSecPerKm(1501, 5)).toBe(300) // 300.2
        expect(timeToPaceSecPerKm(1000, 3)).toBe(333) // 333.33
    })

    it('rechaza distancia 0 (division)', () => {
        expect(() => timeToPaceSecPerKm(1500, 0)).toThrow(RangeError)
    })

    it('rechaza tiempo invalido', () => {
        expect(() => timeToPaceSecPerKm(-1, 5)).toThrow(RangeError)
        expect(() => timeToPaceSecPerKm(Number.NaN, 5)).toThrow(RangeError)
    })
})

describe('distanceKmFromTimePace', () => {
    it('1500 s a 300 s/km → 5 km', () => {
        expect(distanceKmFromTimePace(1500, 300)).toBe(5)
    })

    it('redondea a 2 decimales', () => {
        expect(distanceKmFromTimePace(1000, 300)).toBe(3.33) // 3.333...
        expect(distanceKmFromTimePace(100, 300)).toBe(0.33)
    })

    it('rechaza pace 0 (division)', () => {
        expect(() => distanceKmFromTimePace(1500, 0)).toThrow(RangeError)
    })
})

describe('kmhFromPace', () => {
    it('golden AC8: 3600/300 = 12 km/h', () => {
        expect(kmhFromPace(300)).toBe(12)
    })

    it('redondea a 1 decimal', () => {
        expect(kmhFromPace(330)).toBe(10.9) // 10.909...
        expect(kmhFromPace(255)).toBe(14.1) // 14.117...
    })

    it('rechaza pace invalido', () => {
        expect(() => kmhFromPace(0)).toThrow(RangeError)
        expect(() => kmhFromPace(Number.NaN)).toThrow(RangeError)
    })
})

describe('paceKmToMile', () => {
    it('golden AC8: pace milla de 5:00/km ≈ 8:03 (483 s)', () => {
        expect(paceKmToMile(300)).toBe(483) // 300 × 1.60934 = 482.8
        expect(formatPace(paceKmToMile(300))).toBe('8:03')
    })

    it('usa el factor 1.60934', () => {
        expect(KM_PER_MILE).toBe(1.60934)
        expect(paceKmToMile(240)).toBe(386) // 386.24
    })

    it('rechaza pace invalido', () => {
        expect(() => paceKmToMile(-1)).toThrow(RangeError)
    })
})

describe('formatPace', () => {
    it('formatea m:ss con padding de segundos', () => {
        expect(formatPace(300)).toBe('5:00')
        expect(formatPace(483)).toBe('8:03')
        expect(formatPace(59)).toBe('0:59')
        expect(formatPace(605)).toBe('10:05')
    })

    it('redondea entradas no enteras', () => {
        expect(formatPace(299.6)).toBe('5:00')
        expect(formatPace(299.4)).toBe('4:59')
    })

    it('0 es valido (placeholder de calculadora)', () => {
        expect(formatPace(0)).toBe('0:00')
    })

    it('rechaza valores invalidos', () => {
        expect(() => formatPace(-1)).toThrow(RangeError)
        expect(() => formatPace(Number.NaN)).toThrow(RangeError)
        expect(() => formatPace(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    })
})

describe('formatDuration', () => {
    it('golden AC8: 1500 s → "25:00"', () => {
        expect(formatDuration(1500)).toBe('25:00')
    })

    it('m:ss bajo la hora', () => {
        expect(formatDuration(0)).toBe('0:00')
        expect(formatDuration(59)).toBe('0:59')
        expect(formatDuration(60)).toBe('1:00')
        expect(formatDuration(3599)).toBe('59:59')
    })

    it('h:mm:ss desde la hora', () => {
        expect(formatDuration(3600)).toBe('1:00:00')
        expect(formatDuration(3661)).toBe('1:01:01')
        expect(formatDuration(86399)).toBe('23:59:59')
    })

    it('redondea a segundo entero', () => {
        expect(formatDuration(89.6)).toBe('1:30')
        expect(formatDuration(89.4)).toBe('1:29')
    })

    it('rechaza valores invalidos', () => {
        expect(() => formatDuration(-1)).toThrow(RangeError)
        expect(() => formatDuration(Number.NaN)).toThrow(RangeError)
    })
})
