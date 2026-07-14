'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  NUTRITION_MEAL_SLOTS,
  type NutritionMealSlot,
} from '@eva/nutrition-engine'
import {
  NutritionIntakeService,
  INTAKE_CAPTURE_METHODS,
  INTAKE_SOURCES,
  type IntakeCaptureMethod,
} from '@/services/nutrition-intake.service'

const addIntakeEntrySchema = z
  .object({
    coachSlug: z.string().min(1),
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    foodId: z.string().uuid().nullable().optional(),
    customName: z.string().trim().min(1).max(120).nullable().optional(),
    quantity: z.number().positive().max(100000),
    unit: z.enum(['g', 'ml', 'un']),
    source: z.enum(INTAKE_SOURCES).optional(),
    mealSlot: z.enum(NUTRITION_MEAL_SLOTS).optional(),
    captureMethod: z.enum(INTAKE_CAPTURE_METHODS).optional(),
  })
  .refine((value) => Boolean(value.foodId) || Boolean(value.customName), {
    message: 'Debes indicar un alimento del catálogo o un nombre libre.',
  })

const deleteIntakeEntrySchema = z.object({
  coachSlug: z.string().min(1),
  entryId: z.string().uuid(),
})

async function resolveAuthedClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub as string | undefined
  if (!userId) return null

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  return clientRow?.id ?? null
}

function captureMethodFromSource(source: string | undefined): IntakeCaptureMethod {
  if (source === 'recent') return 'recent'
  if (source === 'copy') return 'copy'
  if (source === 'quickadd') return 'barcode'
  return 'search'
}

export async function addIntakeEntryAction(
  raw: z.infer<typeof addIntakeEntrySchema>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = addIntakeEntrySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message }
  }

  const {
    coachSlug,
    logDate,
    foodId,
    customName,
    quantity,
    unit,
    source,
    mealSlot,
    captureMethod,
  } = parsed.data

  const supabase = await createClient()
  const clientId = await resolveAuthedClientId(supabase)
  if (!clientId) return { success: false, error: 'No autorizado' }

  let foodSnapshot = null
  if (foodId) {
    const { data: food } = await supabase
      .from('foods')
      .select('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, household_grams, household_label, is_liquid')
      .eq('id', foodId)
      .maybeSingle()
    if (!food) return { success: false, error: 'Alimento no encontrado' }
    foodSnapshot = food
  }

  const service = new NutritionIntakeService(supabase)
  const inserted = await service.insertIntakeEntry({
    clientId,
    logDate,
    foodId: foodId ?? null,
    customName: customName ?? null,
    quantity,
    unit,
    source: source ?? 'offplan',
    mealSlot: (mealSlot ?? 'other') as NutritionMealSlot,
    captureMethod: captureMethod ?? captureMethodFromSource(source),
    foodSnapshot,
  })

  if (!inserted) return { success: false, error: 'No se pudo registrar' }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  revalidatePath(`/c/${coachSlug}/dashboard`)
  return { success: true }
}

export async function deleteIntakeEntryAction(
  raw: z.infer<typeof deleteIntakeEntrySchema>,
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
