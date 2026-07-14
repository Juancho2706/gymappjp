import {
  calculateIntakeEntriesTotals,
  calculateIntakeEntryMacros,
  normalizeFoodSearchText,
  parseGtin,
  type NutritionMealSlot,
} from '@eva/nutrition-engine'
import { supabase } from './supabase'

export type IntakeUnit = 'g' | 'ml' | 'un'
export type IntakeSource = 'offplan' | 'quickadd' | 'recent' | 'copy'
export type IntakeCaptureMethod = 'search' | 'barcode' | 'recent' | 'copy' | 'manual'

export interface IntakeFood {
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
  is_liquid: boolean | null
}

export interface IntakeEntry {
  id: string
  log_date: string
  food_id: string | null
  custom_name: string | null
  quantity: number
  unit: string
  source: string
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
  created_at: string
  food: IntakeFood | null
}

export interface IntakeMacros {
  calories: number
  protein: number
  carbs: number
  fats: number
}

export type BarcodeLookupResult =
  | { status: 'found'; barcode: string; food: IntakeFood }
  | { status: 'invalid'; barcode: string }
  | { status: 'not_found'; barcode: string }
  | { status: 'unavailable'; barcode: string }

const FOOD_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, is_liquid'
const ENTRY_SELECT = `*, food:foods(${FOOD_SELECT})`
const SEARCH_MIN_CHARS = 2

type LooseClient = {
  from: (table: string) => any
}

function loose(): LooseClient {
  return supabase as unknown as LooseClient
}

export async function searchIntakeFoods(term: string, limit = 30): Promise<IntakeFood[]> {
  const normalized = normalizeFoodSearchText(term)
  if (normalized.length < SEARCH_MIN_CHARS) return []
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_SELECT)
    .ilike('name_search', `%${normalized}%`)
    .order('name')
    .limit(limit)
  if (error || !data) return []
  return data as unknown as IntakeFood[]
}

export async function findIntakeFoodByBarcode(rawCode: string): Promise<BarcodeLookupResult> {
  const barcode = parseGtin(rawCode)
  if (!barcode) return { status: 'invalid', barcode: rawCode.replace(/\D/g, '') }

  try {
    const { data, error } = await loose()
      .from('foods')
      .select(`${FOOD_SELECT}, barcode`)
      .eq('barcode', barcode)
      .limit(1)
      .maybeSingle()

    if (error) return { status: 'unavailable', barcode }
    if (!data) return { status: 'not_found', barcode }
    return { status: 'found', barcode, food: data as IntakeFood }
  } catch {
    return { status: 'unavailable', barcode }
  }
}

export async function recordMissingFoodBarcode(clientId: string, rawCode: string): Promise<void> {
  const barcode = parseGtin(rawCode)
  if (!barcode) return

  try {
    await loose().from('food_catalog_missing_codes').upsert(
      {
        client_id: clientId,
        barcode,
        country_code: 'CL',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,barcode' },
    )
  } catch {
    // No bloquea el registro manual si falla conectividad o permisos.
  }
}

export async function listIntakeEntriesForDate(
  clientId: string,
  isoDate: string,
): Promise<IntakeEntry[]> {
  const { data, error } = await loose()
    .from('nutrition_intake_entries')
    .select(ENTRY_SELECT)
    .eq('client_id', clientId)
    .eq('log_date', isoDate)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data as IntakeEntry[]
}

export async function listRecentIntakeFoods(clientId: string, limit = 8): Promise<IntakeFood[]> {
  const { data, error } = await loose()
    .from('nutrition_intake_entries')
    .select(`food_id, created_at, food:foods(${FOOD_SELECT})`)
    .eq('client_id', clientId)
    .not('food_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 4)
  if (error || !data) return []

  const seen = new Set<string>()
  const out: IntakeFood[] = []
  for (const row of data as Array<{ food_id: string | null; food: IntakeFood | null }>) {
    if (!row.food || !row.food_id || seen.has(row.food_id)) continue
    seen.add(row.food_id)
    out.push(row.food)
    if (out.length >= limit) break
  }
  return out
}

export interface InsertIntakeInput {
  clientId: string
  logDate: string
  foodId?: string | null
  customName?: string | null
  quantity: number
  unit: IntakeUnit
  source?: IntakeSource
  mealSlot?: NutritionMealSlot
  captureMethod?: IntakeCaptureMethod
  foodSnapshot?: IntakeFood | null
}

export async function insertIntakeEntry(input: InsertIntakeInput): Promise<IntakeEntry | null> {
  if (!(input.foodId || input.customName)) return null
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return null

  const snapshot = input.foodSnapshot
  const { data, error } = await loose()
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
    .select(ENTRY_SELECT)
    .single()
  if (error || !data) return null
  return data as IntakeEntry
}

export async function deleteIntakeEntry(clientId: string, entryId: string): Promise<boolean> {
  const { error } = await loose()
    .from('nutrition_intake_entries')
    .delete()
    .eq('id', entryId)
    .eq('client_id', clientId)
  return !error
}

export function intakeEntryMacros(entry: IntakeEntry): IntakeMacros {
  const macros = calculateIntakeEntryMacros(entry)
  return {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
  }
}

export function sumIntakeMacros(entries: IntakeEntry[]): IntakeMacros {
  const macros = calculateIntakeEntriesTotals(entries)
  return {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
  }
}
