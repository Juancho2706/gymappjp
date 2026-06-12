import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

export const getTemplateBuilderData = cache(async (programId?: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, exercises: [] as Exercise[], initialProgram: null }

    // Resolve workspace to apply correct org scope
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

    const { data: rawExercises } = await supabase
        .from('exercises')
        .select(EXERCISE_LIST_COLUMNS)
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

    let initialProgram = null
    if (programId) {
        let query = supabase
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

        // Scope to active workspace — enterprise coach only sees programs from their org
        if (orgId) {
            query = query.eq('org_id', orgId)
        } else {
            query = query.is('org_id', null)
        }

        const { data: program } = await query.single()
        initialProgram = program ?? null
    }

    return {
        user,
        exercises: (rawExercises ?? []) as Exercise[],
        initialProgram,
    }
})
