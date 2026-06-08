import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type Admin = SupabaseClient<Database>

/**
 * B-7: an invite code ENCODES SCOPE.
 *  - organization_members.invite_code  → ENTERPRISE alumno (org_id set, org branding)
 *  - coaches.invite_code               → STANDALONE alumno (org_id null, coach branding)
 *
 * Enterprise is checked first so a (hypothetical) code shared between spaces resolves to
 * the org context. Generation guarantees no such overlap, but the order is defensive.
 */
export type InviteResolution =
    | {
          scope: 'standalone'
          coachId: string
          coachSlug: string | null
          orgId: null
          brandName: string
          primaryColor: string | null
          logoUrl: string | null
          welcomeMessage: string | null
      }
    | {
          scope: 'enterprise'
          coachId: string
          coachSlug: string | null
          orgId: string
          brandName: string
          primaryColor: string | null
          logoUrl: string | null
          welcomeMessage: string | null
      }
    | null

export async function resolveInvite(admin: Admin, code: string): Promise<InviteResolution> {
    // 1) Enterprise code (active coach membership) → org-scoped, org branding.
    const { data: member } = await admin
        .from('organization_members')
        .select(
            'org_id, coach_id, organizations(name, primary_color, logo_url), coaches(slug, brand_name, welcome_message, primary_color, logo_url)'
        )
        .eq('invite_code', code)
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('coach_id', 'is', null)
        .maybeSingle()

    if (member?.coach_id) {
        const org = member.organizations as unknown as
            | { name: string | null; primary_color: string | null; logo_url: string | null }
            | null
        const coach = member.coaches as unknown as
            | { slug: string | null; brand_name: string | null; welcome_message: string | null; primary_color: string | null; logo_url: string | null }
            | null
        return {
            scope: 'enterprise',
            coachId: member.coach_id,
            coachSlug: coach?.slug ?? null,
            orgId: member.org_id,
            brandName: org?.name ?? coach?.brand_name ?? 'EVA',
            primaryColor: org?.primary_color ?? coach?.primary_color ?? null,
            logoUrl: org?.logo_url ?? coach?.logo_url ?? null,
            welcomeMessage: coach?.welcome_message ?? null,
        }
    }

    // 2) Standalone code → coach-scoped, coach branding.
    const { data: coach } = await admin
        .from('coaches')
        .select('id, slug, brand_name, primary_color, logo_url, welcome_message')
        .eq('invite_code', code)
        .maybeSingle()

    if (coach) {
        return {
            scope: 'standalone',
            coachId: coach.id,
            coachSlug: coach.slug,
            orgId: null,
            brandName: coach.brand_name ?? 'EVA',
            primaryColor: coach.primary_color ?? null,
            logoUrl: coach.logo_url ?? null,
            welcomeMessage: coach.welcome_message ?? null,
        }
    }

    return null
}
