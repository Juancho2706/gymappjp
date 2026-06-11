import { describe, it, expect } from 'vitest'
import {
    PlanModeSchema,
    SetPlanModeSchema,
    SaveMealExchangeTargetsSchema,
    CreateDayVariantSchema,
    AssignMealVariantSchema,
    LogNutritionPdfGeneratedSchema,
} from './nutrition-exchanges'

const MEAL_ID = '6f1f9b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const GROUP_A = '11111111-1111-4111-8111-111111111111'
const GROUP_B = '22222222-2222-4222-8222-222222222222'
const PLAN_ID = '33333333-3333-4333-8333-333333333333'

describe('PlanModeSchema', () => {
    it('acepta grams y exchanges', () => {
        expect(PlanModeSchema.parse('grams')).toBe('grams')
        expect(PlanModeSchema.parse('exchanges')).toBe('exchanges')
    })
    it('rechaza modos desconocidos', () => {
        expect(PlanModeSchema.safeParse('portions').success).toBe(false)
        expect(SetPlanModeSchema.safeParse({ planId: 'nope', mode: 'grams' }).success).toBe(false)
    })
})

describe('SaveMealExchangeTargetsSchema', () => {
    it('acepta payload válido con fracciones 0.5', () => {
        const r = SaveMealExchangeTargetsSchema.safeParse({
            mealId: MEAL_ID,
            targets: [
                { exchangeGroupId: GROUP_A, portions: 2 },
                { exchangeGroupId: GROUP_B, portions: 0.5, notes: 'media porción' },
            ],
        })
        expect(r.success).toBe(true)
    })
    it('acepta targets vacíos (quitar todos los grupos de la comida)', () => {
        expect(SaveMealExchangeTargetsSchema.safeParse({ mealId: MEAL_ID, targets: [] }).success).toBe(true)
    })
    it('rechaza porciones <= 0 y > 99', () => {
        expect(
            SaveMealExchangeTargetsSchema.safeParse({
                mealId: MEAL_ID,
                targets: [{ exchangeGroupId: GROUP_A, portions: 0 }],
            }).success
        ).toBe(false)
        expect(
            SaveMealExchangeTargetsSchema.safeParse({
                mealId: MEAL_ID,
                targets: [{ exchangeGroupId: GROUP_A, portions: 100 }],
            }).success
        ).toBe(false)
    })
    it('rechaza grupo repetido en la misma comida', () => {
        const r = SaveMealExchangeTargetsSchema.safeParse({
            mealId: MEAL_ID,
            targets: [
                { exchangeGroupId: GROUP_A, portions: 1 },
                { exchangeGroupId: GROUP_A, portions: 2 },
            ],
        })
        expect(r.success).toBe(false)
    })
    it('rechaza ids no-guid (payload client-controlled)', () => {
        const r = SaveMealExchangeTargetsSchema.safeParse({
            mealId: 'x',
            targets: [{ exchangeGroupId: 'y', portions: 1 }],
        })
        expect(r.success).toBe(false)
    })
})

describe('DayVariant schemas', () => {
    it('acepta nombre 1-40 y recorta espacios', () => {
        const r = CreateDayVariantSchema.parse({ planId: PLAN_ID, name: '  Entreno AM ' })
        expect(r.name).toBe('Entreno AM')
    })
    it('rechaza nombre vacío o > 40', () => {
        expect(CreateDayVariantSchema.safeParse({ planId: PLAN_ID, name: '   ' }).success).toBe(false)
        expect(CreateDayVariantSchema.safeParse({ planId: PLAN_ID, name: 'x'.repeat(41) }).success).toBe(false)
    })
    it('AssignMealVariant permite variantId null (todas las variantes)', () => {
        expect(AssignMealVariantSchema.safeParse({ mealId: MEAL_ID, variantId: null }).success).toBe(true)
        expect(AssignMealVariantSchema.safeParse({ mealId: MEAL_ID, variantId: GROUP_A }).success).toBe(true)
        expect(AssignMealVariantSchema.safeParse({ mealId: MEAL_ID, variantId: 'bad' }).success).toBe(false)
    })
})

describe('LogNutritionPdfGeneratedSchema', () => {
    it('acepta formatos válidos', () => {
        expect(
            LogNutritionPdfGeneratedSchema.safeParse({ planId: PLAN_ID, format: 'compact' }).success
        ).toBe(true)
        expect(
            LogNutritionPdfGeneratedSchema.safeParse({ planId: PLAN_ID, format: 'equivalences' }).success
        ).toBe(true)
    })
    it('rechaza formato desconocido', () => {
        expect(
            LogNutritionPdfGeneratedSchema.safeParse({ planId: PLAN_ID, format: 'fancy' }).success
        ).toBe(false)
    })
})
