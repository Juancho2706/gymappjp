import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Servicio del feature L — "Recetas" (ideas simples de nutrición).
 *
 * Una receta es una idea inspiracional: `name` + `ingredients_text` + `instructions`
 * (+ `image_url` opcional). NO tiene macros, NO computa adherencia. El coach las crea
 * scope `coach` XOR `team` (espejo de las otras tablas de nutrición), y las asigna a
 * N alumnos. El alumno las ve como inspiración (solo lectura).
 *
 * Capa: services/ — recibe el supabase client request-scoped del caller (_data / _actions).
 * El scoping coach/team se aplica explícito acá; RLS lo refuerza en DB.
 */

export type RecipeScope = {
  coachId: string
  /** Workspace team ACTIVO; null => standalone/enterprise (scope coach). */
  teamId: string | null
}

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

const RECIPE_COLUMNS =
  'id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at'

type DB = SupabaseClient<Database>

/**
 * Aplica el scope coach XOR team a una row nueva.
 * - team activo  => team_id set, coach_id = autor (audit) — RLS valida membresía del team.
 * - standalone   => coach_id set, team_id null.
 */
function scopeColumns(scope: RecipeScope): { coach_id: string; team_id: string | null } {
  return { coach_id: scope.coachId, team_id: scope.teamId }
}

/** Crea una receta en el scope activo (coach XOR team). */
export async function createRecipe(
  supabase: DB,
  scope: RecipeScope,
  input: CreateRecipeInput
): Promise<{ success: boolean; recipe?: RecipeRow; error?: string }> {
  const { data, error } = await supabase
    .from('nutrition_recipes')
    .insert({
      ...scopeColumns(scope),
      name: input.name,
      ingredients_text: input.ingredients_text ?? null,
      instructions: input.instructions ?? null,
      image_url: input.image_url ?? null,
    })
    .select(RECIPE_COLUMNS)
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? 'No se pudo crear la receta.' }
  }
  return { success: true, recipe: data as RecipeRow }
}

/**
 * Actualiza una receta. El WHERE va acotado al scope activo (coach XOR team) además
 * del RLS, para que un coach no edite recetas de otro team aunque pertenezca a ambos.
 */
export async function updateRecipe(
  supabase: DB,
  scope: RecipeScope,
  recipeId: string,
  input: UpdateRecipeInput
): Promise<{ success: boolean; recipe?: RecipeRow; error?: string }> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.ingredients_text !== undefined) patch.ingredients_text = input.ingredients_text
  if (input.instructions !== undefined) patch.instructions = input.instructions
  if (input.image_url !== undefined) patch.image_url = input.image_url

  if (Object.keys(patch).length === 0) {
    return { success: false, error: 'Nada que actualizar.' }
  }

  let query = supabase.from('nutrition_recipes').update(patch).eq('id', recipeId)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { data, error } = await query.select(RECIPE_COLUMNS).maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Receta no encontrada.' }
  return { success: true, recipe: data as RecipeRow }
}

/** Borra una receta del scope activo. Las asignaciones caen por ON DELETE CASCADE (FK). */
export async function deleteRecipe(
  supabase: DB,
  scope: RecipeScope,
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  let query = supabase.from('nutrition_recipes').delete().eq('id', recipeId)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/** Lista las recetas del scope activo (coach XOR team), más recientes primero. */
export async function listCoachRecipes(
  supabase: DB,
  scope: RecipeScope
): Promise<RecipeRow[]> {
  let query = supabase.from('nutrition_recipes').select(RECIPE_COLUMNS)
  query = scope.teamId
    ? query.eq('team_id', scope.teamId)
    : query.eq('coach_id', scope.coachId).is('team_id', null)

  const { data } = await query.order('created_at', { ascending: false })
  return (data ?? []) as RecipeRow[]
}

/**
 * Asigna una receta a N alumnos (idempotente — upsert por (recipe_id, client_id)).
 * `assignedBy` queda como audit del coach que asignó.
 */
export async function assignRecipeToClients(
  supabase: DB,
  recipeId: string,
  clientIds: string[],
  assignedBy: string
): Promise<{ success: boolean; error?: string }> {
  if (clientIds.length === 0) return { success: true }

  const rows = clientIds.map((clientId) => ({
    recipe_id: recipeId,
    client_id: clientId,
    assigned_by: assignedBy,
  }))

  const { error } = await supabase
    .from('nutrition_recipe_assignments')
    .upsert(rows, { onConflict: 'recipe_id,client_id', ignoreDuplicates: true })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/** Quita la asignación de una receta a un alumno. */
export async function unassignRecipe(
  supabase: DB,
  recipeId: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('nutrition_recipe_assignments')
    .delete()
    .eq('recipe_id', recipeId)
    .eq('client_id', clientId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Recetas asignadas a UN alumno (vista del alumno — inspiración, solo lectura).
 * RLS limita a las asignaciones del propio `client_id`.
 */
export async function listAssignedRecipesForClient(
  supabase: DB,
  clientId: string
): Promise<RecipeRow[]> {
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
