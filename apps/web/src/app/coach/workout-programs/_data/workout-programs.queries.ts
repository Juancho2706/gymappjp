import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'
import type { CoachClientScope } from '@/app/coach/clients/_data/clients.queries'
import type { ProgramListModel } from '../libraryStats'

/**
 * Programas + picker de clientes scopeados por el workspace ACTIVO (3-vías, sin cruce):
 *  - enterprise: coach_id + org_id.
 *  - team: alumnos/programas del pool (org∅ + team_id), SIN filtro coach_id — pool colaborativo
 *    (un coach del team ve/asigna programas de alumnos creados por sus pares; RLS es el techo).
 *  - standalone: propios NO-pool (coach_id + org∅ + team∅).
 */
export const getWorkoutProgramsWithClients = cache(async (coachId: string, scope: CoachClientScope) => {
    const supabase = await createClient()

    let clientsQuery = supabase
        .from('clients')
        .select('id, full_name, workout_programs(id, name, is_active)')
        .eq('is_active', true)
        .order('full_name')

    if (scope.orgId) {
        clientsQuery = clientsQuery.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        clientsQuery = clientsQuery.is('org_id', null).eq('team_id', scope.activeTeamId)
    } else {
        clientsQuery = clientsQuery.eq('coach_id', coachId).is('org_id', null).is('team_id', null)
    }

    const clientsResponse = await clientsQuery
    const clients = clientsResponse.data ?? []

    let programsQuery = supabase
        .from('workout_programs')
        .select(LIBRARY_PROGRAM_LIST_SELECT)
        .order('created_at', { ascending: false })

    if (scope.orgId) {
        programsQuery = programsQuery.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        // Pool: plantillas propias (client_id NULL) + programas de alumnos del pool (de cualquier coach del team).
        const poolIds = clients.map((c) => c.id)
        programsQuery = programsQuery.is('org_id', null)
        programsQuery = poolIds.length > 0
            ? programsQuery.or(`and(coach_id.eq.${coachId},client_id.is.null),client_id.in.(${poolIds.join(',')})`)
            : programsQuery.eq('coach_id', coachId).is('client_id', null)
    } else {
        programsQuery = programsQuery.eq('coach_id', coachId).is('org_id', null)
    }

    const programsResponse = await programsQuery
    let programs = (programsResponse.data ?? []) as unknown as ProgramListModel[]

    if (!scope.orgId && !scope.activeTeamId) {
        // Standalone: excluir programas de alumnos de pool creados por este coach (viven en el contexto team).
        const standaloneIds = new Set(clients.map((c) => c.id))
        programs = programs.filter((p) => {
            const clientId = (p as { client_id?: string | null }).client_id
            return !clientId || standaloneIds.has(clientId)
        })
    }

    return { programs, clients }
})
