import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCoachEnterpriseContext = cache(async (coach: {
    id: string
    active_org_id: string | null
    subscription_status: string | null
}) => {
    if (coach.subscription_status !== 'org_managed' || !coach.active_org_id) {
        return null
    }

    const supabase = await createClient()
    const { data: membership } = await supabase
        .from('organization_members')
        .select('role, organizations(slug, name)')
        .eq('org_id', coach.active_org_id)
        .eq('coach_id', coach.id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    const organization = membership?.organizations as unknown as { slug?: string | null; name?: string | null } | null
    if (!organization?.slug || !organization.name) return null

    return {
        orgSlug: organization.slug,
        orgName: organization.name,
        orgRole: membership?.role ?? 'coach',
    }
})
