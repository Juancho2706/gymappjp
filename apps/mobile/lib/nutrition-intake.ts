import { supabase } from './supabase'

/**
 * Off-plan intake (registro fuera de plan) del alumno — lado ALUMNO (mobile).
 *
 * Espejo de:
 *  - apps/web/src/services/nutrition-intake.service.ts (insertIntakeEntry / listRecentIntakeFoods)
 *  - apps/web/src/app/c/[coach_slug]/nutrition/_components/OffPlanLogger.tsx (busqueda + quick-add)
 *
 * Tabla `nutrition_intake_entries` es client-scoped por RLS (client_id = auth.uid()). La sesion
 * + RLS son la autorizacion; `clientId` solo filtra/inserta explicitamente.
 */

export type IntakeFoodRef = {
  id: string
  name: string
  brand: string | null
  serving_size: number | null
  serving_unit: string | null
  is_liquid: boolean | null
}

/** Resultado minimo del catalogo para registrar/buscar. */
export type FoodHit = {
  id: string
  name: string
  brand: string | null
  serving_size: number | null
  serving_unit: string | null
  is_liquid: boolean | null
}

const FOOD_SEARCH_COLUMNS = 'id, name, brand, serving_size, serving_unit, is_liquid'

const DEFAULT_QUANTITY = 100
const DEFAULT_UNIT = 'g'

/** Alimentos del catalogo usados recientemente (quick-add). Dedup por food_id, mas reciente primero. */
export async function getRecentIntakeFoods(
  clientId: string,
  limit = 10
): Promise<IntakeFoodRef[]> {
  try {
    const { data } = await supabase
      .from('nutrition_intake_entries')
      .select(`food_id, created_at, food:foods(${FOOD_SEARCH_COLUMNS})`)
      .eq('client_id', clientId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 4)

    const seen = new Set<string>()
    const out: IntakeFoodRef[] = []
    for (const row of (data ?? []) as any[]) {
      const food = Array.isArray(row.food) ? row.food[0] : row.food
      if (!food || !row.food_id || seen.has(row.food_id)) continue
      seen.add(row.food_id)
      out.push(food as IntakeFoodRef)
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

/** Busqueda debounced sobre el catalogo (RLS scope: global + coach del alumno). */
export async function searchFoods(term: string, limit = 30): Promise<FoodHit[]> {
  const trimmed = term.trim()
  if (trimmed.length < 2) return []
  try {
    const { data, error } = await supabase
      .from('foods')
      .select(FOOD_SEARCH_COLUMNS)
      .ilike('name_search', `%${trimmed}%`)
      .order('name')
      .limit(limit)
    if (error) return []
    return (data ?? []) as FoodHit[]
  } catch {
    return []
  }
}

/**
 * Inserta una entrada de intake fuera de plan (cantidad 100 g por defecto, igual que la web).
 * RLS garantiza clientId == auth.uid(). Espejo de addIntakeEntryAction (manual).
 */
export async function addIntakeEntry(input: {
  clientId: string
  logDate: string
  foodId: string
  quantity?: number
  unit?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('nutrition_intake_entries').insert({
      client_id: input.clientId,
      log_date: input.logDate,
      food_id: input.foodId,
      quantity: input.quantity ?? DEFAULT_QUANTITY,
      unit: input.unit ?? DEFAULT_UNIT,
      source: 'manual',
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo registrar.' }
  }
}
