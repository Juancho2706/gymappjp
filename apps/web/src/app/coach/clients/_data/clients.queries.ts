import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
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
    let query = supabase
        .from('clients')
        .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

    query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)

    const { data } = await query
    return (data ?? []) as ClientWithProgram[]
})

export const getCoachClientsPulse = cache(async (coachId: string, orgId: string | null) => {
    return getCachedDirectoryPulse(coachId, orgId)
})
