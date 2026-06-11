import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCoach } from '@/lib/coach/get-coach'
import { isCurrentUserTeamManager } from '@/services/auth/team.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listAvailableWorkoutAreas } from '@/services/workout/workout-areas.service'
import type { WorkoutArea } from '@/domain/workout/types'

export type AreasScope = 'team' | 'standalone'

export interface AreasContext {
    scope: AreasScope
    teamId: string | null
    teamName: string | null
    canEdit: boolean
    areas: WorkoutArea[]
}

/**
 * Contexto de areas para Settings > Areas del builder, derivado del WORKSPACE ACTIVO
 * (mismo patron que Modulos): coach_team -> areas system + del team ACTIVO (edita
 * owner/co-gestor; miembro read-only). standalone -> system + propias (edita el coach).
 * enterprise -> no aplica (la pagina redirige). Cliente user-scoped: RLS wst_* es el techo.
 */
export const getAreasContext = cache(async (): Promise<{ coachId: string | null; orgManaged: boolean; ctx: AreasContext | null }> => {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) return { coachId: null, orgManaged: false, ctx: null }

    const workspace = await resolvePreferredWorkspace(supabase, coach.id)
    const orgManaged = coach.subscription_status === 'org_managed' || workspace?.type === 'enterprise_coach'

    if (workspace?.type === 'coach_team') {
        const teamId = workspace.teamId
        const [{ data: team }, canEdit, areas] = await Promise.all([
            supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
            isCurrentUserTeamManager(supabase, teamId),
            listAvailableWorkoutAreas(supabase, { coachId: null, teamId }),
        ])
        return {
            coachId: coach.id,
            orgManaged,
            ctx: { scope: 'team', teamId, teamName: team?.name ?? 'Equipo', canEdit, areas },
        }
    }

    const areas = await listAvailableWorkoutAreas(supabase, { coachId: coach.id, teamId: null })
    return {
        coachId: coach.id,
        orgManaged,
        ctx: { scope: 'standalone', teamId: null, teamName: null, canEdit: true, areas },
    }
})
