import { supabase } from './supabase'

/**
 * Feature L (alumno) — Recetas-idea asignadas por el coach como inspiracion.
 *
 * Espejo de `apps/web/src/services/nutrition-recipes.service.ts#listAssignedRecipesForClient`.
 * El alumno lee las recetas via PostgREST directo (anon key + JWT): la RLS de
 * `nutrition_recipe_assignments` (policy `_client_select`: `client_id = auth.uid()`)
 * + la de `nutrition_recipes` (`_client_select`: EXISTS assignment propia) limitan
 * al alumno a SUS asignaciones. Solo lectura, SIN macros, SIN adherencia — no es
 * un modulo pago (tier Pro+ del coach, pero el alumno solo consume).
 * Migracion: supabase/migrations/20260618180005_nutrition_recipes_and_assignments.sql
 */

export type RecipeRow = {
  id: string
  coach_id: string | null
  team_id: string | null
  name: string
  ingredients_text: string | null
  instructions: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

const RECIPE_COLUMNS =
  'id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at'

/**
 * Recetas asignadas a UN alumno (vista del alumno — inspiracion, solo lectura).
 * `clientId` = `auth.uid()` del alumno (clients.id === user.id). RLS refuerza.
 */
export async function getAssignedRecipesForClient(clientId: string): Promise<RecipeRow[]> {
  const { data } = await supabase
    .from('nutrition_recipe_assignments')
    .select(`recipe:nutrition_recipes(${RECIPE_COLUMNS})`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  type JoinRow = { recipe: RecipeRow | null }
  return ((data ?? []) as unknown as JoinRow[])
    .map((r) => r.recipe)
    .filter((r): r is RecipeRow => r !== null)
}
