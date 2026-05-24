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
}

export type WorkspaceMemberRow = {
    id: string
    org_id: string
    coach_id: string | null
    role: string
    status: string
}

export type WorkspaceOrgRow = {
    id: string
    slug: string
    name: string
    logo_url: string | null
    primary_color: string | null
}

export async function findWorkspaceIdentityRows(db: DB, userId: string) {
    const [coachRes, clientRes, membersRes] = await Promise.all([
        db
            .from('coaches')
            .select('id, full_name, brand_name, slug, logo_url, primary_color, subscription_status, active_org_id')
            .eq('id', userId)
            .maybeSingle(),
        db
            .from('clients')
            .select('id, full_name, coach_id, org_id')
            .eq('id', userId)
            .maybeSingle(),
        db
            .from('organization_members')
            .select('id, org_id, coach_id, role, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null),
    ])

    const coach = (coachRes.data ?? null) as WorkspaceCoachRow | null
    const client = (clientRes.data ?? null) as WorkspaceClientRow | null
    const members = (membersRes.data ?? []) as WorkspaceMemberRow[]

    const orgIds = [...new Set([
        ...members.map(member => member.org_id),
        ...(client?.org_id ? [client.org_id] : []),
    ])]

    const coachIds = [...new Set([
        ...members.map(member => member.coach_id).filter(Boolean),
        ...(client?.coach_id ? [client.coach_id] : []),
    ] as string[])]

    const [orgsRes, coachesRes] = await Promise.all([
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
    ])

    return {
        coach,
        client,
        members,
        orgs: (orgsRes.data ?? []) as WorkspaceOrgRow[],
        coaches: (coachesRes.data ?? []) as WorkspaceCoachRow[],
    }
}
