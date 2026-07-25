import { describe, it, expect } from 'vitest'
import {
    typedKeypadFields,
    formatTypedObjective,
    distanceCaptureToMeters,
    metersToDistanceCapture,
} from './typed-keypad'

describe('typedKeypadFields', () => {
    it('cardio → min (decimal), metros (decimal), FC (entero)', () => {
        const f = typedKeypadFields('cardio')
        expect(f.map((x) => x.key)).toEqual(['cardio_min', 'actual_distance_m', 'actual_avg_hr'])
        expect(f.find((x) => x.key === 'cardio_min')?.allowDecimal).toBe(true)
        expect(f.find((x) => x.key === 'actual_distance_m')?.allowDecimal).toBe(true)
        expect(f.find((x) => x.key === 'actual_avg_hr')?.allowDecimal).toBe(false)
    })

    it('mobility → hold entero, un solo campo', () => {
        const f = typedKeypadFields('mobility')
        expect(f).toHaveLength(1)
        expect(f[0]).toMatchObject({ key: 'actual_hold_sec', allowDecimal: false })
    })

    it('roller → segundos + pasadas, ambos enteros', () => {
        const f = typedKeypadFields('roller')
        expect(f.map((x) => x.key)).toEqual(['actual_duration_sec', 'reps_done'])
        expect(f.every((x) => !x.allowDecimal)).toBe(true)
    })

    // ── Hold POR LADO (E0.5): sideMode='per_side' en movilidad → dos campos enteros ──
    it('mobility per_side → dos campos hold izq./der., enteros', () => {
        const f = typedKeypadFields('mobility', 'per_side')
        expect(f.map((x) => x.key)).toEqual(['hold_left_sec', 'hold_right_sec'])
        expect(f.every((x) => !x.allowDecimal)).toBe(true)
    })

    it('paridad: sideMode ausente/bilateral/otro modo → un solo hold, byte-idéntico', () => {
        const bilateral = [{ key: 'actual_hold_sec', label: 'Hold', unit: 'seg', allowDecimal: false }]
        expect(typedKeypadFields('mobility')).toEqual(bilateral)
        expect(typedKeypadFields('mobility', 'bilateral')).toEqual(bilateral)
        expect(typedKeypadFields('mobility', null)).toEqual(bilateral)
        // per_side NO afecta cardio ni roller
        expect(typedKeypadFields('cardio', 'per_side').map((x) => x.key)).toEqual(['cardio_min', 'actual_distance_m', 'actual_avg_hr'])
        expect(typedKeypadFields('roller', 'per_side').map((x) => x.key)).toEqual(['actual_duration_sec', 'reps_done'])
    })
})

// ── Unidad de captura = unidad PRESCRITA (G3 / RF4) ──
describe('typedKeypadFields — distancia en la unidad prescrita', () => {
    it('cardio con distance_unit km → caja "Km" decimal con factor a metros', () => {
        const f = typedKeypadFields('cardio', { distanceUnit: 'km' })
        expect(f.map((x) => x.key)).toEqual(['cardio_min', 'actual_distance_m', 'actual_avg_hr'])
        expect(f[1]).toEqual({
            key: 'actual_distance_m',
            label: 'Km',
            unit: 'km',
            allowDecimal: true,
            toColumnFactor: 1000,
        })
    })

    it('fallback: sin unidad, con "m", o con el sideMode suelto → "Metros" sin factor', () => {
        const metros = { key: 'actual_distance_m', label: 'Metros', unit: 'm', allowDecimal: true }
        expect(typedKeypadFields('cardio')[1]).toEqual(metros)
        expect(typedKeypadFields('cardio', { distanceUnit: 'm' })[1]).toEqual(metros)
        expect(typedKeypadFields('cardio', { distanceUnit: null })[1]).toEqual(metros)
        expect(typedKeypadFields('cardio', 'per_side')[1]).toEqual(metros)
        expect(typedKeypadFields('cardio')[1].toColumnFactor).toBeUndefined()
    })

    it('la unidad de distancia no toca movilidad ni roller', () => {
        expect(typedKeypadFields('mobility', { distanceUnit: 'km' })).toEqual(typedKeypadFields('mobility'))
        expect(typedKeypadFields('roller', { distanceUnit: 'km' })).toEqual(typedKeypadFields('roller'))
        expect(typedKeypadFields('mobility', { sideMode: 'per_side', distanceUnit: 'km' }).map((x) => x.key)).toEqual([
            'hold_left_sec',
            'hold_right_sec',
        ])
    })

    it('conversión ida y vuelta km ↔ metros (lo que el alumno escribe es lo que relee)', () => {
        expect(distanceCaptureToMeters(5, 'km')).toBe(5000)
        expect(distanceCaptureToMeters(5.25, 'km')).toBe(5250)
        expect(metersToDistanceCapture(5000, 'km')).toBe(5)
        expect(metersToDistanceCapture(5250, 'km')).toBe(5.25)
        // Redondeo a 2 decimales en la relectura (no arrastra ruido de punto flotante).
        expect(metersToDistanceCapture(5253, 'km')).toBe(5.25)
        // Sin km: valores intactos en ambas direcciones.
        expect(distanceCaptureToMeters(400, 'm')).toBe(400)
        expect(distanceCaptureToMeters(400)).toBe(400)
        expect(metersToDistanceCapture(400, 'm')).toBe(400)
        expect(metersToDistanceCapture(null, 'km')).toBeNull()
    })
})

describe('formatTypedObjective', () => {
    it('cardio con duración en minutos + zona FC', () => {
        expect(formatTypedObjective({ duration_sec: 1200, hr_zone: 4 }, 'cardio')).toBe('20 min · Z4')
    })

    it('cardio con distancia + rondas', () => {
        expect(formatTypedObjective({ distance_value: 5, distance_unit: 'km', sets: 3 }, 'cardio')).toBe('5 km · 3 rondas')
    })

    it('cardio con duración no-redonda usa m/s', () => {
        expect(formatTypedObjective({ duration_sec: 90 }, 'cardio')).toBe('1m 30s')
    })

    it('mobility con hold + series + respiraciones', () => {
        expect(
            formatTypedObjective({ duration_sec: 30, sets: 3, reps_unit: 'breaths', reps_value: 5 }, 'mobility'),
        ).toBe('Hold 30s · 3 series · 5 resp.')
    })

    it('roller por pasadas', () => {
        expect(formatTypedObjective({ reps_unit: 'passes', reps_value: 10 }, 'roller')).toBe('10 pasadas')
    })

    it('roller por duración (sin pasadas)', () => {
        expect(formatTypedObjective({ duration_sec: 45 }, 'roller')).toBe('45s')
    })

    it('sin prescripción → vacío', () => {
        expect(formatTypedObjective({}, 'cardio')).toBe('')
    })
})

// ── Objetivo rep-based de cardio (RF8 · Fase C): saltos / pisos / reps ──
describe('formatTypedObjective — cardio rep-based', () => {
    it('imprime el conteo prescrito con la unidad de la modalidad', () => {
        expect(formatTypedObjective({ reps_value: 500, reps_unit: 'jumps' }, 'cardio')).toBe('500 saltos')
        expect(formatTypedObjective({ reps_value: 40, reps_unit: 'floors' }, 'cardio')).toBe('40 pisos')
        expect(formatTypedObjective({ reps_value: 30, reps_unit: 'reps' }, 'cardio')).toBe('30 reps')
    })

    it('convive con duración, zona y rondas en el orden del header', () => {
        expect(
            formatTypedObjective({ duration_sec: 480, reps_value: 500, reps_unit: 'jumps', hr_zone: 3, sets: 2 }, 'cardio'),
        ).toBe('8 min · 500 saltos · Z3 · 2 rondas')
    })

    it('sin valor, con valor 0 o con unidades de otros tipos ⇒ no aporta nada', () => {
        expect(formatTypedObjective({ reps_unit: 'jumps' }, 'cardio')).toBe('')
        expect(formatTypedObjective({ reps_value: 0, reps_unit: 'jumps' }, 'cardio')).toBe('')
        expect(formatTypedObjective({ reps_value: 10, reps_unit: 'passes' }, 'cardio')).toBe('')
        expect(formatTypedObjective({ reps_value: 5, reps_unit: 'breaths' }, 'cardio')).toBe('')
        // Y no toca a movilidad ni roller (sus reglas siguen intactas).
        expect(formatTypedObjective({ reps_value: 500, reps_unit: 'jumps' }, 'roller')).toBe('')
    })
})
