import { describe, expect, it } from 'vitest'
import { reduceMonthlyRecap } from './monthly-recap.reduce'

describe('reduceMonthlyRecap — filtro al mes calendario (Santiago)', () => {
    const dayCounts = [
        { day: '2026-06-29', sets: 12 }, // mes anterior
        { day: '2026-06-30', sets: 8 }, // mes anterior
        { day: '2026-07-01', sets: 10 }, // primer día del mes
        { day: '2026-07-15', sets: 20 },
        { day: '2026-07-31', sets: 6 }, // último día del mes
        { day: '2026-08-01', sets: 5 }, // mes siguiente
    ]
    const tonnage = [
        { day: '2026-06-30', tonnage: 5000 }, // fuera
        { day: '2026-07-01', tonnage: 3000 },
        { day: '2026-07-15', tonnage: 4200 },
        { day: '2026-07-31', tonnage: 1800 },
        { day: '2026-08-01', tonnage: 9999 }, // fuera
    ]

    it('cuenta solo las sesiones del mes (bordes 07-01 y 07-31 incluidos, 06-30 y 08-01 fuera)', () => {
        const { sessions } = reduceMonthlyRecap(dayCounts, tonnage, '2026-07')
        expect(sessions).toBe(3) // 07-01, 07-15, 07-31
    })

    it('suma solo el volumen del mes', () => {
        const { volumeKg } = reduceMonthlyRecap(dayCounts, tonnage, '2026-07')
        expect(volumeKg).toBe(3000 + 4200 + 1800) // 9000; excluye 06-30 y 08-01
    })

    it('ignora días sin series (sets = 0) al contar sesiones', () => {
        const rows = [
            { day: '2026-07-02', sets: 0 },
            { day: '2026-07-03', sets: 4 },
        ]
        const { sessions } = reduceMonthlyRecap(rows, [], '2026-07')
        expect(sessions).toBe(1)
    })

    it('tolera day/sets/tonnage nulos sin romper', () => {
        const rows = [
            { day: null, sets: 5 },
            { day: '2026-07-04', sets: null },
            { day: '2026-07-05', sets: 3 },
        ]
        const tons = [
            { day: null, tonnage: 100 },
            { day: '2026-07-05', tonnage: null },
            { day: '2026-07-06', tonnage: 250 },
        ]
        const { sessions, volumeKg } = reduceMonthlyRecap(rows, tons, '2026-07')
        expect(sessions).toBe(1) // solo 07-05 (07-04 tiene sets null → no cuenta)
        expect(volumeKg).toBe(250) // solo 07-06 aporta
    })

    it('mes sin datos → 0 sesiones y 0 volumen', () => {
        const { sessions, volumeKg } = reduceMonthlyRecap(dayCounts, tonnage, '2026-12')
        expect(sessions).toBe(0)
        expect(volumeKg).toBe(0)
    })
})
