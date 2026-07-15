import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listAvailableWorkoutAreas } from '@/services/workout/workout-areas.service'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import type { Tables } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'

type Exercise = Tables<'exercises'>

export const getTemplateBuilderData = cache(async (programId?: string) => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, exercises: [] as Exercise[], initialProgram: null, areas: [] as WorkoutArea[] }

    // Resolve workspace to apply correct org scope
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const [{ data: rawExercises }, areas] = await Promise.all([
        supabase
            .from('exercises')
            .select(EXERCISE_LIST_COLUMNS)
            .or(`coach_id.is.null,coach_id.eq.${user.id}`)
            .order('muscle_group')
            .order('name'),
        // Areas del builder segun workspace activo (enterprise: solo system en v1).
        listAvailableWorkoutAreas(supabase, {
            coachId: orgId ? null : user.id,
            teamId: activeTeamId,
        }),
    ])

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
            // PostgREST no garantiza el orden de embeds sin .order() explicito.
            .order('order_index', { referencedTable: 'workout_plans.workout_blocks', ascending: true })

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
        areas,
    }
})
