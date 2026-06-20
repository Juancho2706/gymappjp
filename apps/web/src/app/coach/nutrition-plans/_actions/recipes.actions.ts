'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  assignRecipeToClients,
  unassignRecipe,
  type RecipeRow,
  type RecipeScope,
} from '@/services/nutrition-recipes.service'

/**
 * Server actions del feature L — "Recetas" (lado COACH).
 * Archivo `'use server'`: SOLO exporta async functions. Los schemas Zod viven inline
 * (no exportados) — exportar un valor/const desde un `'use server'` rompe en runtime.
 *
 * Cada action: Zod v4 (server) + resolución de scope coach/team desde auth.uid()
 * (NUNCA del body) + revalidatePath. RLS refuerza el aislamiento en DB.
 *
 * TODO(image-pipeline): la subida de imagen (privado-bucket WebP) NO está cableada acá.
 * Por ahora se acepta `image_url` como string ya resuelto. Cuando se conecte, reusar
 * el pipeline de fotos de check-in (commit 2b9911e): convertir a WebP, subir al bucket
 * privado, y pasar la URL/firma resultante como `image_url`. Hook sugerido:
 * uploadRecipeImageAction(formData) -> { image_url } previo a create/update.
 */

type ActionResult = { success: boolean; error?: string }

// ── Zod (inline, NO exportar) ────────────────────────────────────────────────
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

const DeleteRecipeSchema = z.object({ recipeId: z.guid() })

const AssignRecipeSchema = z.object({
  recipeId: z.guid(),
  clientIds: z.array(z.guid()).min(1, 'Seleccioná al menos un alumno.').max(500),
})

const UnassignRecipeSchema = z.object({
  recipeId: z.guid(),
  clientId: z.guid(),
})

// ── helpers ──────────────────────────────────────────────────────────────────
async function requireCoachScope(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; scope: RecipeScope; coachId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado.' }
  const workspace = await resolvePreferredWorkspace(supabase, user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  return { ok: true, supabase, coachId: user.id, scope: { coachId: user.id, teamId } }
}

function zodError(e: z.ZodError): string {
  return e.issues.map((i) => i.message).join('. ')
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

function revalidateCoachRecipePaths() {
  revalidatePath('/coach/nutrition-plans')
}

// ── actions ──────────────────────────────────────────────────────────────────
export async function createRecipeAction(
  input: z.input<typeof CreateRecipeSchema>
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = CreateRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }
  try {
    const res = await createRecipe(ctx.supabase, ctx.scope, {
      name: parsed.data.name,
      ingredients_text: parsed.data.ingredients_text ?? null,
      instructions: parsed.data.instructions ?? null,
      image_url: parsed.data.image_url ?? null,
    })
    if (res.success) revalidateCoachRecipePaths()
    return res
  } catch (e) {
    console.error('[recipes] createRecipeAction', e)
    return { success: false, error: errorMessage(e, 'No se pudo crear la receta.') }
  }
}

export async function updateRecipeAction(
  input: z.input<typeof UpdateRecipeSchema>
): Promise<ActionResult & { recipe?: RecipeRow }> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = UpdateRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }
  try {
    const { recipeId, ...patch } = parsed.data
    const res = await updateRecipe(ctx.supabase, ctx.scope, recipeId, patch)
    if (res.success) revalidateCoachRecipePaths()
    return res
  } catch (e) {
    console.error('[recipes] updateRecipeAction', e)
    return { success: false, error: errorMessage(e, 'No se pudo actualizar la receta.') }
  }
}

export async function deleteRecipeAction(
  input: z.input<typeof DeleteRecipeSchema>
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = DeleteRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }
  try {
    const res = await deleteRecipe(ctx.supabase, ctx.scope, parsed.data.recipeId)
    if (res.success) revalidateCoachRecipePaths()
    return res
  } catch (e) {
    console.error('[recipes] deleteRecipeAction', e)
    return { success: false, error: errorMessage(e, 'No se pudo eliminar la receta.') }
  }
}

export async function assignRecipeAction(
  input: z.input<typeof AssignRecipeSchema>
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = AssignRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }
  try {
    const res = await assignRecipeToClients(
      ctx.supabase,
      parsed.data.recipeId,
      parsed.data.clientIds,
      ctx.coachId
    )
    if (res.success) revalidateCoachRecipePaths()
    return res
  } catch (e) {
    console.error('[recipes] assignRecipeAction', e)
    return { success: false, error: errorMessage(e, 'No se pudo asignar la receta.') }
  }
}

export async function unassignRecipeAction(
  input: z.input<typeof UnassignRecipeSchema>
): Promise<ActionResult> {
  const ctx = await requireCoachScope()
  if (!ctx.ok) return { success: false, error: ctx.error }
  const parsed = UnassignRecipeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: zodError(parsed.error) }
  try {
    const res = await unassignRecipe(ctx.supabase, parsed.data.recipeId, parsed.data.clientId)
    if (res.success) revalidateCoachRecipePaths()
    return res
  } catch (e) {
    console.error('[recipes] unassignRecipeAction', e)
    return { success: false, error: errorMessage(e, 'No se pudo quitar la receta.') }
  }
}
