import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkoutProgramsClientShell } from './WorkoutProgramsClientShell'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'

export default async function WorkoutProgramsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [programsResponse, clientsResponse] = await Promise.all([
        supabase
            .from('workout_programs')
            .select(LIBRARY_PROGRAM_LIST_SELECT)
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        
        supabase
            .from('clients')
            .select(`
                id, 
                full_name,
                workout_programs (
                    id,
                    name,
                    is_active
                )
            `)
            .eq('coach_id', user.id)
            .eq('is_active', true)
            .order('full_name')
    ])

    const programs = (programsResponse.data || []) as unknown as import('./libraryStats').ProgramListModel[]
    const clients = clientsResponse.data || []

    return (
        <WorkoutProgramsClientShell
            initialPrograms={programs}
            availableClients={clients}
        />
    )
}
