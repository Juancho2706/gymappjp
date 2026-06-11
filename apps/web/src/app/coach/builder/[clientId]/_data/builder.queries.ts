import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listAvailableWorkoutAreas } from '@/services/workout/workout-areas.service'

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
    if (!user) return { user: null, client: null, exercises: [] as Exercise[], initialProgram: null, areas: [] as WorkoutArea[] }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // Acceso por workspace ACTIVO (separación estricta): team ⇒ SOLO alumnos de ESE pool
    // (colaborativo, sin filtro coach_id; RLS techo); standalone ⇒ propios NO-pool; enterprise ⇒ org.
    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
    if (activeTeamId) {
        clientQuery = clientQuery.eq('team_id', activeTeamId).is('org_id', null)
    } else {
        clientQuery = clientQuery.eq('coach_id', user.id)
        clientQuery = applyOrgScope(clientQuery, orgId)
        if (!orgId) clientQuery = clientQuery.is('team_id', null)
    }

    // Fase 2C / F7: scope exercises to the active workspace — standalone shows system + own,
    // enterprise shows system + the org catalog (RLS enforces the boundary either way).
    const exercisesFilter = orgId
        ? `and(coach_id.is.null,org_id.is.null),org_id.eq.${orgId}`
        : `and(coach_id.is.null,org_id.is.null),and(coach_id.eq.${user.id},org_id.is.null)`

    const [clientResult, exercisesResult, areas] = await Promise.all([
        clientQuery.maybeSingle(),
        supabase
            .from('exercises')
            .select('*')
            .or(exercisesFilter)
            .order('muscle_group')
            .order('name'),
        // Areas del builder (workout_section_templates) segun workspace activo.
        // Enterprise: solo system por ahora (sin areas de org en v1).
        listAvailableWorkoutAreas(supabase, {
            coachId: orgId ? null : user.id,
            teamId: activeTeamId,
        }),
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
        if (activeTeamId) {
            // Pool colaborativo: el programa del alumno del pool puede ser de otro coach del team.
            // RLS valida la fila; el client gate de arriba ya exige que el alumno sea de ESTE pool.
            programQuery = programQuery.eq('client_id', clientId).is('org_id', null)
        } else {
            programQuery = programQuery.eq('coach_id', user.id)
            programQuery = applyOrgScope(programQuery, orgId)
        }
        const { data: program } = await programQuery.maybeSingle()
        initialProgram = program ?? null
    }

    // E (awareness): nombre del último editor — solo interesa en el pool (contexto team)
    // y solo si fue OTRO coach (el badge "editado por mí" es ruido).
    let lastEditor: { name: string; at: string | null } | null = null
    const editedBy = (initialProgram as { last_edited_by_coach_id?: string | null } | null)?.last_edited_by_coach_id
    if (activeTeamId && editedBy && editedBy !== user.id) {
        const { data: editor } = await supabase
            .from('coaches')
            .select('full_name, brand_name')
            .eq('id', editedBy)
            .maybeSingle()
        if (editor) {
            lastEditor = {
                name: editor.full_name || editor.brand_name || 'Otro coach',
                at: (initialProgram as { updated_at?: string | null } | null)?.updated_at ?? null,
            }
        }
    }

    return {
        user,
        client: clientResult.data as Client | null,
        exercises: (exercisesResult.data ?? []) as Exercise[],
        initialProgram,
        lastEditor,
        areas,
    }
})
