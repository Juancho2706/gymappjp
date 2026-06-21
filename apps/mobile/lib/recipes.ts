import { supabase } from './supabase'

/**
 * Recetas del coach (mobile) — espejo del feature L de la web
 * (apps/web/src/services/nutrition-recipes.service.ts + recipes.actions.ts).
 *
 * Una receta es una idea inspiracional: `name` + `ingredients_text` (+ `instructions`
 * e `image_url` opcionales). NO tiene macros, NO computa adherencia. Es BASE-tier
 * (viene incluida en el módulo de nutrición — sin gating de módulo de pago).
 *
 * Lecturas/escrituras DIRECTAS por PostgREST bajo la sesión del coach. RLS refuerza
 * el aislamiento (coach_id = auth.uid()). Mobile = coach STANDALONE v1 → siempre se
 * usa el scope coach (team_id = null); el contexto team/pool no se resuelve acá
 * (igual que las otras libs de mobile). El server action web corre bajo la sesión del
 * coach también, así que los GRANT de columna para `authenticated` ya existen — sin migración.
 *
 * Subida de imagen: espejo del check-in (expo-image-picker + expo-image-manipulator →
 * sube el arrayBuffer al bucket público `recipe-media` en `{coachUid}/{uuid}.jpg`).
 * Mutaciones tolerantes (try/catch); los loaders apagan en finally en la pantalla.
 */

const RECIPE_MEDIA_BUCKET = 'recipe-media'

export interface RecipeRow {
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

async function currentCoachId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/** Lista las recetas del coach (scope coach standalone), más recientes primero. */
export async function listCoachRecipes(): Promise<RecipeRow[]> {
  try {
    const coachId = await currentCoachId()
    if (!coachId) return []
    const { data } = await supabase
      .from('nutrition_recipes')
      .select(RECIPE_COLUMNS)
      .eq('coach_id', coachId)
      .is('team_id', null)
      .order('created_at', { ascending: false })
    return (data ?? []) as RecipeRow[]
  } catch {
    return []
  }
}

export interface RecipeInput {
  name: string
  ingredients_text?: string | null
  instructions?: string | null
  image_url?: string | null
}

/** Crea una receta en el scope coach (team_id null). */
export async function createRecipe(
  input: RecipeInput
): Promise<{ ok: boolean; recipe?: RecipeRow; error?: string }> {
  try {
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'El nombre es obligatorio.' }
    const coachId = await currentCoachId()
    if (!coachId) return { ok: false, error: 'No autenticado.' }
    const { data, error } = await supabase
      .from('nutrition_recipes')
      .insert({
        coach_id: coachId,
        team_id: null,
        name,
        ingredients_text: input.ingredients_text?.trim() || null,
        instructions: input.instructions?.trim() || null,
        image_url: input.image_url?.trim() || null,
      })
      .select(RECIPE_COLUMNS)
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo crear la receta.' }
    return { ok: true, recipe: data as RecipeRow }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear la receta.' }
  }
}

/** Actualiza una receta (acotada al scope coach + RLS). */
export async function updateRecipe(
  recipeId: string,
  input: RecipeInput
): Promise<{ ok: boolean; recipe?: RecipeRow; error?: string }> {
  try {
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'El nombre es obligatorio.' }
    const coachId = await currentCoachId()
    if (!coachId) return { ok: false, error: 'No autenticado.' }
    const { data, error } = await supabase
      .from('nutrition_recipes')
      .update({
        name,
        ingredients_text: input.ingredients_text?.trim() || null,
        instructions: input.instructions?.trim() || null,
        image_url: input.image_url?.trim() || null,
      })
      .eq('id', recipeId)
      .eq('coach_id', coachId)
      .is('team_id', null)
      .select(RECIPE_COLUMNS)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Receta no encontrada.' }
    return { ok: true, recipe: data as RecipeRow }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo actualizar la receta.' }
  }
}

/** Borra una receta del scope coach. Las asignaciones caen por ON DELETE CASCADE. */
export async function deleteRecipe(recipeId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const coachId = await currentCoachId()
    if (!coachId) return { ok: false, error: 'No autenticado.' }
    const { error } = await supabase
      .from('nutrition_recipes')
      .delete()
      .eq('id', recipeId)
      .eq('coach_id', coachId)
      .is('team_id', null)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar la receta.' }
  }
}

export interface RecipeAssignClient {
  id: string
  full_name: string
}

/** Alumnos activos del coach (selector multi-select para compartir). */
export async function listAssignClients(): Promise<RecipeAssignClient[]> {
  try {
    const coachId = await currentCoachId()
    if (!coachId) return []
    const { data } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('coach_id', coachId)
      .eq('is_archived', false)
      .order('full_name')
    return ((data ?? []) as any[]).map((c) => ({
      id: c.id,
      full_name: c.full_name ?? 'Sin nombre',
    }))
  } catch {
    return []
  }
}

/**
 * Asigna (comparte) una receta a N alumnos (idempotente — upsert por (recipe_id, client_id)).
 * `assigned_by` queda como audit del coach.
 */
export async function assignRecipeToClients(
  recipeId: string,
  clientIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (clientIds.length === 0) return { ok: true }
    const coachId = await currentCoachId()
    if (!coachId) return { ok: false, error: 'No autenticado.' }
    const rows = clientIds.map((clientId) => ({
      recipe_id: recipeId,
      client_id: clientId,
      assigned_by: coachId,
    }))
    const { error } = await supabase
      .from('nutrition_recipe_assignments')
      .upsert(rows, { onConflict: 'recipe_id,client_id', ignoreDuplicates: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo compartir la receta.' }
  }
}

/**
 * Sube una imagen (uri local ya comprimida a JPEG) al bucket público `recipe-media`
 * en `{coachUid}/{uuid}.jpg` y devuelve la URL pública. Espejo del upload de check-in
 * (fetch(uri) → arrayBuffer → storage.upload con contentType explícito). Best-effort:
 * devuelve null si falla, la receta se guarda igual sin imagen.
 */
export async function uploadRecipePhoto(uri: string): Promise<string | null> {
  try {
    const coachId = await currentCoachId()
    if (!coachId) return null
    const path = `${coachId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`
    const response = await fetch(uri)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const { error } = await supabase.storage
      .from(RECIPE_MEDIA_BUCKET)
      .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
    if (error) return null
    const { data } = supabase.storage.from(RECIPE_MEDIA_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}
