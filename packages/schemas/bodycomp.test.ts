import { describe, expect, it } from 'vitest'
import {
    BiaMetricsSchema,
    BodyCompositionCreateSchema,
    IsakRawInputSchema,
} from './bodycomp'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const validSkinfolds = {
    tricepsMm: 12,
    subscapularMm: 11,
    supraspinaleMm: 9,
    abdominalMm: 15,
    frontThighMm: 14,
    medialCalfMm: 8,
    bicepsMm: 5,
    iliacCrestMm: 13,
}

const validGirths = {
    headCm: 57,
    armRelaxedCm: 30,
    armFlexedCm: 32,
    forearmCm: 26,
    chestMesosternaleCm: 95,
    waistCm: 80,
    thighCm: 55,
    calfCm: 36,
}

const validBreadths = {
    biacromialCm: 40,
    biiliocristalCm: 28,
    humerusCm: 7,
    femurCm: 9.5,
    transverseChestCm: 28,
    apChestDepthCm: 19,
}

const validRawInput = {
    sex: 'male' as const,
    ageYears: 30,
    heightCm: 175,
    weightKg: 75,
    sittingHeightCm: 92,
    skinfolds: validSkinfolds,
    girths: validGirths,
    breadths: validBreadths,
}

describe('IsakRawInputSchema', () => {
    it('acepta un input ISAK completo', () => {
        expect(IsakRawInputSchema.safeParse(validRawInput).success).toBe(true)
    })

    it('permite ageYears ausente (Yuhasz/Faulkner no lo requieren)', () => {
        const { ageYears: _omit, ...noAge } = validRawInput
        expect(IsakRawInputSchema.safeParse(noAge).success).toBe(true)
    })

    it('rechaza un pliegue fuera de rango fisiologico', () => {
        const bad = { ...validRawInput, skinfolds: { ...validSkinfolds, tricepsMm: 999 } }
        expect(IsakRawInputSchema.safeParse(bad).success).toBe(false)
    })

    it('rechaza un pliegue negativo', () => {
        const bad = { ...validRawInput, skinfolds: { ...validSkinfolds, tricepsMm: -1 } }
        expect(IsakRawInputSchema.safeParse(bad).success).toBe(false)
    })

    it('rechaza un campo de pliegue desconocido (strict)', () => {
        const bad = { ...validRawInput, skinfolds: { ...validSkinfolds, unknownMm: 10 } }
        expect(IsakRawInputSchema.safeParse(bad).success).toBe(false)
    })

    it('rechaza un sexo invalido', () => {
        const bad = { ...validRawInput, sex: 'other' }
        expect(IsakRawInputSchema.safeParse(bad).success).toBe(false)
    })
})

describe('BiaMetricsSchema', () => {
    it('acepta un subconjunto de campos (todos opcionales)', () => {
        const r = BiaMetricsSchema.safeParse({ skeletalMuscleMassKg: 35, bodyFatPercent: 18 })
        expect(r.success).toBe(true)
    })

    it('acepta vacio', () => {
        expect(BiaMetricsSchema.safeParse({}).success).toBe(true)
    })

    it('acepta visceral area y nivel como campos separados', () => {
        const r = BiaMetricsSchema.safeParse({ visceralFatAreaCm2: 90, visceralFatLevel: 8 })
        expect(r.success).toBe(true)
    })

    it('rechaza un campo desconocido (strict)', () => {
        expect(BiaMetricsSchema.safeParse({ bogus: 1 }).success).toBe(false)
    })

    it('rechaza % grasa fuera de rango', () => {
        expect(BiaMetricsSchema.safeParse({ bodyFatPercent: 120 }).success).toBe(false)
    })
})

describe('BodyCompositionCreateSchema (discriminated union)', () => {
    it('acepta BIA valido', () => {
        const r = BodyCompositionCreateSchema.safeParse({
            method: 'bia',
            clientId: CLIENT_ID,
            metrics: { skeletalMuscleMassKg: 35, bodyFatPercent: 18 },
            deviceBrand: 'InBody',
            deviceModel: '570',
        })
        expect(r.success).toBe(true)
    })

    it('acepta ISAK valido y aplica el default de ecuacion', () => {
        const r = BodyCompositionCreateSchema.safeParse({
            method: 'isak',
            clientId: CLIENT_ID,
            rawInput: validRawInput,
        })
        expect(r.success).toBe(true)
        if (r.success && r.data.method === 'isak') {
            expect(r.data.bodyFatEquation).toBe('durnin_womersley')
        }
    })

    it('rechaza un metodo desconocido', () => {
        const r = BodyCompositionCreateSchema.safeParse({
            method: 'dexa',
            clientId: CLIENT_ID,
            metrics: {},
        })
        expect(r.success).toBe(false)
    })

    it('rechaza ISAK que intenta inyectar metrics (los calcula el server)', () => {
        const r = BodyCompositionCreateSchema.safeParse({
            method: 'isak',
            clientId: CLIENT_ID,
            rawInput: validRawInput,
            metrics: { bodyFatPercent: 5 },
        })
        expect(r.success).toBe(false)
    })

    it('rechaza BIA sin metrics', () => {
        const r = BodyCompositionCreateSchema.safeParse({ method: 'bia', clientId: CLIENT_ID })
        expect(r.success).toBe(false)
    })

    it('rechaza clientId no-uuid', () => {
        const r = BodyCompositionCreateSchema.safeParse({
            method: 'bia',
            clientId: 'not-a-uuid',
            metrics: {},
        })
        expect(r.success).toBe(false)
    })
})
