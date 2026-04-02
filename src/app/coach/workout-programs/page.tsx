import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkoutProgramsClient } from './WorkoutProgramsClient'

export default async function WorkoutProgramsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [programsResponse, clientsResponse] = await Promise.all([
        supabase
            .from('workout_programs')
            .select(`
                *,
                client:clients(id, full_name),
                workout_plans (
                    id,
                    day_of_week,
                    title,
                    workout_blocks (
                        id,
                        exercise:exercises(name),
                        sets,
                        reps
                    )
                )
            `)
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        
        supabase
            .from('clients')
            .select(`
                id, 
                full_name,
                workout_programs (
                    id,
                    name
                )
            `)
            .eq('coach_id', user.id)
            .eq('is_active', true)
            .order('full_name')
    ])

    const programs = programsResponse.data || []
    const clients = clientsResponse.data || []

    return (
        <WorkoutProgramsClient 
            initialPrograms={programs} 
            availableClients={clients}
        />
    )
}
