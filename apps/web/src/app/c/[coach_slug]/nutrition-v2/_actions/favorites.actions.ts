'use server'

import { z } from 'zod'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

/**
 * Favoritos de alimento del alumno para nutrición V2.
 *
 * Reutiliza la MISMA tabla V1 `client_food_preferences` (`preference_type='favorite'`)
 * con la MISMA semántica de la web V1 (`toggleClientFoodPreference`): escritura
 * AUTENTICADA y RLS-scoped (nunca service-role) y que NUNCA pisa un marcador de
 * alergia/intolerancia puesto por el coach. No hay DDL nuevo: las filas existentes se
 * reusan tal cual — el `food_id` del catálogo V2 (`search_food_catalog_v2`) es un
 * `public.foods.id`, el mismo FK que ya usa esta tabla.
 *
 * Fail-closed: cada acción re-verifica el gate de rollout con el MISMO servicio que las
 * pages (isNutritionV2Enabled, surface webStudent). Un usuario fuera del canary no puede
 * tocar estas actions ni aunque arme el request a mano. El alumno solo escribe su fila
 * (clientId debe ser auth.uid()).
 */

type Fail = { ok: false; error: string }

const ClientIdSchema = z.object({ clientId: z.string().uuid() })
const ToggleSchema = z.object({ clientId: z.string().uuid(), foodId: z.string().uuid() })

async function authorizeFavorite(
  clientId: string,
): Promise<{ ok: true; supabase: Awaited<ReturnType<typeof createClient>> } | Fail> {
  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user || !hasClientRow) return { ok: false, error: 'Debes iniciar sesión.' }
  if (user.id !== clientId) return { ok: false, error: 'La cuenta no coincide.' }

  const scope = await getClientScope(user.id)
  const enabled = await isNutritionV2Enabled({
    surface: 'webStudent',
    userId: user.id,
    clientId: user.id,
    coachId: scope.coachId,
    teamId: scope.teamId,
    orgId: scope.orgId,
  })
  if (!enabled) return { ok: false, error: 'La nueva experiencia de nutrición no está habilitada.' }

  const supabase = await createClient()
  return { ok: true, supabase }
}

/** food_ids que el alumno marcó como favorito (para la estrella y el orden de resultados). */
export async function getFavoriteFoodIdsAction(input: unknown): Promise<{ ok: true; ids: string[] } | Fail> {
  const parsed = ClientIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const auth = await authorizeFavorite(parsed.data.clientId)
  if (!auth.ok) return auth

  const { data } = await auth.supabase
    .from('client_food_preferences')
    .select('food_id')
    .eq('client_id', parsed.data.clientId)
    .eq('preference_type', 'favorite')
  return { ok: true, ids: (data ?? []).map((row) => row.food_id) }
}

/** Marca/desmarca un alimento como favorito. Devuelve el estado resultante. */
export async function toggleFavoriteFoodAction(input: unknown): Promise<{ ok: true; active: boolean } | Fail> {
  const parsed = ToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const auth = await authorizeFavorite(parsed.data.clientId)
  if (!auth.ok) return auth

  const { clientId, foodId } = parsed.data
  const { supabase } = auth

  const { data: existing } = await supabase
    .from('client_food_preferences')
    .select('preference_type')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle()

  // Safety: el alumno NO puede pisar un marcador de alergia/intolerancia del coach
  // (fila compartida por PK client_id,food_id) — ahí su toggle es no-op.
  if (existing && (existing.preference_type === 'allergy' || existing.preference_type === 'intolerance')) {
    return { ok: false, error: 'Tu coach marcó este alimento; no puedes cambiarlo.' }
  }

  if (existing) {
    if (existing.preference_type === 'favorite') {
      const { error } = await supabase
        .from('client_food_preferences')
        .delete()
        .eq('client_id', clientId)
        .eq('food_id', foodId)
      if (error) return { ok: false, error: 'No se pudo quitar el favorito.' }
      return { ok: true, active: false }
    }
    const { error } = await supabase
      .from('client_food_preferences')
      .update({ preference_type: 'favorite' })
      .eq('client_id', clientId)
      .eq('food_id', foodId)
    if (error) return { ok: false, error: 'No se pudo guardar el favorito.' }
    return { ok: true, active: true }
  }

  const { error } = await supabase
    .from('client_food_preferences')
    .insert({ client_id: clientId, food_id: foodId, preference_type: 'favorite' })
  if (error) return { ok: false, error: 'No se pudo guardar el favorito.' }
  return { ok: true, active: true }
}

type FavoriteFoodRow = {
  id: string
  name: string
  brand: string | null
  category: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  sodium_mg: number | null
  sugar_g: number | null
  saturated_fat_g: number | null
  serving_size: number
  serving_unit: string | null
}

/** Mapea una fila de `foods` (RLS-scoped) al item del catálogo V2 que consume la UI. */
function toCatalogItem(row: FavoriteFoodRow): FoodCatalogItem {
  const servingSize = Number.isFinite(row.serving_size) && row.serving_size > 0 ? row.serving_size : 100
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
    sodiumMg: row.sodium_mg,
    sugarG: row.sugar_g,
    saturatedFatG: row.saturated_fat_g,
    packageQuantity: null,
    packageUnit: null,
    source: 'manual',
    sourceRef: null,
    verificationStatus: 'unverified',
    media: null,
  }
}

/**
 * Foods favoritos del alumno hidratados como items del catálogo (acceso rápido "Tus
 * favoritos" cuando el buscador está vacío). Dos consultas RLS-scoped (prefs → foods)
 * sin embed para tipado robusto; conserva el orden por recencia del favorito y
 * descarta lo que el alumno ya no puede ver (RLS). Sin RPC ni DDL nuevos.
 */
export async function listFavoriteFoodsAction(input: unknown): Promise<{ ok: true; items: FoodCatalogItem[] } | Fail> {
  const parsed = ClientIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const auth = await authorizeFavorite(parsed.data.clientId)
  if (!auth.ok) return auth

  const { supabase } = auth
  const { data: prefs } = await supabase
    .from('client_food_preferences')
    .select('food_id, created_at')
    .eq('client_id', parsed.data.clientId)
    .eq('preference_type', 'favorite')
    .order('created_at', { ascending: false })
    .limit(50)

  const ids = (prefs ?? []).map((row) => row.food_id)
  if (ids.length === 0) return { ok: true, items: [] }

  const { data: foods } = await supabase
    .from('foods')
    .select(
      'id, name, brand, category, calories, protein_g, carbs_g, fats_g, fiber_g, sodium_mg, sugar_g, saturated_fat_g, serving_size, serving_unit',
    )
    .in('id', ids)

  const byId = new Map((foods ?? []).map((food) => [food.id, food]))
  const items = ids
    .map((id) => byId.get(id))
    .filter((food): food is FavoriteFoodRow => food != null)
    .map(toCatalogItem)
  return { ok: true, items }
}
