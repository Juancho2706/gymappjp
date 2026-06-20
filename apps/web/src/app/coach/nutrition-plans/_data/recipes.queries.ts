import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  listCoachRecipes,
  listAssignedRecipesForClient,
  type RecipeRow,
  type RecipeScope,
} from '@/services/nutrition-recipes.service'

/**
 * Queries del feature L (recetas) — lado COACH.
 * Flujo obligatorio: _data → services → Supabase. Acá solo se crea el client
 * request-scoped y se delega al service. React.cache deduplica por render.
 */

/** Recetas del scope activo del coach (coach XOR team). */
export const getCoachRecipes = cache(
  async (scope: RecipeScope): Promise<RecipeRow[]> => {
    const supabase = await createClient()
    return listCoachRecipes(supabase, scope)
  }
)

/** Recetas ya asignadas a un alumno (para pintar el estado de los toggles en el coach). */
export const getRecipesAssignedToClient = cache(
  async (clientId: string): Promise<RecipeRow[]> => {
    const supabase = await createClient()
    return listAssignedRecipesForClient(supabase, clientId)
  }
)
