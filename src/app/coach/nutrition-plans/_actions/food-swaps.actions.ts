'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const upsertSwapGroupSchema = z.object({
  id: z.string().uuid().optional(),
  coachId: z.string().uuid(),
  name: z.string().min(1).max(100),
  foodIds: z.array(z.string().uuid()).min(2, 'Un grupo debe tener al menos 2 alimentos'),
})

export async function upsertFoodSwapGroup(
  raw: z.infer<typeof upsertSwapGroupSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = upsertSwapGroupSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { id, coachId, name, foodIds } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== coachId) return { success: false, error: 'No autorizado' }

  if (id) {
    const { error } = await supabase
      .from('food_swap_groups')
      .update({ name, food_ids: foodIds, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/coach/nutrition-plans')
    return { success: true, id }
  }

  const { data, error } = await supabase
    .from('food_swap_groups')
    .insert({ coach_id: coachId, name, food_ids: foodIds })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Error al crear grupo' }
  revalidatePath('/coach/nutrition-plans')
  return { success: true, id: data.id }
}

export async function deleteFoodSwapGroup(
  coachId: string,
  groupId: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== coachId) return { success: false }
  await supabase.from('food_swap_groups').delete().eq('id', groupId).eq('coach_id', coachId)
  revalidatePath('/coach/nutrition-plans')
  return { success: true }
}

export async function getCoachFoodSwapGroups(coachId: string): Promise<
  Array<{ id: string; name: string; food_ids: string[] }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('food_swap_groups')
    .select('id, name, food_ids')
    .eq('coach_id', coachId)
    .order('name')
  return (data ?? []) as Array<{ id: string; name: string; food_ids: string[] }>
}
