'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Returns all swap groups for the coach that contain at least one food
 * present in the client's active plan.
 * Only groups with ≥2 foods (including valid alternates) are returned.
 */
export async function getSwapGroupsForClient(
  clientId: string,
  coachId: string
): Promise<Array<{ id: string; name: string; food_ids: string[] }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return []

  const { data } = await supabase
    .from('food_swap_groups')
    .select('id, name, food_ids')
    .eq('coach_id', coachId)
    .order('name')

  return (data ?? []).filter((g) => (g.food_ids as string[]).length >= 2) as Array<{
    id: string
    name: string
    food_ids: string[]
  }>
}
