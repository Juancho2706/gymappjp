import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

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
    coach_id: string
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

export const getOrgBySlug = cache(async (slug: string): Promise<OrgWithMembership | null> => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug, name, logo_url, primary_color, plan, status, seats_included, trial_ends_at, billing_cycle, currency, created_at, onboarding_step, last_health_score')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle()

    if (!org) return null

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('coach_id', user.id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    if (!membership) return null

    return { ...org, myRole: membership.role as OrgWithMembership['myRole'] }
})

export const getOrgMembers = cache(async (orgId: string): Promise<OrgMember[]> => {
    const supabase = await createClient()

    const { data } = await supabase
        .from('organization_members')
        .select(`
            id, coach_id, role, status, invited_at, joined_at,
            coach:coaches(id, full_name, slug, logo_url, subscription_status, invite_code)
        `)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('joined_at', { ascending: false })

    return (data ?? []) as OrgMember[]
})

export const getOrgClients = cache(async (orgId: string, search?: string): Promise<OrgClient[]> => {
    const supabase = await createClient()

    let query = supabase
        .from('clients')
        .select(`
            id, full_name, email, phone, is_active, created_at, coach_id
        `)
        .eq('org_id', orgId)

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients } = await query.order('created_at', { ascending: false }).limit(100)

    if (!clients?.length) return []

    const coachIds = [...new Set(clients.map(c => c.coach_id).filter(Boolean))]
    let coachMap: Record<string, { id: string; full_name: string | null; slug: string | null }> = {}

    if (coachIds.length > 0) {
        const { data: coaches } = await supabase
            .from('coaches')
            .select('id, full_name, slug')
            .in('id', coachIds as string[])
        coachMap = Object.fromEntries((coaches ?? []).map(c => [c.id, c]))
    }

    return clients.map(c => ({
        ...c,
        assignedCoach: c.coach_id ? (coachMap[c.coach_id] ?? null) : null,
    }))
})

export const getOrgStats = cache(async (orgId: string) => {
    const supabase = await createClient()

    const [membersRes, clientsRes] = await Promise.all([
        supabase
            .from('organization_members')
            .select('id, status', { count: 'exact' })
            .eq('org_id', orgId)
            .is('deleted_at', null),
        supabase
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
})
