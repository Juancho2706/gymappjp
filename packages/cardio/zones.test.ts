import { describe, expect, it } from 'vitest'

import type { CardioProfile } from './types'
import {
    HR_ZONES,
    HR_ZONE_BOUNDS,
    ageFromBirthDate,
    hrRangeForZone,
    hrZonesFromMax,
    hrZonesKarvonen,
    karvonenBpm,
    maxHrClassic,
    maxHrTanaka,
    percentMaxBpm,
    resolveClientZones,
    resolveMaxHr,
} from './zones'

/** Fecha fija para tests deterministas (hora local). */
const TODAY = new Date(2026, 5, 11) // 2026-06-11

const emptyProfile: CardioProfile = { birthDate: null, restingHr: null, maxHrOverride: null }

function profile(overrides: Partial<CardioProfile>): CardioProfile {
    return { ...emptyProfile, ...overrides }
}

describe('ageFromBirthDate', () => {
    it('calcula anos cumplidos cuando el cumpleanos ya paso este ano', () => {
        expect(ageFromBirthDate('1996-03-15', TODAY)).toBe(30)
    })

    it('resta 1 cuando el cumpleanos aun no llega este ano', () => {
        expect(ageFromBirthDate('1996-09-15', TODAY)).toBe(29)
    })

    it('cuenta el ano nuevo exactamente el dia del cumpleanos', () => {
        expect(ageFromBirthDate('1996-06-11', TODAY)).toBe(30)
        expect(ageFromBirthDate('1996-06-12', TODAY)).toBe(29)
    })

    it('maneja nacidos el 29 de febrero en anos no bisiestos (cumple al pasar feb)', () => {
        expect(ageFromBirthDate('2000-02-29', new Date(2026, 2, 1))).toBe(26) // 1 mar 2026
        expect(ageFromBirthDate('2000-02-29', new Date(2026, 1, 28))).toBe(25) // 28 feb 2026
    })

    it('acepta timestamps ISO completos (prefijo YYYY-MM-DD)', () => {
        expect(ageFromBirthDate('1996-03-15T00:00:00.000Z', TODAY)).toBe(30)
    })

    it('devuelve null para null / undefined / vacio (edad faltante → sin bpm)', () => {
        expect(ageFromBirthDate(null, TODAY)).toBeNull()
        expect(ageFromBirthDate(undefined, TODAY)).toBeNull()
        expect(ageFromBirthDate('', TODAY)).toBeNull()
    })

    it('devuelve null para formatos no ISO', () => {
        expect(ageFromBirthDate('15-03-1996', TODAY)).toBeNull()
        expect(ageFromBirthDate('15/03/1996', TODAY)).toBeNull()
        expect(ageFromBirthDate('no es fecha', TODAY)).toBeNull()
    })

    it('devuelve null para fechas imposibles', () => {
        expect(ageFromBirthDate('2000-02-30', TODAY)).toBeNull()
        expect(ageFromBirthDate('2000-13-01', TODAY)).toBeNull()
        expect(ageFromBirthDate('2000-00-10', TODAY)).toBeNull()
    })

    it('devuelve null para fechas futuras (edad negativa)', () => {
        expect(ageFromBirthDate('2030-01-01', TODAY)).toBeNull()
    })

    it('edad 0 es valida (nacido este ano, cumpleanos pasado)', () => {
        expect(ageFromBirthDate('2026-01-10', TODAY)).toBe(0)
    })
})

describe('maxHrTanaka (default del producto)', () => {
    it('golden AC8: edad 30 → 187', () => {
        expect(maxHrTanaka(30)).toBe(187)
    })

    it('redondea a entero (edad 45 → 176.5 → 177)', () => {
        expect(maxHrTanaka(45)).toBe(177)
    })

    it('otros puntos de la recta', () => {
        expect(maxHrTanaka(20)).toBe(194)
        expect(maxHrTanaka(60)).toBe(166)
        expect(maxHrTanaka(0)).toBe(208)
    })
})

describe('maxHrClassic (referencia)', () => {
    it('golden AC8: edad 30 → 190', () => {
        expect(maxHrClassic(30)).toBe(190)
    })

    it('edad 50 → 170', () => {
        expect(maxHrClassic(50)).toBe(170)
    })
})

describe('hrZonesFromMax (%FCmax, 5 zonas)', () => {
    it('golden AC8: Z4 sobre 187 = 150-168 bpm', () => {
        const z4 = hrZonesFromMax(187).find((z) => z.zone === 4)
        expect(z4).toEqual({ zone: 4, minBpm: 150, maxBpm: 168 })
    })

    it('devuelve las 5 zonas en orden Z1..Z5 con limites contiguos', () => {
        const zones = hrZonesFromMax(187)
        expect(zones.map((z) => z.zone)).toEqual([1, 2, 3, 4, 5])
        expect(zones).toEqual([
            { zone: 1, minBpm: 94, maxBpm: 112 }, // round(93.5)=94, round(112.2)=112
            { zone: 2, minBpm: 112, maxBpm: 131 },
            { zone: 3, minBpm: 131, maxBpm: 150 },
            { zone: 4, minBpm: 150, maxBpm: 168 },
            { zone: 5, minBpm: 168, maxBpm: 187 },
        ])
    })

    it('Z5 termina exactamente en FCmax', () => {
        expect(hrZonesFromMax(200).at(-1)?.maxBpm).toBe(200)
    })
})

describe('hrZonesKarvonen (reserva de FC)', () => {
    it('golden AC8: Tanaka 30 (187) + reposo 60 al 70% ≈ 149', () => {
        expect(karvonenBpm(187, 60, 0.7)).toBe(149) // 127×0.7+60 = 148.9
    })

    it('zonas completas para maxHr 187 / reposo 60', () => {
        expect(hrZonesKarvonen(187, 60)).toEqual([
            { zone: 1, minBpm: 124, maxBpm: 136 }, // 127×0.5+60=123.5→124
            { zone: 2, minBpm: 136, maxBpm: 149 },
            { zone: 3, minBpm: 149, maxBpm: 162 }, // 127×0.8+60=161.6→162
            { zone: 4, minBpm: 162, maxBpm: 174 }, // 127×0.9+60=174.3→174
            { zone: 5, minBpm: 174, maxBpm: 187 },
        ])
    })

    it('Z5 termina exactamente en FCmax y Z1 arranca sobre el reposo', () => {
        const zones = hrZonesKarvonen(190, 55)
        expect(zones.at(-1)?.maxBpm).toBe(190)
        expect(zones[0].minBpm).toBeGreaterThan(55)
    })
})

describe('percentMaxBpm / bounds', () => {
    it('percentMaxBpm redondea (187 × 0.8 = 149.6 → 150)', () => {
        expect(percentMaxBpm(187, 0.8)).toBe(150)
    })

    it('HR_ZONE_BOUNDS cubre 50%-100% sin huecos', () => {
        for (let i = 0; i < HR_ZONES.length - 1; i++) {
            expect(HR_ZONE_BOUNDS[HR_ZONES[i]][1]).toBe(HR_ZONE_BOUNDS[HR_ZONES[i + 1]][0])
        }
        expect(HR_ZONE_BOUNDS[1][0]).toBe(0.5)
        expect(HR_ZONE_BOUNDS[5][1]).toBe(1)
    })
})

describe('resolveMaxHr (override > Tanaka)', () => {
    it('sin override ni birthDate → null', () => {
        expect(resolveMaxHr(emptyProfile, TODAY)).toBeNull()
    })

    it('birthDate sola → Tanaka', () => {
        expect(resolveMaxHr(profile({ birthDate: '1996-03-15' }), TODAY)).toEqual({ maxHr: 187, method: 'tanaka' })
    })

    it('override manda incluso con birthDate presente', () => {
        expect(resolveMaxHr(profile({ birthDate: '1996-03-15', maxHrOverride: 192 }), TODAY)).toEqual({
            maxHr: 192,
            method: 'override',
        })
    })

    it('override invalido (0 / negativo / NaN) se ignora y cae a Tanaka', () => {
        expect(resolveMaxHr(profile({ birthDate: '1996-03-15', maxHrOverride: 0 }), TODAY)).toEqual({
            maxHr: 187,
            method: 'tanaka',
        })
        expect(resolveMaxHr(profile({ maxHrOverride: -5 }), TODAY)).toBeNull()
        expect(resolveMaxHr(profile({ maxHrOverride: Number.NaN }), TODAY)).toBeNull()
    })

    it('override no entero se redondea', () => {
        expect(resolveMaxHr(profile({ maxHrOverride: 187.6 }), TODAY)).toEqual({ maxHr: 188, method: 'override' })
    })
})

describe('resolveClientZones (resolucion completa del perfil)', () => {
    it('perfil vacio → null (borde AC: sin edad NO hay bpm, solo la zona prescrita)', () => {
        expect(resolveClientZones(emptyProfile, TODAY)).toBeNull()
    })

    it('solo restingHr (sin edad ni override) → null: el reposo solo no deriva FCmax', () => {
        expect(resolveClientZones(profile({ restingHr: 60 }), TODAY)).toBeNull()
    })

    it('solo birthDate → Tanaka + %FCmax', () => {
        const result = resolveClientZones(profile({ birthDate: '1996-03-15' }), TODAY)
        expect(result).not.toBeNull()
        expect(result?.maxHr).toBe(187)
        expect(result?.maxHrMethod).toBe('tanaka')
        expect(result?.zoneMethod).toBe('percent_max')
        expect(result?.restingHr).toBeNull()
        expect(result?.zones.find((z) => z.zone === 4)).toEqual({ zone: 4, minBpm: 150, maxBpm: 168 })
    })

    it('birthDate + restingHr → Tanaka + Karvonen', () => {
        const result = resolveClientZones(profile({ birthDate: '1996-03-15', restingHr: 60 }), TODAY)
        expect(result?.maxHrMethod).toBe('tanaka')
        expect(result?.zoneMethod).toBe('karvonen')
        expect(result?.restingHr).toBe(60)
        expect(result?.zones.find((z) => z.zone === 3)?.minBpm).toBe(149) // golden 70%
    })

    it('override sin birthDate → override + %FCmax', () => {
        const result = resolveClientZones(profile({ maxHrOverride: 190 }), TODAY)
        expect(result?.maxHr).toBe(190)
        expect(result?.maxHrMethod).toBe('override')
        expect(result?.zoneMethod).toBe('percent_max')
    })

    it('override + restingHr → override + Karvonen', () => {
        const result = resolveClientZones(profile({ maxHrOverride: 190, restingHr: 55 }), TODAY)
        expect(result?.maxHrMethod).toBe('override')
        expect(result?.zoneMethod).toBe('karvonen')
        expect(result?.zones.at(-1)?.maxBpm).toBe(190)
    })

    it('restingHr degenerada (>= FCmax) cae a %FCmax, no Karvonen', () => {
        const result = resolveClientZones(profile({ maxHrOverride: 150, restingHr: 150 }), TODAY)
        expect(result?.zoneMethod).toBe('percent_max')
        expect(result?.restingHr).toBeNull()
    })

    it('restingHr invalida (0 / NaN) cae a %FCmax', () => {
        expect(resolveClientZones(profile({ maxHrOverride: 190, restingHr: 0 }), TODAY)?.zoneMethod).toBe('percent_max')
        expect(resolveClientZones(profile({ maxHrOverride: 190, restingHr: Number.NaN }), TODAY)?.zoneMethod).toBe(
            'percent_max',
        )
    })

    it('birthDate invalida sin override → null', () => {
        expect(resolveClientZones(profile({ birthDate: '2000-02-30', restingHr: 60 }), TODAY)).toBeNull()
    })
})

describe('hrRangeForZone (chip "Z4 · 150-168 bpm" en builder/ejecucion)', () => {
    it('devuelve el rango de la zona prescrita para un perfil resoluble', () => {
        expect(hrRangeForZone(4, profile({ birthDate: '1996-03-15' }), TODAY)).toEqual({
            zone: 4,
            minBpm: 150,
            maxBpm: 168,
        })
    })

    it('usa Karvonen cuando hay reposo', () => {
        expect(hrRangeForZone(4, profile({ birthDate: '1996-03-15', restingHr: 60 }), TODAY)).toEqual({
            zone: 4,
            minBpm: 162,
            maxBpm: 174,
        })
    })

    it('perfil sin edad ni override → null (la UI muestra solo "Z4" + CTA)', () => {
        expect(hrRangeForZone(4, emptyProfile, TODAY)).toBeNull()
        expect(hrRangeForZone(2, profile({ restingHr: 58 }), TODAY)).toBeNull()
    })
})
