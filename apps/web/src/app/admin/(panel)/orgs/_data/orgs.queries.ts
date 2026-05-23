import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type OrgRow = {
    id: string
    slug: string
    name: string
    status: string
    plan: string
    seats_included: number
    currency: string
    created_at: string | null
    trial_ends_at: string | null
    billing_cycle: string | null
    memberCount: number
    clientCount: number
    ownerUserId: string | null
}

export async function getOrgs(): Promise<OrgRow[]> {
    const admin = createServiceRoleClient()

    const { data: orgs } = await admin
        .from('organizations')
        .select('id, slug, name, status, plan, seats_included, currency, created_at, trial_ends_at, billing_cycle')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (!orgs?.length) return []

    const orgIds = orgs.map(o => o.id)

    const [membersRes, clientsRes, ownersRes] = await Promise.all([
        admin
            .from('organization_members')
            .select('org_id')
            .in('org_id', orgIds)
            .eq('status', 'active')
            .is('deleted_at', null),
        admin
            .from('clients')
            .select('org_id')
            .in('org_id', orgIds),
        admin
            .from('organization_members')
            .select('org_id, user_id')
            .in('org_id', orgIds)
            .eq('role', 'org_owner')
            .eq('status', 'active')
            .is('deleted_at', null),
    ])

    const memberCounts: Record<string, number> = {}
    const clientCounts: Record<string, number> = {}
    const ownerUserIds: Record<string, string> = {}
    for (const m of membersRes.data ?? []) {
        memberCounts[m.org_id] = (memberCounts[m.org_id] ?? 0) + 1
    }
    for (const c of clientsRes.data ?? []) {
        if (c.org_id) clientCounts[c.org_id] = (clientCounts[c.org_id] ?? 0) + 1
    }
    for (const o of ownersRes.data ?? []) {
        ownerUserIds[o.org_id] = o.user_id
    }

    return orgs.map(o => ({
        ...o,
        memberCount: memberCounts[o.id] ?? 0,
        clientCount: clientCounts[o.id] ?? 0,
        ownerUserId: ownerUserIds[o.id] ?? null,
    }))
}
