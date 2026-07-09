import { normalizeSwapOptions } from '../../../lib/nutrition-utils'
import type { Json, MealWithFoodItems } from '../../../lib/nutrition-utils'

/**
 * Contrato de datos del shell de Nutrición del alumno (mobile). `nutricion.tsx`
 * hace UN fetch, deriva y alimenta a las secciones presentacionales de este
 * folder — cada sección vive en su propio archivo (mismo patrón que el dashboard
 * E1: `components/alumno/home/*`, espejo del árbol mobile de la web
 * `apps/web/src/app/c/[coach_slug]/nutrition/_components/*`).
 */

// ── Acentos de dominio nutrición (rampa ember FIJA, token-contract — NUNCA
//    white-label; la marca del coach sigue via theme.primary / clases NativeWind). ──
export const EMBER_500 = '#FF6A3D'
export const EMBER_600 = '#E8511E'
export const EMBER_700 = '#C2410C'

// ── Shapes crudos del select de Supabase (getActiveNutritionPlanFull) ──

export interface RawFoodRow {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
  household_grams: number | null
  household_label: string | null
}

export interface RawFoodItem {
  id: string
  quantity: number
  unit: string | null
  swap_options: Json | null
  foods: RawFoodRow | null
}

export interface RawMeal {
  id: string
  name: string
  description: string | null
  order_index: number
  day_of_week: number | null
  nutrition_meal_food_items: RawFoodItem[]
}

export interface NutritionPlan {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  instructions: string | null
  coach_id: string | null
  nutrition_meals: RawMeal[]
}

export interface DailyLog {
  id: string
  log_date: string
  target_calories_at_log: number | null
  target_protein_at_log: number | null
  target_carbs_at_log: number | null
  target_fats_at_log: number | null
  nutrition_meal_logs: {
    id: string
    meal_id: string
    is_completed: boolean
    consumed_quantity: number | null
    satisfaction_score: number | null
  }[]
  nutrition_meal_food_swaps: {
    meal_id: string
    original_food_id: string
    swapped_food_id: string
    swapped_quantity: number | null
    swapped_unit: string | null
  }[]
}

/** Fila de adherencia (30 días) — solo lo que necesitan racha + AdherenceStrip. */
export interface AdherenceDay {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

/** Comida normalizada para las tarjetas: macros + display (conserva household). */
export type DisplayMeal = MealWithFoodItems & {
  name: string
  description: string | null
  day_of_week: number | null
}

/**
 * Normaliza una `RawMeal` al shape que consumen el motor de macros
 * (`MealWithFoodItems`) Y las tarjetas — a diferencia de
 * `normalizeMealForMacros` del engine, PRESERVA `household_grams`/
 * `household_label` (campos de display, no alteran ningún cálculo) para poder
 * mostrar medidas caseras ("120 g (1 taza)"). El `swap_options` se normaliza
 * (no se descarta) para alimentar el swap interactivo de la tarjeta; el motor lo
 * tolera en el cómputo de macros base.
 */
export function normalizeMealForDisplay(meal: RawMeal): DisplayMeal {
  const items = meal.nutrition_meal_food_items ?? []
  return {
    id: meal.id,
    name: meal.name,
    description: meal.description,
    day_of_week: meal.day_of_week,
    food_items: items.map((fi, i) => ({
      id: fi.id ?? `${meal.id}-fi-${i}`,
      quantity: Number(fi.quantity) || 0,
      unit: fi.unit ?? 'g',
      // Preserva las alternativas del coach (motor las tolera en el cómputo base)
      // para que la tarjeta ofrezca el swap interactivo (E4-08 / seam E4-SEAM-swaps).
      swap_options: normalizeSwapOptions(fi.swap_options),
      foods: {
        id: fi.foods?.id,
        name: fi.foods?.name ?? '',
        calories: fi.foods?.calories ?? 0,
        protein_g: fi.foods?.protein_g ?? 0,
        carbs_g: fi.foods?.carbs_g ?? 0,
        fats_g: fi.foods?.fats_g ?? 0,
        serving_size: fi.foods?.serving_size ?? 100,
        serving_unit: fi.foods?.serving_unit ?? null,
        household_grams: fi.foods?.household_grams ?? null,
        household_label: fi.foods?.household_label ?? null,
      },
    })),
  }
}
