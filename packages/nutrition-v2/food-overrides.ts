import { z } from 'zod'
import { NutritionMacrosBasisSchema } from './contracts'
import type { NutritionMacrosBasis } from './intake-normalize'

/**
 * Overrides de macros por coach (T2.1 — specs/nutrition-food-overrides).
 *
 * El coach puede corregir los macros de un alimento del catalogo que considera errados y
 * fijarle una medida casera propia, sin clonarlo. Clonar es la salida que existe hoy y la que
 * produjo los 104 duplicados de julio: el alimento clonado deja de recibir correcciones del
 * catalogo y el buscador muestra dos filas iguales.
 *
 * Todo lo de este archivo es PURO (web + RN + API movil, sin Supabase). Es el ESPEJO en
 * TypeScript del merge que hace `private.food_catalog_v2_item_json` en SQL: el catalogo
 * mergea en la base, y el freeze de publicacion mergea aca. Si las dos formulas se separan,
 * el coach ve un numero en el buscador y el alumno recibe otro en su plan — exactamente el
 * drift que este archivo existe para impedir.
 */

/** Tope de sanidad de cada macro, espejo del check `cfo_macros_range` de la tabla. */
export const COACH_FOOD_OVERRIDE_MACRO_MAX = 9999

/** Largo maximo de la medida casera, espejo del check de `household_label`. */
export const COACH_FOOD_OVERRIDE_HOUSEHOLD_LABEL_MAX = 40

const macroValue = z.number().finite().min(0).max(COACH_FOOD_OVERRIDE_MACRO_MAX)

/**
 * Valores editables de un override. Los CINCO macros son obligatorios: el merge es un
 * reemplazo TOTAL, no un coalesce por campo.
 *
 * Por que total: un override parcial deja el alimento internamente incoherente (kcal
 * corregidas contra macros viejos que no suman), y el coach no tiene como notarlo. El sheet
 * de edicion (T2.2) prellena los cinco valores vigentes, asi que "corregir solo las kcal"
 * sigue siendo un gesto de un campo para el coach — la coherencia la garantiza el contrato.
 *
 * `macrosBasis` viaja SIEMPRE y es obligatoria. Es el gotcha central de la feature: el
 * catalogo tiene dos convenciones vivas (`per_100` del importado y `per_serving` del seed de
 * intercambios) y hoy el freeze asume per_100 sin declararlo. Un override per_serving sin
 * base declarada se congelaria con numeros equivocados y nadie lo veria hasta que el alumno
 * mire su plan.
 */
export const CoachFoodOverrideValuesSchema = z
  .object({
    calories: macroValue,
    proteinG: macroValue,
    carbsG: macroValue,
    fatsG: macroValue,
    fiberG: macroValue,
    macrosBasis: NutritionMacrosBasisSchema,
    householdLabel: z
      .string()
      .trim()
      .min(1)
      .max(COACH_FOOD_OVERRIDE_HOUSEHOLD_LABEL_MAX)
      .nullable()
      .default(null),
    householdGrams: z.number().finite().positive().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    // Espejo del check par de la tabla: "1 taza" sin gramos no convierte nada, y unos gramos
    // sin etiqueta no se pueden mostrar. O viajan los dos, o ninguno.
    const hasLabel = value.householdLabel != null
    const hasGrams = value.householdGrams != null
    if (hasLabel !== hasGrams) {
      ctx.addIssue({
        code: 'custom',
        path: [hasLabel ? 'householdGrams' : 'householdLabel'],
        message: 'La medida casera necesita etiqueta y gramos juntos.',
      })
    }
  })

/** Lo que manda la UI del coach: el alimento + los valores. El dueño se deriva del actor. */
export const CoachFoodOverrideInputSchema = z.object({
  foodId: z.string().uuid(),
  values: CoachFoodOverrideValuesSchema,
})

/** Override ya persistido (fila leida). `coachId` JAMAS viene del payload: lo pone el server. */
export const CoachFoodOverrideSchema = z.object({
  id: z.string().uuid(),
  coachId: z.string().uuid(),
  foodId: z.string().uuid(),
  calories: macroValue,
  proteinG: macroValue,
  carbsG: macroValue,
  fatsG: macroValue,
  fiberG: macroValue,
  macrosBasis: NutritionMacrosBasisSchema,
  householdLabel: z.string().nullable(),
  householdGrams: z.number().finite().positive().nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable().optional(),
})

export type CoachFoodOverrideValues = z.infer<typeof CoachFoodOverrideValuesSchema>
export type CoachFoodOverrideInput = z.infer<typeof CoachFoodOverrideInputSchema>
export type CoachFoodOverride = z.infer<typeof CoachFoodOverrideSchema>

/** Los cinco macros y nada mas: lo que el badge ✎ de T2.2 muestra tachado como original. */
export interface FoodMacroSet {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
}

/**
 * Alimento tal como lo trae el catalogo o el select del freeze, antes del merge. Los campos
 * opcionales pueden faltar en una build RN cacheada o en un select que aun no los pide.
 */
export interface FoodBaseMacros extends Partial<FoodMacroSet> {
  macrosBasis?: NutritionMacrosBasis | null
  householdLabel?: string | null
  householdGrams?: number | null
}

/**
 * Resultado del merge. No incluye el alimento entero a proposito: el caller hace
 * `{ ...food, ...resolveFoodMacros(food, override) }` y conserva su propio tipo sin casts.
 */
export interface ResolvedFoodMacros extends FoodMacroSet {
  /**
   * Base declarada de los macros resultantes. `null` = no declarada (fila vieja o select que
   * no la pide) ⇒ el consumidor aplica su regla historica; nunca se inventa `per_100` aca.
   */
  macrosBasis: NutritionMacrosBasis | null
  householdLabel: string | null
  householdGrams: number | null
  hasOverride: boolean
  /** Macros del catalogo antes del override. `null` cuando no hay override. */
  original: FoodMacroSet | null
}

function nonNegative(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Fibra: `null` es dato ("este alimento no declara fibra"), no cero. Se preserva. */
function nullableMacro(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Merge de un alimento con el override de su coach. Espejo exacto del `left join` de
 * `private.food_catalog_v2_item_json`: sin override el resultado es el alimento tal cual
 * (mas `hasOverride: false`), con override los cinco macros y la base se reemplazan enteros.
 *
 * La medida casera NO sigue esa regla: es opcional dentro del override y se coalescea como
 * PAR. Un coach que solo corrige macros no debe borrar la medida casera que el alimento ya
 * traia, y mezclar la etiqueta de una fuente con los gramos de la otra daria una conversion
 * falsa ("1 taza = 30 g" con la taza del override y los gramos del catalogo).
 */
export function resolveFoodMacros(
  food: FoodBaseMacros,
  override: CoachFoodOverrideValues | null | undefined,
): ResolvedFoodMacros {
  const baseHouseholdPair =
    food.householdLabel != null && food.householdGrams != null
      ? { householdLabel: food.householdLabel, householdGrams: food.householdGrams }
      : { householdLabel: null, householdGrams: null }

  if (override == null) {
    return {
      calories: nonNegative(food.calories),
      proteinG: nonNegative(food.proteinG),
      carbsG: nonNegative(food.carbsG),
      fatsG: nonNegative(food.fatsG),
      fiberG: nullableMacro(food.fiberG),
      macrosBasis: food.macrosBasis ?? null,
      ...baseHouseholdPair,
      hasOverride: false,
      original: null,
    }
  }

  const overrideHouseholdPair =
    override.householdLabel != null && override.householdGrams != null
      ? { householdLabel: override.householdLabel, householdGrams: override.householdGrams }
      : baseHouseholdPair

  return {
    calories: nonNegative(override.calories),
    proteinG: nonNegative(override.proteinG),
    carbsG: nonNegative(override.carbsG),
    fatsG: nonNegative(override.fatsG),
    fiberG: nonNegative(override.fiberG),
    macrosBasis: override.macrosBasis,
    ...overrideHouseholdPair,
    hasOverride: true,
    original: {
      calories: nonNegative(food.calories),
      proteinG: nonNegative(food.proteinG),
      carbsG: nonNegative(food.carbsG),
      fatsG: nonNegative(food.fatsG),
      fiberG: nullableMacro(food.fiberG),
    },
  }
}

/** Fila de `public.coach_food_overrides` tal como la devuelve PostgREST. */
export interface CoachFoodOverrideRow {
  food_id: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number
  macros_basis: string
  household_label: string | null
  household_grams: number | null
}

/** Fila -> valores del merge. Una base fuera del vocabulario se ignora (queda per_100). */
export function coachFoodOverrideValuesFromRow(row: CoachFoodOverrideRow): CoachFoodOverrideValues {
  return {
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatsG: Number(row.fats_g),
    fiberG: Number(row.fiber_g),
    macrosBasis: row.macros_basis === 'per_serving' ? 'per_serving' : 'per_100',
    householdLabel: row.household_label,
    householdGrams: row.household_grams == null ? null : Number(row.household_grams),
  }
}

/**
 * Indice por `food_id` para mergear un lote sin N+1 (freeze de publicacion y rehidratacion
 * leen los overrides del coach de una sola vez y resuelven en memoria). El unique
 * `(coach_id, food_id)` garantiza una fila por alimento; ante duplicados gana la ultima.
 */
export function indexCoachFoodOverridesByFoodId(
  rows: readonly CoachFoodOverrideRow[],
): Map<string, CoachFoodOverrideValues> {
  const byFoodId = new Map<string, CoachFoodOverrideValues>()
  for (const row of rows) {
    byFoodId.set(row.food_id, coachFoodOverrideValuesFromRow(row))
  }
  return byFoodId
}
