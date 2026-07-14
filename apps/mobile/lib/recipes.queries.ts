import { supabase } from './supabase'

/**
 * Recetas asignadas al alumno:
 * - idea Base: inspiración en texto libre;
 * - structured: receta profesional con macros por porción.
 *
 * La lectura sigue siendo PostgREST + JWT y queda limitada por RLS a las
 * asignaciones del propio alumno.
 */

export type RecipeMode = 'idea' | 'structured'

export type RecipeRow = {
  id: string
  coach_id: string | null
  team_id: string | null
  name: string
  description: string | null
  ingredients_text: string | null
  instructions: string | null
  image_url: string | null
  recipe_mode: RecipeMode
  servings: number
  prep_time_minutes: number | null
  category: string | null
  calories_per_serving: number | null
  protein_g_per_serving: number | null
  carbs_g_per_serving: number | null
  fats_g_per_serving: number | null
  fiber_g_per_serving: number | null
  created_at: string
  updated_at: string
}

const RECIPE_COLUMNS = [
  'id',
  'coach_id',
  'team_id',
  'name',
  'description',
  'ingredients_text',
  'instructions',
  'image_url',
  'recipe_mode',
  'servings',
  'prep_time_minutes',
  'category',
  'calories_per_serving',
  'protein_g_per_serving',
  'carbs_g_per_serving',
  'fats_g_per_serving',
  'fiber_g_per_serving',
  'created_at',
  'updated_at',
].join(', ')

export async function getAssignedRecipesForClient(clientId: string): Promise<RecipeRow[]> {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown }>
        }
      }
    }
  }

  const { data } = await client
    .from('nutrition_recipe_assignments')
    .select(`recipe:nutrition_recipes(${RECIPE_COLUMNS})`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  type JoinRow = { recipe: RecipeRow | null }
  return ((data ?? []) as JoinRow[])
    .map((row) => row.recipe)
    .filter((recipe): recipe is RecipeRow => recipe !== null)
}
