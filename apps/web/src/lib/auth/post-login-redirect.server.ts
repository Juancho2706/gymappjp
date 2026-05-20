import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export async function resolvePostLoginRedirect(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
    const [{ data: coach }, { data: client }] = await Promise.all([
        supabase
            .from('coaches')
            .select('id, active_org_id')
            .eq('id', userId)
            .maybeSingle(),
        supabase
            .from('clients')
            .select('id, coach_id, coaches(slug)')
            .eq('id', userId)
            .maybeSingle(),
    ])

    let activeOrgSlug: string | null = null
    let activeOrgRole: string | null = null

    if (coach?.active_org_id) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('role, org_id')
            .eq('org_id', coach.active_org_id)
            .eq('coach_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle()

        activeOrgRole = membership?.role ?? null

        if (membership?.org_id) {
            const { data: organization } = await supabase
                .from('organizations')
                .select('slug')
                .eq('id', membership.org_id)
                .maybeSingle()

            activeOrgSlug = organization?.slug ?? null
        }
    }

    if (coach && (!activeOrgSlug || !activeOrgRole)) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('role, org_id')
            .eq('coach_id', userId)
            .eq('status', 'active')
            .in('role', ['org_owner', 'org_admin'])
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle()

        if (membership?.org_id) {
            const { data: organization } = await supabase
                .from('organizations')
                .select('slug')
                .eq('id', membership.org_id)
                .maybeSingle()

            activeOrgSlug = organization?.slug ?? activeOrgSlug
            activeOrgRole = membership.role ?? activeOrgRole
        }
    }

    const clientCoach = client?.coaches as { slug?: string | null } | null

    return getPostLoginRedirect({
        isCoach: !!coach,
        activeOrgSlug,
        activeOrgRole,
        clientCoachSlug: clientCoach?.slug ?? null,
    })
}
