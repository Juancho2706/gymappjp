import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Servicio del sistema VIVO de recetas.
 *
 * - `idea`: inspiración Base, texto libre y asignación a alumnos.
 * - `structured`: receta cuantificable de Nutrición Pro, con ingredientes
 *   snapshoteados y macros por porción.
 *
 * Ambas modalidades usan `nutrition_recipes`; no se revive el sistema legacy.
 */

export type RecipeScope = {
  coachId: string
  teamId: string | null
}

export type RecipeMode = 'idea' | 'structured'

export type RecipeIngredientRow = {
  id: string
  recipe_id: string
  food_id: string | null
  name_snapshot: string
  brand_snapshot: string | null
  quantity: number
  unit: 'g' | 'ml' | 'un'
  calories_snapshot: number
  protein_g_snapshot: number
  carbs_g_snapshot: number
  fats_g_snapshot: number
  fiber_g_snapshot: number | null
  serving_size_snapshot: number
  serving_unit_snapshot: string | null
  order_index: number
  note: string | null
  created_at: string
}

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
  ingredients?: RecipeIngredientRow[]
}

export type CreateRecipeInput = {
  name: string
  ingredients_text?: string | null
  instructions?: string | null
  image_url?: string | null
}

export type UpdateRecipeInput = {
  name?: string
  ingredients_text?: string | null
  instructions?: string | null
  image_url?: string | null
}

export type StructuredRecipeIngredientInput = {
  food_id: string
  quantity: number
  unit: 'g' | 'ml' | 'un'
  note?: string | null
  order_index: number
}

export type SaveStructuredRecipeInput = {
  recipe_id?: string | null
  name: string
  description?: string | null
  instructions?: string | null
  image_url?: string | null
  servings: number
  prep_time_minutes?: number | null
  category?: string | null
  ingredients: StructuredRecipeIngredientInput[]
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

const RECIPE_INGREDIENT_COLUMNS = [
  'id',
  'recipe_id',
  'food_id',
  'name_snapshot',
  'brand_snapshot',
  'quantity',
  'unit',
  'calories_snapshot',
  'protein_g_snapshot',
  'carbs_g_snapshot',
  'fats_g_snapshot',
  'fiber_g_snapshot',
  'serving_size_snapshot',
  'serving_unit_snapshot',
  'order_index',
  'note',
  'created_at',
].join(', ')

const RECIPE_WITH_INGREDIENTS = `${RECIPE_COLUMNS}, ingredients:nutrition_recipe_ingredients(${RECIPE_INGREDIENT_COLUMNS})`

type DB = SupabaseClient<Database>
type LooseDB = SupabaseClient

function loose(db: DB): LooseDB {
  // database.types.ts se regenerará al cerrar la rama; este cast queda acotado a
  // las columnas nuevas ya aplicadas y verificadas en Supabase.
  return db as unknown as LooseDB
}

function scopeColumns(scope: RecipeScope): { coach_id: string; team_id: string | null } {
  return { coach_id: scope.coachId, team_id: scope.teamId }
}

/** Crea una idea Base. */
export async function createRecipe(
  supabase: DB,
  scope: RecipeScope,
  input: CreateRecipeInput,
): Promise<{ success: boolean; recipe?: RecipeRow; error?: string }> {
  const { data, error } = await loose(supabase)
    .from('nutrition_recipes')
    .insert({
      ...scopeColumns(scope),
      name: input.name,
      ingredients_text: input.ingredients_text ?? null,
      instructions: input.instructions ?? null,
      image_url: input.image_url ?? null,
      recipe_mode: 'idea',
    })
    .select(RECIPE_COLUMNS)
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? 'No se pudo crear la receta.' }
  }
  return { success: true, recipe: data as RecipeRow }
}

/** Actualiza una idea Base sin alterar accidentalmente recetas estructuradas. */
export async function updateRecipe(
  supabase: DB,
  scope: RecipeScope,
  recipeId: string,
  input: UpdateRecipeInput,
): Promise<{ success: boolean; recipe?: RecipeRow; error?: string }> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.ingredients_text !== undefined) patch.ingredients_text = input.ingredients_text
  if (input.instructions !== undefined) patch.instructions = input.instructions
  if (input.image_url !== undefined) patch.image_url = input.image_url

  if (Object.keys(patch).length === 0) {
    return { success: false, error: 'Nada que actualizar.' }
  }

  let query = loose(supabase)
    .from('nutrition_recipes')
    .update(patch)
    .eq('id', recipeId)
    .eq('recipe_mode', 'idea')
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { data, error } = await query.select(RECIPE_COLUMNS).maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Receta Base no encontrada.' }
  return { success: true, recipe: data as RecipeRow }
}

/**
 * Guarda una receta Pro y todos sus ingredientes en UNA transacción PostgreSQL.
 * La RPC es SECURITY INVOKER: deriva nutrientes desde foods visibles y respeta RLS.
 */
export async function saveStructuredRecipe(
  supabase: DB,
  scope: RecipeScope,
  input: SaveStructuredRecipeInput,
): Promise<{ success: boolean; recipe?: RecipeRow; error?: string }> {
  const { data: recipeId, error } = await loose(supabase).rpc(
    'save_structured_nutrition_recipe',
    {
      p_recipe_id: input.recipe_id ?? null,
      p_team_id: scope.teamId,
      p_name: input.name,
      p_description: input.description ?? null,
      p_instructions: input.instructions ?? null,
      p_image_url: input.image_url ?? null,
      p_servings: input.servings,
      p_prep_time_minutes: input.prep_time_minutes ?? null,
      p_category: input.category ?? null,
      p_ingredients: input.ingredients,
    },
  )

  if (error || !recipeId) {
    return { success: false, error: error?.message ?? 'No se pudo guardar la receta profesional.' }
  }

  const { data, error: readError } = await loose(supabase)
    .from('nutrition_recipes')
    .select(RECIPE_WITH_INGREDIENTS)
    .eq('id', String(recipeId))
    .single()

  if (readError || !data) {
    return {
      success: false,
      error: readError?.message ?? 'La receta se guardó, pero no se pudo recargar.',
    }
  }

  const recipe = data as unknown as RecipeRow
  recipe.ingredients = [...(recipe.ingredients ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )
  return { success: true, recipe }
}

export async function getRecipeWithIngredients(
  supabase: DB,
  recipeId: string,
): Promise<RecipeRow | null> {
  const { data } = await loose(supabase)
    .from('nutrition_recipes')
    .select(RECIPE_WITH_INGREDIENTS)
    .eq('id', recipeId)
    .maybeSingle()
  if (!data) return null
  const recipe = data as unknown as RecipeRow
  recipe.ingredients = [...(recipe.ingredients ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )
  return recipe
}

export async function deleteRecipe(
  supabase: DB,
  scope: RecipeScope,
  recipeId: string,
): Promise<{ success: boolean; error?: string }> {
  let query = loose(supabase).from('nutrition_recipes').delete().eq('id', recipeId)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function listCoachRecipes(
  supabase: DB,
  scope: RecipeScope,
): Promise<RecipeRow[]> {
  let query = loose(supabase).from('nutrition_recipes').select(RECIPE_COLUMNS)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { data } = await query.order('created_at', { ascending: false })
  return (data ?? []) as unknown as RecipeRow[]
}

export async function searchCoachRecipes(
  supabase: DB,
  scope: RecipeScope,
  q: string,
  limit = 5,
): Promise<Pick<RecipeRow, 'id' | 'name' | 'image_url'>[]> {
  let query = loose(supabase)
    .from('nutrition_recipes')
    .select('id, name, image_url')
    .ilike('name', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(limit)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { data } = await query
  return (data ?? []) as Pick<RecipeRow, 'id' | 'name' | 'image_url'>[]
}

export async function assignRecipeToClients(
  supabase: DB,
  recipeId: string,
  clientIds: string[],
  assignedBy: string,
): Promise<{ success: boolean; error?: string }> {
  if (clientIds.length === 0) return { success: true }

  const rows = clientIds.map((clientId) => ({
    recipe_id: recipeId,
    client_id: clientId,
    assigned_by: assignedBy,
  }))

  const { error } = await loose(supabase)
    .from('nutrition_recipe_assignments')
    .upsert(rows, { onConflict: 'recipe_id,client_id', ignoreDuplicates: true })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function unassignRecipe(
  supabase: DB,
  recipeId: string,
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await loose(supabase)
    .from('nutrition_recipe_assignments')
    .delete()
    .eq('recipe_id', recipeId)
    .eq('client_id', clientId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function listAssignedRecipesForClient(
  supabase: DB,
  clientId: string,
): Promise<RecipeRow[]> {
  const { data } = await loose(supabase)
    .from('nutrition_recipe_assignments')
    .select(`recipe:nutrition_recipes(${RECIPE_COLUMNS})`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  type JoinRow = { recipe: RecipeRow | null }
  return ((data ?? []) as unknown as JoinRow[])
    .map((row) => row.recipe)
    .filter((recipe): recipe is RecipeRow => recipe !== null)
}
