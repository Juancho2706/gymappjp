import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  coachFoodOverrideValuesFromRow,
  type CoachFoodOverrideRow,
  type CoachFoodOverrideValues,
} from '@eva/nutrition-v2'

/**
 * Repository de `coach_food_overrides` — la correccion de macros de UN alimento del catalogo
 * hecha por UN coach (T2.1, specs/nutrition-food-overrides).
 *
 * RLS es el TECHO: con el cliente user-scoped del coach, un SELECT devuelve sus overrides (y
 * los de su coach si el actor es alumno), y una escritura a nombre de otro coach la niega la
 * policy `cfo_insert_own`. Estas funciones JAMAS reciben el cliente service-role: no existe
 * override "global" que escribir, y el dueño lo pone siempre el servicio desde el actor.
 *
 * El merge NO vive aca: en discovery lo hace `private.food_catalog_v2_item_json` y en el freeze
 * el helper puro `resolveFoodMacros`. Este archivo solo lee y escribe filas.
 */

type DB = SupabaseClient<Database>

const ROW_COLUMNS =
  'food_id, calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams'

/** Tope de una lectura por lote. El freeze de un plan nunca resuelve mas alimentos que esto. */
const MAX_BATCH = 500

export type CoachFoodOverrideWriteResult = { ok: true } | { ok: false; error: string }

function toRow(raw: unknown): CoachFoodOverrideRow {
  const row = raw as Record<string, unknown>
  return {
    food_id: String(row.food_id),
    calories: Number(row.calories),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fats_g: Number(row.fats_g),
    fiber_g: Number(row.fiber_g),
    macros_basis: String(row.macros_basis),
    household_label: (row.household_label as string | null) ?? null,
    household_grams: row.household_grams == null ? null : Number(row.household_grams),
  }
}

/** El override del coach para UN alimento, o `null` si no lo corrigio. */
export async function findCoachFoodOverride(
  db: DB,
  input: { coachId: string; foodId: string },
): Promise<CoachFoodOverrideValues | null> {
  const { data, error } = await db
    .from('coach_food_overrides')
    .select(ROW_COLUMNS)
    .eq('coach_id', input.coachId)
    .eq('food_id', input.foodId)
    .maybeSingle()
  if (error || data == null) return null
  return coachFoodOverrideValuesFromRow(toRow(data))
}

/**
 * Los overrides del coach para un LOTE de alimentos, indexados por `food_id`. Es la lectura que
 * usa el freeze: un round-trip para todo el plan, nunca uno por alimento (el N+1 que ya existia
 * en `plan-persistence` es justamente lo que no hay que reproducir).
 *
 * Sin alimentos ⇒ mapa vacio sin tocar la base.
 */
export async function findCoachFoodOverridesByFoodIds(
  db: DB,
  input: { coachId: string; foodIds: readonly string[] },
): Promise<Map<string, CoachFoodOverrideValues>> {
  const ids = [...new Set(input.foodIds)].filter(Boolean).slice(0, MAX_BATCH)
  if (ids.length === 0) return new Map()

  const { data, error } = await db
    .from('coach_food_overrides')
    .select(ROW_COLUMNS)
    .eq('coach_id', input.coachId)
    .in('food_id', ids)
  if (error || data == null) return new Map()

  const byFoodId = new Map<string, CoachFoodOverrideValues>()
  for (const raw of data) {
    const row = toRow(raw)
    byFoodId.set(row.food_id, coachFoodOverrideValuesFromRow(row))
  }
  return byFoodId
}

/**
 * Alta o edicion de MI override. Sin `upsert` de PostgREST a proposito (mismo criterio que
 * `exchange_group_foods`): un select previo cuesta un round-trip y deja explicito que la
 * identidad `(coach_id, food_id)` no se toca — la app ni siquiera tiene grant para moverla.
 */
export async function upsertCoachFoodOverride(
  db: DB,
  input: {
    coachId: string
    foodId: string
    values: CoachFoodOverrideValues
    createdBy?: string | null
  },
): Promise<CoachFoodOverrideWriteResult> {
  const { values } = input
  const editable = {
    calories: values.calories,
    protein_g: values.proteinG,
    carbs_g: values.carbsG,
    fats_g: values.fatsG,
    fiber_g: values.fiberG,
    macros_basis: values.macrosBasis,
    household_label: values.householdLabel,
    household_grams: values.householdGrams,
  }

  const existing = await db
    .from('coach_food_overrides')
    .select('id')
    .eq('coach_id', input.coachId)
    .eq('food_id', input.foodId)
    .maybeSingle()

  if (existing.data) {
    const { data, error } = await db
      .from('coach_food_overrides')
      .update(editable)
      .eq('id', (existing.data as { id: string }).id)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'No se pudo guardar la correccion del alimento.' }
    return { ok: true }
  }

  const { data, error } = await db
    .from('coach_food_overrides')
    .insert({
      coach_id: input.coachId,
      food_id: input.foodId,
      created_by: input.createdBy ?? null,
      ...editable,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No se pudo guardar la correccion del alimento.' }
  return { ok: true }
}

/**
 * Restaurar el original ES un delete. 0 filas afectadas NO es error: significa que el coach
 * nunca corrigio ese alimento y el estado final es exactamente el que pidio.
 */
export async function deleteCoachFoodOverride(
  db: DB,
  input: { coachId: string; foodId: string },
): Promise<CoachFoodOverrideWriteResult> {
  const { error } = await db
    .from('coach_food_overrides')
    .delete()
    .eq('coach_id', input.coachId)
    .eq('food_id', input.foodId)
  return error ? { ok: false, error: error.message } : { ok: true }
}
