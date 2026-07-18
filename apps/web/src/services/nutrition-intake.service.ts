import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import type { NutritionMealSlot } from '@eva/nutrition-engine'

/**
 * Registro de consumo real del alumno.
 *
 * RLS mantiene el scope por `client_id = auth.uid()`. Las columnas snapshot
 * preservan el valor histórico aunque luego se edite el catálogo de alimentos.
 */

type IntakeEntryRow = Database['public']['Tables']['nutrition_intake_entries']['Row']

export const INTAKE_SOURCES = ['offplan', 'quickadd', 'recent', 'copy'] as const
export type IntakeSource = (typeof INTAKE_SOURCES)[number]

export const INTAKE_CAPTURE_METHODS = ['search', 'barcode', 'recent', 'copy', 'manual'] as const
export type IntakeCaptureMethod = (typeof INTAKE_CAPTURE_METHODS)[number]

export type IntakeFoodRef = {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g?: number | null
  serving_size: number
  serving_unit: string | null
  household_grams: number | null
  household_label: string | null
  is_liquid: boolean | null
}

export type IntakeEntryWithFood = IntakeEntryRow & {
  meal_slot?: NutritionMealSlot | null
  capture_method?: IntakeCaptureMethod | null
  snapshot_name?: string | null
  snapshot_brand?: string | null
  snapshot_calories?: number | null
  snapshot_protein_g?: number | null
  snapshot_carbs_g?: number | null
  snapshot_fats_g?: number | null
  snapshot_fiber_g?: number | null
  snapshot_serving_size?: number | null
  snapshot_serving_unit?: string | null
  food: IntakeFoodRef | null
}

const FOOD_REF_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, household_grams, household_label, is_liquid'

const INTAKE_SELECT = `*, food:foods(${FOOD_REF_SELECT})`

export type InsertIntakeEntryInput = {
  clientId: string
  logDate: string
  foodId?: string | null
  customName?: string | null
  quantity: number
  unit: string
  source?: IntakeSource
  mealSlot?: NutritionMealSlot | null
  captureMethod?: IntakeCaptureMethod
  foodSnapshot?: IntakeFoodRef | null
}

type LooseClient = SupabaseClient

function loose(client: SupabaseClient<Database>): LooseClient {
  return client as unknown as LooseClient
}

export class NutritionIntakeService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async insertIntakeEntry(input: InsertIntakeEntryInput): Promise<IntakeEntryWithFood | null> {
    const snapshot = input.foodSnapshot
    const { data, error } = await loose(this.supabase)
      .from('nutrition_intake_entries')
      .insert({
        client_id: input.clientId,
        log_date: input.logDate,
        food_id: input.foodId ?? null,
        custom_name: input.customName ?? null,
        quantity: input.quantity,
        unit: input.unit,
        source: input.source ?? 'offplan',
        meal_slot: input.mealSlot ?? 'other',
        capture_method: input.captureMethod ?? 'search',
        snapshot_name: snapshot?.name ?? input.customName ?? null,
        snapshot_brand: snapshot?.brand ?? null,
        snapshot_calories: snapshot?.calories ?? null,
        snapshot_protein_g: snapshot?.protein_g ?? null,
        snapshot_carbs_g: snapshot?.carbs_g ?? null,
        snapshot_fats_g: snapshot?.fats_g ?? null,
        snapshot_fiber_g: snapshot?.fiber_g ?? null,
        snapshot_serving_size: snapshot?.serving_size ?? null,
        snapshot_serving_unit: snapshot?.serving_unit ?? null,
      })
      .select(INTAKE_SELECT)
      .single()

    if (error || !data) {
      if (error) console.error('[nutrition-intake] insert failed:', error.message)
      return null
    }
    return data as unknown as IntakeEntryWithFood
  }

  async listIntakeEntriesForDate(
    clientId: string,
    isoDate: string,
  ): Promise<IntakeEntryWithFood[]> {
    const { data, error } = await loose(this.supabase)
      .from('nutrition_intake_entries')
      .select(INTAKE_SELECT)
      .eq('client_id', clientId)
      .eq('log_date', isoDate)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data as unknown as IntakeEntryWithFood[]
  }

  async listRecentIntakeFoods(clientId: string, limit = 10): Promise<IntakeFoodRef[]> {
    const { data, error } = await loose(this.supabase)
      .from('nutrition_intake_entries')
      .select(`food_id, created_at, food:foods(${FOOD_REF_SELECT})`)
      .eq('client_id', clientId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 4)

    if (error || !data) return []

    const seen = new Set<string>()
    const out: IntakeFoodRef[] = []
    for (const row of data as unknown as Array<{ food_id: string | null; food: IntakeFoodRef | null }>) {
      if (!row.food || !row.food_id || seen.has(row.food_id)) continue
      seen.add(row.food_id)
      out.push(row.food)
      if (out.length >= limit) break
    }
    return out
  }

  async deleteIntakeEntry(clientId: string, entryId: string): Promise<boolean> {
    const { error } = await loose(this.supabase)
      .from('nutrition_intake_entries')
      .delete()
      .eq('id', entryId)
      .eq('client_id', clientId)

    return !error
  }
}
