import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { NutritionNotesService, type MealCommentRow } from '@/services/nutrition-notes.service'

/**
 * Queries del ALUMNO para los comentarios bidireccionales de su bitácora.
 * El alumno solo ve su propio hilo: clientId = uid de la sesión (RLS lo refuerza).
 * React.cache → dedupe por request.
 */

export const getClientMealComments = cache(
  async (logDate: string): Promise<MealCommentRow[]> => {
    const supabase = await createClient()
    const { data: __cl } = await supabase.auth.getClaims()
    const clientId = (__cl?.claims?.sub as string | undefined) ?? null
    if (!clientId) return []
    const service = new NutritionNotesService(supabase)
    return service.listMealComments(clientId, logDate)
  }
)
