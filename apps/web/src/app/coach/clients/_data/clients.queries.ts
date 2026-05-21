import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

export interface ClientWithProgram extends Client {
    workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]
}

export const getCoachClientsWithPrograms = cache(async (coachId: string): Promise<ClientWithProgram[]> => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('clients')
        .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
    return (data ?? []) as ClientWithProgram[]
})

export const getCoachClientsPulse = cache(async (coachId: string) => {
    return getCachedDirectoryPulse(coachId)
})
