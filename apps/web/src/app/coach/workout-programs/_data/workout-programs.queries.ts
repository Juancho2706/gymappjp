import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'
import { getCoachActiveTeamIds } from '@/services/auth/team.service'
import type { ProgramListModel } from '../libraryStats'

export const getWorkoutProgramsWithClients = cache(async (coachId: string, orgId: string | null) => {
    const supabase = await createClient()
    let programsQuery = supabase
        .from('workout_programs')
        .select(LIBRARY_PROGRAM_LIST_SELECT)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

    programsQuery = orgId ? programsQuery.eq('org_id', orgId) : programsQuery.is('org_id', null)

    // Standalone: ensanchar el picker a los alumnos del pool del team (igual que la lista de clientes).
    // RLS es el techo -> un filtro de mas solo puede sub-mostrar, nunca filtrar ajenos.
    const teamIds = orgId ? [] : await getCoachActiveTeamIds(supabase, coachId)
    let clientsQuery = supabase
        .from('clients')
        .select('id, full_name, workout_programs(id, name, is_active)')
        .eq('is_active', true)
        .order('full_name')

    if (teamIds.length > 0) {
        clientsQuery = clientsQuery.is('org_id', null).or(`coach_id.eq.${coachId},team_id.in.(${teamIds.join(',')})`)
    } else {
        clientsQuery = clientsQuery.eq('coach_id', coachId)
        clientsQuery = orgId ? clientsQuery.eq('org_id', orgId) : clientsQuery.is('org_id', null)
    }

    const [programsResponse, clientsResponse] = await Promise.all([
        programsQuery,
        clientsQuery,
    ])

    return {
        programs: (programsResponse.data ?? []) as unknown as ProgramListModel[],
        clients: clientsResponse.data ?? [],
    }
})
