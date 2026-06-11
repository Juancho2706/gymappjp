import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type WorkspaceCoachRow = {
    id: string
    full_name: string | null
    brand_name: string | null
    slug: string | null
    logo_url: string | null
    primary_color: string | null
    subscription_status: string | null
    active_org_id: string | null
}

export type WorkspaceClientRow = {
    id: string
    full_name: string | null
    coach_id: string | null
    org_id: string | null
    team_id: string | null
}

export type WorkspaceMemberRow = {
    id: string
    org_id: string
    coach_id: string | null
    role: string
    status: string
}

export type WorkspaceTeamRow = {
    memberId: string
    teamId: string
    name: string
    slug: string
    ownerCoachId: string
}

export type WorkspaceOrgRow = {
    id: string
    slug: string
    name: string
    logo_url: string | null
    primary_color: string | null
}

export type WorkspaceBrandOrgRow = Pick<WorkspaceOrgRow, 'id' | 'name' | 'logo_url' | 'primary_color'> & {
    loader_text: string | null
    use_custom_loader: boolean | null
    loader_icon_mode: string | null
    loader_text_color: string | null
    splash_bg_color: string | null
    accent_light: string | null
    accent_dark: string | null
    logo_url_dark: string | null
    neutral_tint: boolean | null
}

export type WorkspaceBrandCoachRow = Pick<
    WorkspaceCoachRow,
    'id' | 'full_name' | 'brand_name' | 'logo_url' | 'primary_color'
> & {
    loader_text?: string | null
}

export type WorkspacePreferenceRow = {
    user_id: string
    last_workspace_type: string
    last_org_id: string | null
    last_coach_id: string | null
    last_client_id: string | null
    updated_at: string
}

export async function findWorkspaceIdentityRows(db: DB, userId: string) {
    const [coachRes, clientRes, membersRes, teamsRes] = await Promise.all([
        db
            .from('coaches')
            .select('id, full_name, brand_name, slug, logo_url, primary_color, subscription_status, active_org_id')
            .eq('id', userId)
            .maybeSingle(),
        db
            .from('clients')
            .select('id, full_name, coach_id, org_id, team_id')
            .eq('id', userId)
            .maybeSingle(),
        db
            .from('organization_members')
            .select('id, org_id, coach_id, role, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null),
        db
            .from('team_members')
            .select('id, team_id, teams(id, name, slug, owner_coach_id, deleted_at, suspended_at)')
            .eq('coach_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null),
    ])

    const coach = (coachRes.data ?? null) as WorkspaceCoachRow | null
    const client = (clientRes.data ?? null) as WorkspaceClientRow | null
    const members = (membersRes.data ?? []) as WorkspaceMemberRow[]

    const teams: WorkspaceTeamRow[] = []
    for (const row of (teamsRes.data ?? [])) {
        const t = (row as { teams?: unknown }).teams
        const team = (Array.isArray(t) ? t[0] : t) as { id: string; name: string; slug: string; owner_coach_id: string; deleted_at: string | null; suspended_at: string | null } | null
        // Kill-switch: team suspendido por el operador = workspace invisible (coaches caen a su otro contexto o holding).
        if (!team || team.deleted_at || team.suspended_at) continue
        teams.push({ memberId: (row as { id: string }).id, teamId: team.id, name: team.name, slug: team.slug, ownerCoachId: team.owner_coach_id })
    }

    const orgIds = [...new Set([
        ...members.map(member => member.org_id),
        ...(client?.org_id ? [client.org_id] : []),
    ])]

    const coachIds = [...new Set([
        ...members.map(member => member.coach_id).filter(Boolean),
        ...(client?.coach_id ? [client.coach_id] : []),
    ] as string[])]

    const [orgsRes, coachesRes, clientTeamRes] = await Promise.all([
        orgIds.length
            ? db
                .from('organizations')
                .select('id, slug, name, logo_url, primary_color')
                .in('id', orgIds)
            : Promise.resolve({ data: [] }),
        coachIds.length
            ? db
                .from('coaches')
                .select('id, full_name, brand_name, slug, logo_url, primary_color, subscription_status, active_org_id')
                .in('id', coachIds)
            : Promise.resolve({ data: [] }),
        client?.team_id
            ? db.from('teams').select('id, name, slug, deleted_at, suspended_at').eq('id', client.team_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ])

    const ctRaw = (clientTeamRes.data ?? null) as { id: string; name: string; slug: string; deleted_at: string | null; suspended_at: string | null } | null
    const clientTeam = ctRaw && !ctRaw.deleted_at && !ctRaw.suspended_at ? { id: ctRaw.id, name: ctRaw.name, slug: ctRaw.slug } : null

    return {
        coach,
        client,
        members,
        teams,
        clientTeam,
        orgs: (orgsRes.data ?? []) as WorkspaceOrgRow[],
        coaches: (coachesRes.data ?? []) as WorkspaceCoachRow[],
    }
}

export async function findWorkspaceOrgBrand(db: DB, orgId: string): Promise<WorkspaceBrandOrgRow | null> {
    const { data } = await db
        .from('organizations')
        .select('id, name, logo_url, primary_color, loader_text, use_custom_loader, loader_icon_mode, loader_text_color, splash_bg_color, accent_light, accent_dark, logo_url_dark, neutral_tint')
        .eq('id', orgId)
        .maybeSingle()

    return (data ?? null) as WorkspaceBrandOrgRow | null
}

export async function findWorkspaceCoachBrand(db: DB, coachId: string): Promise<WorkspaceBrandCoachRow | null> {
    const { data } = await db
        .from('coaches')
        .select('id, full_name, brand_name, logo_url, primary_color, loader_text')
        .eq('id', coachId)
        .maybeSingle()

    return (data ?? null) as WorkspaceBrandCoachRow | null
}

export async function findWorkspacePreference(db: DB, userId: string): Promise<WorkspacePreferenceRow | null> {
    const { data } = await db
        .from('workspace_preferences')
        .select('user_id, last_workspace_type, last_org_id, last_coach_id, last_client_id, updated_at')
        .eq('user_id', userId)
        .maybeSingle()

    return (data ?? null) as WorkspacePreferenceRow | null
}

export async function upsertWorkspacePreference(db: DB, preference: WorkspacePreferenceRow): Promise<{ error?: string }> {
    const { error } = await db
        .from('workspace_preferences')
        .upsert(preference, { onConflict: 'user_id' })

    return error ? { error: error.message } : {}
}
