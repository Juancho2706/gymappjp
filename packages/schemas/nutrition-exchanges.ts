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

/**
 * "Colación Fran" → "COL". Solo sugerencia: el coach puede sobrescribirla.
 * Vive acá (y no en la UI del builder) porque web y RN tienen que sugerir lo MISMO: hasta F2
 * había dos copias de esta función, una por superficie.
 */
export function suggestExchangeGroupCode(name: string): string {
    return toExchangeGroupSlug(name)
        .replace(/[^a-z]/g, '')
        .slice(0, 3)
        .toUpperCase()
}

const EXCHANGE_CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Código LIBRE derivado de otro ("C" → "CA", "CB"…) para duplicar un grupo del sistema sin
 * chocar con la unicidad que impone el servicio. El schema solo acepta 1-3 LETRAS, así que no
 * sirve el clásico sufijo numérico: se prueban sufijos de una y dos letras.
 */
export function suggestFreeExchangeGroupCode(base: string, taken: readonly string[]): string {
    const ocupados = new Set(taken.map((code) => code.trim().toUpperCase()))
    const raiz = base.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'G'
    for (const letra of EXCHANGE_CODE_LETTERS) {
        const candidato = (raiz.slice(0, 2) + letra).slice(0, 3)
        if (!ocupados.has(candidato)) return candidato
    }
    for (const primera of EXCHANGE_CODE_LETTERS) {
        for (const segunda of EXCHANGE_CODE_LETTERS) {
            const candidato = raiz.slice(0, 1) + primera + segunda
            if (!ocupados.has(candidato)) return candidato
        }
    }
    // Inalcanzable con 26² combinaciones libres por raíz; el servidor es el techo real igual.
    return raiz
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

// ─── Equivalencia de porciones de un alimento (clasificar alimentos propios — P-B) ──
//
// Las 3 columnas `exchange_*` de `foods` clasifican un alimento dentro de un grupo:
// "1 porción de C = 120 g de arroz integral (≈ 1 taza)". `authenticated` ya tiene
// INSERT+UPDATE sobre las 3 (grant de tabla verificado en LIVE) ⇒ P-B no necesita SQL.
//
// El read model del alumno NO cambia: `exchangeFoods` y la cobertura derivada leen `foods`
// vivo. Ojo con el cap del read model: la vista corta las equivalencias por grupo en
// `rn <= 40` (`20260718150000_nutrition_portions_read_models.sql:364`, replicado en
// `20260720120000`), ordenadas por nombre — clasificar el alimento 41 de un grupo NO
// rompe nada, pero ese alimento no aparece en el sheet del alumno hasta que se priorice
// a los propios (F2 del SPEC).

/** Tope de la medida casera ("1 taza", "1 palma"): es un hint corto, no una descripción. */
export const EXCHANGE_PORTION_LABEL_MAX = 40
/** Tope defensivo de gramos por porción (una porción jamás es un kilo y medio). */
export const EXCHANGE_PORTION_GRAMS_MAX = 5000

/**
 * Trío `exchange_*` — se mezcla dentro del schema de alta/edición de alimento de cada
 * superficie (web V2 `CoachFoodInputSchema`, alta directa del catálogo, RN). Los 3 campos
 * son opcionales: un alimento sin clasificar es el caso normal.
 */
export const foodExchangeEquivalenceShape = {
    exchangeGroupId: z.guid('Grupo de porciones inválido').nullish(),
    exchangePortionGrams: z
        .number({ error: 'Los gramos por porción deben ser un número' })
        .positive('Los gramos por porción deben ser mayores a 0')
        .max(EXCHANGE_PORTION_GRAMS_MAX, `Máximo ${EXCHANGE_PORTION_GRAMS_MAX} g por porción`)
        .nullish(),
    exchangePortionLabel: z
        .string()
        .trim()
        .max(EXCHANGE_PORTION_LABEL_MAX, `Máximo ${EXCHANGE_PORTION_LABEL_MAX} caracteres`)
        .nullish(),
}

export type FoodExchangeEquivalenceInput = {
    exchangeGroupId?: string | null
    exchangePortionGrams?: number | null
    exchangePortionLabel?: string | null
}

/**
 * Regla junto-o-nada: grupo ⇔ gramos. La medida casera es el único campo realmente
 * opcional del trío, pero no tiene sentido sola (nadie ve "1 taza" sin saber de qué grupo
 * ni cuántos gramos), así que también exige grupo. Devuelve el primer problema o `null`.
 */
export function foodExchangeEquivalenceIssue(
    value: FoodExchangeEquivalenceInput
): { path: 'exchangeGroupId' | 'exchangePortionGrams'; message: string } | null {
    const hasGroup = typeof value.exchangeGroupId === 'string' && value.exchangeGroupId.length > 0
    const hasGrams = value.exchangePortionGrams != null
    const hasLabel = (value.exchangePortionLabel ?? '').trim().length > 0
    if (hasGroup && !hasGrams) {
        return { path: 'exchangePortionGrams', message: 'Indica cuántos gramos equivalen a 1 porción.' }
    }
    if (!hasGroup && (hasGrams || hasLabel)) {
        return { path: 'exchangeGroupId', message: 'Elige el grupo de porciones al que equivale este alimento.' }
    }
    return null
}

/**
 * Callback para `.superRefine()` del schema que mezcle `foodExchangeEquivalenceShape`.
 * Zod 4 conserva la clase del schema tras refinar, así que el `.extend()` que hace el
 * endpoint mobile sobre `CoachFoodInputSchema` sigue funcionando.
 */
export function refineFoodExchangeEquivalence(
    value: FoodExchangeEquivalenceInput,
    ctx: { addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void }
): void {
    const issue = foodExchangeEquivalenceIssue(value)
    if (issue) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
}

/**
 * Normaliza el trío a lo que va a las columnas: sin grupo ⇒ los 3 en NULL (limpiar la
 * clasificación es un caso legítimo del update); etiqueta vacía ⇒ NULL, nunca ''.
 */
export function normalizeFoodExchangeEquivalence(value: FoodExchangeEquivalenceInput): {
    exchangeGroupId: string | null
    exchangePortionGrams: number | null
    exchangePortionLabel: string | null
} {
    const groupId = typeof value.exchangeGroupId === 'string' && value.exchangeGroupId.length > 0 ? value.exchangeGroupId : null
    if (!groupId) return { exchangeGroupId: null, exchangePortionGrams: null, exchangePortionLabel: null }
    const label = (value.exchangePortionLabel ?? '').trim()
    return {
        exchangeGroupId: groupId,
        exchangePortionGrams: value.exchangePortionGrams ?? null,
        exchangePortionLabel: label.length > 0 ? label : null,
    }
}

// ─── Listas de equivalencia propias del coach (F2 — specs/nutrition-exchange-lists) ──
//
// A diferencia del trío `foods.exchange_*` (una verdad GLOBAL por alimento), estas operaciones
// escriben una fila en `exchange_group_foods` con DUEÑO. El dueño no viaja en el payload: lo
// resuelve el servidor desde la sesión y el workspace activo — el body jamás es autoridad de
// identidad (AGENTS.md).

const exchangeListGroupId = z.guid('Grupo de porciones inválido')
const exchangeListFoodId = z.guid('Alimento inválido')

/** Alta o edición de "1 porción de este grupo = N g de este alimento" en MI lista. */
export const UpsertExchangeGroupFoodSchema = z.object({
    exchangeGroupId: exchangeListGroupId,
    foodId: exchangeListFoodId,
    portionGrams: z
        .number({ error: 'Los gramos por porción deben ser un número' })
        .positive('Los gramos por porción deben ser mayores a 0')
        .max(EXCHANGE_PORTION_GRAMS_MAX, `Máximo ${EXCHANGE_PORTION_GRAMS_MAX} g por porción`),
    portionLabel: z
        .string()
        .trim()
        .max(EXCHANGE_PORTION_LABEL_MAX, `Máximo ${EXCHANGE_PORTION_LABEL_MAX} caracteres`)
        .nullish(),
})
export type UpsertExchangeGroupFoodInput = z.infer<typeof UpsertExchangeGroupFoodSchema>

/**
 * Sacar un alimento de MI lista sin tocar el catálogo: escribe la fila-lápida (`is_excluded`).
 * Es distinto de `RemoveExchangeGroupFoodSchema`, que borra mi fila y devuelve el alimento a
 * lo que diga el catálogo global.
 */
export const ExcludeExchangeGroupFoodSchema = z.object({
    exchangeGroupId: exchangeListGroupId,
    foodId: exchangeListFoodId,
})
export type ExcludeExchangeGroupFoodInput = z.infer<typeof ExcludeExchangeGroupFoodSchema>

/** Borra MI fila (valor propio o lápida) ⇒ el alimento vuelve al valor del catálogo. */
export const RemoveExchangeGroupFoodSchema = z.object({
    exchangeGroupId: exchangeListGroupId,
    foodId: exchangeListFoodId,
})
export type RemoveExchangeGroupFoodInput = z.infer<typeof RemoveExchangeGroupFoodSchema>

/**
 * "Duplicar y ajustar" un grupo: crea un grupo propio y, si `copyList`, copia la lista completa
 * del origen reescalada por regla de tres (`rescalePortionGrams`). Sin la copia el grupo nuevo
 * nace vacío y el alumno abre un sheet sin un solo ejemplo — el defecto que F1 dejó abierto.
 */
export const DuplicateExchangeGroupSchema = z.object({
    sourceGroupId: exchangeListGroupId,
    ...exchangeGroupWritableShape,
    copyList: z.boolean().default(true),
})
export type DuplicateExchangeGroupInput = z.infer<typeof DuplicateExchangeGroupSchema>

/** Tope de filas que puede copiar una duplicación (Cereales tiene 715). */
export const EXCHANGE_LIST_COPY_MAX = 2000

export const ExchangePdfFormatSchema = z.enum(['compact', 'equivalences', 'full'])
export type ExchangePdfFormatInput = z.infer<typeof ExchangePdfFormatSchema>

export const LogNutritionPdfGeneratedSchema = z.object({
    planId: z.guid('ID de plan inválido'),
    format: ExchangePdfFormatSchema,
})
export type LogNutritionPdfGeneratedInput = z.infer<typeof LogNutritionPdfGeneratedSchema>
