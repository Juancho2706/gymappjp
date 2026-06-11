// Guards de scoping 3-vias coach->alumno (workspace ACTIVO). Compartidos entre services.
// NO lleva 'use server': no son server actions (exportarlos desde un archivo 'use server'
// los publicaria como endpoints RPC). Extraidos de client-detail.service.ts (T3.0,
// specs/movida-screening) — la logica de scoping vive en UN solo lugar.

import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export type CoachClientScope = { orgId: string | null; activeTeamId: string | null }

export type CoachClientAccess = CoachClientScope & { viaTeam: boolean }

export async function getCoachClientScope(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
): Promise<CoachClientScope> {
    const workspace = await resolvePreferredWorkspace(supabase, userId)
    if (!workspace || workspace.type === 'coach_standalone') {
        return { orgId: null, activeTeamId: null }
    }
    if (workspace.type === 'enterprise_coach') {
        return { orgId: workspace.orgId, activeTeamId: null }
    }
    if (workspace.type === 'coach_team') {
        return { orgId: null, activeTeamId: workspace.teamId }
    }
    throw new Error('Workspace not allowed for coach client operations')
}

export async function assertCoachClientReadAccess(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    clientId: string
): Promise<CoachClientAccess> {
    const scope = await getCoachClientScope(supabase, userId)

    // TEAM workspace: SOLO alumnos de ESE pool (RLS = techo). No filtra coach_id (cualquier
    // miembro del pool accede). No se cruza con standalone/enterprise.
    if (scope.activeTeamId) {
        const { data: poolClient } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('team_id', scope.activeTeamId)
            .maybeSingle()
        if (poolClient) return { ...scope, viaTeam: true as const }
        throw new Error('Client not found')
    }

    // ENTERPRISE / STANDALONE: cliente propio. Standalone excluye pool (team_id NULL) y org.
    let clientQuery = supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', userId)
    clientQuery = scope.orgId ? clientQuery.eq('org_id', scope.orgId) : clientQuery.is('org_id', null)
    if (!scope.orgId) clientQuery = clientQuery.is('team_id', null)

    const { data: client, error } = await clientQuery.maybeSingle()
    if (error) throw new Error('Client access check failed')
    if (client) return { ...scope, viaTeam: false as const }
    throw new Error('Client not found')
}
