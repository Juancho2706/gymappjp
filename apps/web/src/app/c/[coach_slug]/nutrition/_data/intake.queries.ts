import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  NutritionIntakeService,
  type IntakeEntryWithFood,
  type IntakeFoodRef,
} from '@/services/nutrition-intake.service'

const FOOD_REF_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, household_grams, household_label, is_liquid'

/**
 * Resuelve el alumno autenticado desde la sesión (getClaims, sin /user).
 * El proxy ya validó/refrescó la sesión. NUNCA derivar el client del body.
 */
const getAuthedClientId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub as string | undefined
  if (!userId) return null

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  return clientRow?.id ?? null
})

/** Entradas de intake fuera de plan del alumno autenticado para un día. */
export const getIntakeEntriesForDate = cache(
  async (isoDate: string): Promise<IntakeEntryWithFood[]> => {
    const clientId = await getAuthedClientId()
    if (!clientId) return []
    const supabase = await createClient()
    const service = new NutritionIntakeService(supabase)
    return service.listIntakeEntriesForDate(clientId, isoDate)
  },
)

/** Alimentos del catálogo usados recientemente en el intake del alumno. */
export const getRecentIntakeFoods = cache(
  async (limit = 10): Promise<IntakeFoodRef[]> => {
    const clientId = await getAuthedClientId()
    if (!clientId) return []
    const supabase = await createClient()
    const service = new NutritionIntakeService(supabase)
    return service.listRecentIntakeFoods(clientId, limit)
  },
)

/** Favoritos Base reutilizando `client_food_preferences`; no crea otro sistema. */
export const getFavoriteIntakeFoods = cache(
  async (): Promise<IntakeFoodRef[]> => {
    const clientId = await getAuthedClientId()
    if (!clientId) return []
    const supabase = await createClient()
    const loose = supabase as unknown as SupabaseClient
    const { data, error } = await loose
      .from('client_food_preferences')
      .select(`food_id, food:foods(${FOOD_REF_SELECT})`)
      .eq('client_id', clientId)
      .eq('preference_type', 'favorite')
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return (data as unknown as Array<{ food_id: string; food: IntakeFoodRef | null }>)
      .map((row) => row.food)
      .filter((food): food is IntakeFoodRef => food !== null)
  },
)
