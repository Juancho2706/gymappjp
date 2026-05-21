import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'
import type { ProgramListModel } from '../libraryStats'

export const getWorkoutProgramsWithClients = cache(async (coachId: string) => {
    const supabase = await createClient()
    const [programsResponse, clientsResponse] = await Promise.all([
        supabase
            .from('workout_programs')
            .select(LIBRARY_PROGRAM_LIST_SELECT)
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false }),
        supabase
            .from('clients')
            .select('id, full_name, workout_programs(id, name, is_active)')
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .order('full_name'),
    ])

    return {
        programs: (programsResponse.data ?? []) as unknown as ProgramListModel[],
        clients: clientsResponse.data ?? [],
    }
})
