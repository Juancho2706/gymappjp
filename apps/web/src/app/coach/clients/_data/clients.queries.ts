import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

export interface ClientWithProgram extends Client {
    workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]
}

export type CoachClientScope = { orgId: string | null; activeTeamId: string | null }

/**
 * Directorio del coach SCOPEADO por el workspace activo (sin cruzar contextos):
 *  - enterprise (orgId): solo clientes de esa org (coach_id propio + org_id).
 *  - team (activeTeamId): solo alumnos de ESE pool (RLS = techo).
 *  - standalone: solo clientes propios NO-pool NO-enterprise (team_id NULL, org_id NULL).
 * RLS es el techo -> un filtro estricto solo puede sub-mostrar, nunca filtrar de otros.
 */
export const getCoachClientsWithPrograms = cache(async (
    coachId: string,
    scope: CoachClientScope
): Promise<ClientWithProgram[]> => {
    const supabase = await createClient()
    let query = supabase
        .from('clients')
        .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
        .order('created_at', { ascending: false })

    if (scope.orgId) {
        query = query.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        query = query.is('org_id', null).eq('team_id', scope.activeTeamId)
    } else {
        query = query.eq('coach_id', coachId).is('org_id', null).is('team_id', null)
    }

    const { data } = await query
    return (data ?? []) as ClientWithProgram[]
})

export const getCoachClientsPulse = cache(async (coachId: string, orgId: string | null) => {
    return getCachedDirectoryPulse(coachId, orgId)
})
