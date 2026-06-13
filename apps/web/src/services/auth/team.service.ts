import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * Team (pool) membership helpers for the APP layer.
 *
 * The DB already enforces pool access via RLS (is_team_member / is_team_manager
 * SECURITY DEFINER + team_* policies, migration team_foundation). These helpers
 * let the app layer mirror that so a pool peer is not blocked by app-side
 * coach_id filters that pre-date RLS.
 *
 * NOTE: the `is_team_member(p_team_id)` / `is_team_manager(p_team_id)` RPCs read
 * auth.uid() internally, so when called through a USER-scoped client they answer
 * "is the CURRENT user a member/manager of this team". Pass a user-scoped client.
 */

/** Team ids where `coachId` is an active member. Used to widen list queries to the pool.
 *  Over-inclusion is safe: RLS (is_team_member, which also checks teams.deleted_at)
 *  re-filters the actual rows. */
export async function getCoachActiveTeamIds(db: DB, coachId: string): Promise<string[]> {
    const { data, error } = await db
        .from('team_members')
        .select('team_id')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .is('deleted_at', null)
    if (error || !data) return []
    return data.map((r) => r.team_id)
}

/** True if the CURRENT user (auth.uid of the user-scoped client) is an active member of the team. */
export async function isCurrentUserTeamMember(db: DB, teamId: string): Promise<boolean> {
    const { data, error } = await db.rpc('is_team_member', { p_team_id: teamId })
    return !error && data === true
}

/** True if the CURRENT user can manage the team (owner or can_manage co-gestor). */
export async function isCurrentUserTeamManager(db: DB, teamId: string): Promise<boolean> {
    const { data, error } = await db.rpc('is_team_manager', { p_team_id: teamId })
    return !error && data === true
}

/**
 * True if the CURRENT user can reach `clientId` through the team pool.
 * Resolves the client's team_id (RLS lets a pool member read it) then checks membership.
 * Returns false for standalone/enterprise clients (team_id NULL) — those keep their
 * existing coach_id/org access paths.
 */
export async function currentUserHasTeamAccessToClient(db: DB, clientId: string): Promise<boolean> {
    const { data } = await db
        .from('clients')
        .select('team_id')
        .eq('id', clientId)
        .maybeSingle()
    const teamId = data?.team_id
    if (!teamId) return false
    return isCurrentUserTeamMember(db, teamId)
}
