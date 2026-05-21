import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

export const getTemplateBuilderData = cache(async (programId?: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, exercises: [] as Exercise[], initialProgram: null }

    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

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
                        exercises ( name, muscle_group )
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
        exercises: (rawExercises ?? []) as Exercise[],
        initialProgram,
    }
})
