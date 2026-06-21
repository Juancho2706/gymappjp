import { supabase } from './supabase'
import type { RecipeRow } from './recipes'

/**
 * Recetas-idea ASIGNADAS al alumno (feature L) — lado ALUMNO (mobile).
 *
 * Espejo de apps/web/src/services/nutrition-recipes.service.ts#listAssignedRecipesForClient +
 * _data/recipes.queries.ts#getAssignedRecipesForClient. El alumno ve las recetas que su coach le
 * compartio como inspiracion (solo lectura, sin macros, sin "completar"). RLS limita a las
 * asignaciones propias (client_id = auth.uid()). Reusa el tipo `RecipeRow` de lib/recipes.ts.
 */

const RECIPE_COLUMNS =
  'id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at'

/** Recetas asignadas al alumno, mas recientes primero. `[]` ante error. */
export async function getAssignedRecipesForClient(clientId: string): Promise<RecipeRow[]> {
  try {
    const { data } = await supabase
      .from('nutrition_recipe_assignments')
      .select(`recipe:nutrition_recipes(${RECIPE_COLUMNS})`)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    return ((data ?? []) as unknown as { recipe: RecipeRow | null }[])
      .map((r) => r.recipe)
      .filter((r): r is RecipeRow => r !== null)
  } catch {
    return []
  }
}
