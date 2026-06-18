'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NutritionIntakeService } from '@/services/nutrition-intake.service'

/**
 * Off-plan intake (registro fuera de plan) — server actions del alumno.
 * El `clientId` SIEMPRE se deriva de la sesión (getClaims), nunca del body.
 */

const addIntakeEntrySchema = z
  .object({
    coachSlug: z.string().min(1),
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    foodId: z.string().uuid().nullable().optional(),
    customName: z.string().trim().min(1).max(120).nullable().optional(),
    quantity: z.number().positive().max(100000),
    unit: z.enum(['g', 'ml', 'un']),
    source: z.enum(['manual', 'recipe', 'plan']).optional(),
  })
  .refine((v) => Boolean(v.foodId) || Boolean(v.customName), {
    message: 'Debes indicar un alimento del catálogo o un nombre libre.',
  })

const deleteIntakeEntrySchema = z.object({
  coachSlug: z.string().min(1),
  entryId: z.string().uuid(),
})

/** Resuelve el id del alumno autenticado desde la sesión (no del body). */
async function resolveAuthedClientId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  return clientRow?.id ?? null
}

export async function addIntakeEntryAction(
  raw: z.infer<typeof addIntakeEntrySchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = addIntakeEntrySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message }
  }

  const { coachSlug, logDate, foodId, customName, quantity, unit, source } = parsed.data

  const supabase = await createClient()
  const clientId = await resolveAuthedClientId(supabase)
  if (!clientId) return { success: false, error: 'No autorizado' }

  // Si referencia el catálogo, validar que el alimento sea visible para el
  // alumno (RLS de foods) antes de insertar — evita food_id colgante.
  if (foodId) {
    const { data: food } = await supabase
      .from('foods')
      .select('id')
      .eq('id', foodId)
      .maybeSingle()
    if (!food) return { success: false, error: 'Alimento no encontrado' }
  }

  const service = new NutritionIntakeService(supabase)
  const inserted = await service.insertIntakeEntry({
    clientId,
    logDate,
    foodId: foodId ?? null,
    customName: customName ?? null,
    quantity,
    unit,
    source: source ?? 'manual',
  })

  if (!inserted) return { success: false, error: 'No se pudo registrar' }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)
  return { success: true }
}

export async function deleteIntakeEntryAction(
  raw: z.infer<typeof deleteIntakeEntrySchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = deleteIntakeEntrySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message }
  }

  const { coachSlug, entryId } = parsed.data

  const supabase = await createClient()
  const clientId = await resolveAuthedClientId(supabase)
  if (!clientId) return { success: false, error: 'No autorizado' }

  const service = new NutritionIntakeService(supabase)
  const ok = await service.deleteIntakeEntry(clientId, entryId)
  if (!ok) return { success: false, error: 'No se pudo eliminar' }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)
  return { success: true }
}
