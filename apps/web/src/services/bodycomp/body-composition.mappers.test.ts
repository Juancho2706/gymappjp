import { describe, expect, it } from 'vitest'
import { computeIsak, type IsakRawInput } from '@eva/bodycomp'
import type { IsakRawInputDto } from '@eva/schemas/bodycomp'
import {
    biaMetricsToJson,
    isakRawToDomain,
    isakRawToJson,
    isakResultToMetricsJson,
} from './body-composition.mappers'

const dto: IsakRawInputDto = {
    sex: 'male',
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

describe('isakRawToDomain', () => {
    it('traduce el DTO al input de dominio sin perder campos', () => {
        const domain: IsakRawInput = isakRawToDomain(dto)
        expect(domain.sex).toBe('male')
        expect(domain.ageYears).toBe(30)
        expect(domain.heightCm).toBe(178)
        expect(domain.weightKg).toBe(75)
        expect(domain.sittingHeightCm).toBe(92)
        expect(domain.skinfolds.tricepsMm).toBe(8)
        expect(domain.skinfolds.iliacCrestMm).toBe(9)
        expect(domain.girths.armFlexedCm).toBe(34)
        expect(domain.breadths.humerusCm).toBe(7.2)
    })

    it('produce un input que computeIsak acepta (paridad preview/server)', () => {
        const result = computeIsak(isakRawToDomain(dto), { bodyFatEquation: 'durnin_womersley' })
        expect(result.fractionation.predictedMassKg).toBeGreaterThan(0)
        expect(result.somatotype.endomorphy).toBeGreaterThan(0)
        expect(result.bodyFat.percent).toBeGreaterThan(0)
        expect(result.equationUsed).toContain('durnin_womersley')
    })
})

describe('isakResultToMetricsJson', () => {
    it('serializa el resultado a la forma estable de metrics', () => {
        const result = computeIsak(isakRawToDomain(dto), { bodyFatEquation: 'durnin_womersley' })
        const json = isakResultToMetricsJson(result) as Record<string, any>

        expect(json.equationUsed).toBe(result.equationUsed)
        expect(json.fractionation.adipose.kg).toBe(result.fractionation.adipose.kg)
        expect(json.fractionation.muscle.pct).toBe(result.fractionation.muscle.pct)
        expect(json.fractionation.predictedMassKg).toBe(result.fractionation.predictedMassKg)
        expect(json.somatotype.endomorphy).toBe(result.somatotype.endomorphy)
        expect(json.bodyFat.percent).toBe(result.bodyFat.percent)
        // DW expone densidad intermedia
        expect(json.bodyFat.bodyDensity).toBe(result.bodyFat.bodyDensity)
    })

    it('omite bodyDensity cuando la ecuacion no lo provee (Yuhasz)', () => {
        const result = computeIsak(isakRawToDomain(dto), { bodyFatEquation: 'yuhasz' })
        const json = isakResultToMetricsJson(result) as Record<string, any>
        expect('bodyDensity' in json.bodyFat).toBe(false)
    })
})

describe('isakRawToJson / biaMetricsToJson', () => {
    it('raw_input conserva los pliegues crudos', () => {
        const json = isakRawToJson(dto) as Record<string, any>
        expect(json.skinfolds.tricepsMm).toBe(8)
        expect(json.weightKg).toBe(75)
    })

    it('metrics BIA conserva los campos capturados separados (area vs nivel)', () => {
        const json = biaMetricsToJson({ visceralFatAreaCm2: 90, visceralFatLevel: 8 }) as Record<string, any>
        expect(json.visceralFatAreaCm2).toBe(90)
        expect(json.visceralFatLevel).toBe(8)
    })
})
