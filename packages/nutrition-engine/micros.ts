/**
 * Micronutrientes + helpers de porción "casera" (household).
 *
 * PURE: sin Next.js / Supabase / React / RN. Reutiliza la misma convención de
 * unidades que `macros.ts` (g/ml = proporción directa por 100; un = serving_size).
 * Los nuevos campos de micros viven en `foods` (por 100g/ml) y son nullable.
 */

import { type FoodItemForMacros } from './macros'

/** Columnas de micronutrientes nuevas en `foods` (todas por 100 g/ml, nullable). */
export type FoodMicrosRow = {
  fiber_g?: number | null
  sodium_mg?: number | null
  sugar_g?: number | null
  saturated_fat_g?: number | null
  unsaturated_fat_g?: number | null
}

/** Ítem de comida con micros en `foods` (extiende el shape de macros). */
export type FoodItemForMicros = FoodItemForMacros & {
  foods: FoodItemForMacros['foods'] & FoodMicrosRow
}

export type MealMicros = {
  fiber_g: number
  sodium_mg: number
  sugar_g: number
  saturated_fat_g: number
  unsaturated_fat_g: number
}

const MICRO_KEYS = [
  'fiber_g',
  'sodium_mg',
  'sugar_g',
  'saturated_fat_g',
  'unsaturated_fat_g',
] as const

/** Factor de escala de un ítem (mismo criterio g/ml/un que `calculateFoodItemMacros`). */
function portionFactor(item: FoodItemForMacros): number {
  const unitLower = item.unit?.toLowerCase() ?? 'g'
  const isDirectProportion = unitLower === 'g' || unitLower === 'ml'
  return isDirectProportion
    ? item.quantity / 100
    : (item.quantity * item.foods.serving_size) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Micros de un ítem según cantidad/unidad. Valores ausentes cuentan como 0. */
export function calculateFoodItemMicros(item: FoodItemForMicros): MealMicros {
  const factor = portionFactor(item)
  const f = item.foods
  return {
    fiber_g: round1((Number(f.fiber_g) || 0) * factor),
    sodium_mg: round1((Number(f.sodium_mg) || 0) * factor),
    sugar_g: round1((Number(f.sugar_g) || 0) * factor),
    saturated_fat_g: round1((Number(f.saturated_fat_g) || 0) * factor),
    unsaturated_fat_g: round1((Number(f.unsaturated_fat_g) || 0) * factor),
  }
}

/** Suma de micros de todos los ítems de una comida. */
export function sumMealMicros(meal: { food_items: FoodItemForMicros[] }): MealMicros {
  return meal.food_items.reduce<MealMicros>(
    (acc, item) => {
      const m = calculateFoodItemMicros(item)
      for (const k of MICRO_KEYS) acc[k] = round1(acc[k] + m[k])
      return acc
    },
    { fiber_g: 0, sodium_mg: 0, sugar_g: 0, saturated_fat_g: 0, unsaturated_fat_g: 0 }
  )
}

/** Subconjunto de `foods` con la porción casera (household). */
export type FoodHouseholdRow = {
  household_grams?: number | null
  household_label?: string | null
}

/**
 * Rotula una cantidad en gramos con su equivalente casero aproximado.
 *
 * Ej.: household_grams=120, household_label='taza', grams=120 → '120 g (1 taza)'
 *      grams=240 → '240 g (2 tazas)'  (pluraliza si label simple)
 *      grams=60  → '60 g (½ taza)'    (fracciones comunes)
 *
 * Si el alimento no tiene `household_grams`/`household_label` válidos, devuelve
 * solo la masa: '120 g'.
 */
export function gramsToHousehold(food: FoodHouseholdRow, grams: number): string {
  const g = Number(grams)
  const safeG = Number.isFinite(g) ? Math.round(g) : 0
  const base = `${safeG} g`

  const hg = Number(food.household_grams)
  const label = typeof food.household_label === 'string' ? food.household_label.trim() : ''
  if (!Number.isFinite(hg) || hg <= 0 || !label) return base

  const count = g / hg
  const rotulo = formatHouseholdCount(count, label)
  return rotulo ? `${base} (${rotulo})` : base
}

/** Fracciones comunes para rótulos caseros (½, ⅓, ¼, ¾). */
const COMMON_FRACTIONS: Array<{ value: number; glyph: string }> = [
  { value: 0.25, glyph: '¼' },
  { value: 0.333, glyph: '⅓' },
  { value: 0.5, glyph: '½' },
  { value: 0.667, glyph: '⅔' },
  { value: 0.75, glyph: '¾' },
]

function pluralizeLabel(label: string, count: number): string {
  if (count <= 1) return label
  // Pluralización liviana es-latam: termina en vocal → +s; en consonante → +es.
  const last = label.slice(-1).toLowerCase()
  if ('aeiou'.includes(last)) return `${label}s`
  return `${label}es`
}

function formatHouseholdCount(count: number, label: string): string {
  if (!Number.isFinite(count) || count <= 0) return ''

  // < 1: intentar fracción común (tolerancia 0.06).
  if (count < 1) {
    let best: string | null = null
    let bestDiff = Infinity
    for (const f of COMMON_FRACTIONS) {
      const diff = Math.abs(count - f.value)
      if (diff < bestDiff && diff <= 0.06) {
        bestDiff = diff
        best = f.glyph
      }
    }
    if (best) return `${best} ${label}`
    // Sin fracción cercana: 1 decimal.
    return `${round1(count)} ${pluralizeLabel(label, count)}`
  }

  // >= 1: redondear a entero si está muy cerca, si no 1 decimal.
  const rounded = Math.round(count)
  const value = Math.abs(count - rounded) <= 0.06 ? rounded : round1(count)
  return `${value} ${pluralizeLabel(label, value)}`
}
