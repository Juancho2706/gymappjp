import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  listAssignedRecipesForClient,
  type RecipeRow,
} from '@/services/nutrition-recipes.service'

/**
 * Queries del feature L (recetas) — lado ALUMNO.
 * El alumno ve las recetas que su coach le asignó como inspiración (solo lectura).
 * El `clientId` es el `auth.uid()` del alumno (clients.id === user.id). RLS limita
 * a las asignaciones propias.
 */
export const getAssignedRecipesForClient = cache(
  async (clientId: string): Promise<RecipeRow[]> => {
    const supabase = await createClient()
    return listAssignedRecipesForClient(supabase, clientId)
  }
)
