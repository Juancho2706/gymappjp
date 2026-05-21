import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type OrgWithMembership = {
    id: string
    slug: string
    name: string
    logo_url: string | null
    primary_color: string | null
    plan: string
    status: string
    seats_included: number
    trial_ends_at: string | null
    billing_cycle: string | null
    currency: string
    created_at: string | null
    onboarding_step: number | null
    last_health_score: number | null
    myRole: 'org_owner' | 'org_admin' | 'coach'
}

export type OrgMember = {
    id: string
    user_id: string
    coach_id: string | null
    role: 'org_owner' | 'org_admin' | 'coach'
    status: string
    invited_at: string | null
    joined_at: string | null
    coach: {
        id: string
        full_name: string | null
        slug: string | null
        logo_url: string | null
        subscription_status: string | null
        invite_code: string | null
    } | null
}

export type OrgClient = {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    is_active: boolean | null
    created_at: string | null
    coach_id: string | null
    assignedCoach: { id: string; full_name: string | null; slug: string | null } | null
}

export async function findOrgBySlug(
    db: DB,
    userId: string,
    slug: string
): Promise<OrgWithMembership | null> {
    const { data: org } = await db
        .from('organizations')
        .select('id, slug, name, logo_url, primary_color, plan, status, seats_included, trial_ends_at, billing_cycle, currency, created_at, onboarding_step, last_health_score')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle()

    if (!org) return null

    const { data: membership } = await db
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    if (!membership) return null

    return { ...org, myRole: membership.role as OrgWithMembership['myRole'] }
}

export async function findOrgMembers(db: DB, orgId: string): Promise<OrgMember[]> {
    const { data } = await db
        .from('organization_members')
        .select(`
            id, user_id, coach_id, role, status, invited_at, joined_at,
            coach:coaches(id, full_name, slug, logo_url, subscription_status, invite_code)
        `)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('joined_at', { ascending: false })

    return (data ?? []) as OrgMember[]
}

export async function findOrgClients(
    db: DB,
    orgId: string,
    search?: string
): Promise<OrgClient[]> {
    let query = db
        .from('clients')
        .select('id, full_name, email, phone, is_active, created_at, coach_id')
        .eq('org_id', orgId)

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients } = await query.order('created_at', { ascending: false }).limit(100)

    if (!clients?.length) return []

    const coachIds = [...new Set(clients.map(c => c.coach_id).filter(Boolean))] as string[]
    let coachMap: Record<string, { id: string; full_name: string | null; slug: string | null }> = {}

    if (coachIds.length > 0) {
        const { data: coaches } = await db
            .from('coaches')
            .select('id, full_name, slug')
            .in('id', coachIds)
        coachMap = Object.fromEntries((coaches ?? []).map(c => [c.id, c]))
    }

    return clients.map(c => ({
        ...c,
        assignedCoach: c.coach_id ? (coachMap[c.coach_id] ?? null) : null,
    }))
}

export async function getOrgStats(db: DB, orgId: string) {
    const [membersRes, clientsRes] = await Promise.all([
        db
            .from('organization_members')
            .select('id, status', { count: 'exact' })
            .eq('org_id', orgId)
            .is('deleted_at', null),
        db
            .from('clients')
            .select('id, is_active', { count: 'exact' })
            .eq('org_id', orgId),
    ])

    const members = membersRes.data ?? []
    const clients = clientsRes.data ?? []

    return {
        totalCoaches: members.filter(m => m.status === 'active').length,
        pendingInvites: members.filter(m => m.status === 'invited').length,
        totalClients: clients.length,
        activeClients: clients.filter(c => c.is_active).length,
    }
}
