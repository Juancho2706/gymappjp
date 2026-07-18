'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  assignRecipeToClients,
  unassignRecipe,
  saveStructuredRecipe,
  getRecipeWithIngredients,
  type RecipeRow,
  type RecipeScope,
} from '@/services/nutrition-recipes.service'

/**
 * Server actions del sistema vivo de recetas.
 *
 * - ideas Base: texto libre, sin entitlement profesional;
 * - recetas estructuradas: requieren `nutrition_exchanges` y se guardan mediante
 *   una RPC SECURITY INVOKER transaccional.
 */

type ActionResult = { success: boolean; error?: string }

const RecipeBaseSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(160),
  ingredients_text: z.string().trim().max(8000).nullish(),
  instructions: z.string().trim().max(8000).nullish(),
  image_url: z.string().trim().url('URL de imagen inválida.').max(2048).nullish(),
})

const CreateRecipeSchema = RecipeBaseSchema

const UpdateRecipeSchema = z.object({
  recipeId: z.guid(),
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(160).optional(),
  ingredients_text: z.string().trim().max(8000).nullish(),
  instructions: z.string().trim().max(8000).nullish(),
  image_url: z.string().trim().url('URL de imagen inválida.').max(2048).nullish(),
})

const StructuredIngredientSchema = z.object({
  food_id: z.guid(),
  quantity: z.number().positive('La cantidad debe ser mayor a cero.').max(100000),
  unit: z.enum(['g', 'ml', 'un']),
  note: z.string().trim().max(500).nullish(),
  order_index: z.number().int().min(0).max(199),
})

const SaveStructuredRecipeSchema = z.object({
  recipe_id: z.guid().nullish(),
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(160),
  description: z.string().trim().max(1000).nullish(),
  instructions: z.string().trim().max(8000).nullish(),
  image_url: z.string().trim().url('URL de imagen inválida.').max(2048).nullish(),
  servings: z.number().positive('Las porciones deben ser mayores a cero.').max(1000),
  prep_time_minutes: z.number().int().min(0).max(10080).nullish(),
  category: z.string().trim().max(80).nullish(),
  ingredients: z.array(StructuredIngredientSchema).min(1, 'Agrega al menos un ingrediente.').max(200),
})

const GetStructuredRecipeSchema = z.object({ recipeId: z.guid() })
const DeleteRecipeSchema = z.object({ recipeId: z.guid() })
const AssignRecipeSchema = z.object({
  recipeId: z.guid(),
  clientIds: z.array(z.guid()).min(1, 'Selecciona al menos un alumno.').max(500),
})
const UnassignRecipeSchema = z.object({ recipeId: z.guid(), clientId: z.guid() })

async function requireCoachScope(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; scope: RecipeScope; coachId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const coachId = claims?.claims?.sub as string | undefined
  if (!coachId) return { ok: false, error: 'No autorizado.' }

  const workspace = await resolvePreferredWorkspace(supabase, coachId)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  return { ok: true, supabase, coachId, scope: { coachId, teamId } }
}

function zodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('. ')
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function revalidateCoachRecipePaths() {
  revalidatePath('/coach/nutrition-plans')
}

export async function createRecipeAction(
  input: z.input<typeof CreateRecipeSchema>,
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = CreateRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    const result = await createRecipe(ctx.supabase, ctx.scope, {
      name: parsed.data.name,
      ingredients_text: parsed.data.ingredients_text ?? null,
      instructions: parsed.data.instructions ?? null,
      image_url: parsed.data.image_url ?? null,
    })
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] createRecipeAction', error)
    return { success: false, error: errorMessage(error, 'No se pudo crear la receta.') }
  }
}

export async function updateRecipeAction(
  input: z.input<typeof UpdateRecipeSchema>,
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = UpdateRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    const { recipeId, ...patch } = parsed.data
    const result = await updateRecipe(ctx.supabase, ctx.scope, recipeId, patch)
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] updateRecipeAction', error)
    return { success: false, error: errorMessage(error, 'No se pudo actualizar la receta.') }
  }
}

export async function saveStructuredRecipeAction(
  input: z.input<typeof SaveStructuredRecipeSchema>,
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = SaveStructuredRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    await assertModule(ctx.supabase, 'nutrition_exchanges', {
      coachId: ctx.coachId,
      teamId: ctx.scope.teamId,
    })
    const result = await saveStructuredRecipe(ctx.supabase, ctx.scope, {
      ...parsed.data,
      recipe_id: parsed.data.recipe_id ?? null,
      description: parsed.data.description ?? null,
      instructions: parsed.data.instructions ?? null,
      image_url: parsed.data.image_url ?? null,
      prep_time_minutes: parsed.data.prep_time_minutes ?? null,
      category: parsed.data.category ?? null,
      ingredients: parsed.data.ingredients.map((ingredient) => ({
        ...ingredient,
        note: ingredient.note ?? null,
      })),
    })
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] saveStructuredRecipeAction', error)
    const message = errorMessage(error, 'No se pudo guardar la receta profesional.')
    return {
      success: false,
      error: message.includes('Modulo no habilitado')
        ? 'Activa el módulo profesional de Nutrición para crear recetas cuantificables.'
        : message,
    }
  }
}

export async function getStructuredRecipeAction(
  input: z.input<typeof GetStructuredRecipeSchema>,
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = GetStructuredRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    await assertModule(ctx.supabase, 'nutrition_exchanges', {
      coachId: ctx.coachId,
      teamId: ctx.scope.teamId,
    })
    const recipe = await getRecipeWithIngredients(ctx.supabase, parsed.data.recipeId)
    if (!recipe || recipe.recipe_mode !== 'structured') {
      return { success: false, error: 'Receta profesional no encontrada.' }
    }
    return { success: true, recipe }
  } catch (error) {
    return { success: false, error: errorMessage(error, 'No se pudo cargar la receta.') }
  }
}

export async function deleteRecipeAction(
  input: z.input<typeof DeleteRecipeSchema>,
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = DeleteRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    const result = await deleteRecipe(ctx.supabase, ctx.scope, parsed.data.recipeId)
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] deleteRecipeAction', error)
    return { success: false, error: errorMessage(error, 'No se pudo eliminar la receta.') }
  }
}

export async function assignRecipeAction(
  input: z.input<typeof AssignRecipeSchema>,
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = AssignRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    const result = await assignRecipeToClients(
      ctx.supabase,
      parsed.data.recipeId,
      parsed.data.clientIds,
      ctx.coachId,
    )
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] assignRecipeAction', error)
    return { success: false, error: errorMessage(error, 'No se pudo asignar la receta.') }
  }
}

export async function unassignRecipeAction(
  input: z.input<typeof UnassignRecipeSchema>,
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = UnassignRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }

  try {
    const result = await unassignRecipe(ctx.supabase, parsed.data.recipeId, parsed.data.clientId)
    if (result.success) revalidateCoachRecipePaths()
    return result
  } catch (error) {
    console.error('[recipes] unassignRecipeAction', error)
    return { success: false, error: errorMessage(error, 'No se pudo quitar la receta.') }
  }
}
