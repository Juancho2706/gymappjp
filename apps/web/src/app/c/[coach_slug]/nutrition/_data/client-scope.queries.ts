import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Scope autoritativo del alumno para preferencias y rollout técnico.
 * React.cache deduplica por request; RLS limita la lectura a la fila propia.
 */
export const getClientScope = cache(
  async (
    clientId: string,
  ): Promise<{ coachId: string | null; teamId: string | null; orgId: string | null }> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('clients')
      .select('coach_id, team_id, org_id')
      .eq('id', clientId)
      .maybeSingle()

    return {
      coachId: (data?.coach_id ?? null) as string | null,
      teamId: (data?.team_id ?? null) as string | null,
      orgId: (data?.org_id ?? null) as string | null,
    }
  },
)

/**
 * Nombre completo del alumno para el saludo del héroe de Nutrición V2. React.cache
 * deduplica por request; RLS limita la lectura a la fila propia. Devuelve null si no
 * hay fila o nombre — la UI cae a un saludo sin nombre.
 */
export const getClientDisplayName = cache(async (clientId: string): Promise<string | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('full_name')
    .eq('id', clientId)
    .maybeSingle()
  const name = (data?.full_name ?? null) as string | null
  return name && name.trim().length > 0 ? name : null
})
