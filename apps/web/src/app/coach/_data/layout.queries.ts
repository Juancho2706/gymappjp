import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCoachEnterpriseContext = cache(async (coach: {
    id: string
    active_org_id: string | null
    subscription_status: string | null
}, workspaceOrgId?: string | null) => {
    const orgId = workspaceOrgId ?? coach.active_org_id
    if (!orgId || (coach.subscription_status !== 'org_managed' && !workspaceOrgId)) {
        return null
    }

    const supabase = await createClient()
    const { data: membership } = await supabase
        .from('organization_members')
        .select('role, organizations(slug, name, primary_color, logo_url)')
        .eq('org_id', orgId)
        .eq('user_id', coach.id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    const organization = membership?.organizations as unknown as {
        slug?: string | null
        name?: string | null
        primary_color?: string | null
        logo_url?: string | null
    } | null
    if (!organization?.slug || !organization.name) return null

    return {
        orgSlug: organization.slug,
        orgName: organization.name,
        orgRole: membership?.role ?? 'coach',
        primaryColor: organization.primary_color ?? null,
        logoUrl: organization.logo_url ?? null,
    }
})

/** Marca del TEAM para el shell del coach en contexto coach_team (espejo de getCoachEnterpriseContext). */
export const getCoachTeamContext = cache(async (teamId: string | null) => {
    if (!teamId) return null
    const supabase = await createClient()
    const { data: team } = await supabase
        .from('teams')
        .select('name, slug, primary_color, logo_url')
        .eq('id', teamId)
        .is('deleted_at', null)
        .maybeSingle()
    if (!team?.name) return null
    return {
        teamName: team.name,
        teamSlug: team.slug,
        primaryColor: team.primary_color ?? null,
        logoUrl: team.logo_url ?? null,
    }
})
