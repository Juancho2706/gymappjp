import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Scope del alumno (team / org) para alimentar el resolver de feature-prefs.
 * - `clientTeamId` ramifica el resolver a `team_feature_prefs` (base = team, §4.9).
 * - `clientOrgId` desactiva esa ramificacion (enterprise NO usa team-base).
 *
 * React.cache => dedupe por request. RLS es el techo: el alumno solo lee su propia fila
 * (`clients.id = auth.uid()`, identidad legacy de EVA).
 */
export const getClientScope = cache(
  async (clientId: string): Promise<{ teamId: string | null; orgId: string | null }> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('clients')
      .select('team_id, org_id')
      .eq('id', clientId)
      .maybeSingle()
    return {
      teamId: (data?.team_id ?? null) as string | null,
      orgId: (data?.org_id ?? null) as string | null,
    }
  },
)
