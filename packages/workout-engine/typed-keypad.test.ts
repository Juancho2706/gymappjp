import { describe, it, expect } from 'vitest'
import { typedKeypadFields, formatTypedObjective } from './typed-keypad'

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
