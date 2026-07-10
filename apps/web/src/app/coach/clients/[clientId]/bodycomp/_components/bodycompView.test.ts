import { describe, expect, it } from 'vitest'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { computeIsak } from '@eva/bodycomp'
import { isakResultToMetricsJson } from '@/services/bodycomp/body-composition.mappers'
import { deltaVsPrev, deviceLabel, readBiaMetrics, readIsakMetrics } from '@/lib/bodycomp/view-helpers'

function baseRow(over: Partial<BodyCompositionRow>): BodyCompositionRow {
    return {
        id: 'r',
        client_id: 'c',
        coach_id: null,
        team_id: null,
        org_id: null,
        method: 'bia',
        measured_at: '2026-06-05T12:00:00Z',
        weight_kg: null,
        height_cm: null,
        device_brand: null,
        device_model: null,
        equation_used: null,
        metrics: {},
        raw_input: {},
        measurement_conditions: {},
        source: 'manual',
        is_validated: false,
        consent_confirmed_at: null,
        notes: null,
        created_by: null,
        created_at: '2026-06-05T12:00:00Z',
        updated_at: '2026-06-05T12:00:00Z',
        deleted_at: null,
        ...over,
    } as BodyCompositionRow
}

const isakInput = {
    sex: 'male' as const,
    ageYears: 30,
    heightCm: 178,
    weightKg: 75,
    sittingHeightCm: 92,
    skinfolds: {
        tricepsMm: 8,
        subscapularMm: 10,
        supraspinaleMm: 7,
        abdominalMm: 12,
        frontThighMm: 10,
        medialCalfMm: 6,
        bicepsMm: 4,
        iliacCrestMm: 9,
    },
    girths: {
        headCm: 57,
        armRelaxedCm: 32,
        armFlexedCm: 34,
        forearmCm: 27.5,
        chestMesosternaleCm: 98,
        waistCm: 80,
        thighCm: 56,
        calfCm: 37.5,
    },
    breadths: {
        biacromialCm: 42,
        biiliocristalCm: 28,
        humerusCm: 7.2,
        femurCm: 9.9,
        transverseChestCm: 29,
        apChestDepthCm: 19,
    },
}

describe('readIsakMetrics', () => {
    it('lee la forma persistida por el mapper', () => {
        const result = computeIsak(isakInput, { bodyFatEquation: 'durnin_womersley' })
        const row = baseRow({ method: 'isak', metrics: isakResultToMetricsJson(result) })
        const view = readIsakMetrics(row)
        expect(view).not.toBeNull()
        expect(view!.fractionation.muscle.kg).toBe(result.fractionation.muscle.kg)
        expect(view!.bodyFat.percent).toBe(result.bodyFat.percent)
        expect(view!.somatotype.endomorphy).toBe(result.somatotype.endomorphy)
    })

    it('devuelve null para una fila BIA', () => {
        expect(readIsakMetrics(baseRow({ method: 'bia' }))).toBeNull()
    })

    it('devuelve null si metrics no tiene la forma esperada', () => {
        expect(readIsakMetrics(baseRow({ method: 'isak', metrics: { junk: 1 } }))).toBeNull()
    })
})

describe('readBiaMetrics', () => {
    it('lee los campos capturados del dispositivo', () => {
        const row = baseRow({ method: 'bia', metrics: { skeletalMuscleMassKg: 35, bodyFatPercent: 18 } })
        const m = readBiaMetrics(row)
        expect(m.skeletalMuscleMassKg).toBe(35)
        expect(m.bodyFatPercent).toBe(18)
    })
})

describe('deviceLabel', () => {
    it('combina dispositivo + fecha', () => {
        const row = baseRow({ device_brand: 'InBody', device_model: '570' })
        expect(deviceLabel(row)).toContain('InBody 570')
    })

    it('cae a solo fecha sin dispositivo', () => {
        expect(deviceLabel(baseRow({}))).not.toContain('·')
    })
})

describe('deltaVsPrev', () => {
    it('calcula el delta vs la medicion anterior del mismo metodo', () => {
        const rows = [
            baseRow({ id: 'new', metrics: { bodyFatPercent: 18 } }),
            baseRow({ id: 'old', metrics: { bodyFatPercent: 20 } }),
        ]
        const d = deltaVsPrev(rows, 0, (r) => (r.metrics as { bodyFatPercent?: number }).bodyFatPercent ?? null)
        expect(d).toBe(-2)
    })

    it('devuelve null sin medicion anterior', () => {
        const rows = [baseRow({ id: 'only', metrics: { bodyFatPercent: 18 } })]
        const d = deltaVsPrev(rows, 0, (r) => (r.metrics as { bodyFatPercent?: number }).bodyFatPercent ?? null)
        expect(d).toBeNull()
    })
})
