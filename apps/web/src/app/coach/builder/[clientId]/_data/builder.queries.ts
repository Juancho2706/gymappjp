import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'

type Client = Pick<Tables<'clients'>, 'id' | 'full_name' | 'email'>
type Exercise = Tables<'exercises'>

export const getBuilderData = cache(async (clientId: string, programId?: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, exercises: [] as Exercise[], initialProgram: null }

    const [clientResult, exercisesResult] = await Promise.all([
        supabase
            .from('clients')
            .select('id, full_name, email')
            .eq('id', clientId)
            .eq('coach_id', user.id)
            .maybeSingle(),
        supabase
            .from('exercises')
            .select('*')
            .or(`coach_id.is.null,coach_id.eq.${user.id}`)
            .order('muscle_group')
            .order('name'),
    ])

    let initialProgram = null
    if (programId) {
        const { data: program } = await supabase
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (
                        *,
                        exercises ( name, muscle_group, gif_url, video_url )
                    )
                )
            `)
            .eq('id', programId)
            .eq('coach_id', user.id)
            .single()
        initialProgram = program ?? null
    }

    return {
        user,
        client: clientResult.data as Client | null,
        exercises: (exercisesResult.data ?? []) as Exercise[],
        initialProgram,
    }
})
