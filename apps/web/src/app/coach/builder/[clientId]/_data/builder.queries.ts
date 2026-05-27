import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

type Client = Pick<Tables<'clients'>, 'id' | 'full_name' | 'email'>
type Exercise = Tables<'exercises'>

function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

export const getBuilderData = cache(async (clientId: string, programId?: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, exercises: [] as Exercise[], initialProgram: null }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .eq('coach_id', user.id)
    clientQuery = applyOrgScope(clientQuery, orgId)

    const [clientResult, exercisesResult] = await Promise.all([
        clientQuery.maybeSingle(),
        supabase
            .from('exercises')
            .select('*')
            .or(`coach_id.is.null,coach_id.eq.${user.id}`)
            .order('muscle_group')
            .order('name'),
    ])

    let initialProgram = null
    if (programId) {
        let programQuery = supabase
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
        programQuery = applyOrgScope(programQuery, orgId)
        const { data: program } = await programQuery.single()
        initialProgram = program ?? null
    }

    return {
        user,
        client: clientResult.data as Client | null,
        exercises: (exercisesResult.data ?? []) as Exercise[],
        initialProgram,
    }
})
