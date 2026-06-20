'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  toggleShoppingItem,
  addManualItem,
  removeManualItem,
} from '@/services/nutrition-shopping.service'

const toggleSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
  label: z.string().min(1).max(200),
  category: z.string().max(120).nullable().optional(),
  isChecked: z.boolean(),
  coachSlug: z.string().min(1),
})

const addManualSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
  label: z.string().min(1).max(200),
  category: z.string().max(120).nullable().optional(),
  coachSlug: z.string().min(1),
})

const removeManualSchema = z.object({
  clientId: z.string().uuid(),
  itemId: z.string().uuid(),
  coachSlug: z.string().min(1),
})

/** Marca/desmarca una línea (derivada o manual) de la lista de compras. */
export async function toggleShoppingItemAction(
  raw: z.infer<typeof toggleSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = toggleSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Datos inválidos' }

  const { clientId, planId, label, category, isChecked, coachSlug } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, error: 'No autorizado' }

  const result = await toggleShoppingItem(supabase, {
    clientId,
    planId,
    label,
    category: category ?? null,
    isChecked,
  })
  if (result.success) revalidatePath(`/c/${coachSlug}/nutrition`)
  return result
}

/** Agrega un ítem manual a la lista de compras. */
export async function addManualShoppingItemAction(
  raw: z.infer<typeof addManualSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = addManualSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Datos inválidos' }

  const { clientId, planId, label, category, coachSlug } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, error: 'No autorizado' }

  const result = await addManualItem(supabase, {
    clientId,
    planId,
    label,
    category: category ?? null,
  })
  if (result.success) revalidatePath(`/c/${coachSlug}/nutrition`)
  return result
}

/** Borra un ítem manual de la lista de compras. */
export async function removeManualShoppingItemAction(
  raw: z.infer<typeof removeManualSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = removeManualSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Datos inválidos' }

  const { clientId, itemId, coachSlug } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, error: 'No autorizado' }

  const result = await removeManualItem(supabase, clientId, itemId)
  if (result.success) revalidatePath(`/c/${coachSlug}/nutrition`)
  return result
}
