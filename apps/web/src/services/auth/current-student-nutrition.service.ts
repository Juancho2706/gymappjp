import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type CurrentStudentNutritionScope = {
  coachId: string | null
  teamId: string | null
  orgId: string | null
}

/** Neutral session/scope gateway for Nutrition V2; it has no V1 route dependency. */
export const getCurrentStudentNutritionSession = cache(async () => {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const user = claims?.claims?.sub ? { id: claims.claims.sub as string } : null
  if (!user) return { user: null, hasClientRow: false }

  const { data: client } = await supabase.from('clients').select('id').eq('id', user.id).maybeSingle()
  return { user, hasClientRow: Boolean(client) }
})

export const getCurrentStudentNutritionScope = cache(
  async (clientId: string): Promise<CurrentStudentNutritionScope> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('clients')
      .select('coach_id, team_id, org_id')
      .eq('id', clientId)
      .maybeSingle()
    return {
      coachId: data?.coach_id ?? null,
      teamId: data?.team_id ?? null,
      orgId: data?.org_id ?? null,
    }
  },
)

export const getCurrentStudentNutritionDisplayName = cache(async (clientId: string): Promise<string | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle()
  const name = data?.full_name ?? null
  return name && name.trim().length > 0 ? name : null
})
