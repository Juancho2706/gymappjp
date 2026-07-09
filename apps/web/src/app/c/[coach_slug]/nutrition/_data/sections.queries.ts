import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { sumMealMicros, type FoodItemForMicros } from '@eva/nutrition-engine'
import { nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import { NutrientTargetsService } from '@/services/nutrient-targets.service'
import { findPlanModuleContext } from '@/infrastructure/db/exchanges.repository'
import { hasExchangesModuleForClientContext } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import type { MicroTarget } from '../_components/MicrosPanel'

/**
 * Queries de las secciones nuevas del overhaul de nutrición (lado ALUMNO).
 * Base tier. React.cache → dedupe por request. Data flow: _data -> services /
 * engine puro -> Supabase. El alumno solo ve lo suyo (RLS lo refuerza).
 */

type MicroFoodRow = {
  quantity: number | null
  unit: string | null
  foods:
    | {
        serving_size: number | null
        fiber_g: number | null
        sodium_mg: number | null
        sugar_g: number | null
        saturated_fat_g: number | null
        unsaturated_fat_g: number | null
      }
    | {
        serving_size: number | null
        fiber_g: number | null
        sodium_mg: number | null
        sugar_g: number | null
        saturated_fat_g: number | null
        unsaturated_fat_g: number | null
      }[]
    | null
}

type MicroMealRow = {
  day_of_week: number | null
  food_items: MicroFoodRow[] | null
}

export type DayMicros = {
  /** Sodio del plan para el día, en mg. `null` cuando no hay datos. */
  sodiumMg: number | null
  /** Fibra del plan para el día, en g. `null` cuando no hay datos. */
  fiberG: number | null
  /** Azúcar del plan para el día, en g (avanzado/Pro). `null` cuando no hay datos. */
  sugarG: number | null
  /** Grasa saturada del plan para el día, en g (avanzado/Pro). `null` cuando no hay datos. */
  saturatedFatG: number | null
  /** Grasa insaturada del plan para el día, en g (avanzado/Pro). `null` cuando no hay datos. */
  unsaturatedFatG: number | null
}

/** Coerce a single food row out of PostgREST's array|object embed. */
function firstFood(food: MicroFoodRow['foods']): NonNullable<Exclude<MicroFoodRow['foods'], unknown[]>> | null {
  if (food == null) return null
  return (Array.isArray(food) ? food[0] : food) ?? null
}

/**
 * Micros (sodio + fibra) DEL PLAN para el día indicado. Lee las columnas de micros
 * de `foods` (ausentes en el plan principal) y suma con `sumMealMicros` (motor puro).
 * Devuelve `null` por nutriente cuando ningún alimento del día aporta datos.
 */
export const getPlanDayMicros = cache(
  async (
    clientId: string,
    planId: string,
    isoDate: string,
    db?: SupabaseClient<Database>
  ): Promise<DayMicros> => {
    const supabase = db ?? (await createClient())
    const { data } = await supabase
      .from('nutrition_plans')
      .select(
        `
        id,
        nutrition_meals (
          day_of_week,
          food_items (
            quantity, unit,
            foods ( serving_size, fiber_g, sodium_mg, sugar_g, saturated_fat_g, unsaturated_fat_g )
          )
        )
      `
      )
      .eq('id', planId)
      .eq('client_id', clientId)
      .maybeSingle()

    const meals = (data?.nutrition_meals as MicroMealRow[] | undefined) ?? []
    const todays = meals.filter((m) =>
      nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week: m.day_of_week }, isoDate)
    )

    let anyData = false
    let sodium = 0
    let fiber = 0
    let sugar = 0
    let saturatedFat = 0
    let unsaturatedFat = 0
    for (const meal of todays) {
      const foodItems: FoodItemForMicros[] = []
      for (const fi of meal.food_items ?? []) {
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
            // `sumMealMicros` solo usa serving_size + las columnas de micros.
            name: '',
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fats_g: 0,
            serving_size: Number(f.serving_size) || 100,
            serving_unit: null,
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
  }
)

/**
 * Topes/metas de sodio y fibra que el coach definió para este alumno (o sus
 * defaults). Se resuelven a la forma {@link MicroTarget} que consume `MicrosPanel`.
 */
export const getMicroTargetsForClient = cache(
  async (
    coachId: string | null,
    clientId: string,
    db?: SupabaseClient<Database>
  ): Promise<{
    sodium?: MicroTarget
    fiber?: MicroTarget
    sugar?: MicroTarget
    saturatedFat?: MicroTarget
    unsaturatedFat?: MicroTarget
  }> => {
    if (!coachId) return {}
    const supabase = db ?? (await createClient())
    const service = new NutrientTargetsService(supabase)
    const rows = await service.listNutrientTargets(coachId, clientId)

    // Específico del alumno gana sobre el default del coach (client_id null).
    const pick = (key: string): MicroTarget | undefined => {
      const matches = rows.filter((r) => r.nutrient_key === key)
      if (matches.length === 0) return undefined
      const row =
        matches.find((r) => r.client_id === clientId) ?? matches.find((r) => r.client_id == null) ?? matches[0]
      const t: MicroTarget = {}
      if (row.floor_value != null) t.floor = row.floor_value
      if (row.target_value != null) t.target = row.target_value
      if (row.ceiling_value != null) t.ceiling = row.ceiling_value
      return t.floor == null && t.target == null && t.ceiling == null ? undefined : t
    }

    const out: {
      sodium?: MicroTarget
      fiber?: MicroTarget
      sugar?: MicroTarget
      saturatedFat?: MicroTarget
      unsaturatedFat?: MicroTarget
    } = {}
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
  }
)

/**
 * ¿"Nutrición Pro" (módulo `nutrition_exchanges`) habilitado para el contexto del
 * recurso de este alumno? Gobierna los micros AVANZADOS del panel (azúcar/grasas),
 * no el modo de la pauta — un plan en gramos también los muestra si el coach tiene Pro.
 * Resuelto SERVER-SIDE por el contexto del RECURSO (team del pool manda; si no, el
 * coach dueño del plan). Fail-closed. React.cache → dedupe por request.
 */
export const getNutritionProEnabledForClient = cache(
  async (planId: string): Promise<boolean> => {
    const supabase = await createClient()
    const ctx = await findPlanModuleContext(supabase, planId)
    if (!ctx) return false
    return hasExchangesModuleForClientContext(supabase, {
      clientTeamId: ctx.clientTeamId,
      clientOrgId: ctx.clientOrgId,
      planCoachId: ctx.coachId,
    })
  }
)

/** Proporción del plato (verduras/proteína/carbohidrato) derivada del split de macros del plan. */
export type PlateShares = { veg: number; protein: number; carb: number }

/**
 * Deriva la proporción del "método del plato" a partir de los gramos de macros del
 * plan. Convención: las verduras ocupan ~la mitad del plato (guía MINSAL), y la otra
 * mitad se reparte entre proteína y carbohidrato según su peso relativo en gramos.
 * Si no hay macros, cae a un plato balanceado por defecto (50/25/25). PURO.
 */
export function platePropFromMacros(proteinG: number, carbsG: number): PlateShares {
  const p = Math.max(0, Number(proteinG) || 0)
  const c = Math.max(0, Number(carbsG) || 0)
  const VEG = 0.5
  const rest = 1 - VEG
  const denom = p + c
  if (denom <= 0) return { veg: VEG, protein: rest / 2, carb: rest / 2 }
  return { veg: VEG, protein: rest * (p / denom), carb: rest * (c / denom) }
}
