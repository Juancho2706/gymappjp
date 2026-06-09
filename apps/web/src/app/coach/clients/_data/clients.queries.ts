import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import { getCoachActiveTeamIds } from '@/services/auth/team.service'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

export interface ClientWithProgram extends Client {
    workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]
}

export const getCoachClientsWithPrograms = cache(async (
    coachId: string,
    orgId: string | null
): Promise<ClientWithProgram[]> => {
    const supabase = await createClient()
    // Standalone context: widen to team pool clients too. Enterprise (orgId set)
    // keeps its exact existing behavior. RLS is the ceiling -> a wrong filter can
    // only under-show pool clients, never leak others'.
    const teamIds = orgId ? [] : await getCoachActiveTeamIds(supabase, coachId)
    let query = supabase
        .from('clients')
        .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
        .order('created_at', { ascending: false })

    if (teamIds.length > 0) {
        // Own clients OR team pool clients (both org_id NULL).
        query = query.is('org_id', null).or(`coach_id.eq.${coachId},team_id.in.(${teamIds.join(',')})`)
    } else {
        query = query.eq('coach_id', coachId)
        query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
    }

    const { data } = await query
    return (data ?? []) as ClientWithProgram[]
})

export const getCoachClientsPulse = cache(async (coachId: string, orgId: string | null) => {
    return getCachedDirectoryPulse(coachId, orgId)
})
