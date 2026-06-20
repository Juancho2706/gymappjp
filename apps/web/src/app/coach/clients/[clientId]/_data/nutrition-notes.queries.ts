import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  NutritionNotesService,
  type MealCommentRow,
  type PrivateNoteRow,
} from '@/services/nutrition-notes.service'

/**
 * Queries del COACH para notas de nutrición de un alumno.
 * React.cache → dedupe por request. RLS hace cumplir coach↔alumno.
 */

export const getCoachMealComments = cache(
  async (clientId: string, logDate: string): Promise<MealCommentRow[]> => {
    const supabase = await createClient()
    const service = new NutritionNotesService(supabase)
    return service.listMealComments(clientId, logDate)
  }
)

export const getCoachPrivateNotes = cache(
  async (clientId: string): Promise<PrivateNoteRow[]> => {
    const supabase = await createClient()
    const service = new NutritionNotesService(supabase)
    return service.listPrivateNotes(clientId)
  }
)
