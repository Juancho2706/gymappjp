import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'

/**
 * E5-19 · Recetas (lado COACH) — espejo de
 * `apps/web/src/services/nutrition-recipes.service.ts` + los server actions
 * `.../coach/nutrition-plans/_actions/recipes.actions.ts`.
 *
 * Una receta = idea inspiracional (`name` + `ingredients_text` + `instructions`
 * + `image_url` opcional). NO tiene macros, NO computa adherencia. El coach las
 * crea/edita/borra y las asigna a N alumnos.
 *
 * Escritura DIRECTA vía PostgREST bajo la sesión del coach (mismo patrón que el
 * resto del builder mobile): la RLS `nutrition_recipes_coach_all`
 * (`coach_id = auth.uid()`, USING+WITH CHECK) y `nutrition_recipe_assignments_coach_all`
 * (asignar SOLO a alumnos propios) son el guardián real — la web usa un supabase
 * client user-scoped con la misma RLS, así que esto es equivalente y seguro.
 *
 * Scope: mobile SIEMPRE opera en scope coach standalone (`coach_id = auth.uid()`,
 * `team_id = null`). Los coaches enterprise resuelven recetas por `coach_id` en la
 * web también (el scope `team` es exclusivo del workspace `coach_team`, que la app
 * móvil no modela). La tabla `nutrition_recipes` NO tiene `org_id`.
 * Migración: supabase/migrations/20260618180005_nutrition_recipes_and_assignments.sql
 */

export type CoachRecipeRow = {
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

export type RecipeInput = {
  name: string
  ingredients_text?: string | null
  instructions?: string | null
  image_url?: string | null
}

const RECIPE_COLUMNS =
  'id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at'

const RECIPE_MEDIA_BUCKET = 'recipe-media'

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Lista las recetas del coach (scope standalone), más recientes primero. */
export async function listCoachRecipes(): Promise<CoachRecipeRow[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('nutrition_recipes')
    .select(RECIPE_COLUMNS)
    .eq('coach_id', coachId)
    .is('team_id', null)
    .order('created_at', { ascending: false })
  return (data as CoachRecipeRow[] | null) ?? []
}

function normalizeInput(input: RecipeInput): {
  name: string
  ingredients_text: string | null
  instructions: string | null
  image_url: string | null
} {
  return {
    name: input.name.trim(),
    ingredients_text: input.ingredients_text?.trim() || null,
    instructions: input.instructions?.trim() || null,
    image_url: input.image_url?.trim() || null,
  }
}

/** Crea una receta en el scope del coach. */
export async function createCoachRecipe(
  input: RecipeInput
): Promise<{ ok: boolean; recipe?: CoachRecipeRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const patch = normalizeInput(input)
  if (patch.name.length < 1) return { ok: false, error: 'El nombre es obligatorio.' }

  const { data, error } = await supabase
    .from('nutrition_recipes')
    .insert({ coach_id: coachId, team_id: null, ...patch })
    .select(RECIPE_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo crear la receta.' }
  return { ok: true, recipe: data as CoachRecipeRow }
}

/** Actualiza una receta del coach (WHERE acotado al scope + RLS). */
export async function updateCoachRecipe(
  recipeId: string,
  input: RecipeInput
): Promise<{ ok: boolean; recipe?: CoachRecipeRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const patch = normalizeInput(input)
  if (patch.name.length < 1) return { ok: false, error: 'El nombre es obligatorio.' }

  const { data, error } = await supabase
    .from('nutrition_recipes')
    .update(patch)
    .eq('id', recipeId)
    .eq('coach_id', coachId)
    .is('team_id', null)
    .select(RECIPE_COLUMNS)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Receta no encontrada.' }
  return { ok: true, recipe: data as CoachRecipeRow }
}

/** Borra una receta del coach. Las asignaciones caen por ON DELETE CASCADE (FK). */
export async function deleteCoachRecipe(recipeId: string): Promise<{ ok: boolean; error?: string }> {
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
}

/**
 * Asigna una receta a N alumnos (idempotente — upsert por (recipe_id, client_id),
 * ignora duplicados). `assigned_by` = coach de la sesión (audit). RLS valida que
 * los `client_id` sean alumnos del coach.
 */
export async function assignRecipeToClients(
  recipeId: string,
  clientIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (!clientIds.length) return { ok: true }

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
}

/**
 * Sube una foto de receta desde el device al bucket público `recipe-media`.
 * RLS `recipe_media_owner_insert`: la carpeta raíz DEBE ser `auth.uid()` del coach
 * (write-path scoping) — por eso el path es `{uid}/{ts}.jpg`. Mismo patrón que
 * `uploadExerciseImage`. Comprimimos a JPEG 1080px para respetar el límite de 2 MB
 * y el allowlist de mimes (jpeg/png/webp) del bucket. Devuelve la URL pública
 * (cache-busted) para guardar en `image_url`.
 */
export async function uploadRecipeImage(
  uri: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    if (!manipulated.base64) return { ok: false, error: 'No se pudo procesar la imagen.' }
    const path = `${coachId}/${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage
      .from(RECIPE_MEDIA_BUCKET)
      .upload(path, decode(manipulated.base64), { contentType: 'image/jpeg', upsert: true })
    if (upErr) return { ok: false, error: upErr.message }
    const { data } = supabase.storage.from(RECIPE_MEDIA_BUCKET).getPublicUrl(path)
    return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al subir la imagen.' }
  }
}
