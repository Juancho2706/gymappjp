import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  NutritionIntakeService,
  type IntakeEntryWithFood,
  type IntakeFoodRef,
} from '@/services/nutrition-intake.service'

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
  }
)

/** Alimentos del catálogo usados recientemente en el intake del alumno. */
export const getRecentIntakeFoods = cache(
  async (limit = 10): Promise<IntakeFoodRef[]> => {
    const clientId = await getAuthedClientId()
    if (!clientId) return []
    const supabase = await createClient()
    const service = new NutritionIntakeService(supabase)
    return service.listRecentIntakeFoods(clientId, limit)
  }
)
