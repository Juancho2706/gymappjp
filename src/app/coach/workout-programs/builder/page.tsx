import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Tables } from '@/lib/database.types'
import { WeeklyPlanBuilder } from '../../builder/[clientId]/WeeklyPlanBuilder'

type Exercise = Tables<'exercises'>

export default async function TemplateBuilderPage(
    props: {
        searchParams: Promise<{ programId?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const { programId } = searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

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
    }

    return (
        <WeeklyPlanBuilder 
            exercises={exercises} 
            initialProgram={initialProgramData} 
        />
    )
}
