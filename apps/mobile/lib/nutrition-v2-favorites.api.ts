import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { supabase } from './supabase'

/**
 * Favoritos usados por la experiencia de registro V2. Conserva las filas legacy
 * como fuente de datos, pero evita que las rutas V2 importen el módulo de swaps V1.
 */
export async function toggleClientFoodFavorite(params: {
  clientId: string
  foodId: string
}): Promise<{ success: boolean; active: boolean; blocked?: boolean }> {
  const { clientId, foodId } = params
  const { data: existing } = await supabase
    .from('client_food_preferences')
    .select('preference_type')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle()

  if (existing && (existing.preference_type === 'allergy' || existing.preference_type === 'intolerance')) {
    return { success: false, active: false, blocked: true }
  }

  if (existing) {
    if (existing.preference_type === 'favorite') {
      const { error } = await supabase
        .from('client_food_preferences')
        .delete()
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      return error ? { success: false, active: true } : { success: true, active: false }
    }

    const { error } = await supabase
      .from('client_food_preferences')
      .update({ preference_type: 'favorite' })
      .eq('client_id', clientId)
      .eq('food_id', foodId)
    return error ? { success: false, active: false } : { success: true, active: true }
  }

  const { error } = await supabase
    .from('client_food_preferences')
    .insert({ client_id: clientId, food_id: foodId, preference_type: 'favorite' })
  return error ? { success: false, active: false } : { success: true, active: true }
}

/** Set de alimentos favoritos del alumno para ordenar el catálogo V2. */
export async function getClientFoodFavorites(clientId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
  return new Set((data ?? []).map((row) => row.food_id as string))
}

type FavoriteFoodRow = {
  id: string
  name: string
  brand: string | null
  category: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  fiber_g: number | null
  serving_size: number | null
  serving_unit: string | null
}

function toFavoriteCatalogItem(row: FavoriteFoodRow): FoodCatalogItem {
  const servingSize = typeof row.serving_size === 'number' && row.serving_size > 0 ? row.serving_size : 100
  return {
    id: row.id,
    catalogKey: null,
    gtin: null,
    name: row.name,
    brand: row.brand,
    category: row.category,
    countryCode: null,
    servingSize,
    servingUnit: row.serving_unit ?? 'g',
    calories: Math.max(row.calories ?? 0, 0),
    proteinG: Math.max(row.protein_g ?? 0, 0),
    carbsG: Math.max(row.carbs_g ?? 0, 0),
    fatsG: Math.max(row.fats_g ?? 0, 0),
    fiberG: row.fiber_g,
    sodiumMg: null,
    sugarG: null,
    saturatedFatG: null,
    packageQuantity: null,
    packageUnit: null,
    source: 'manual',
    sourceRef: null,
    verificationStatus: 'unverified',
    media: null,
  }
}

/** Lista los favoritos existentes como ítems del catálogo V2, sin migrar ni escribir historial V1. */
export async function listFavoriteFoodsV2(clientId: string): Promise<FoodCatalogItem[]> {
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from('client_food_preferences')
    .select(
      'created_at, food:foods(id, name, brand, category, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit)',
    )
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []

  return (data as unknown as Array<{ food: FavoriteFoodRow | null }>)
    .map((row) => row.food)
    .filter((food): food is FavoriteFoodRow => food != null)
    .map(toFavoriteCatalogItem)
}
