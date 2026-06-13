import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

type DB = SupabaseClient<Database>

/**
 * Canonical coach data scope. Derived ONLY from the active workspace
 * (resolvePreferredWorkspace) — never from a request body. This is the single
 * source of truth for "is this coach acting in standalone or in an org, and which".
 *
 * Invariant: standalone => orgId = null; enterprise_coach => orgId = the org.
 * Any other workspace type is invalid for coach-side client/data actions.
 */
export type CoachScope =
    | { ok: true; orgId: string | null; activeTeamId: string | null; isEnterprise: boolean; coachId: string }
    | { ok: false; error: string }

export async function resolveCoachScope(db: DB, userId: string): Promise<CoachScope> {
    const workspace = await resolvePreferredWorkspace(db, userId)
    if (!workspace || workspace.type === 'coach_standalone') {
        return { ok: true, orgId: null, activeTeamId: null, isEnterprise: false, coachId: userId }
    }
    // coach_team: scope org∅ + el team ACTIVO (los writes de creación estampan team_id; los
    // checks per-client + RLS gatean el acceso al pool).
    if (workspace.type === 'coach_team') {
        return { ok: true, orgId: null, activeTeamId: workspace.teamId, isEnterprise: false, coachId: userId }
    }
    if (workspace.type === 'enterprise_coach') {
        return { ok: true, orgId: workspace.orgId, activeTeamId: null, isEnterprise: true, coachId: userId }
    }
    return { ok: false, error: 'Workspace invalido para gestionar alumnos.' }
}

/**
 * Apply the standalone/enterprise org scope to a query builder.
 * orgId present => .eq('org_id', orgId); null => .is('org_id', null).
 * Shared helper that replaces the per-file duplicates.
 */
export function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}
