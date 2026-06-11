import { z } from 'zod'
import { ClientPlanSchema, FoodItemSchema, MealSchema } from './nutrition'

/**
 * Schemas Zod del módulo `nutrition_exchanges` (pauta por porciones de intercambio).
 * SAFE FOR MOBILE: sin imports de Next/Supabase.
 *
 * Gotcha Zod 4 (F3 de movida-areas): `.uuid()` es estricto RFC 9562 y rechaza UUIDs
 * de seeds legacy ⇒ se usa `z.guid()` para ids.
 */

export const PlanModeSchema = z.enum(['grams', 'exchanges'])
export type PlanModeInput = z.infer<typeof PlanModeSchema>

export const SetPlanModeSchema = z.object({
    planId: z.guid('ID de plan inválido'),
    mode: PlanModeSchema,
})
export type SetPlanModeInput = z.infer<typeof SetPlanModeSchema>

export const ExchangeTargetSchema = z.object({
    exchangeGroupId: z.guid('ID de grupo inválido'),
    portions: z
        .number({ error: 'Las porciones deben ser un número' })
        .positive('Las porciones deben ser mayores a 0')
        .max(99, 'Máximo 99 porciones'),
    notes: z.string().max(300, 'Máximo 300 caracteres').nullish(),
})
export type ExchangeTargetInput = z.infer<typeof ExchangeTargetSchema>

export const SaveMealExchangeTargetsSchema = z.object({
    mealId: z.guid('ID de comida inválido'),
    targets: z
        .array(ExchangeTargetSchema)
        .max(20, 'Máximo 20 grupos por comida')
        // Un grupo no puede repetirse dentro de la misma comida (UNIQUE meal_id+group en DB).
        .refine(
            (ts) => new Set(ts.map((t) => t.exchangeGroupId)).size === ts.length,
            'Grupo repetido en la comida'
        ),
})
export type SaveMealExchangeTargetsInput = z.infer<typeof SaveMealExchangeTargetsSchema>

const dayVariantName = z
    .string()
    .trim()
    .min(1, 'El nombre es requerido')
    .max(40, 'Máximo 40 caracteres')

export const CreateDayVariantSchema = z.object({
    planId: z.guid('ID de plan inválido'),
    name: dayVariantName,
})
export type CreateDayVariantInput = z.infer<typeof CreateDayVariantSchema>

export const RenameDayVariantSchema = z.object({
    variantId: z.guid('ID de variante inválido'),
    name: dayVariantName,
})
export type RenameDayVariantInput = z.infer<typeof RenameDayVariantSchema>

export const DeleteDayVariantSchema = z.object({
    variantId: z.guid('ID de variante inválido'),
})
export type DeleteDayVariantInput = z.infer<typeof DeleteDayVariantSchema>

export const AssignMealVariantSchema = z.object({
    mealId: z.guid('ID de comida inválido'),
    variantId: z.guid('ID de variante inválido').nullable(),
})
export type AssignMealVariantInput = z.infer<typeof AssignMealVariantSchema>

/**
 * Variante RELAJADA del plan del alumno para modo 'exchanges': las comidas se
 * prescriben por grupos de intercambio ⇒ `foodItems` puede venir vacío.
 * SOLO debe usarse cuando el plan YA está en modo exchanges (verificado en DB
 * por la action — el payload es client-controlled). El modo gramos sigue
 * validando con `ClientPlanSchema` byte-identical (AC1).
 */
export const ExchangesMealSchema = MealSchema.extend({
    /**
     * Id de DB de la comida persistida (R1): el server matchea por ID — los
     * `meal_exchange_targets` y la variante de día viajan SIEMPRE con su comida
     * al reordenar/borrar. Omitido = comida nueva. El modo gramos NO lo envía
     * (y `ClientPlanSchema` lo descarta) ⇒ matching legacy byte-identical.
     */
    id: z.guid('ID de comida inválido').optional(),
    foodItems: z.array(FoodItemSchema).max(20, 'Máximo 20 alimentos por comida'),
})

export const ExchangesClientPlanSchema = ClientPlanSchema.extend({
    meals: z
        .array(ExchangesMealSchema)
        .min(1, 'El plan debe tener al menos 1 comida')
        .max(10, 'Máximo 10 comidas'),
})
export type ExchangesClientPlanInput = z.infer<typeof ExchangesClientPlanSchema>

export const ExchangePdfFormatSchema = z.enum(['compact', 'equivalences', 'full'])
export type ExchangePdfFormatInput = z.infer<typeof ExchangePdfFormatSchema>

export const LogNutritionPdfGeneratedSchema = z.object({
    planId: z.guid('ID de plan inválido'),
    format: ExchangePdfFormatSchema,
})
export type LogNutritionPdfGeneratedInput = z.infer<typeof LogNutritionPdfGeneratedSchema>
