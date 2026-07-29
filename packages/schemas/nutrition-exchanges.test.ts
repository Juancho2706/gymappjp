import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
    EXCHANGE_PORTION_GRAMS_MAX,
    EXCHANGE_PORTION_LABEL_MAX,
    foodExchangeEquivalenceIssue,
    foodExchangeEquivalenceShape,
    normalizeFoodExchangeEquivalence,
    refineFoodExchangeEquivalence,
    PlanModeSchema,
    SetPlanModeSchema,
    SaveMealExchangeTargetsSchema,
    CreateDayVariantSchema,
    AssignMealVariantSchema,
    LogNutritionPdfGeneratedSchema,
    CreateExchangeGroupSchema,
    UpdateExchangeGroupSchema,
    DeleteExchangeGroupSchema,
    EXCHANGE_GROUP_PALETTE,
    EXCHANGE_GROUP_NAME_MAX,
    EXCHANGE_GROUP_SLUG_MAX,
    exchangeGroupKcalFromMacros,
    toExchangeGroupSlug,
} from './nutrition-exchanges'
// Import RELATIVO al motor (igual que screening.test.ts con ../calc/src/movement): el paquete
// de contratos no depende de otros paquetes, así que este test es el guardián del drift.
import { EXCHANGE_FALLBACK_COLORS } from '../nutrition-engine/exchange-calc'

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

// ─── Grupos propios del coach (porciones propias — P-A) ─────────────────────────

const GROUP_ID = '44444444-4444-4444-8444-444444444444'

const VALID_GROUP = {
    name: 'Batido',
    code: 'SHK',
    refCalories: 180,
    refProteinG: 25,
    refCarbsG: 10,
    refFatsG: 3,
    color: '#3B82F6',
}

describe('EXCHANGE_GROUP_PALETTE (drift vs el motor)', () => {
    it('es el espejo exacto de EXCHANGE_FALLBACK_COLORS del motor', () => {
        expect([...EXCHANGE_GROUP_PALETTE]).toEqual([...EXCHANGE_FALLBACK_COLORS])
    })
})

describe('toExchangeGroupSlug', () => {
    it('normaliza tildes, ñ y espacios a kebab-case', () => {
        expect(toExchangeGroupSlug('Colación Fran')).toBe('colacion-fran')
        expect(toExchangeGroupSlug('  Ñoquis  ')).toBe('noquis')
        expect(toExchangeGroupSlug('Batido 2.0')).toBe('batido-2-0')
    })
    it('nunca deja guiones en los bordes ni excede el máximo', () => {
        expect(toExchangeGroupSlug('--- ¡Hola! ---')).toBe('hola')
        const long = toExchangeGroupSlug('a'.repeat(80))
        expect(long.length).toBeLessThanOrEqual(EXCHANGE_GROUP_SLUG_MAX)
        expect(long.endsWith('-')).toBe(false)
    })
    it('un nombre sin letras ni números produce slug vacío (el servidor lo rechaza)', () => {
        expect(toExchangeGroupSlug('***')).toBe('')
    })
})

describe('exchangeGroupKcalFromMacros (4/4/9)', () => {
    it('aplica los factores Atwater y redondea', () => {
        expect(exchangeGroupKcalFromMacros({ refProteinG: 7, refCarbsG: 0, refFatsG: 5 })).toBe(73)
        expect(exchangeGroupKcalFromMacros({ refProteinG: 2, refCarbsG: 15, refFatsG: 0 })).toBe(68)
    })
})

describe('CreateExchangeGroupSchema', () => {
    it('acepta un grupo válido y normaliza nombre/código', () => {
        const r = CreateExchangeGroupSchema.parse({ ...VALID_GROUP, name: '  Batido  ', code: 'shk' })
        expect(r.name).toBe('Batido')
        expect(r.code).toBe('SHK')
    })
    it('acepta slug explícito kebab-case y rechaza uno con mayúsculas o espacios', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, slug: 'batido-fran' }).success).toBe(true)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, slug: 'Batido Fran' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, slug: '-batido' }).success).toBe(false)
    })
    it('rechaza códigos fuera de 1-3 letras mayúsculas', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, code: '' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, code: 'ABCD' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, code: 'S1' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, code: 'S K' }).success).toBe(false)
    })
    it('rechaza nombre vacío, solo símbolos o mayor al máximo', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, name: '   ' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, name: '***' }).success).toBe(false)
        expect(
            CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, name: 'x'.repeat(EXCHANGE_GROUP_NAME_MAX + 1) })
                .success
        ).toBe(false)
    })
    it('rechaza macros negativas o fuera de rango', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, refProteinG: -1 }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, refCalories: -1 }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, refFatsG: 500 }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, refCalories: 5000 }).success).toBe(false)
    })
    it('rechaza colores fuera de la paleta y acepta null', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, color: '#123456' }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, color: null }).success).toBe(true)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, color: undefined }).success).toBe(true)
    })
    it('RECHAZA is_system / isSystem (los grupos del sistema son inmutables)', () => {
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, isSystem: true }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, is_system: true }).success).toBe(false)
        expect(CreateExchangeGroupSchema.safeParse({ ...VALID_GROUP, is_system: false }).success).toBe(false)
    })
    it('RECHAZA composed_of / composedOf (compuestos fuera de alcance F1)', () => {
        expect(
            CreateExchangeGroupSchema.safeParse({
                ...VALID_GROUP,
                composedOf: [{ code: 'P', portions: 1 }],
            }).success
        ).toBe(false)
        expect(
            CreateExchangeGroupSchema.safeParse({
                ...VALID_GROUP,
                composed_of: [{ code: 'P', portions: 1 }],
            }).success
        ).toBe(false)
    })
})

describe('UpdateExchangeGroupSchema / DeleteExchangeGroupSchema', () => {
    it('exigen un groupId válido', () => {
        expect(UpdateExchangeGroupSchema.safeParse({ ...VALID_GROUP, groupId: GROUP_ID }).success).toBe(true)
        expect(UpdateExchangeGroupSchema.safeParse({ ...VALID_GROUP, groupId: 'nope' }).success).toBe(false)
        expect(DeleteExchangeGroupSchema.safeParse({ groupId: GROUP_ID }).success).toBe(true)
        expect(DeleteExchangeGroupSchema.safeParse({ groupId: '' }).success).toBe(false)
    })
    it('la edición hereda los rechazos de is_system y composed_of', () => {
        expect(
            UpdateExchangeGroupSchema.safeParse({ ...VALID_GROUP, groupId: GROUP_ID, is_system: true }).success
        ).toBe(false)
        expect(
            UpdateExchangeGroupSchema.safeParse({
                ...VALID_GROUP,
                groupId: GROUP_ID,
                composed_of: [{ code: 'C', portions: 1 }],
            }).success
        ).toBe(false)
    })
})

// ─── Equivalencia de porciones de un alimento (P-B, clasificar alimentos propios) ──

describe('foodExchangeEquivalenceIssue / normalizeFoodExchangeEquivalence', () => {
    it('acepta el trío vacío: un alimento sin clasificar es el caso normal', () => {
        expect(foodExchangeEquivalenceIssue({})).toBeNull()
        expect(
            foodExchangeEquivalenceIssue({
                exchangeGroupId: null,
                exchangePortionGrams: null,
                exchangePortionLabel: null,
            })
        ).toBeNull()
    })

    it('acepta grupo + gramos, con o sin medida casera', () => {
        expect(foodExchangeEquivalenceIssue({ exchangeGroupId: GROUP_ID, exchangePortionGrams: 120 })).toBeNull()
        expect(
            foodExchangeEquivalenceIssue({
                exchangeGroupId: GROUP_ID,
                exchangePortionGrams: 120,
                exchangePortionLabel: '1 taza',
            })
        ).toBeNull()
    })

    it('grupo sin gramos => pide los gramos', () => {
        expect(foodExchangeEquivalenceIssue({ exchangeGroupId: GROUP_ID })?.path).toBe('exchangePortionGrams')
        expect(
            foodExchangeEquivalenceIssue({ exchangeGroupId: GROUP_ID, exchangePortionGrams: null })?.path
        ).toBe('exchangePortionGrams')
    })

    it('gramos o medida casera sin grupo => pide el grupo', () => {
        expect(foodExchangeEquivalenceIssue({ exchangePortionGrams: 120 })?.path).toBe('exchangeGroupId')
        expect(foodExchangeEquivalenceIssue({ exchangePortionLabel: '1 taza' })?.path).toBe('exchangeGroupId')
        // Etiqueta en blanco no cuenta como valor.
        expect(foodExchangeEquivalenceIssue({ exchangePortionLabel: '   ' })).toBeNull()
    })

    it('normaliza: sin grupo limpia los 3 campos; etiqueta vacía => null', () => {
        expect(
            normalizeFoodExchangeEquivalence({
                exchangeGroupId: null,
                exchangePortionGrams: 120,
                exchangePortionLabel: '1 taza',
            })
        ).toEqual({ exchangeGroupId: null, exchangePortionGrams: null, exchangePortionLabel: null })
        expect(
            normalizeFoodExchangeEquivalence({
                exchangeGroupId: GROUP_ID,
                exchangePortionGrams: 120,
                exchangePortionLabel: '  ',
            })
        ).toEqual({ exchangeGroupId: GROUP_ID, exchangePortionGrams: 120, exchangePortionLabel: null })
        expect(
            normalizeFoodExchangeEquivalence({
                exchangeGroupId: GROUP_ID,
                exchangePortionGrams: 120,
                exchangePortionLabel: '  1 taza  ',
            })
        ).toEqual({ exchangeGroupId: GROUP_ID, exchangePortionGrams: 120, exchangePortionLabel: '1 taza' })
    })
})

describe('foodExchangeEquivalenceShape (mezclado en un schema de alimento)', () => {
    const FoodSchema = z
        .object({ name: z.string().min(1), ...foodExchangeEquivalenceShape })
        .superRefine(refineFoodExchangeEquivalence)

    it('los gramos deben ser > 0 y con tope', () => {
        expect(FoodSchema.safeParse({ name: 'Arroz', exchangeGroupId: GROUP_ID, exchangePortionGrams: 0 }).success).toBe(false)
        expect(FoodSchema.safeParse({ name: 'Arroz', exchangeGroupId: GROUP_ID, exchangePortionGrams: -5 }).success).toBe(false)
        expect(
            FoodSchema.safeParse({
                name: 'Arroz',
                exchangeGroupId: GROUP_ID,
                exchangePortionGrams: EXCHANGE_PORTION_GRAMS_MAX + 1,
            }).success
        ).toBe(false)
        expect(FoodSchema.safeParse({ name: 'Arroz', exchangeGroupId: GROUP_ID, exchangePortionGrams: 120 }).success).toBe(true)
    })

    it('rechaza el grupo con id inválido y la medida casera muy larga', () => {
        expect(FoodSchema.safeParse({ name: 'Arroz', exchangeGroupId: 'nope', exchangePortionGrams: 120 }).success).toBe(false)
        expect(
            FoodSchema.safeParse({
                name: 'Arroz',
                exchangeGroupId: GROUP_ID,
                exchangePortionGrams: 120,
                exchangePortionLabel: 'x'.repeat(EXCHANGE_PORTION_LABEL_MAX + 1),
            }).success
        ).toBe(false)
    })

    it('el refinamiento del trío sobrevive a un .extend() posterior (contrato del endpoint mobile)', () => {
        const Extended = FoodSchema.extend({ action: z.literal('createFood') })
        expect(Extended.safeParse({ name: 'Arroz', action: 'createFood' }).success).toBe(true)
        const missingGrams = Extended.safeParse({ name: 'Arroz', action: 'createFood', exchangeGroupId: GROUP_ID })
        expect(missingGrams.success).toBe(false)
        expect(missingGrams.error?.issues[0]?.path).toEqual(['exchangePortionGrams'])
    })
})
