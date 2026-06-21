import { supabase } from './supabase'
import { nutritionMealApplies } from './date-utils'

/**
 * Micros del plan (sodio/fibra + avanzados Pro) y proporcion del plato — lado ALUMNO (mobile).
 *
 * Espejo de apps/web/src/app/c/[coach_slug]/nutrition/_data/sections.queries.ts
 * (getPlanDayMicros + platePropFromMacros) y del motor puro `sumMealMicros`
 * (@eva/nutrition-engine).
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * @eva/nutrition-engine NO esta en las tsconfig paths / deps de mobile, asi que la
 * formula PURA de micros se espeja INLINE aca. Si cambia `sumMealMicros` en el package,
 * actualizar `sumFoodItemMicros`/`sumMealMicros` de este archivo.
 */

// ── Tipos espejo de @eva/nutrition-engine (subset de micros) ─────────────────

export interface FoodMicrosRow {
  serving_size: number
  fiber_g?: number | null
  sodium_mg?: number | null
  sugar_g?: number | null
  saturated_fat_g?: number | null
  unsaturated_fat_g?: number | null
}

export interface FoodItemForMicros {
  quantity: number
  unit: string
  foods: FoodMicrosRow
}

export interface MealMicrosTotals {
  sodium_mg: number
  fiber_g: number
  sugar_g: number
  saturated_fat_g: number
  unsaturated_fat_g: number
}

/**
 * Factor de proporcion 1:1 con `calculateFoodItemMacros` (nutrition-utils): g/ml = qty/100;
 * unidades = qty × serving_size / 100. Mantener identico para no driftar las cifras.
 */
function microFactor(quantity: number, unit: string, servingSize: number): number {
  const u = unit?.toLowerCase() ?? 'g'
  const isDirect = u === 'g' || u === 'ml'
  return isDirect ? quantity / 100 : (quantity * servingSize) / 100
}

function sumFoodItemMicros(item: FoodItemForMicros): MealMicrosTotals {
  const f = item.foods
  const factor = microFactor(item.quantity, item.unit, Number(f.serving_size) || 100)
  return {
    sodium_mg: (Number(f.sodium_mg) || 0) * factor,
    fiber_g: (Number(f.fiber_g) || 0) * factor,
    sugar_g: (Number(f.sugar_g) || 0) * factor,
    saturated_fat_g: (Number(f.saturated_fat_g) || 0) * factor,
    unsaturated_fat_g: (Number(f.unsaturated_fat_g) || 0) * factor,
  }
}

/** Suma los micros de una comida (motor puro, espejo de @eva/nutrition-engine#sumMealMicros). */
export function sumMealMicros(meal: { food_items: FoodItemForMicros[] }): MealMicrosTotals {
  return meal.food_items.reduce<MealMicrosTotals>(
    (acc, item) => {
      const m = sumFoodItemMicros(item)
      acc.sodium_mg += m.sodium_mg
      acc.fiber_g += m.fiber_g
      acc.sugar_g += m.sugar_g
      acc.saturated_fat_g += m.saturated_fat_g
      acc.unsaturated_fat_g += m.unsaturated_fat_g
      return acc
    },
    { sodium_mg: 0, fiber_g: 0, sugar_g: 0, saturated_fat_g: 0, unsaturated_fat_g: 0 }
  )
}

export type DayMicros = {
  sodiumMg: number | null
  fiberG: number | null
  sugarG: number | null
  saturatedFatG: number | null
  unsaturatedFatG: number | null
}

const EMPTY_MICROS: DayMicros = {
  sodiumMg: null,
  fiberG: null,
  sugarG: null,
  saturatedFatG: null,
  unsaturatedFatG: null,
}

type MicroFoodEmbed = {
  serving_size: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sugar_g: number | null
  saturated_fat_g: number | null
  unsaturated_fat_g: number | null
}

function firstFood(food: MicroFoodEmbed | MicroFoodEmbed[] | null): MicroFoodEmbed | null {
  if (food == null) return null
  return (Array.isArray(food) ? food[0] : food) ?? null
}

/**
 * Micros del plan para el dia indicado (sodio + fibra + avanzados Pro). Lee las columnas
 * de micros de `foods` (ausentes del plan principal) y suma con `sumMealMicros`. Devuelve
 * `null` por nutriente cuando ningun alimento del dia aporta datos. RLS = techo (alumno).
 */
export async function getPlanDayMicros(
  clientId: string,
  planId: string,
  isoDate: string
): Promise<DayMicros> {
  try {
    const { data } = await supabase
      .from('nutrition_plans')
      .select(
        `
        id,
        nutrition_meals (
          day_of_week,
          nutrition_meal_food_items (
            quantity, unit,
            foods ( serving_size, fiber_g, sodium_mg, sugar_g, saturated_fat_g, unsaturated_fat_g )
          )
        )
      `
      )
      .eq('id', planId)
      .eq('client_id', clientId)
      .maybeSingle()

    const meals =
      ((data as any)?.nutrition_meals as
        | { day_of_week: number | null; nutrition_meal_food_items: any[] }[]
        | undefined) ?? []
    const todays = meals.filter((m) => nutritionMealApplies({ day_of_week: m.day_of_week }, isoDate))

    let anyData = false
    let sodium = 0
    let fiber = 0
    let sugar = 0
    let saturatedFat = 0
    let unsaturatedFat = 0

    for (const meal of todays) {
      const foodItems: FoodItemForMicros[] = []
      for (const fi of meal.nutrition_meal_food_items ?? []) {
        const f = firstFood(fi.foods)
        if (!f) continue
        if (
          f.fiber_g != null ||
          f.sodium_mg != null ||
          f.sugar_g != null ||
          f.saturated_fat_g != null ||
          f.unsaturated_fat_g != null
        ) {
          anyData = true
        }
        foodItems.push({
          quantity: Number(fi.quantity) || 0,
          unit: fi.unit ?? 'g',
          foods: {
            serving_size: Number(f.serving_size) || 100,
            fiber_g: f.fiber_g,
            sodium_mg: f.sodium_mg,
            sugar_g: f.sugar_g,
            saturated_fat_g: f.saturated_fat_g,
            unsaturated_fat_g: f.unsaturated_fat_g,
          },
        })
      }
      const m = sumMealMicros({ food_items: foodItems })
      sodium += m.sodium_mg
      fiber += m.fiber_g
      sugar += m.sugar_g
      saturatedFat += m.saturated_fat_g
      unsaturatedFat += m.unsaturated_fat_g
    }

    const round1 = (n: number) => Math.round(n * 10) / 10
    return {
      sodiumMg: anyData ? Math.round(sodium) : null,
      fiberG: anyData ? round1(fiber) : null,
      sugarG: anyData ? round1(sugar) : null,
      saturatedFatG: anyData ? round1(saturatedFat) : null,
      unsaturatedFatG: anyData ? round1(unsaturatedFat) : null,
    }
  } catch {
    return EMPTY_MICROS
  }
}

// ── Proporcion del plato (metodo del plato) — PURO, espejo de platePropFromMacros ──

export type PlateProportion = { veg: number; protein: number; carb: number }

/**
 * Deriva la proporcion del "metodo del plato" desde los gramos de macros del plan.
 * Verduras ~la mitad del plato (guia MINSAL); la otra mitad se reparte entre proteina y
 * carbohidrato segun su peso relativo en gramos. Sin macros => 50/25/25. PURO.
 */
export function platePropFromMacros(proteinG: number, carbsG: number): PlateProportion {
  const p = Math.max(0, Number(proteinG) || 0)
  const c = Math.max(0, Number(carbsG) || 0)
  const VEG = 0.5
  const rest = 1 - VEG
  const denom = p + c
  if (denom <= 0) return { veg: VEG, protein: rest / 2, carb: rest / 2 }
  return { veg: VEG, protein: rest * (p / denom), carb: rest * (c / denom) }
}

// ── Topes/metas de micros que el coach definio para el alumno ─────────────────

export interface MicroTarget {
  floor?: number
  target?: number
  ceiling?: number
}

export interface MicroTargets {
  sodium?: MicroTarget
  fiber?: MicroTarget
  sugar?: MicroTarget
  saturatedFat?: MicroTarget
  unsaturatedFat?: MicroTarget
}

/**
 * Topes/metas de micros del alumno (especifico del alumno gana sobre el default del coach,
 * client_id null). Espejo de getMicroTargetsForClient. RLS = techo. `{}` si error/sin datos.
 */
export async function getMicroTargetsForClient(
  coachId: string | null,
  clientId: string
): Promise<MicroTargets> {
  if (!coachId) return {}
  try {
    const { data } = await supabase
      .from('nutrient_targets')
      .select('nutrient_key, client_id, floor_value, target_value, ceiling_value')
      .eq('coach_id', coachId)

    const rows = (data ?? []) as Array<{
      nutrient_key: string
      client_id: string | null
      floor_value: number | null
      target_value: number | null
      ceiling_value: number | null
    }>

    const pick = (key: string): MicroTarget | undefined => {
      const matches = rows.filter((r) => r.nutrient_key === key)
      if (matches.length === 0) return undefined
      const row =
        matches.find((r) => r.client_id === clientId) ??
        matches.find((r) => r.client_id == null) ??
        matches[0]
      const t: MicroTarget = {}
      if (row.floor_value != null) t.floor = row.floor_value
      if (row.target_value != null) t.target = row.target_value
      if (row.ceiling_value != null) t.ceiling = row.ceiling_value
      return t.floor == null && t.target == null && t.ceiling == null ? undefined : t
    }

    const out: MicroTargets = {}
    const sodium = pick('sodium_mg')
    const fiber = pick('fiber_g')
    const sugar = pick('sugar_g')
    const saturatedFat = pick('saturated_fat_g')
    const unsaturatedFat = pick('unsaturated_fat_g')
    if (sodium) out.sodium = sodium
    if (fiber) out.fiber = fiber
    if (sugar) out.sugar = sugar
    if (saturatedFat) out.saturatedFat = saturatedFat
    if (unsaturatedFat) out.unsaturatedFat = unsaturatedFat
    return out
  } catch {
    return {}
  }
}
