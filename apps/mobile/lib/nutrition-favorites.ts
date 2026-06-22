import { supabase } from './supabase'

/**
 * Favoritos de alimentos del alumno — espejo de las server actions web
 * `toggleClientFoodPreference` / `getClientFoodFavoritesForClient`.
 * RLS asegura que el alumno solo lee/escribe sus propias filas; mobile habla PostgREST directo.
 *
 * Safety (A2): el alumno NO puede pisar/borrar un marcador de alergia/intolerancia puesto por el
 * coach (misma PK client_id,food_id). El toggle de favorito es no-op sobre esas filas.
 */

/** Trae los food_id que el alumno marcó como favorito. */
export async function getClientFoodFavorites(clientId: string): Promise<string[]> {
  const { data } = await supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('preference_type', 'favorite')
  return (data ?? []).map((r) => r.food_id as string)
}

/** Alterna el favorito de un alimento. Devuelve el estado resultante (active = es favorito). */
export async function toggleClientFoodFavorite(
  clientId: string,
  foodId: string
): Promise<{ success: boolean; active: boolean }> {
  const { data: existing } = await supabase
    .from('client_food_preferences')
    .select('preference_type')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle()

  const type = (existing as { preference_type?: string } | null)?.preference_type
  if (type === 'allergy' || type === 'intolerance') {
    return { success: false, active: false }
  }

  if (existing) {
    if (type === 'favorite') {
      const { error } = await supabase
        .from('client_food_preferences')
        .delete()
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      return { success: !error, active: false }
    }
    const { error } = await supabase
      .from('client_food_preferences')
      .update({ preference_type: 'favorite' })
      .eq('client_id', clientId)
      .eq('food_id', foodId)
    return { success: !error, active: true }
  }

  const { error } = await supabase.from('client_food_preferences').insert({
    client_id: clientId,
    food_id: foodId,
    preference_type: 'favorite',
  })
  return { success: !error, active: true }
}
