import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'

export interface EnterpriseLoginOrg {
    id: string
    slug: string
    name: string
    primary_color: string
    logo_url: string | null
}

/**
 * P1.4: public branding for the enterprise alumno login at `/e/[org_slug]/login`.
 * Org-scoped (NOT coach-scoped) — one entry link per organization regardless of which
 * coach the alumno ends up assigned to. Service-role read so the page renders branding
 * before the user authenticates (organizations has no public anon SELECT policy).
 */
export const getEnterpriseLoginOrg = cache(async (slug: string): Promise<EnterpriseLoginOrg | null> => {
    const admin = createServiceRoleClient()
    const { data } = await admin
        .from('organizations')
        .select('id, slug, name, primary_color, logo_url')
        .eq('slug', slug)
        .maybeSingle()

    if (!data) return null

    const row = data as Record<string, unknown>
    return {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name ?? 'Tu organización'),
        primary_color: (typeof row.primary_color === 'string' && row.primary_color.trim()) || SYSTEM_PRIMARY_COLOR,
        logo_url: typeof row.logo_url === 'string' && row.logo_url.trim() ? row.logo_url : null,
    }
})
