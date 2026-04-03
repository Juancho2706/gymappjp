import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
type Exercise = Tables<'exercises'>
import type { Metadata } from 'next'
import { WeeklyPlanBuilder } from './WeeklyPlanBuilder'

export const metadata: Metadata = { title: 'Planificador Semanal | COACH OP' }

export default async function BuilderPage(
    props: {
        params: Promise<{ clientId: string }>
        searchParams: Promise<{ planId?: string; programId?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const { clientId } = params
    const { planId, programId } = searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Verify client belongs to coach
    const { data: rawClient } = await supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Pick<Client, 'id' | 'full_name' | 'email'>

    // Fetch all exercises (global + coach's own)
    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

    const exercises = (rawExercises ?? []) as Exercise[]

    let initialProgramData = null

    if (programId) {
        const { data: program } = await supabase
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (
                        *,
                        exercises ( name, muscle_group )
                    )
                )
            `)
            .eq('id', programId)
            .eq('coach_id', user.id)
            .single()
        
        if (program) {
            initialProgramData = program
        }
    } else if (planId) {
        // Fallback or conversion: if we only have a planId, we could wrap it in a pseudo-program 
        // but for now let's just fetch it to see if we can use it as a template or something.
        // However, the WeeklyPlanBuilder expects a full program structure.
        // For simplicity, let's just support programId for now as the "Weekly" path.
    }

    return (
        <WeeklyPlanBuilder 
            client={client} 
            exercises={exercises} 
            initialProgram={initialProgramData} 
        />
    )
}
