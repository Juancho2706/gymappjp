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

// ─── Grupos de intercambio propios del coach (porciones propias — P-A) ──────────

/**
 * Paleta permitida para el color de un grupo propio. ESPEJO EXACTO de
 * `EXCHANGE_FALLBACK_COLORS` (`packages/nutrition-engine/exchange-calc.ts`): este paquete
 * es el contrato compartido con RN y se mantiene SIN dependencias entre paquetes, por eso
 * la lista se repite acá. `nutrition-exchanges.test.ts` tiene un test de drift que falla
 * si ambas dejan de coincidir.
 */
export const EXCHANGE_GROUP_PALETTE = [
    '#F59E0B', // ámbar
    '#3B82F6', // azul
    '#EF4444', // rojo
    '#22C55E', // verde
    '#8B5CF6', // violeta
    '#EC4899', // rosa
    '#14B8A6', // turquesa
    '#F97316', // naranjo
    '#6366F1', // índigo
] as const
export type ExchangeGroupColor = (typeof EXCHANGE_GROUP_PALETTE)[number]

export const EXCHANGE_GROUP_NAME_MAX = 40
export const EXCHANGE_GROUP_SLUG_MAX = 48

/**
 * Slug kebab-case derivado del nombre (sin tildes ni ñ). El slug es INTERNO (nunca se
 * muestra): sirve de clave de unicidad por coach — `exchange_groups_coach_slug_uq`
 * (parcial sobre filas vivas). Web y RN deben derivarlo con esta misma función para que
 * la colisión se detecte igual en las dos superficies.
 */
export function toExchangeGroupSlug(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, EXCHANGE_GROUP_SLUG_MAX)
        .replace(/^-+|-+$/g, '')
}

/** kcal sugeridas por 1 porción con los factores Atwater del repo (4/4/9), redondeadas. */
export function exchangeGroupKcalFromMacros(input: {
    refProteinG: number
    refCarbsG: number
    refFatsG: number
}): number {
    const kcal = input.refProteinG * 4 + input.refCarbsG * 4 + input.refFatsG * 9
    return Number.isFinite(kcal) ? Math.round(kcal) : 0
}

const exchangeGroupName = z
    .string({ error: 'El nombre es requerido' })
    .trim()
    .min(1, 'El nombre es requerido')
    .max(EXCHANGE_GROUP_NAME_MAX, `Máximo ${EXCHANGE_GROUP_NAME_MAX} caracteres`)
    .refine((name) => toExchangeGroupSlug(name).length > 0, 'El nombre debe tener al menos una letra o número')

const exchangeGroupCode = z
    .string({ error: 'El código es requerido' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/, 'El código debe tener 1 a 3 letras (sin números ni espacios)')

const exchangeGroupSlug = z
    .string()
    .trim()
    .toLowerCase()
    .max(EXCHANGE_GROUP_SLUG_MAX, `Máximo ${EXCHANGE_GROUP_SLUG_MAX} caracteres`)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El identificador debe ser kebab-case')

const refMacroGrams = (label: string) =>
    z
        .number({ error: `${label} deben ser un número` })
        .min(0, `${label} no pueden ser negativas`)
        .max(200, `${label} no pueden superar 200 g por porción`)

const refCalories = z
    .number({ error: 'Las calorías deben ser un número' })
    .min(0, 'Las calorías no pueden ser negativas')
    .max(2000, 'Las calorías no pueden superar 2000 por porción')

/**
 * Campos PROHIBIDOS en F1 (rechazo explícito, no descarte silencioso): `is_system` es
 * inmutable (la RLS `xg_*` ya niega escribir grupos del sistema) y los grupos compuestos
 * (`composed_of`) quedan fuera de alcance — el freeze del snapshot resuelve las bases de
 * un compuesto solo entre grupos `is_system` (plan-persistence.resolveExchangeGroupsForDraft).
 * Se declaran en camelCase y snake_case porque el payload puede venir de RN o de un form web.
 */
const forbiddenSystemFlag = z
    .never({ error: 'Los grupos del sistema no se pueden crear ni editar.' })
    .optional()
const forbiddenComposedOf = z
    .never({ error: 'Los grupos compuestos todavía no se pueden crear.' })
    .optional()

const exchangeGroupWritableShape = {
    name: exchangeGroupName,
    code: exchangeGroupCode,
    /** Opcional: si no viene, el servidor lo deriva del nombre con `toExchangeGroupSlug`. */
    slug: exchangeGroupSlug.optional(),
    refCalories,
    refProteinG: refMacroGrams('Las proteínas'),
    refCarbsG: refMacroGrams('Los carbohidratos'),
    refFatsG: refMacroGrams('Las grasas'),
    color: z.enum(EXCHANGE_GROUP_PALETTE, { error: 'Elige un color de la paleta' }).nullish(),
    isSystem: forbiddenSystemFlag,
    is_system: forbiddenSystemFlag,
    composedOf: forbiddenComposedOf,
    composed_of: forbiddenComposedOf,
}

export const CreateExchangeGroupSchema = z.object(exchangeGroupWritableShape)
export type CreateExchangeGroupInput = z.infer<typeof CreateExchangeGroupSchema>

export const UpdateExchangeGroupSchema = z.object({
    groupId: z.guid('ID de grupo inválido'),
    ...exchangeGroupWritableShape,
})
export type UpdateExchangeGroupInput = z.infer<typeof UpdateExchangeGroupSchema>

export const DeleteExchangeGroupSchema = z.object({
    groupId: z.guid('ID de grupo inválido'),
})
export type DeleteExchangeGroupInput = z.infer<typeof DeleteExchangeGroupSchema>

export const ExchangePdfFormatSchema = z.enum(['compact', 'equivalences', 'full'])
export type ExchangePdfFormatInput = z.infer<typeof ExchangePdfFormatSchema>

export const LogNutritionPdfGeneratedSchema = z.object({
    planId: z.guid('ID de plan inválido'),
    format: ExchangePdfFormatSchema,
})
export type LogNutritionPdfGeneratedInput = z.infer<typeof LogNutritionPdfGeneratedSchema>
